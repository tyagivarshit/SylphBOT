"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const performanceMetrics_1 = require("../observability/performanceMetrics");
const sentry_1 = require("../observability/sentry");
const webhookIntake_queue_1 = require("../queues/webhookIntake.queue");
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const reliabilityOS_service_1 = require("../services/reliability/reliabilityOS.service");
const securityGovernanceOS_service_1 = require("../services/security/securityGovernanceOS.service");
const webhookSecurity_service_1 = require("../services/webhookSecurity.service");
const router = (0, express_1.Router)();
const WEBHOOK_DEBUG = process.env.LOG_WEBHOOK_DEBUG === "true";
const WEBHOOK_RUNTIME_BUDGET_MS = Math.max(250, Number(process.env.WEBHOOK_RUNTIME_BUDGET_MS || 1200));
const isProduction = process.env.NODE_ENV === "production";
const log = (...args) => {
    console.log("[INSTAGRAM WEBHOOK]", ...args);
};
const emitWebhookMetric = (name, value, metadata) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name,
        value,
        route: "instagram_webhook",
        metadata: {
            provider: "INSTAGRAM",
            ...(metadata || {}),
        },
    });
};
const normalizeIdentifier = (value) => {
    const normalized = String(value || "").trim();
    return normalized || null;
};
const getUniqueIdentifiers = (values) => Array.from(new Set(values
    .map((value) => normalizeIdentifier(value))
    .filter((value) => Boolean(value))));
const parseWebhookBody = (req) => {
    const rawBody = req.body;
    if (Buffer.isBuffer(rawBody)) {
        return JSON.parse(rawBody.toString("utf8"));
    }
    if (req.body && typeof req.body === "object") {
        return req.body;
    }
    throw new Error("Invalid webhook body");
};
const getSignatureHeader = (req) => req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];
const enforceWebhookSecurity = async (req, body) => {
    const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : req.rawBody;
    const signature = getSignatureHeader(req);
    const secret = process.env.META_APP_SECRET?.trim() || null;
    if ((isProduction || secret) &&
        (!rawBody ||
            !(0, webhookSecurity_service_1.verifyMetaWebhookSignature)({
                rawBody,
                signature,
                secret,
            }))) {
        await (0, securityGovernanceOS_service_1.recordWebhookSpoofAttempt)({
            businessId: null,
            tenantId: null,
            provider: "INSTAGRAM",
            signature: Array.isArray(signature) ? signature[0] : signature,
            reason: "signature_invalid",
            metadata: {
                requestId: req.requestId || null,
            },
        }).catch(() => undefined);
        return false;
    }
    const timestampMs = (0, webhookSecurity_service_1.extractMetaWebhookTimestamp)(body);
    if (!(0, webhookSecurity_service_1.isWebhookTimestampFresh)(timestampMs)) {
        await (0, securityGovernanceOS_service_1.recordWebhookSpoofAttempt)({
            businessId: null,
            tenantId: null,
            provider: "INSTAGRAM",
            signature: Array.isArray(signature) ? signature[0] : signature,
            reason: "timestamp_stale",
            metadata: {
                requestId: req.requestId || null,
                timestampMs,
            },
        }).catch(() => undefined);
        return false;
    }
    const replaySignature = Array.isArray(signature) ? signature[0] : signature;
    if (timestampMs && replaySignature) {
        const accepted = await (0, webhookSecurity_service_1.guardWebhookReplay)({
            platform: "INSTAGRAM",
            signature: String(replaySignature),
            timestampMs,
        });
        if (!accepted) {
            await (0, securityGovernanceOS_service_1.recordWebhookSpoofAttempt)({
                businessId: null,
                tenantId: null,
                provider: "INSTAGRAM",
                signature: replaySignature,
                reason: "replay_rejected",
                metadata: {
                    requestId: req.requestId || null,
                    timestampMs,
                },
            }).catch(() => undefined);
            return false;
        }
    }
    return true;
};
const parseInstagramCommentChange = ({ entry, change, }) => {
    const value = change?.value || {};
    const commentId = normalizeIdentifier(value.id || value.comment_id || value.comment?.id);
    const commentText = normalizeIdentifier(value.text || value.comment?.text);
    const mediaId = normalizeIdentifier(value.media?.id || value.media_id);
    const senderId = normalizeIdentifier(value.from?.id);
    const pageIds = getUniqueIdentifiers([
        entry?.id,
        value.instagram_business_account?.id,
        value.instagram_business_account_id,
    ]);
    return {
        commentId,
        commentText,
        mediaId,
        senderId,
        pageIds,
    };
};
const getInstagramDeliveryMessageIds = (entry) => {
    const messagingIds = Array.isArray(entry?.messaging)
        ? entry.messaging.flatMap((item) => Array.isArray(item?.delivery?.mids)
            ? item.delivery.mids
            : item?.delivery?.mid
                ? [item.delivery.mid]
                : [])
        : [];
    const changeStatusIds = Array.isArray(entry?.changes)
        ? entry.changes.flatMap((change) => Array.isArray(change?.value?.statuses)
            ? change.value.statuses
                .map((status) => normalizeIdentifier(status?.id || status?.message_id))
                .filter((value) => Boolean(value))
            : [])
        : [];
    return Array.from(new Set([...messagingIds, ...changeStatusIds]
        .map((value) => normalizeIdentifier(value))
        .filter((value) => Boolean(value))));
};
router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
        log("Webhook verified");
        return res.status(200).send(challenge);
    }
    log("Webhook verification failed");
    return res.sendStatus(403);
});
router.post("/", async (req, res) => {
    const startedAt = Date.now();
    const webhookTraceId = `ig_webhook_${req.requestId || crypto_1.default.randomUUID()}`;
    let enqueuedJobs = 0;
    let dedupedEvents = 0;
    let body;
    const sendWebhookResponse = (statusCode, reason) => {
        const ingestMs = Math.max(0, Date.now() - startedAt);
        emitWebhookMetric("webhook_ingest_ms", ingestMs, {
            statusCode,
            enqueuedJobs,
            dedupedEvents,
            traceId: webhookTraceId,
            reason: reason || null,
        });
        emitWebhookMetric("webhook_post_response_work", 0, {
            statusCode,
            traceId: webhookTraceId,
        });
        if (ingestMs > WEBHOOK_RUNTIME_BUDGET_MS) {
            emitWebhookMetric("webhook_runtime_budget_exceeded", ingestMs, {
                thresholdMs: WEBHOOK_RUNTIME_BUDGET_MS,
                statusCode,
                traceId: webhookTraceId,
            });
        }
        return res.sendStatus(statusCode);
    };
    try {
        body = parseWebhookBody(req);
    }
    catch (error) {
        req.logger?.error({ error }, "Instagram webhook body parse failed");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                webhook: "instagram",
                stage: "body_parse",
            },
        });
        await (0, reliabilityOS_service_1.recordObservabilityEvent)({
            eventType: "webhook.instagram.body_parse_failed",
            message: "Instagram webhook body parse failed",
            severity: "error",
            context: {
                traceId: webhookTraceId,
                correlationId: webhookTraceId,
                provider: "INSTAGRAM",
                component: "webhook",
                phase: "reception",
            },
            metadata: {
                error: String(error?.message ||
                    error ||
                    "body_parse_failed"),
            },
        }).catch(() => undefined);
        return sendWebhookResponse(400, "body_parse_failed");
    }
    try {
        if (WEBHOOK_DEBUG) {
            log("Webhook received", {
                entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
            });
        }
        if (!(await enforceWebhookSecurity(req, body))) {
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                eventType: "webhook.instagram.security_rejected",
                message: "Instagram webhook rejected by security guard",
                severity: "warn",
                context: {
                    traceId: webhookTraceId,
                    correlationId: webhookTraceId,
                    provider: "INSTAGRAM",
                    component: "webhook",
                    phase: "reception",
                },
            }).catch(() => undefined);
            return sendWebhookResponse(403, "security_rejected");
        }
        const entry = body.entry?.[0];
        if (!entry) {
            return sendWebhookResponse(200, "entry_missing");
        }
        await (0, reliabilityOS_service_1.recordTraceLedger)({
            traceId: webhookTraceId,
            correlationId: webhookTraceId,
            stage: "webhook:instagram:accepted",
            status: "IN_PROGRESS",
            metadata: {
                entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
            },
        }).catch(() => undefined);
        const deliveryMessageIds = getInstagramDeliveryMessageIds(entry);
        if (deliveryMessageIds.length) {
            const enqueueStartedAt = Date.now();
            try {
                await (0, webhookIntake_queue_1.enqueueProviderDeliveryReconcileJob)({
                    provider: "INSTAGRAM",
                    traceId: webhookTraceId,
                    requestId: req.requestId || null,
                    providerMessageIds: deliveryMessageIds,
                    deliveredAtIso: new Date().toISOString(),
                });
                emitWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
                    webhookTask: "delivery_reconcile",
                    deliveryCount: deliveryMessageIds.length,
                    traceId: webhookTraceId,
                });
                enqueuedJobs += 1;
            }
            catch (error) {
                emitWebhookMetric("webhook_degraded", 1, {
                    webhookTask: "delivery_reconcile",
                    reason: "enqueue_failed",
                    traceId: webhookTraceId,
                });
                await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                    eventType: "webhook.instagram.delivery_reconcile_enqueue_failed",
                    message: "Instagram delivery reconciliation enqueue failed",
                    severity: "warn",
                    context: {
                        traceId: webhookTraceId,
                        correlationId: webhookTraceId,
                        provider: "INSTAGRAM",
                        component: "webhook",
                        phase: "enqueue",
                    },
                    metadata: {
                        error: String(error?.message ||
                            error ||
                            "enqueue_failed"),
                        deliveryCount: deliveryMessageIds.length,
                    },
                }).catch(() => undefined);
            }
        }
        for (const change of entry?.changes || []) {
            if (change.field !== "comments") {
                continue;
            }
            const { commentId, commentText, mediaId, senderId, pageIds, } = parseInstagramCommentChange({
                entry,
                change,
            });
            const commentEventId = commentId ||
                `${pageIds[0] || "unknown"}:${senderId || "unknown"}:${mediaId || "unknown"}:${String(commentText || "").trim()}`;
            if (!commentText || !senderId || !mediaId || !commentEventId) {
                continue;
            }
            const shouldProcessComment = await (0, webhookDedup_service_1.processWebhookEvent)({
                eventId: String(commentEventId),
                platform: "INSTAGRAM",
            });
            if (!shouldProcessComment) {
                dedupedEvents += 1;
                emitWebhookMetric("webhook_deduped", 1, {
                    webhookTask: "comment_intake",
                    eventId: commentEventId,
                    traceId: webhookTraceId,
                });
                continue;
            }
            const enqueueStartedAt = Date.now();
            try {
                await (0, webhookIntake_queue_1.enqueueInstagramCommentIngestJob)({
                    webhookTraceId,
                    requestId: req.requestId || null,
                    commentEventId: String(commentEventId),
                    commentId,
                    commentText,
                    mediaId,
                    senderId,
                    pageIds,
                });
            }
            catch (error) {
                await (0, webhookDedup_service_1.rollbackWebhookEvent)({
                    eventId: String(commentEventId),
                    platform: "INSTAGRAM",
                }).catch(() => undefined);
                emitWebhookMetric("webhook_degraded", 1, {
                    webhookTask: "comment_intake",
                    reason: "enqueue_failed",
                    traceId: webhookTraceId,
                });
                await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                    eventType: "webhook.instagram.comment_enqueue_failed",
                    message: "Instagram comment ingestion enqueue failed",
                    severity: "error",
                    context: {
                        traceId: webhookTraceId,
                        correlationId: webhookTraceId,
                        provider: "INSTAGRAM",
                        component: "webhook",
                        phase: "enqueue",
                    },
                    metadata: {
                        eventId: commentEventId,
                        error: String(error?.message ||
                            error ||
                            "enqueue_failed"),
                    },
                }).catch(() => undefined);
                return sendWebhookResponse(503, "comment_enqueue_failed");
            }
            emitWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
                webhookTask: "comment_intake",
                eventId: commentEventId,
                traceId: webhookTraceId,
            });
            enqueuedJobs += 1;
        }
        let senderId;
        let text;
        let eventId;
        let pageIds = [];
        const messaging = entry?.messaging?.[0];
        if (messaging?.message?.text && !messaging?.message?.is_echo) {
            senderId = messaging.sender?.id;
            text = messaging.message.text;
            pageIds = getUniqueIdentifiers([messaging.recipient?.id, entry.id]);
            eventId = messaging.message.mid;
        }
        const changeMessage = entry?.changes?.[0]?.value?.messages?.[0];
        if (!text && changeMessage?.text?.body) {
            senderId = changeMessage.from;
            text = changeMessage.text.body;
            pageIds = getUniqueIdentifiers([entry.id]);
            eventId = changeMessage.id;
        }
        if (!senderId || !text || !pageIds.length) {
            return sendWebhookResponse(200, "message_identifiers_missing");
        }
        if (pageIds.includes(senderId)) {
            return sendWebhookResponse(200, "self_event");
        }
        const lowerText = text.toLowerCase();
        if (lowerText.includes("please wait") ||
            lowerText.includes("moment before sending")) {
            return sendWebhookResponse(200, "provider_notice_filtered");
        }
        if (!eventId) {
            return sendWebhookResponse(200, "event_id_missing");
        }
        const shouldProcess = await (0, webhookDedup_service_1.processWebhookEvent)({
            eventId,
            platform: "INSTAGRAM",
        });
        if (!shouldProcess) {
            dedupedEvents += 1;
            emitWebhookMetric("webhook_deduped", 1, {
                webhookTask: "message_intake",
                eventId,
                traceId: webhookTraceId,
            });
            return sendWebhookResponse(200, "duplicate_message");
        }
        const enqueueStartedAt = Date.now();
        try {
            await (0, webhookIntake_queue_1.enqueueInstagramMessageIngestJob)({
                webhookTraceId,
                requestId: req.requestId || null,
                eventId,
                senderId,
                text,
                pageIds,
                diagnosticSenderId: normalizeIdentifier(senderId),
            });
        }
        catch (error) {
            await (0, webhookDedup_service_1.rollbackWebhookEvent)({
                eventId,
                platform: "INSTAGRAM",
            }).catch(() => undefined);
            emitWebhookMetric("webhook_degraded", 1, {
                webhookTask: "message_intake",
                reason: "enqueue_failed",
                traceId: webhookTraceId,
            });
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                eventType: "webhook.instagram.message_enqueue_failed",
                message: "Instagram message ingestion enqueue failed",
                severity: "error",
                context: {
                    traceId: webhookTraceId,
                    correlationId: webhookTraceId,
                    provider: "INSTAGRAM",
                    component: "webhook",
                    phase: "enqueue",
                },
                metadata: {
                    eventId,
                    error: String(error?.message ||
                        error ||
                        "enqueue_failed"),
                },
            }).catch(() => undefined);
            return sendWebhookResponse(503, "message_enqueue_failed");
        }
        emitWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
            webhookTask: "message_intake",
            eventId,
            traceId: webhookTraceId,
        });
        enqueuedJobs += 1;
        return sendWebhookResponse(200, "accepted");
    }
    catch (error) {
        req.logger?.error({ error }, "Instagram webhook error");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                webhook: "instagram",
            },
        });
        await (0, reliabilityOS_service_1.recordTraceLedger)({
            traceId: webhookTraceId,
            correlationId: webhookTraceId,
            stage: "webhook:instagram:failed",
            status: "FAILED",
            endedAt: new Date(),
            metadata: {
                error: String(error?.message ||
                    error ||
                    "webhook_failed"),
            },
        }).catch(() => undefined);
        await (0, reliabilityOS_service_1.recordObservabilityEvent)({
            eventType: "webhook.instagram.failed",
            message: "Instagram webhook processing failed",
            severity: "error",
            context: {
                traceId: webhookTraceId,
                correlationId: webhookTraceId,
                provider: "INSTAGRAM",
                component: "webhook",
                phase: "reception",
            },
            metadata: {
                error: String(error?.message ||
                    error ||
                    "webhook_failed"),
            },
        }).catch(() => undefined);
        return sendWebhookResponse(500, "unhandled_error");
    }
});
exports.default = router;
