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
const prisma_1 = __importDefault(require("../config/prisma"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
const WEBHOOK_DEBUG = process.env.LOG_WEBHOOK_DEBUG === "true";
const WEBHOOK_RUNTIME_BUDGET_MS = Math.max(250, Number(process.env.WEBHOOK_RUNTIME_BUDGET_MS || 1200));
const isProduction = process.env.NODE_ENV === "production";
const log = (...args) => {
    console.log("[INSTAGRAM WEBHOOK]", ...args);
};
const emitWebhookMetric = (name, value, metadata) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: name,
        value,
        route: "instagram_webhook",
        metadata: {
            provider: "INSTAGRAM",
            ...(metadata || {}),
        },
    });
};
const resolveInstagramTenantId = async (pageIds) => {
    if (!pageIds.length)
        return null;
    try {
        const client = await prisma_1.default.client.findFirst({
            where: {
                OR: pageIds.map((id) => ({ pageId: id })),
                isActive: true,
            },
            select: { businessId: true },
        });
        return client?.businessId || null;
    }
    catch (error) {
        console.error("[RESOLVE TENANT ERROR]", error);
        return null;
    }
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
const enforceWebhookSecurity = async (req, body, correlationId, tenantId, emitRequestWebhookMetric) => {
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
                correlationId,
            },
        }).catch(() => undefined);
        return false;
    }
    const timestampMs = (0, webhookSecurity_service_1.extractMetaWebhookTimestamp)(body);
    const replaySignature = Array.isArray(signature) ? signature[0] : signature;
    if (timestampMs) {
        const isFresh = (0, webhookSecurity_service_1.isWebhookTimestampFresh)(timestampMs);
        let isUnique = true;
        if (isFresh && replaySignature) {
            isUnique = await (0, webhookSecurity_service_1.guardWebhookReplay)({
                platform: "INSTAGRAM",
                signature: String(replaySignature),
                timestampMs,
            });
        }
        const replayDetected = !isFresh || !isUnique;
        if (replayDetected) {
            emitRequestWebhookMetric("webhook_replay_detected", 1, {
                isFresh,
                isUnique,
                timestampMs,
                replaySignature,
            });
            const isReplayProtectionEnabled = process.env.WEBHOOK_REPLAY_PROTECTION_ENABLED !== "false";
            if (isReplayProtectionEnabled) {
                emitRequestWebhookMetric("webhook_replay_rejected", 1, {
                    isFresh,
                    isUnique,
                    timestampMs,
                    replaySignature,
                });
                await (0, securityGovernanceOS_service_1.recordWebhookSpoofAttempt)({
                    businessId: null,
                    tenantId: null,
                    provider: "INSTAGRAM",
                    signature: replaySignature,
                    reason: !isFresh ? "timestamp_stale" : "replay_rejected",
                    metadata: {
                        requestId: req.requestId || null,
                        correlationId,
                        timestampMs,
                    },
                }).catch(() => undefined);
                return false;
            }
            else {
                emitRequestWebhookMetric("webhook_replay_allowed", 1, {
                    isFresh,
                    isUnique,
                    timestampMs,
                    replaySignature,
                });
            }
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
    const safeHeaders = { ...req.headers };
    for (const key of Object.keys(safeHeaders)) {
        if (key.toLowerCase() === "authorization") {
            safeHeaders[key] = "[MASKED]";
        }
    }
    logger_1.default.info({
        stage: "WEBHOOK_HTTP_RECEIVED",
        method: req.method,
        originalUrl: req.originalUrl,
        ip: req.ip,
        headers: safeHeaders,
        "content-type": req.headers["content-type"],
        "content-length": req.headers["content-length"],
        timestamp: new Date().toISOString(),
    }, "Instagram webhook HTTP request received");
    const startedAt = Date.now();
    let enqueuedJobs = 0;
    let dedupedEvents = 0;
    let body;
    console.log("[INSTAGRAM WEBHOOK INCOMING] Received request:", {
        url: req.originalUrl,
        method: req.method,
        query: req.query,
        headers: req.headers,
        hasBody: Boolean(req.body),
        isBuffer: Buffer.isBuffer(req.body),
        bodyLength: Buffer.isBuffer(req.body) ? req.body.length : (req.body ? JSON.stringify(req.body).length : 0),
    });
    try {
        body = parseWebhookBody(req);
        console.log("[INSTAGRAM WEBHOOK BODY PARSED]", {
            entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
            objectType: body?.object,
        });
    }
    catch (error) {
        console.error("[INSTAGRAM WEBHOOK EXIT] Body parse failed:", error.message);
        req.logger?.error({ error }, "Instagram webhook body parse failed");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                webhook: "instagram",
                stage: "body_parse",
            },
        });
        return res.sendStatus(400);
    }
    const correlationId = String(req.headers["x-correlation-id"] ||
        req.correlationId ||
        req.requestId ||
        crypto_1.default.randomUUID());
    const webhookTraceId = `ig_webhook_${correlationId}`;
    const entry = body.entry?.[0];
    const pageIds = entry
        ? getUniqueIdentifiers([
            entry?.id,
            entry?.changes?.[0]?.value?.instagram_business_account?.id,
            entry?.changes?.[0]?.value?.instagram_business_account_id,
            entry?.messaging?.[0]?.recipient?.id,
        ])
        : [];
    console.log("[INSTAGRAM WEBHOOK PROCESS]", {
        correlationId,
        webhookTraceId,
        pageIds,
        firstEntryId: entry?.id,
    });
    const tenantId = await resolveInstagramTenantId(pageIds);
    const requestLogger = req.logger
        ? req.logger.child({ correlationId, traceId: webhookTraceId, tenantId })
        : null;
    const requestLog = (...args) => {
        console.log(`[INSTAGRAM WEBHOOK] [correlationId=${correlationId}]`, ...args);
    };
    const emitRequestWebhookMetric = (name, value, metadata) => {
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: name,
            value,
            businessId: tenantId,
            route: "instagram_webhook",
            metadata: {
                provider: "INSTAGRAM",
                correlationId,
                traceId: webhookTraceId,
                tenantId,
                ...(metadata || {}),
            },
        });
    };
    const sendWebhookResponse = (statusCode, reason) => {
        const ingestMs = Math.max(0, Date.now() - startedAt);
        console.log("[INSTAGRAM WEBHOOK RESPONSE]", {
            statusCode,
            reason,
            ingestMs,
            correlationId,
        });
        emitRequestWebhookMetric("webhook_ingest_ms", ingestMs, {
            statusCode,
            enqueuedJobs,
            dedupedEvents,
            traceId: webhookTraceId,
            reason: reason || null,
        });
        emitRequestWebhookMetric("webhook_post_response_work", 0, {
            statusCode,
            traceId: webhookTraceId,
        });
        if (ingestMs > WEBHOOK_RUNTIME_BUDGET_MS) {
            emitRequestWebhookMetric("webhook_runtime_budget_exceeded", ingestMs, {
                thresholdMs: WEBHOOK_RUNTIME_BUDGET_MS,
                statusCode,
                traceId: webhookTraceId,
            });
        }
        return res.sendStatus(statusCode);
    };
    try {
        const signature = getSignatureHeader(req);
        const secret = process.env.META_APP_SECRET?.trim() || null;
        const isSecPassed = await enforceWebhookSecurity(req, body, correlationId, tenantId, emitRequestWebhookMetric);
        console.log("[INSTAGRAM WEBHOOK SECURITY]", {
            signature,
            hasSecret: Boolean(secret),
            isSecPassed,
        });
        if (!isSecPassed) {
            console.error("[INSTAGRAM WEBHOOK EXIT] Security validation failed");
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                businessId: tenantId,
                tenantId,
                eventType: "webhook.instagram.security_rejected",
                message: `[correlationId=${correlationId}] Instagram webhook rejected by security guard`,
                severity: "warn",
                context: {
                    traceId: webhookTraceId,
                    correlationId,
                    provider: "INSTAGRAM",
                    component: "webhook",
                    phase: "reception",
                    tenantId,
                },
            }).catch(() => undefined);
            return sendWebhookResponse(403, "security_rejected");
        }
        if (!entry) {
            console.log("[INSTAGRAM WEBHOOK EXIT] Entry missing");
            return sendWebhookResponse(200, "entry_missing");
        }
        await (0, reliabilityOS_service_1.recordTraceLedger)({
            traceId: webhookTraceId,
            correlationId,
            businessId: tenantId,
            tenantId,
            stage: "webhook:instagram:accepted",
            status: "IN_PROGRESS",
            metadata: {
                entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
                correlationId,
            },
        }).catch(() => undefined);
        const deliveryMessageIds = getInstagramDeliveryMessageIds(entry);
        if (deliveryMessageIds.length) {
            const enqueueStartedAt = Date.now();
            console.log("[INSTAGRAM WEBHOOK DELIVERIES]", { deliveryMessageIds });
            try {
                console.log("[INSTAGRAM WEBHOOK ENQUEUE DELIVERY RECONCILE] Started");
                await (0, webhookIntake_queue_1.enqueueProviderDeliveryReconcileJob)({
                    provider: "INSTAGRAM",
                    traceId: webhookTraceId,
                    requestId: correlationId,
                    providerMessageIds: deliveryMessageIds,
                    deliveredAtIso: new Date().toISOString(),
                    correlationId,
                    tenantId,
                });
                console.log("[INSTAGRAM WEBHOOK ENQUEUE DELIVERY RECONCILE] Finished successfully");
                emitRequestWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
                    webhookTask: "delivery_reconcile",
                    deliveryCount: deliveryMessageIds.length,
                    traceId: webhookTraceId,
                });
                enqueuedJobs += 1;
            }
            catch (error) {
                console.error("[INSTAGRAM WEBHOOK DELIVERIES ENQUEUE FAILED]", error.message);
                emitRequestWebhookMetric("webhook_degraded", 1, {
                    webhookTask: "delivery_reconcile",
                    reason: "enqueue_failed",
                    traceId: webhookTraceId,
                });
                emitRequestWebhookMetric("webhook_queue_failure", 1, {
                    webhookTask: "delivery_reconcile",
                    traceId: webhookTraceId,
                });
                await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                    businessId: tenantId,
                    tenantId,
                    eventType: "webhook.instagram.delivery_reconcile_enqueue_failed",
                    message: `[correlationId=${correlationId}] Instagram delivery reconciliation enqueue failed`,
                    severity: "warn",
                    context: {
                        traceId: webhookTraceId,
                        correlationId,
                        provider: "INSTAGRAM",
                        component: "webhook",
                        phase: "enqueue",
                        tenantId,
                    },
                    metadata: {
                        error: error?.message || String(error),
                        deliveryCount: deliveryMessageIds.length,
                        correlationId,
                    },
                }).catch(() => undefined);
            }
        }
        for (const change of entry?.changes || []) {
            if (change.field !== "comments") {
                console.log("[INSTAGRAM WEBHOOK CHANGE FIELD SKIPPED]", { field: change.field });
                continue;
            }
            const { commentId, commentText, mediaId, senderId, pageIds: commentPageIds, } = parseInstagramCommentChange({
                entry,
                change,
            });
            const commentEventId = commentId ||
                `${commentPageIds[0] || "unknown"}:${senderId || "unknown"}:${mediaId || "unknown"}:${String(commentText || "").trim()}`;
            console.log("[INSTAGRAM WEBHOOK COMMENT CHANGE]", {
                commentId,
                commentText,
                mediaId,
                senderId,
                commentEventId,
            });
            if (!commentText || !senderId || !mediaId || !commentEventId) {
                console.log("[INSTAGRAM WEBHOOK COMMENT CHANGE SKIPPED] Missing identifiers");
                continue;
            }
            const shouldProcessComment = await (0, webhookDedup_service_1.processWebhookEvent)({
                eventId: String(commentEventId),
                platform: "INSTAGRAM",
                correlationId,
                tenantId,
            });
            console.log("[INSTAGRAM WEBHOOK DEDUP COMMENT]", { shouldProcessComment, commentEventId });
            if (!shouldProcessComment) {
                dedupedEvents += 1;
                emitRequestWebhookMetric("webhook_deduped", 1, {
                    webhookTask: "comment_intake",
                    eventId: commentEventId,
                    traceId: webhookTraceId,
                });
                if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
                    emitRequestWebhookMetric("webhook_dedup_hit", 1, {
                        webhookTask: "comment_intake",
                        eventId: commentEventId,
                        traceId: webhookTraceId,
                    });
                }
                continue;
            }
            else {
                if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
                    emitRequestWebhookMetric("webhook_dedup_miss", 1, {
                        webhookTask: "comment_intake",
                        eventId: commentEventId,
                        traceId: webhookTraceId,
                    });
                }
            }
            const enqueueStartedAt = Date.now();
            try {
                console.log("[INSTAGRAM WEBHOOK ENQUEUE COMMENT] Started", { commentEventId });
                await (0, webhookIntake_queue_1.enqueueInstagramCommentIngestJob)({
                    webhookTraceId,
                    requestId: correlationId,
                    commentEventId: String(commentEventId),
                    commentId,
                    commentText,
                    mediaId,
                    senderId,
                    pageIds: commentPageIds,
                    correlationId,
                    tenantId,
                });
                console.log("[INSTAGRAM WEBHOOK ENQUEUE COMMENT] Finished successfully");
            }
            catch (error) {
                console.error("[INSTAGRAM WEBHOOK ENQUEUE COMMENT FAILED]", error.message);
                await (0, webhookDedup_service_1.rollbackWebhookEvent)({
                    eventId: String(commentEventId),
                    platform: "INSTAGRAM",
                    correlationId,
                    tenantId,
                }).catch(() => undefined);
                const timestampMs = (0, webhookSecurity_service_1.extractMetaWebhookTimestamp)(body);
                const signature = getSignatureHeader(req);
                const replaySignature = Array.isArray(signature) ? signature[0] : signature;
                if (timestampMs && replaySignature) {
                    await (0, webhookSecurity_service_1.deleteReplayKey)({
                        platform: "INSTAGRAM",
                        signature: String(replaySignature),
                        timestampMs,
                    }).catch(() => undefined);
                }
                emitRequestWebhookMetric("webhook_degraded", 1, {
                    webhookTask: "comment_intake",
                    reason: "enqueue_failed",
                    traceId: webhookTraceId,
                });
                emitRequestWebhookMetric("webhook_queue_failure", 1, {
                    webhookTask: "comment_intake",
                    eventId: commentEventId,
                    traceId: webhookTraceId,
                });
                await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                    businessId: tenantId,
                    tenantId,
                    eventType: "webhook.instagram.comment_enqueue_failed",
                    message: `[correlationId=${correlationId}] Instagram comment ingestion enqueue failed`,
                    severity: "error",
                    context: {
                        traceId: webhookTraceId,
                        correlationId,
                        provider: "INSTAGRAM",
                        component: "webhook",
                        phase: "enqueue",
                        tenantId,
                    },
                    metadata: {
                        eventId: commentEventId,
                        error: error?.message || String(error),
                        correlationId,
                    },
                }).catch(() => undefined);
                console.error("[INSTAGRAM WEBHOOK EXIT] Comment enqueue failed early return");
                return sendWebhookResponse(503, "comment_enqueue_failed");
            }
            emitRequestWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
                webhookTask: "comment_intake",
                eventId: commentEventId,
                traceId: webhookTraceId,
            });
            enqueuedJobs += 1;
        }
        let senderId;
        let text;
        let eventId;
        let msgPageIds = [];
        const messaging = entry?.messaging?.[0];
        if (messaging?.message?.text && !messaging?.message?.is_echo) {
            senderId = messaging.sender?.id;
            text = messaging.message.text;
            msgPageIds = getUniqueIdentifiers([messaging.recipient?.id, entry.id]);
            eventId = messaging.message.mid;
        }
        const changeMessage = entry?.changes?.[0]?.value?.messages?.[0];
        if (!text && changeMessage?.text?.body) {
            senderId = changeMessage.from;
            text = changeMessage.text.body;
            msgPageIds = getUniqueIdentifiers([entry.id]);
            eventId = changeMessage.id;
        }
        console.log("[INSTAGRAM WEBHOOK MESSAGE EXTRACTION]", {
            senderId,
            text,
            msgPageIds,
            eventId,
        });
        if (!senderId || !text || !msgPageIds.length) {
            console.log("[INSTAGRAM WEBHOOK EXIT] Message identifiers missing");
            return sendWebhookResponse(200, "message_identifiers_missing");
        }
        if (msgPageIds.includes(senderId)) {
            console.log("[INSTAGRAM WEBHOOK EXIT] Self event");
            return sendWebhookResponse(200, "self_event");
        }
        const lowerText = text.toLowerCase();
        if (lowerText.includes("please wait") ||
            lowerText.includes("moment before sending")) {
            console.log("[INSTAGRAM WEBHOOK EXIT] Provider notice filtered");
            return sendWebhookResponse(200, "provider_notice_filtered");
        }
        if (!eventId) {
            console.log("[INSTAGRAM WEBHOOK EXIT] Event ID missing");
            return sendWebhookResponse(200, "event_id_missing");
        }
        console.log("[DIAGNOSTIC_TRACE] instagram.webhook.ts received message:", { senderId, text, msgPageIds, eventId, webhookTraceId });
        const shouldProcess = await (0, webhookDedup_service_1.processWebhookEvent)({
            eventId,
            platform: "INSTAGRAM",
            correlationId,
            tenantId,
        });
        console.log("[INSTAGRAM WEBHOOK DEDUP MESSAGE]", { shouldProcess, eventId });
        if (!shouldProcess) {
            dedupedEvents += 1;
            emitRequestWebhookMetric("webhook_deduped", 1, {
                webhookTask: "message_intake",
                eventId,
                traceId: webhookTraceId,
            });
            if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
                emitRequestWebhookMetric("webhook_dedup_hit", 1, {
                    webhookTask: "message_intake",
                    eventId,
                    traceId: webhookTraceId,
                });
            }
            console.log("[INSTAGRAM WEBHOOK EXIT] Duplicate message");
            return sendWebhookResponse(200, "duplicate_message");
        }
        else {
            if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
                emitRequestWebhookMetric("webhook_dedup_miss", 1, {
                    webhookTask: "message_intake",
                    eventId,
                    traceId: webhookTraceId,
                });
            }
        }
        const enqueueStartedAt = Date.now();
        try {
            console.log("[INSTAGRAM WEBHOOK ENQUEUE MESSAGE] Started", { eventId });
            await (0, webhookIntake_queue_1.enqueueInstagramMessageIngestJob)({
                webhookTraceId,
                requestId: correlationId,
                eventId,
                senderId,
                text,
                pageIds: msgPageIds,
                diagnosticSenderId: normalizeIdentifier(senderId),
                correlationId,
                tenantId,
            });
            console.log("[INSTAGRAM WEBHOOK ENQUEUE MESSAGE] Finished successfully");
        }
        catch (error) {
            console.error("[INSTAGRAM WEBHOOK ENQUEUE MESSAGE FAILED]", error.message);
            await (0, webhookDedup_service_1.rollbackWebhookEvent)({
                eventId,
                platform: "INSTAGRAM",
                correlationId,
                tenantId,
            }).catch(() => undefined);
            const timestampMs = (0, webhookSecurity_service_1.extractMetaWebhookTimestamp)(body);
            const signature = getSignatureHeader(req);
            const replaySignature = Array.isArray(signature) ? signature[0] : signature;
            if (timestampMs && replaySignature) {
                await (0, webhookSecurity_service_1.deleteReplayKey)({
                    platform: "INSTAGRAM",
                    signature: String(replaySignature),
                    timestampMs,
                }).catch(() => undefined);
            }
            emitRequestWebhookMetric("webhook_degraded", 1, {
                webhookTask: "message_intake",
                reason: "enqueue_failed",
                traceId: webhookTraceId,
            });
            emitRequestWebhookMetric("webhook_queue_failure", 1, {
                webhookTask: "message_intake",
                eventId,
                traceId: webhookTraceId,
            });
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                businessId: tenantId,
                tenantId,
                eventType: "webhook.instagram.message_enqueue_failed",
                message: `[correlationId=${correlationId}] Instagram message ingestion enqueue failed`,
                severity: "error",
                context: {
                    traceId: webhookTraceId,
                    correlationId,
                    provider: "INSTAGRAM",
                    component: "webhook",
                    phase: "enqueue",
                    tenantId,
                },
                metadata: {
                    eventId,
                    error: error?.message || String(error),
                    correlationId,
                },
            }).catch(() => undefined);
            console.error("[INSTAGRAM WEBHOOK EXIT] Message enqueue failed early return");
            return sendWebhookResponse(503, "message_enqueue_failed");
        }
        emitRequestWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
            webhookTask: "message_intake",
            eventId,
            traceId: webhookTraceId,
        });
        enqueuedJobs += 1;
        console.log("[INSTAGRAM WEBHOOK SUCCESS PROCESSING]");
        return sendWebhookResponse(200, "accepted");
    }
    catch (error) {
        if (requestLogger) {
            requestLogger.error({ error }, "Instagram webhook error");
        }
        else {
            console.error(`[Instagram Webhook Error] [correlationId=${correlationId}]`, error);
        }
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                webhook: "instagram",
                correlationId,
            },
        });
        await (0, reliabilityOS_service_1.recordTraceLedger)({
            traceId: webhookTraceId,
            correlationId,
            businessId: tenantId,
            tenantId,
            stage: "webhook:instagram:failed",
            status: "FAILED",
            endedAt: new Date(),
            metadata: {
                error: error?.message || String(error),
                correlationId,
            },
        }).catch(() => undefined);
        await (0, reliabilityOS_service_1.recordObservabilityEvent)({
            businessId: tenantId,
            tenantId,
            eventType: "webhook.instagram.failed",
            message: `[correlationId=${correlationId}] Instagram webhook processing failed`,
            severity: "error",
            context: {
                traceId: webhookTraceId,
                correlationId,
                provider: "INSTAGRAM",
                component: "webhook",
                phase: "reception",
                tenantId,
            },
            metadata: {
                error: error?.message || String(error),
                correlationId,
            },
        }).catch(() => undefined);
        console.error("[INSTAGRAM WEBHOOK EXIT] Unhandled error:", error.message);
        return sendWebhookResponse(500, "unhandled_error");
    }
});
exports.default = router;
