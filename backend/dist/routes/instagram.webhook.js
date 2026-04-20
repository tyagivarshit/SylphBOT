"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../config/prisma"));
const ai_queue_1 = require("../queues/ai.queue");
const automation_queue_1 = require("../queues/automation.queue");
const followup_queue_1 = require("../queues/followup.queue");
const socket_server_1 = require("../sockets/socket.server");
const instagramProfile_service_1 = require("../services/instagramProfile.service");
const notification_service_1 = require("../services/notification.service");
const conversionTracker_service_1 = require("../services/salesAgent/conversionTracker.service");
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const sentry_1 = require("../observability/sentry");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const usage_service_1 = require("../services/usage.service");
const webhookSecurity_service_1 = require("../services/webhookSecurity.service");
const router = (0, express_1.Router)();
const WEBHOOK_DEBUG = process.env.LOG_WEBHOOK_DEBUG === "true";
const isProduction = process.env.NODE_ENV === "production";
const log = (...args) => {
    console.log("[INSTAGRAM WEBHOOK]", ...args);
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
        return false;
    }
    const timestampMs = (0, webhookSecurity_service_1.extractMetaWebhookTimestamp)(body);
    if (!(0, webhookSecurity_service_1.isWebhookTimestampFresh)(timestampMs)) {
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
            return false;
        }
    }
    return true;
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
        log("Body parse failed", {
            message: error?.message || "Unknown error",
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
            return res.sendStatus(403);
        }
        const entry = body.entry?.[0];
        if (!entry) {
            return res.sendStatus(200);
        }
        for (const change of entry?.changes || []) {
            if (change.field !== "comments") {
                continue;
            }
            const commentText = change.value.comment?.text;
            const instagramUserId = change.value.from?.id;
            const reelId = change.value.media?.id;
            const pageId = change.value.id;
            const commentEventId = change.value.comment_id ||
                change.value.comment?.id ||
                `${pageId}:${instagramUserId}:${reelId}:${String(commentText || "").trim()}`;
            if (!commentText || !instagramUserId || !reelId || !commentEventId) {
                continue;
            }
            const shouldProcessComment = await (0, webhookDedup_service_1.processWebhookEvent)({
                eventId: String(commentEventId),
                platform: "INSTAGRAM",
            });
            if (!shouldProcessComment) {
                continue;
            }
            const client = await prisma_1.default.client.findFirst({
                where: {
                    platform: "INSTAGRAM",
                    pageId,
                    isActive: true,
                },
            });
            if (!client) {
                continue;
            }
            const access = await (0, subscriptionGuard_middleware_1.getSubscriptionAccess)(client.businessId);
            if (!access.allowed) {
                (0, subscriptionGuard_middleware_1.logSubscriptionLockedAction)({
                    businessId: client.businessId,
                    requestId: req.requestId,
                    path: req.originalUrl,
                    method: req.method,
                    action: "instagram_comment_webhook",
                    lockReason: access.lockReason,
                }, "Instagram comment webhook ignored because subscription is locked");
                continue;
            }
            await automation_queue_1.automationQueue.add("comment", {
                businessId: client.businessId,
                clientId: client.id,
                instagramUserId,
                reelId,
                commentText,
            });
        }
        let senderId;
        let text;
        let eventId;
        let pageId;
        const messaging = entry?.messaging?.[0];
        if (messaging?.message?.text && !messaging?.message?.is_echo) {
            senderId = messaging.sender?.id;
            text = messaging.message.text;
            pageId = messaging.recipient?.id || entry.id;
            eventId = messaging.message.mid;
        }
        const changeMessage = entry?.changes?.[0]?.value?.messages?.[0];
        if (!text && changeMessage?.text?.body) {
            senderId = changeMessage.from;
            text = changeMessage.text.body;
            pageId = entry.id;
            eventId = changeMessage.id;
        }
        if (!senderId || !text || !pageId) {
            return res.sendStatus(200);
        }
        if (senderId === pageId) {
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
        const client = await prisma_1.default.client.findFirst({
            where: {
                platform: "INSTAGRAM",
                pageId,
                isActive: true,
            },
            include: {
                business: {
                    select: {
                        ownerId: true,
                        subscription: {
                            include: {
                                plan: true,
                            },
                        },
                    },
                },
            },
        });
        if (!client) {
            return res.sendStatus(200);
        }
        const access = await (0, subscriptionGuard_middleware_1.getSubscriptionAccess)(client.businessId);
        if (!access.allowed) {
            (0, subscriptionGuard_middleware_1.logSubscriptionLockedAction)({
                businessId: client.businessId,
                requestId: req.requestId,
                path: req.originalUrl,
                method: req.method,
                action: "instagram_message_webhook",
                lockReason: access.lockReason,
            }, "Instagram webhook ignored because subscription is locked");
            return res.sendStatus(200);
        }
        let lead = await prisma_1.default.lead.findFirst({
            where: {
                businessId: client.businessId,
                instagramId: senderId,
            },
        });
        const instagramUsername = await (0, instagramProfile_service_1.fetchInstagramUsername)(senderId, client.accessToken);
        if (!lead) {
            const createdLead = await (0, usage_service_1.runWithContactUsageLimit)(client.businessId, (tx) => tx.lead.create({
                data: {
                    businessId: client.businessId,
                    clientId: client.id,
                    name: instagramUsername || null,
                    instagramId: senderId,
                    platform: "INSTAGRAM",
                    stage: "NEW",
                },
            })).catch((error) => {
                if (error?.code === "LIMIT_REACHED") {
                    return null;
                }
                throw error;
            });
            if (!createdLead) {
                return res.sendStatus(200);
            }
            lead = createdLead.result;
            await (0, notification_service_1.createNotification)({
                userId: client.business.ownerId,
                title: "New Lead",
                message: "A new Instagram lead has been created",
                type: "LEAD",
            });
        }
        else if (instagramUsername && !lead.name) {
            lead = await prisma_1.default.lead.update({
                where: {
                    id: lead.id,
                },
                data: {
                    name: instagramUsername,
                },
            });
        }
        const userMessage = await prisma_1.default.message.create({
            data: {
                leadId: lead.id,
                content: text,
                sender: "USER",
                metadata: {
                    externalEventId: eventId,
                    platform: "INSTAGRAM",
                },
            },
        });
        await (0, conversionTracker_service_1.recordConversionEvent)({
            businessId: client.businessId,
            leadId: lead.id,
            outcome: "replied",
            source: "INSTAGRAM_WEBHOOK",
            idempotencyKey: `reply:${eventId}`,
            occurredAt: userMessage.createdAt,
            metadata: {
                platform: "INSTAGRAM",
                externalEventId: eventId,
            },
        }).catch(() => { });
        await (0, notification_service_1.createNotification)({
            userId: client.business.ownerId,
            title: "New Message",
            message: text,
            type: "MESSAGE",
        });
        try {
            const io = (0, socket_server_1.getIO)();
            io.to(`lead_${lead.id}`).emit("new_message", userMessage);
        }
        catch { }
        const plan = client.business?.subscription?.plan || null;
        if (WEBHOOK_DEBUG) {
            log("Router job data", {
                businessId: client.businessId,
                leadId: lead.id,
                message: text,
                planType: plan?.type || null,
            });
        }
        await (0, ai_queue_1.enqueueAIBatch)([
            {
                businessId: client.businessId,
                leadId: lead.id,
                message: text,
                kind: "router",
                plan,
                platform: "INSTAGRAM",
                senderId,
                pageId,
                accessTokenEncrypted: client.accessToken,
                externalEventId: eventId,
                skipInboundPersist: true,
            },
        ], {
            source: "router",
            idempotencyKey: eventId,
        });
        log("Queued AI reply", {
            businessId: client.businessId,
            leadId: lead.id,
            eventId,
            pageId,
            senderId,
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
        req.logger?.error({ error }, "Instagram webhook error");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                webhook: "instagram",
            },
        });
        log("Webhook error:", error);
        return res.sendStatus(500);
    }
});
exports.default = router;
