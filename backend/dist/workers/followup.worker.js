"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeFollowupWorkers = exports.initFollowupWorkers = void 0;
const bullmq_1 = require("bullmq");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const refreshEvents_service_1 = require("../services/crm/refreshEvents.service");
const encrypt_1 = require("../utils/encrypt");
const socket_server_1 = require("../sockets/socket.server");
const followup_service_1 = require("../services/salesAgent/followup.service");
const conversionTracker_service_1 = require("../services/salesAgent/conversionTracker.service");
const followup_queue_1 = require("../queues/followup.queue");
const queue_defaults_1 = require("../queues/queue.defaults");
const replyDeliveryPipeline_service_1 = require("../services/replyDeliveryPipeline.service");
const aiPipelineState_service_1 = require("../services/aiPipelineState.service");
const consentAuthority_service_1 = require("../services/consentAuthority.service");
const leadControlState_service_1 = require("../services/leadControlState.service");
const revenueTouchLedger_service_1 = require("../services/revenueTouchLedger.service");
const logger_1 = __importDefault(require("../utils/logger"));
const sentry_1 = require("../observability/sentry");
const requestContext_1 = require("../observability/requestContext");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const usage_service_1 = require("../services/usage.service");
const feature_service_1 = require("../services/feature.service");
const rateLimiter_redis_1 = require("../redis/rateLimiter.redis");
const workerManager_1 = require("./workerManager");
const isSystemGenerated = (msg) => {
    const normalizedMessage = msg.toLowerCase();
    return (normalizedMessage.includes("please wait") ||
        normalizedMessage.includes("try again later") ||
        normalizedMessage.includes("conversation limit reached"));
};
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const extractProviderMessageId = (value) => {
    if (!isRecord(value)) {
        return null;
    }
    if (typeof value.message_id === "string" && value.message_id.trim()) {
        return value.message_id.trim();
    }
    if (Array.isArray(value.messages)) {
        const first = value.messages.find((message) => isRecord(message) && typeof message.id === "string");
        if (typeof first?.id === "string" && first.id.trim()) {
            return first.id.trim();
        }
    }
    return null;
};
const buildFollowupJobKey = (job) => `followup:${String(job.id || `${job.data?.leadId || "unknown"}:${job.data?.type || "step"}`)}`;
const FOLLOWUP_WORKER_CONCURRENCY = (0, workerManager_1.resolveWorkerConcurrency)("FOLLOWUP_WORKER_CONCURRENCY", Math.max(2, (0, workerManager_1.getWorkerCount)()), {
    min: 1,
    max: 32,
});
const saveFollowupMessage = async ({ jobKey, leadId, message, cta, angle, trigger, variantId, variantKey, decision, jobId, outboundKey, }) => {
    const deliveryState = await (0, aiPipelineState_service_1.getReplyDeliveryState)(jobKey);
    if (deliveryState.savedMessageId) {
        const existing = await prisma_1.default.message.findUnique({
            where: { id: deliveryState.savedMessageId },
        });
        if (existing) {
            return {
                message: existing,
                created: false,
            };
        }
    }
    const aiMessage = await prisma_1.default.message.create({
        data: {
            leadId,
            content: message,
            sender: "AI",
            metadata: {
                source: "FOLLOWUP",
                cta,
                angle,
                trigger,
                variantId: variantId || null,
                variantKey: variantKey || null,
                jobId: jobId || null,
                outboundKey,
                deliveryJobKey: jobKey,
                decisionCTA: decision?.cta || null,
                decisionCTAStyle: decision?.ctaStyle || null,
                decisionTone: decision?.tone || null,
                decisionStructure: decision?.structure || null,
                decisionStrategy: decision?.strategy || null,
                topPatterns: decision?.topPatterns || [],
            },
        },
    });
    await (0, aiPipelineState_service_1.markReplySaved)(jobKey, aiMessage.id);
    return {
        message: aiMessage,
        created: true,
    };
};
const loadFollowupPayload = async (job) => {
    const { leadId, type, trigger } = job.data;
    logger_1.default.info({
        jobId: job.id,
        queueName: job.queueName,
        leadId,
        businessId: null,
        type,
        trigger,
    }, "Processing sales follow-up");
    const payload = await (0, followup_service_1.generateSalesFollowupMessage)({
        leadId: leadId,
        step: type,
    });
    if (!payload) {
        return null;
    }
    (0, requestContext_1.updateRequestContext)({
        businessId: payload.lead.businessId,
        leadId: payload.lead.id,
    });
    return payload;
};
const validateSubscriptionAccess = async (job, payload) => {
    const subscriptionAccess = await (0, subscriptionGuard_middleware_1.getSubscriptionAccess)(payload.lead.businessId).catch(() => null);
    if (!subscriptionAccess?.allowed) {
        (0, subscriptionGuard_middleware_1.logSubscriptionLockedAction)({
            businessId: payload.lead.businessId,
            queueName: job.queueName,
            jobId: job.id,
            leadId: payload.lead.id,
            action: "followup_worker_job",
            lockReason: subscriptionAccess?.lockReason,
        }, "Follow-up worker skipped job because subscription is locked");
        return false;
    }
    return true;
};
const validateLeadState = async (job, payload) => {
    const { lead } = payload;
    const controlGate = await (0, leadControlState_service_1.evaluateLeadControlGate)({
        leadId: lead.id,
        expectedCancelTokenVersion: typeof job.data.cancelTokenVersion === "number"
            ? job.data.cancelTokenVersion
            : null,
    });
    if (!controlGate.allowed) {
        logger_1.default.info({
            jobId: job.id,
            queueName: job.queueName,
            leadId: lead.id,
            businessId: lead.businessId,
            reason: controlGate.reason,
        }, "Follow-up skipped because the lead control authority rejected the queued token");
        return false;
    }
    if (lead.isHumanActive) {
        logger_1.default.info({
            jobId: job.id,
            queueName: job.queueName,
            leadId: lead.id,
            businessId: lead.businessId,
        }, "Follow-up skipped because human takeover is active");
        return false;
    }
    if (lead.stage === "CLOSED" || lead.stage === "BOOKED_CALL") {
        logger_1.default.info({
            jobId: job.id,
            queueName: job.queueName,
            leadId: lead.id,
            businessId: lead.businessId,
        }, "Follow-up skipped because lead is already converted");
        return false;
    }
    if ((lead.followupCount ?? 0) >= 2) {
        logger_1.default.info({
            jobId: job.id,
            queueName: job.queueName,
            leadId: lead.id,
            businessId: lead.businessId,
        }, "Follow-up skipped because limit was reached");
        return false;
    }
    return true;
};
const resolveFollowupThroughput = async (businessId) => {
    const planContext = await (0, feature_service_1.resolvePlanContext)(businessId).catch(() => null);
    return (0, workerManager_1.getThroughputLimits)(planContext?.planKey || "LOCKED");
};
const delayRateLimitedJob = async (job, retryAfterMs, scope) => {
    const delayMs = Math.max(1000, retryAfterMs);
    await job.moveToDelayed(Date.now() + delayMs, job.token);
    logger_1.default.warn({
        jobId: job.id,
        queueName: job.queueName,
        leadId: job.data?.leadId || null,
        retryAfterMs: delayMs,
        scope,
    }, "Follow-up worker delayed job because business throughput limit was reached");
    throw new bullmq_1.DelayedError();
};
const resolveFollowupDeliveryRequest = (job, payload) => {
    const { lead, message } = payload;
    if (lead.platform === "WHATSAPP") {
        if (!lead.client.phoneNumberId || !lead.phone) {
            return null;
        }
        return {
            url: `https://graph.facebook.com/v19.0/${lead.client.phoneNumberId}/messages`,
            body: {
                messaging_product: "whatsapp",
                to: lead.phone,
                type: "text",
                text: { body: message },
            },
            accessToken: (0, encrypt_1.decrypt)(lead.client.accessToken),
        };
    }
    if (lead.platform === "INSTAGRAM") {
        if (!lead.instagramId) {
            return null;
        }
        return {
            url: "https://graph.facebook.com/v19.0/me/messages",
            body: {
                recipient: { id: lead.instagramId },
                message: { text: message },
            },
            accessToken: (0, encrypt_1.decrypt)(lead.client.accessToken),
        };
    }
    logger_1.default.warn({
        jobId: job.id,
        queueName: job.queueName,
        leadId: lead.id,
        businessId: lead.businessId,
        platform: lead.platform,
    }, "Follow-up delivery skipped because platform is unsupported");
    return null;
};
const sendFollowupMessage = async (request) => {
    const response = await axios_1.default.post(request.url, request.body, {
        timeout: 10000,
        headers: {
            Authorization: `Bearer ${request.accessToken}`,
        },
    });
    return {
        providerMessageId: extractProviderMessageId(response.data),
        acceptedAt: new Date().toISOString(),
    };
};
const buildFollowupTrackingMetadata = ({ job, jobKey, payload, }) => ({
    outboundKey: (0, revenueTouchLedger_service_1.buildRevenueTouchOutboundKey)({
        source: "FOLLOWUP",
        leadId: payload.lead.id,
        deliveryJobKey: jobKey,
        step: String(job.data.type || payload.trigger || "FOLLOWUP"),
    }),
    trigger: payload.trigger,
    step: job.data.type,
    variantKey: payload.variant?.variantKey || null,
    decisionCTA: payload.decision?.cta || null,
    decisionCTAStyle: payload.decision?.ctaStyle || null,
    decisionTone: payload.decision?.tone || null,
    decisionStructure: payload.decision?.structure || null,
    decisionStrategy: payload.decision?.strategy || null,
    topPatterns: payload.decision?.topPatterns || [],
    deliveryJobKey: jobKey,
});
const finalizeConfirmedFollowupDelivery = async ({ job, jobKey, payload, mode, platform, confirmedAt, }) => (0, replyDeliveryPipeline_service_1.finalizeCheckpointedReplyDelivery)({
    jobKey,
    fallbackDeliveryMode: mode,
    fallbackPlatform: platform,
    fallbackConfirmedAt: confirmedAt,
    persistConfirmedReply: async ({ reply }) => saveFollowupMessage({
        jobKey,
        leadId: payload.lead.id,
        message: reply.text,
        cta: reply.cta || payload.cta,
        angle: reply.angle || payload.angle,
        trigger: payload.trigger,
        variantId: reply.variantId || payload.variant?.id || null,
        variantKey: reply.variantKey || payload.variant?.variantKey || null,
        decision: payload.decision,
        jobId: job.id || null,
        outboundKey: String(reply.meta?.outboundKey || buildFollowupTrackingMetadata({
            job,
            jobKey,
            payload,
        }).outboundKey),
    }),
    afterPersist: async ({ message, created }) => {
        if (!created) {
            return;
        }
        try {
            try {
                const io = (0, socket_server_1.getIO)();
                io.to(`lead_${payload.lead.id}`).emit("new_message", message);
            }
            catch { }
            await prisma_1.default.lead.update({
                where: { id: payload.lead.id },
                data: {
                    followupCount: { increment: 1 },
                    lastFollowupAt: new Date(),
                },
            });
        }
        catch (error) {
            throw new Error(String(error?.message ||
                error ||
                "followup_finalize_persistence_failed"));
        }
    },
    beforeSent: async ({ message, reply, mode: confirmedMode }) => {
        await (0, conversionTracker_service_1.trackAIMessage)({
            messageId: message.id,
            businessId: payload.lead.businessId,
            leadId: payload.lead.id,
            clientId: payload.lead.clientId || null,
            variantId: reply.variantId || payload.variant?.id || null,
            source: reply.source || "FOLLOWUP",
            cta: reply.cta || payload.cta,
            angle: reply.angle || payload.angle,
            leadState: reply.leadState ||
                payload.lead.revenueState ||
                payload.lead.aiStage ||
                null,
            messageType: reply.messageType || "FOLLOWUP",
            traceId: reply.traceId || String(job.id || jobKey),
            metadata: {
                ...(reply.meta || {}),
                ...buildFollowupTrackingMetadata({
                    job,
                    jobKey,
                    payload,
                }),
                deliveryConfirmed: true,
                deliveryMode: confirmedMode,
                deliveredMessageId: message.id,
            },
        }).catch((error) => {
            logger_1.default.warn({
                jobId: job.id,
                queueName: job.queueName,
                leadId: payload.lead.id,
                businessId: payload.lead.businessId,
                messageId: message.id,
                error,
            }, "Follow-up message attribution failed");
        });
    },
    afterSent: async ({ created }) => {
        if (!created) {
            return;
        }
        await (0, refreshEvents_service_1.publishCRMRefreshEvent)({
            businessId: payload.lead.businessId,
            leadId: payload.lead.id,
            event: "followup_sent",
            waitForSync: true,
        });
    },
});
const followupQueueNames = Array.from(new Set([followup_queue_1.FOLLOWUP_QUEUE_NAME, followup_queue_1.LEGACY_FOLLOWUP_QUEUE_NAME]));
const shouldRunWorker = process.env.RUN_WORKER === "true" ||
    process.env.RUN_WORKER === undefined;
const globalForFollowupWorker = globalThis;
const initFollowupWorkers = () => {
    if (!shouldRunWorker) {
        console.log("[followup.worker] RUN_WORKER disabled, worker not started");
        return [];
    }
    if (globalForFollowupWorker.__sylphFollowupWorkers) {
        return globalForFollowupWorker.__sylphFollowupWorkers;
    }
    (0, sentry_1.initializeSentry)();
    const workers = followupQueueNames.map((queueName) => new bullmq_1.Worker(queueName, (0, queue_defaults_1.withRedisWorkerFailSafe)(queueName, async (job) => (0, requestContext_1.runWithRequestContext)({
        requestId: String(job.id || buildFollowupJobKey(job)),
        source: "worker",
        route: `queue:${job.queueName}`,
        queueName: job.queueName,
        jobId: String(job.id || buildFollowupJobKey(job)),
        leadId: job.data?.leadId || null,
    }, async () => {
        const jobKey = buildFollowupJobKey(job);
        try {
            // Validation
            const payload = await loadFollowupPayload(job);
            if (!payload) {
                return;
            }
            if (!(await validateSubscriptionAccess(job, payload))) {
                return;
            }
            if (!(await validateLeadState(job, payload))) {
                return;
            }
            if (!payload.message || isSystemGenerated(payload.message)) {
                return;
            }
            // Generation and limits
            const throughput = await resolveFollowupThroughput(payload.lead.businessId);
            const aiWindow = await (0, rateLimiter_redis_1.consumeBusinessAIHourlyRate)(payload.lead.businessId, throughput.aiPerHour);
            if (!aiWindow.allowed) {
                await delayRateLimitedJob(job, aiWindow.ttlSeconds * 1000, "ai");
            }
            await (0, rateLimiter_redis_1.incrementDailyAIUsage)(payload.lead.businessId).catch(() => undefined);
            const deliveryState = await (0, aiPipelineState_service_1.getReplyDeliveryState)(jobKey);
            if (deliveryState.sent) {
                logger_1.default.info({
                    jobId: job.id,
                    queueName: job.queueName,
                    leadId: payload.lead.id,
                    businessId: payload.lead.businessId,
                    step: job.data.type,
                }, "Follow-up delivery already finalized");
                return;
            }
            if (deliveryState.confirmed && deliveryState.confirmedReply) {
                await finalizeConfirmedFollowupDelivery({
                    job,
                    jobKey,
                    payload,
                    mode: deliveryState.deliveryMode ||
                        "platform",
                    platform: deliveryState.platform || payload.lead.platform || null,
                    confirmedAt: deliveryState.confirmedAt || new Date().toISOString(),
                });
            }
            else {
                const deliveryRequest = resolveFollowupDeliveryRequest(job, payload);
                if (!deliveryRequest) {
                    return;
                }
                const messageWindow = await (0, rateLimiter_redis_1.consumeBusinessMessageMinuteRate)(payload.lead.businessId, throughput.messagesPerMinute);
                if (!messageWindow.allowed) {
                    await delayRateLimitedJob(job, messageWindow.ttlSeconds * 1000, "messages");
                }
                try {
                    await (0, usage_service_1.reserveUsage)({
                        businessId: payload.lead.businessId,
                        feature: "messages_sent",
                    });
                }
                catch (error) {
                    if (error?.code === "LIMIT_REACHED") {
                        logger_1.default.warn({
                            jobId: job.id,
                            queueName: job.queueName,
                            leadId: payload.lead.id,
                            businessId: payload.lead.businessId,
                        }, "Follow-up delivery skipped because message usage limit exceeded");
                        return;
                    }
                    throw error;
                }
                if (await (0, consentAuthority_service_1.isConsentRevoked)({
                    businessId: payload.lead.businessId,
                    leadId: payload.lead.id,
                    channel: payload.lead.platform || "UNKNOWN",
                    scope: "CONVERSATIONAL_OUTBOUND",
                })) {
                    logger_1.default.info({
                        jobId: job.id,
                        queueName: job.queueName,
                        leadId: payload.lead.id,
                        businessId: payload.lead.businessId,
                    }, "Follow-up skipped because outbound consent is revoked");
                    return;
                }
                const deliveryResult = await sendFollowupMessage(deliveryRequest);
                const confirmedAt = new Date().toISOString();
                const trackingMetadata = buildFollowupTrackingMetadata({
                    job,
                    jobKey,
                    payload,
                });
                await (0, replyDeliveryPipeline_service_1.checkpointReplyConfirmation)(jobKey, {
                    confirmedAt,
                    deliveryMode: "platform",
                    platform: payload.lead.platform || null,
                    confirmedReply: (0, replyDeliveryPipeline_service_1.toConfirmedReplyPayload)({
                        text: payload.message,
                        cta: payload.cta,
                        angle: payload.angle,
                        variantId: payload.variant?.id || null,
                        variantKey: payload.variant?.variantKey || null,
                        leadState: payload.lead.revenueState || payload.lead.aiStage || null,
                        messageType: "FOLLOWUP",
                        source: "FOLLOWUP",
                        traceId: String(job.id || jobKey),
                        meta: {
                            ...trackingMetadata,
                            providerMessageId: deliveryResult.providerMessageId || null,
                        },
                    }),
                });
                await finalizeConfirmedFollowupDelivery({
                    job,
                    jobKey,
                    payload,
                    mode: "platform",
                    platform: payload.lead.platform || null,
                    confirmedAt,
                });
            }
            logger_1.default.info({
                jobId: job.id,
                queueName: job.queueName,
                leadId: payload.lead.id,
                businessId: payload.lead.businessId,
                step: job.data.type,
            }, "Follow-up sent");
            await (0, followup_service_1.logSalesFollowupMessage)({
                businessId: payload.lead.businessId,
                leadId: payload.lead.id,
                step: job.data.type,
                cta: payload.cta,
                angle: payload.angle,
                planKey: payload.planKey,
                temperature: payload.temperature,
                trigger: payload.trigger,
                variantId: payload.variant?.id || null,
            });
        }
        catch (error) {
            if (error instanceof bullmq_1.DelayedError ||
                error?.name === "DelayedError") {
                throw error;
            }
            logger_1.default.error({
                jobId: job.id,
                queueName: job.queueName,
                leadId: job.data?.leadId || null,
                businessId: null,
                error,
            }, "Follow-up worker error");
            (0, sentry_1.captureExceptionWithContext)(error, {
                tags: {
                    worker: "followup",
                    queueName: job.queueName,
                },
                extras: {
                    jobId: job.id,
                    leadId: job.data?.leadId || null,
                },
            });
            const finalDeliveryState = await (0, aiPipelineState_service_1.getReplyDeliveryState)(jobKey).catch(() => null);
            if (finalDeliveryState?.sent) {
                return;
            }
            throw error;
        }
    })), {
        connection: (0, redis_1.getWorkerRedisConnection)(),
        concurrency: FOLLOWUP_WORKER_CONCURRENCY,
    }));
    workers.forEach((worker) => {
        worker.on("failed", (job, error) => {
            logger_1.default.error({
                jobId: job?.id,
                queueName: job?.queueName || followup_queue_1.FOLLOWUP_QUEUE_NAME,
                leadId: job?.data?.leadId || null,
                error,
            }, "Follow-up worker job failed");
        });
        worker.on("error", (error) => {
            logger_1.default.error({
                queueName: worker.name,
                error,
            }, "Follow-up worker error");
            (0, sentry_1.captureExceptionWithContext)(error, {
                tags: {
                    worker: "followup",
                    queueName: worker.name,
                },
            });
        });
    });
    logger_1.default.info({ queueNames: followupQueueNames, concurrency: FOLLOWUP_WORKER_CONCURRENCY }, "Follow-up workers started");
    globalForFollowupWorker.__sylphFollowupWorkers = workers;
    return workers;
};
exports.initFollowupWorkers = initFollowupWorkers;
const closeFollowupWorkers = async () => {
    const workers = globalForFollowupWorker.__sylphFollowupWorkers || [];
    await Promise.allSettled(workers.map((worker) => worker.close()));
    globalForFollowupWorker.__sylphFollowupWorkers = undefined;
};
exports.closeFollowupWorkers = closeFollowupWorkers;
