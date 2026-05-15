"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../config/prisma"));
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const sentry_1 = require("../observability/sentry");
const revenueTouchLedger_service_1 = require("../services/revenueTouchLedger.service");
const webhookSecurity_service_1 = require("../services/webhookSecurity.service");
const securityGovernanceOS_service_1 = require("../services/security/securityGovernanceOS.service");
const receptionLead_service_1 = require("../services/receptionLead.service");
const receptionIntake_service_1 = require("../services/receptionIntake.service");
const reliabilityOS_service_1 = require("../services/reliability/reliabilityOS.service");
const saasPackagingConnectHubOS_service_1 = require("../services/saasPackagingConnectHubOS.service");
const router = (0, express_1.Router)();
const WEBHOOK_DEBUG = process.env.LOG_WEBHOOK_DEBUG === "true";
const isProduction = process.env.NODE_ENV === "production";
const log = (...args) => {
    console.log("[INSTAGRAM WEBHOOK]", ...args);
};
const runWebhookBackgroundTask = (label, task) => {
    setImmediate(() => {
        void task().catch((error) => {
            console.error("[INSTAGRAM WEBHOOK] background task failed", {
                label,
                reason: String(error?.message || "background_task_failed"),
            });
        });
    });
};
const normalizeIdentifier = (value) => {
    const normalized = String(value || "").trim();
    return normalized || null;
};
const getUniqueIdentifiers = (values) => Array.from(new Set(values
    .map((value) => normalizeIdentifier(value))
    .filter((value) => Boolean(value))));
const buildClientLookupOr = ({ pageIds = [], phoneNumberIds = [], }) => [
    ...pageIds.map((pageId) => ({ pageId })),
    ...phoneNumberIds.map((phoneNumberId) => ({ phoneNumberId })),
];
const clientBusinessInclude = {
    business: {
        select: {
            ownerId: true,
        },
    },
};
const findInstagramClient = async ({ pageIds, includeBusiness = false, }) => {
    const lookupOr = buildClientLookupOr({
        pageIds,
    });
    if (!lookupOr.length) {
        return null;
    }
    const client = await prisma_1.default.client.findFirst({
        where: {
            OR: lookupOr,
            isActive: true,
        },
        ...(includeBusiness
            ? {
                include: clientBusinessInclude,
            }
            : {}),
    });
    if (!client) {
        console.error("❌ CRITICAL: Client mapping missing", {
            pageId: pageIds[0] || null,
            phoneNumberId: null,
            action: "Reconnect required",
        });
        return null;
    }
    log("client found", {
        pageIds,
        clientId: client.id,
        businessId: client.businessId,
    });
    return client;
};
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
    if ((isProduction || secret) && (!rawBody || !(0, webhookSecurity_service_1.verifyMetaWebhookSignature)({
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
    let body;
    const webhookTraceId = `ig_webhook_${req.requestId || crypto_1.default.randomUUID()}`;
    let checkpointReached = "[STEP 1] entered route";
    let diagnosticSenderId = null;
    let diagnosticRecipientId = null;
    let diagnosticMessageMid = null;
    console.log("🔥 WEBHOOK HIT", JSON.stringify(req.body));
    log("[STEP 1] entered route");
    try {
        body = parseWebhookBody(req);
    }
    catch (error) {
        const rawMessaging = !Buffer.isBuffer(req.body) && req.body && typeof req.body === "object"
            ? req.body?.entry?.[0]?.messaging?.[0]
            : undefined;
        diagnosticSenderId =
            diagnosticSenderId || normalizeIdentifier(rawMessaging?.sender?.id);
        diagnosticRecipientId =
            diagnosticRecipientId || normalizeIdentifier(rawMessaging?.recipient?.id);
        diagnosticMessageMid =
            diagnosticMessageMid || normalizeIdentifier(rawMessaging?.message?.mid);
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
                error: String(error?.message || error || "body_parse_failed"),
            },
        }).catch(() => undefined);
        log("Body parse failed", {
            message: error?.message || "Unknown error",
        });
        log("Webhook error diagnostics", {
            "error.message": error?.message || "Unknown error",
            "error.stack": error?.stack || null,
            "checkpoint reached": checkpointReached,
            "sender.id": diagnosticSenderId,
            "recipient.id": diagnosticRecipientId,
            "message.mid": diagnosticMessageMid,
        });
        return res.sendStatus(400);
    }
    try {
        if (WEBHOOK_DEBUG) {
            log("Webhook received", {
                entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
            });
        }
        if (!(await enforceWebhookSecurity(req, body))) {
            log("Webhook security validation failed");
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
            return res.sendStatus(403);
        }
        checkpointReached = "[STEP 2] signature validated";
        log("[STEP 2] signature validated");
        checkpointReached = "[STEP 3] replay guard passed";
        log("[STEP 3] replay guard passed");
        const entry = body.entry?.[0];
        if (!entry) {
            return res.sendStatus(200);
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
            runWebhookBackgroundTask("delivery_reconcile", async () => {
                await Promise.allSettled(deliveryMessageIds.map((providerMessageId) => (0, revenueTouchLedger_service_1.reconcileRevenueTouchDeliveryByProviderMessageId)({
                    providerMessageId,
                    deliveredAt: new Date(),
                }).catch(() => undefined)));
                await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                    eventType: "webhook.instagram.delivery_reconciled",
                    message: "Instagram delivery reconciliation processed",
                    severity: "info",
                    context: {
                        traceId: webhookTraceId,
                        correlationId: webhookTraceId,
                        provider: "INSTAGRAM",
                        component: "webhook-reconciliation",
                        phase: "providers",
                    },
                    metadata: {
                        deliveryCount: deliveryMessageIds.length,
                    },
                }).catch(() => undefined);
            });
        }
        for (const change of entry?.changes || []) {
            if (change.field !== "comments") {
                continue;
            }
            try {
                const rawCommentValue = change?.value || {};
                const { commentId, commentText, mediaId, senderId, pageIds, } = parseInstagramCommentChange({
                    entry,
                    change,
                });
                console.log("📩 COMMENT EVENT DETECTED", {
                    commentId: rawCommentValue.id,
                    text: rawCommentValue.text,
                    mediaId: rawCommentValue.media?.id,
                    from: rawCommentValue.from?.id,
                });
                console.log("🔥 COMMENT EVENT RECEIVED", {
                    commentId,
                    text: commentText,
                    mediaId,
                    senderId,
                });
                const commentEventId = commentId ||
                    `${pageIds[0] || "unknown"}:${senderId || "unknown"}:${mediaId || "unknown"}:${String(commentText || "").trim()}`;
                if (!commentText || !senderId || !mediaId || !commentEventId) {
                    log("Comment event skipped due to missing identifiers", {
                        commentId,
                        mediaId,
                        senderId,
                        pageIds,
                    });
                    continue;
                }
                const shouldProcessComment = await (0, webhookDedup_service_1.processWebhookEvent)({
                    eventId: String(commentEventId),
                    platform: "INSTAGRAM",
                });
                if (!shouldProcessComment) {
                    log("Duplicate Instagram comment event skipped", {
                        commentId,
                    });
                    continue;
                }
                log("comment identifiers", {
                    pageIds,
                    commentId,
                    mediaId,
                    senderId,
                });
                runWebhookBackgroundTask("comment_intake", async () => {
                    const client = await findInstagramClient({
                        pageIds,
                    });
                    if (!client) {
                        return;
                    }
                    await (0, saasPackagingConnectHubOS_service_1.recordInboundProviderWebhook)({
                        businessId: client.businessId,
                        tenantId: client.businessId,
                        provider: "INSTAGRAM",
                        environment: "LIVE",
                        success: true,
                        details: {
                            webhookType: "comment",
                            commentId: commentId || null,
                        },
                    }).catch(() => undefined);
                    await (0, securityGovernanceOS_service_1.enforceSecurityGovernanceInfluence)({
                        domain: "RECEPTION",
                        action: "messages:enqueue",
                        businessId: client.businessId,
                        tenantId: client.businessId,
                        actorId: "instagram_webhook",
                        actorType: "WEBHOOK",
                        role: "SERVICE",
                        permissions: ["messages:enqueue"],
                        scopes: ["WRITE"],
                        resourceType: "INSTAGRAM_COMMENT",
                        resourceId: commentEventId,
                        resourceTenantId: client.businessId,
                        purpose: "INBOUND_MESSAGE",
                        metadata: {
                            provider: "INSTAGRAM",
                            webhookType: "comment",
                        },
                    });
                    const payload = {
                        comment: {
                            text: commentText,
                        },
                        from: {
                            id: senderId,
                        },
                        mediaId,
                        messageId: commentId || commentEventId,
                        receivedAt: new Date().toISOString(),
                    };
                    const lead = await (0, receptionLead_service_1.resolveOrCreateReceptionLead)({
                        businessId: client.businessId,
                        clientId: client.id,
                        adapter: "INSTAGRAM",
                        payload,
                    });
                    await (0, receptionIntake_service_1.receiveInboundInteraction)({
                        businessId: client.businessId,
                        leadId: lead.id,
                        clientId: client.id,
                        adapter: "INSTAGRAM",
                        payload,
                        interactionTypeHint: "COMMENT",
                        providerMessageIdHint: commentId || commentEventId,
                        correlationId: req.requestId || commentEventId,
                        traceId: req.requestId || commentEventId,
                        metadata: {
                            webhook: "instagram_comment",
                            requestId: req.requestId,
                            mediaId,
                        },
                    });
                });
            }
            catch (commentError) {
                req.logger?.error({ error: commentError }, "Instagram comment webhook processing failed");
                (0, sentry_1.captureExceptionWithContext)(commentError, {
                    tags: {
                        webhook: "instagram",
                        stage: "comment_processing",
                    },
                });
                console.error("❌ Instagram comment webhook processing failed", commentError);
                continue;
            }
        }
        let senderId;
        let text;
        let eventId;
        let pageIds = [];
        const messaging = entry?.messaging?.[0];
        diagnosticSenderId =
            diagnosticSenderId || normalizeIdentifier(messaging?.sender?.id);
        diagnosticRecipientId =
            diagnosticRecipientId || normalizeIdentifier(messaging?.recipient?.id);
        diagnosticMessageMid =
            diagnosticMessageMid || normalizeIdentifier(messaging?.message?.mid);
        if (messaging?.message?.text && !messaging?.message?.is_echo) {
            senderId = messaging.sender?.id;
            text = messaging.message.text;
            pageIds = getUniqueIdentifiers([messaging.recipient?.id, entry.id]);
            eventId = messaging.message.mid;
            diagnosticSenderId = normalizeIdentifier(senderId);
            diagnosticRecipientId =
                normalizeIdentifier(messaging.recipient?.id) || diagnosticRecipientId;
            diagnosticMessageMid = normalizeIdentifier(eventId) || diagnosticMessageMid;
        }
        const changeMessage = entry?.changes?.[0]?.value?.messages?.[0];
        if (!text && changeMessage?.text?.body) {
            senderId = changeMessage.from;
            text = changeMessage.text.body;
            pageIds = getUniqueIdentifiers([entry.id]);
            eventId = changeMessage.id;
            diagnosticSenderId = normalizeIdentifier(senderId) || diagnosticSenderId;
            diagnosticRecipientId = normalizeIdentifier(entry.id) || diagnosticRecipientId;
            diagnosticMessageMid = normalizeIdentifier(eventId) || diagnosticMessageMid;
        }
        if (!senderId || !text || !pageIds.length) {
            return res.sendStatus(200);
        }
        if (pageIds.includes(senderId)) {
            return res.sendStatus(200);
        }
        const lowerText = text.toLowerCase();
        if (lowerText.includes("please wait") ||
            lowerText.includes("moment before sending")) {
            return res.sendStatus(200);
        }
        if (!eventId) {
            return res.sendStatus(200);
        }
        const shouldProcess = await (0, webhookDedup_service_1.processWebhookEvent)({
            eventId,
            platform: "INSTAGRAM",
        });
        if (!shouldProcess) {
            return res.sendStatus(200);
        }
        checkpointReached = "[STEP 4] dedupe passed";
        log("[STEP 4] dedupe passed");
        log("message identifiers", {
            pageIds,
        });
        runWebhookBackgroundTask("message_intake", async () => {
            const client = await findInstagramClient({
                pageIds,
                includeBusiness: true,
            });
            if (!client) {
                return;
            }
            checkpointReached = "[STEP 5] client mapping resolved";
            log("[STEP 5] client mapping resolved");
            await (0, saasPackagingConnectHubOS_service_1.recordInboundProviderWebhook)({
                businessId: client.businessId,
                tenantId: client.businessId,
                provider: "INSTAGRAM",
                environment: "LIVE",
                success: true,
                details: {
                    webhookType: "message",
                    eventId: eventId || null,
                },
            }).catch(() => undefined);
            await (0, securityGovernanceOS_service_1.enforceSecurityGovernanceInfluence)({
                domain: "RECEPTION",
                action: "messages:enqueue",
                businessId: client.businessId,
                tenantId: client.businessId,
                actorId: "instagram_webhook",
                actorType: "WEBHOOK",
                role: "SERVICE",
                permissions: ["messages:enqueue"],
                scopes: ["WRITE"],
                resourceType: "INSTAGRAM_MESSAGE",
                resourceId: eventId,
                resourceTenantId: client.businessId,
                purpose: "INBOUND_MESSAGE",
                metadata: {
                    provider: "INSTAGRAM",
                    webhookType: "message",
                },
            });
            const lead = await (0, receptionLead_service_1.resolveOrCreateReceptionLead)({
                businessId: client.businessId,
                clientId: client.id,
                adapter: "INSTAGRAM",
                payload: {
                    message: text,
                    mid: eventId,
                    from: {
                        id: senderId,
                    },
                    threadId: pageIds[0],
                    receivedAt: new Date().toISOString(),
                },
            });
            checkpointReached = "[STEP 6] lead resolved";
            log("[STEP 6] lead resolved");
            const instagramUsername = lead.name ||
                (diagnosticSenderId ? `ig:${diagnosticSenderId.slice(0, 8)}` : null);
            checkpointReached = "[STEP 7] username enrichment complete";
            log("[STEP 7] username enrichment complete");
            checkpointReached = "[STEP 8] before receiveInboundInteraction";
            log("[STEP 8] before receiveInboundInteraction");
            const intake = await (0, receptionIntake_service_1.receiveInboundInteraction)({
                businessId: client.businessId,
                leadId: lead.id,
                clientId: client.id,
                adapter: "INSTAGRAM",
                payload: {
                    message: text,
                    mid: eventId,
                    from: {
                        id: senderId,
                        username: instagramUsername || undefined,
                    },
                    threadId: pageIds[0],
                    receivedAt: new Date().toISOString(),
                },
                interactionTypeHint: "DM",
                providerMessageIdHint: eventId,
                correlationId: req.requestId || eventId,
                traceId: req.requestId || eventId,
                metadata: {
                    webhook: "instagram_message",
                    requestId: req.requestId,
                    pageId: pageIds[0],
                },
            });
            checkpointReached = "[STEP 9] intake complete";
            log("[STEP 9] intake complete");
            if (WEBHOOK_DEBUG) {
                log("Canonical interaction accepted", {
                    businessId: client.businessId,
                    leadId: lead.id,
                    interactionId: intake.interaction.id,
                    externalInteractionKey: intake.interaction.externalInteractionKey,
                });
            }
            await (0, reliabilityOS_service_1.recordTraceLedger)({
                traceId: webhookTraceId,
                correlationId: webhookTraceId,
                businessId: client.businessId,
                tenantId: client.businessId,
                leadId: lead.id,
                interactionId: intake.interaction.id,
                stage: "webhook:instagram:completed",
                status: "COMPLETED",
                endedAt: new Date(),
                metadata: {
                    externalInteractionKey: intake.interaction.externalInteractionKey,
                },
            }).catch(() => undefined);
        });
        checkpointReached = "[STEP 10] returning fast ack";
        log("[STEP 10] returning fast ack");
        return res.sendStatus(200);
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
                error: String(error?.message || error || "webhook_failed"),
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
                error: String(error?.message || error || "webhook_failed"),
            },
        }).catch(() => undefined);
        log("Webhook error diagnostics", {
            "error.message": error?.message || "Unknown error",
            "error.stack": error?.stack || null,
            "checkpoint reached": checkpointReached,
            "sender.id": diagnosticSenderId,
            "recipient.id": diagnosticRecipientId,
            "message.mid": diagnosticMessageMid,
        });
        log("Webhook error:", error);
        return res.sendStatus(500);
    }
});
exports.default = router;
