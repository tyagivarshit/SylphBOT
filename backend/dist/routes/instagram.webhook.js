"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../config/prisma"));
const ai_queue_1 = require("../queues/ai.queue");
const automation_queue_1 = require("../queues/automation.queue");
const followup_queue_1 = require("../queues/followup.queue");
const socket_server_1 = require("../sockets/socket.server");
const instagramProfile_service_1 = require("../services/instagramProfile.service");
const notification_service_1 = require("../services/notification.service");
const conversionTracker_service_1 = require("../services/salesAgent/conversionTracker.service");
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const router = (0, express_1.Router)();
const WEBHOOK_DEBUG = process.env.LOG_WEBHOOK_DEBUG === "true";
const isProduction = process.env.NODE_ENV === "production";
const log = (...args) => {
    console.log("[INSTAGRAM WEBHOOK]", ...args);
};
const verifySignature = (req) => {
    try {
        const signature = req.headers["x-hub-signature-256"];
        const appSecret = process.env.META_APP_SECRET;
        const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : req.body;
        if (!signature || !appSecret || !Buffer.isBuffer(rawBody)) {
            return false;
        }
        const expected = Buffer.from("sha256=" +
            crypto_1.default
                .createHmac("sha256", appSecret)
                .update(rawBody)
                .digest("hex"));
        const received = Buffer.from(signature);
        if (expected.length !== received.length) {
            return false;
        }
        return crypto_1.default.timingSafeEqual(received, expected);
    }
    catch {
        return false;
    }
};
const parseWebhookBody = (req) => {
    if (Buffer.isBuffer(req.body)) {
        return JSON.parse(req.body.toString("utf8"));
    }
    if (Buffer.isBuffer(req.rawBody)) {
        return JSON.parse(req.rawBody.toString("utf8"));
    }
    if (req.body && typeof req.body === "object") {
        return req.body;
    }
    throw new Error("Invalid webhook body");
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
        if (isProduction && !verifySignature(req)) {
            log("Signature verification failed");
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
            if (!commentText || !instagramUserId || !reelId) {
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
        let lead = await prisma_1.default.lead.findFirst({
            where: {
                businessId: client.businessId,
                instagramId: senderId,
            },
        });
        const instagramUsername = await (0, instagramProfile_service_1.fetchInstagramUsername)(senderId, client.accessToken);
        if (!lead) {
            lead = await prisma_1.default.lead.create({
                data: {
                    businessId: client.businessId,
                    clientId: client.id,
                    name: instagramUsername || null,
                    instagramId: senderId,
                    platform: "INSTAGRAM",
                    stage: "NEW",
                },
            });
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
        log("Webhook error:", error);
        return res.sendStatus(500);
    }
});
exports.default = router;
