"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const sentry_1 = require("../observability/sentry");
const webhookIntake_queue_1 = require("../queues/webhookIntake.queue");
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const webhookSecurity_service_1 = require("../services/webhookSecurity.service");
const router = (0, express_1.Router)();
const WEBHOOK_RUNTIME_BUDGET_MS = Math.max(250, Number(process.env.WEBHOOK_RUNTIME_BUDGET_MS || 1200));
const isProduction = process.env.NODE_ENV === "production";
const emitWebhookMetric = (name, value, metadata) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name,
        value,
        route: "whatsapp_webhook",
        metadata: {
            provider: "WHATSAPP",
            ...(metadata || {}),
        },
    });
};
const normalizeIdentifier = (value) => {
    const normalized = String(value || "").trim();
    return normalized || null;
};
const toEpochMs = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return Date.now();
    }
    return numeric < 10000000000 ? numeric * 1000 : numeric;
};
const getSignatureHeader = (req) => req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];
const parseBody = (req) => {
    if (Buffer.isBuffer(req.body)) {
        return JSON.parse(req.body.toString("utf8"));
    }
    throw new Error("Invalid webhook body");
};
const getWhatsAppDeliveryStatuses = (body) => Array.isArray(body?.entry)
    ? body.entry.flatMap((entry) => Array.isArray(entry?.changes)
        ? entry.changes.flatMap((change) => Array.isArray(change?.value?.statuses) ? change.value.statuses : [])
        : [])
    : [];
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
        return false;
    }
    const timestampMs = (0, webhookSecurity_service_1.extractMetaWebhookTimestamp)(body);
    if (!(0, webhookSecurity_service_1.isWebhookTimestampFresh)(timestampMs)) {
        return false;
    }
    const replaySignature = Array.isArray(signature) ? signature[0] : signature;
    if (timestampMs && replaySignature) {
        const accepted = await (0, webhookSecurity_service_1.guardWebhookReplay)({
            platform: "WHATSAPP",
            signature: String(replaySignature),
            timestampMs,
        });
        if (!accepted) {
            return false;
        }
    }
    return true;
};
router.get("/", (req, res) => {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});
router.post("/", async (req, res) => {
    const startedAt = Date.now();
    let enqueuedJobs = 0;
    let dedupedEvents = 0;
    const sendWebhookResponse = (statusCode, reason) => {
        const ingestMs = Math.max(0, Date.now() - startedAt);
        emitWebhookMetric("webhook_ingest_ms", ingestMs, {
            statusCode,
            enqueuedJobs,
            dedupedEvents,
            reason: reason || null,
        });
        emitWebhookMetric("webhook_post_response_work", 0, {
            statusCode,
        });
        if (ingestMs > WEBHOOK_RUNTIME_BUDGET_MS) {
            emitWebhookMetric("webhook_runtime_budget_exceeded", ingestMs, {
                thresholdMs: WEBHOOK_RUNTIME_BUDGET_MS,
                statusCode,
            });
        }
        return res.sendStatus(statusCode);
    };
    try {
        const body = parseBody(req);
        if (!(await enforceWebhookSecurity(req, body))) {
            return sendWebhookResponse(403, "security_rejected");
        }
        const requestId = String(req.requestId || "").trim() || null;
        const deliveryStatuses = getWhatsAppDeliveryStatuses(body);
        const deliveryProviderMessageIds = deliveryStatuses
            .map((status) => ({
            providerMessageId: normalizeIdentifier(status?.id || status?.message_id),
            deliveryStatus: String(status?.status || "").trim().toLowerCase(),
        }))
            .filter((status) => Boolean(status.providerMessageId) &&
            ["sent", "delivered", "read"].includes(status.deliveryStatus))
            .map((status) => status.providerMessageId);
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        const eventId = normalizeIdentifier(message?.id);
        if (eventId) {
            const shouldProcess = await (0, webhookDedup_service_1.processWebhookEvent)({
                eventId,
                platform: "WHATSAPP",
            });
            if (!shouldProcess) {
                dedupedEvents += 1;
                emitWebhookMetric("webhook_deduped", 1, {
                    webhookTask: "message_intake",
                    eventId,
                });
                return sendWebhookResponse(200, "duplicate_message");
            }
        }
        const from = normalizeIdentifier(message?.from);
        const phoneNumberId = normalizeIdentifier(body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id);
        const phoneNumberIds = [phoneNumberId].filter((value) => Boolean(value));
        const intakePayload = {
            ...body.entry?.[0]?.changes?.[0]?.value,
            receivedAt: new Date().toISOString(),
        };
        if (deliveryProviderMessageIds.length) {
            const enqueueStartedAt = Date.now();
            try {
                await (0, webhookIntake_queue_1.enqueueProviderDeliveryReconcileJob)({
                    provider: "WHATSAPP",
                    traceId: requestId,
                    requestId,
                    providerMessageIds: deliveryProviderMessageIds,
                    deliveredAtIso: new Date().toISOString(),
                });
                emitWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
                    webhookTask: "delivery_reconcile",
                    deliveryCount: deliveryProviderMessageIds.length,
                });
                enqueuedJobs += 1;
            }
            catch (error) {
                emitWebhookMetric("webhook_degraded", 1, {
                    webhookTask: "delivery_reconcile",
                    reason: "enqueue_failed",
                    error: String(error?.message || error || "enqueue_failed"),
                });
            }
        }
        if (from && phoneNumberIds.length && message) {
            const enqueueStartedAt = Date.now();
            try {
                await (0, webhookIntake_queue_1.enqueueWhatsAppMessageIngestJob)({
                    requestId,
                    eventId,
                    from,
                    phoneNumberIds,
                    eventTimestampMs: toEpochMs(message?.timestamp || body?.entry?.[0]?.time),
                    intakePayload,
                });
            }
            catch (error) {
                if (eventId) {
                    await (0, webhookDedup_service_1.rollbackWebhookEvent)({
                        eventId,
                        platform: "WHATSAPP",
                    }).catch(() => undefined);
                }
                emitWebhookMetric("webhook_degraded", 1, {
                    webhookTask: "message_intake",
                    reason: "enqueue_failed",
                    eventId: eventId || null,
                    error: String(error?.message || error || "enqueue_failed"),
                });
                return sendWebhookResponse(503, "message_enqueue_failed");
            }
            emitWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
                webhookTask: "message_intake",
                eventId: eventId || null,
            });
            enqueuedJobs += 1;
        }
        return sendWebhookResponse(200, "accepted");
    }
    catch (error) {
        req.logger?.error({ error }, "WhatsApp webhook error");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                webhook: "whatsapp",
            },
        });
        return sendWebhookResponse(500, "unhandled_error");
    }
});
exports.default = router;
