"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../config/prisma"));
const ai_queue_1 = require("../queues/ai.queue");
const followup_queue_1 = require("../queues/followup.queue");
const socket_server_1 = require("../sockets/socket.server");
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const conversionTracker_service_1 = require("../services/salesAgent/conversionTracker.service");
const sentry_1 = require("../observability/sentry");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const usage_service_1 = require("../services/usage.service");
const webhookSecurity_service_1 = require("../services/webhookSecurity.service");
const router = (0, express_1.Router)();
const isProduction = process.env.NODE_ENV === "production";
const normalizeIdentifier = (value) => {
    const normalized = String(value || "").trim();
    return normalized || null;
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
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) {
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
        const text = message.text?.body;
        const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
        const phoneNumberIds = [normalizeIdentifier(phoneNumberId)].filter((value) => Boolean(value));
        if (!from || !text || !phoneNumberIds.length) {
            return res.sendStatus(200);
        }
        console.log("[WHATSAPP WEBHOOK] identifiers", {
            phoneNumberIds,
        });
        console.log("[WHATSAPP WEBHOOK] incoming:", text);
        const client = await findWhatsAppClient({
            phoneNumberIds,
        });
        if (!client) {
            console.log("[WHATSAPP WEBHOOK] client not found");
            return res.sendStatus(200);
        }
        attachResolvedBusinessContext(req, client);
        const access = await (0, subscriptionGuard_middleware_1.getSubscriptionAccess)(client.businessId);
        if (!access.allowed) {
            (0, subscriptionGuard_middleware_1.logSubscriptionLockedAction)({
                businessId: client.businessId,
                requestId: req.requestId,
                path: req.originalUrl,
                method: req.method,
                action: "whatsapp_webhook",
                lockReason: access.lockReason,
            }, "WhatsApp webhook ignored because subscription is locked");
            return res.sendStatus(200);
        }
        const subscription = await prisma_1.default.subscription.findUnique({
            where: { businessId: client.businessId },
            include: { plan: true },
        });
        if (!subscription || !subscription.plan) {
            console.log("[WHATSAPP WEBHOOK] no subscription");
            return res.sendStatus(200);
        }
        const planName = subscription.plan.name;
        if (planName === "BASIC") {
            console.log("[WHATSAPP WEBHOOK] BASIC plan blocked");
            return res.sendStatus(200);
        }
        let lead = await prisma_1.default.lead.findFirst({
            where: {
                businessId: client.businessId,
                phone: from,
            },
        });
        if (!lead) {
            const createdLead = await (0, usage_service_1.runWithContactUsageLimit)(client.businessId, (tx) => tx.lead.create({
                data: {
                    businessId: client.businessId,
                    clientId: client.id,
                    phone: from,
                    platform: "WHATSAPP",
                    stage: "NEW",
                    followupCount: 0,
                },
            })).catch((error) => {
                if (error?.code === "LIMIT_REACHED") {
                    console.log("[WHATSAPP WEBHOOK] contact limit reached");
                    return null;
                }
                throw error;
            });
            if (!createdLead) {
                return res.sendStatus(200);
            }
            lead = createdLead.result;
            console.log("[WHATSAPP WEBHOOK] lead created");
        }
        const userMessage = await prisma_1.default.message.create({
            data: {
                leadId: lead.id,
                content: text,
                sender: "USER",
                metadata: {
                    externalEventId: eventId || null,
                    platform: "WHATSAPP",
                },
            },
        });
        await (0, conversionTracker_service_1.recordConversionEvent)({
            businessId: client.businessId,
            leadId: lead.id,
            outcome: "replied",
            source: "WHATSAPP_WEBHOOK",
            idempotencyKey: `reply:${eventId}`,
            occurredAt: userMessage.createdAt,
            metadata: {
                platform: "WHATSAPP",
                externalEventId: eventId,
            },
        }).catch(() => { });
        const io = (0, socket_server_1.getIO)();
        io.to(`lead_${lead.id}`).emit("new_message", userMessage);
        await (0, ai_queue_1.enqueueAIBatch)([
            {
                businessId: client.businessId,
                leadId: lead.id,
                message: text,
                kind: "router",
                plan: subscription.plan,
                platform: "WHATSAPP",
                senderId: from,
                phoneNumberId: phoneNumberIds[0],
                accessTokenEncrypted: client.accessToken,
                externalEventId: eventId,
                skipInboundPersist: true,
            },
        ], {
            source: "router",
            idempotencyKey: eventId,
        });
        console.log("[WHATSAPP WEBHOOK] queued AI reply", {
            businessId: client.businessId,
            leadId: lead.id,
            eventId,
            phoneNumberId: phoneNumberIds[0],
        });
        await prisma_1.default.lead.update({
            where: { id: lead.id },
            data: {
                lastMessageAt: new Date(),
                followupCount: 0,
                unreadCount: { increment: 1 },
            },
        });
        await (0, followup_queue_1.cancelFollowups)(lead.id);
        await (0, followup_queue_1.scheduleFollowups)(lead.id);
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
