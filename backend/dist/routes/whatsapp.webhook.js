"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../config/prisma"));
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const sentry_1 = require("../observability/sentry");
const revenueTouchLedger_service_1 = require("../services/revenueTouchLedger.service");
const webhookSecurity_service_1 = require("../services/webhookSecurity.service");
const receptionLead_service_1 = require("../services/receptionLead.service");
const receptionIntake_service_1 = require("../services/receptionIntake.service");
const saasPackagingConnectHubOS_service_1 = require("../services/saasPackagingConnectHubOS.service");
const router = (0, express_1.Router)();
const isProduction = process.env.NODE_ENV === "production";
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
const buildClientLookupOr = ({ pageIds = [], phoneNumberIds = [], }) => [
    ...pageIds.map((pageId) => ({ pageId })),
    ...phoneNumberIds.map((phoneNumberId) => ({ phoneNumberId })),
];
const attachResolvedBusinessContext = (req, client) => {
    req.businessId = client.businessId;
    req.tenant = {
        businessId: client.businessId,
    };
    console.log("[WHATSAPP WEBHOOK] businessId resolved", {
        businessId: client.businessId,
        clientId: client.id,
        platform: client.platform,
    });
};
const findWhatsAppClient = async ({ phoneNumberIds, pageIds = [], }) => {
    const lookupOr = buildClientLookupOr({
        phoneNumberIds,
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
    });
    if (!client) {
        console.error("❌ CRITICAL: Client mapping missing", {
            pageId: pageIds[0] || null,
            phoneNumberId: phoneNumberIds[0] || null,
            action: "Reconnect required",
        });
        return null;
    }
    console.log("[WHATSAPP WEBHOOK] client found", {
        phoneNumberIds,
        pageIds,
        clientId: client.id,
        businessId: client.businessId,
    });
    return client;
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
    if ((isProduction || secret) && (!rawBody || !(0, webhookSecurity_service_1.verifyMetaWebhookSignature)({
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
    try {
        console.log("[WHATSAPP WEBHOOK] hit");
        const body = parseBody(req);
        if (!(await enforceWebhookSecurity(req, body))) {
            console.log("[WHATSAPP WEBHOOK] security validation failed");
            return res.sendStatus(403);
        }
        const deliveryStatuses = getWhatsAppDeliveryStatuses(body);
        let reconciledDeliveryStatus = false;
        for (const status of deliveryStatuses) {
            const providerMessageId = normalizeIdentifier(status?.id || status?.message_id);
            const deliveryStatus = String(status?.status || "").trim().toLowerCase();
            if (providerMessageId &&
                ["sent", "delivered", "read"].includes(deliveryStatus)) {
                await (0, revenueTouchLedger_service_1.reconcileRevenueTouchDeliveryByProviderMessageId)({
                    providerMessageId,
                    deliveredAt: new Date(),
                }).catch(() => undefined);
                reconciledDeliveryStatus = true;
            }
        }
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) {
            if (reconciledDeliveryStatus) {
                return res.sendStatus(200);
            }
            return res.sendStatus(200);
        }
        const eventId = message?.id;
        const shouldProcess = await (0, webhookDedup_service_1.processWebhookEvent)({
            eventId,
            platform: "WHATSAPP",
        });
        if (!shouldProcess) {
            console.log("[WHATSAPP WEBHOOK] duplicate webhook ignored");
            return res.sendStatus(200);
        }
        const from = message.from;
        const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
        const phoneNumberIds = [normalizeIdentifier(phoneNumberId)].filter((value) => Boolean(value));
        if (!from || !phoneNumberIds.length) {
            return res.sendStatus(200);
        }
        console.log("[WHATSAPP WEBHOOK] identifiers", {
            phoneNumberIds,
        });
        const client = await findWhatsAppClient({
            phoneNumberIds,
        });
        if (!client) {
            console.log("[WHATSAPP WEBHOOK] client not found");
            return res.sendStatus(200);
        }
        attachResolvedBusinessContext(req, client);
        await (0, saasPackagingConnectHubOS_service_1.recordInboundProviderWebhook)({
            businessId: client.businessId,
            tenantId: client.businessId,
            provider: "WHATSAPP",
            environment: "LIVE",
            success: true,
            details: {
                eventId: eventId || null,
                phoneNumberId: phoneNumberIds[0] || null,
                eventTimestampMs: toEpochMs(message?.timestamp || body?.entry?.[0]?.time),
            },
        }).catch(() => undefined);
        const lead = await (0, receptionLead_service_1.resolveOrCreateReceptionLead)({
            businessId: client.businessId,
            clientId: client.id,
            adapter: "WHATSAPP",
            payload: {
                ...body.entry?.[0]?.changes?.[0]?.value,
                receivedAt: new Date().toISOString(),
            },
        });
        const intake = await (0, receptionIntake_service_1.receiveInboundInteraction)({
            businessId: client.businessId,
            leadId: lead.id,
            clientId: client.id,
            adapter: "WHATSAPP",
            payload: {
                ...body.entry?.[0]?.changes?.[0]?.value,
                receivedAt: new Date().toISOString(),
            },
            providerMessageIdHint: eventId || null,
            correlationId: req.requestId || eventId,
            traceId: req.requestId || eventId || null,
            metadata: {
                webhook: "whatsapp",
                requestId: req.requestId,
                phoneNumberId: phoneNumberIds[0],
            },
        });
        console.log("[WHATSAPP WEBHOOK] canonical interaction received", {
            businessId: client.businessId,
            leadId: lead.id,
            interactionId: intake.interaction.id,
            externalInteractionKey: intake.interaction.externalInteractionKey,
        });
        return res.sendStatus(200);
    }
    catch (error) {
        req.logger?.error({ error }, "WhatsApp webhook error");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                webhook: "whatsapp",
            },
        });
        console.error("[WHATSAPP WEBHOOK] error:", error);
        return res.sendStatus(500);
    }
});
exports.default = router;
