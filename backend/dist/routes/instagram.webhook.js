"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../config/prisma"));
const followup_queue_1 = require("../queues/followup.queue");
/* 🔥 CHANGED: AI → ROUTER */
const ai_queue_1 = require("../queues/ai.queue");
const socket_server_1 = require("../sockets/socket.server");
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const notification_service_1 = require("../services/notification.service");
/* 🔥 ADDED (QUEUE) */
const automation_queue_1 = require("../queues/automation.queue");
const router = (0, express_1.Router)();
/* --------------------------------------------------- */
const log = (...args) => {
    console.log("[INSTAGRAM WEBHOOK]", ...args);
};
/* --------------------------------------------------- */
/* SIGNATURE VERIFY */
/* --------------------------------------------------- */
const verifySignature = (req) => {
    try {
        const signature = req.headers["x-hub-signature-256"];
        const appSecret = process.env.META_APP_SECRET;
        if (!signature || !appSecret)
            return false;
        const expected = "sha256=" +
            crypto_1.default
                .createHmac("sha256", appSecret)
                .update(req.body)
                .digest("hex");
        return signature === expected;
    }
    catch {
        return false;
    }
};
/* --------------------------------------------------- */
/* WEBHOOK VERIFY */
/* --------------------------------------------------- */
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
/* --------------------------------------------------- */
/* INSTAGRAM WEBHOOK */
/* --------------------------------------------------- */
router.post("/", async (req, res) => {
    console.log("🔥 RAW BODY:", JSON.stringify(req.body, null, 2));
    console.log("🔥 INSTAGRAM WEBHOOK HIT");
    let body;
    try {
        body = Buffer.isBuffer(req.body)
            ? JSON.parse(req.body.toString("utf8"))
            : req.body;
    }
    catch {
        log("Body parse failed");
        return res.sendStatus(400);
    }
    try {
        if (process.env.NODE_ENV === "production" && !verifySignature(req)) {
            log("Invalid signature");
            return res.sendStatus(403);
        }
        const entry = body.entry?.[0];
        if (!entry)
            return res.sendStatus(200);
        /* ---------------------------------------------------
        COMMENT AUTOMATION
        --------------------------------------------------- */
        for (const change of entry?.changes || []) {
            if (change.field === "comments") {
                const commentText = change.value.comment?.text;
                const instagramUserId = change.value.from?.id;
                const reelId = change.value.media?.id;
                const pageId = change.value.id;
                if (!commentText || !instagramUserId || !reelId)
                    continue;
                const client = await prisma_1.default.client.findFirst({
                    where: {
                        platform: "INSTAGRAM",
                        pageId,
                        isActive: true,
                    },
                });
                if (!client)
                    continue;
                await automation_queue_1.automationQueue.add("comment", {
                    businessId: client.businessId,
                    clientId: client.id,
                    instagramUserId,
                    reelId,
                    commentText,
                });
            }
        }
        /* ---------------------------------------------------
        MESSAGE DETECTION
        --------------------------------------------------- */
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
        if (!senderId || !text)
            return res.sendStatus(200);
        if (pageId && senderId === pageId)
            return res.sendStatus(200);
        const lowerText = text.toLowerCase();
        if (lowerText.includes("please wait") ||
            lowerText.includes("moment before sending")) {
            return res.sendStatus(200);
        }
        if (!eventId)
            return res.sendStatus(200);
        const shouldProcess = await (0, webhookDedup_service_1.processWebhookEvent)({
            eventId,
            platform: "INSTAGRAM",
        });
        if (!shouldProcess)
            return res.sendStatus(200);
        /* ---------------------------------------------------
        CLIENT (🔥 FIXED PLAN FETCH)
        --------------------------------------------------- */
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
                                plan: true, // 🔥 FIX
                            },
                        },
                    },
                },
            },
        });
        if (!client)
            return res.sendStatus(200);
        /* ---------------------------------------------------
        LEAD
        --------------------------------------------------- */
        let lead = await prisma_1.default.lead.findFirst({
            where: {
                businessId: client.businessId,
                instagramId: senderId,
            },
        });
        if (!lead) {
            lead = await prisma_1.default.lead.create({
                data: {
                    businessId: client.businessId,
                    clientId: client.id,
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
        /* ---------------------------------------------------
        SAVE MESSAGE
        --------------------------------------------------- */
        const userMessage = await prisma_1.default.message.create({
            data: {
                leadId: lead.id,
                content: text,
                sender: "USER",
            },
        });
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
        /* ---------------------------------------------------
        🧠 ROUTER JOB (FINAL FIX)
        --------------------------------------------------- */
        const plan = client.business?.subscription?.plan || null;
        console.log("PLAN DEBUG FULL:", JSON.stringify(plan, null, 2));
        console.log("ROUTER JOB DATA:", {
            businessId: client.businessId,
            leadId: lead.id,
            message: text,
            plan,
        });
        await (0, ai_queue_1.addRouterJob)({
            businessId: client.businessId,
            leadId: lead.id,
            message: text,
            plan, // ✅ FINAL FIX
            platform: "INSTAGRAM",
            senderId,
            pageId,
            accessTokenEncrypted: client.accessToken,
        });
        /* ---------------------------------------------------
        UPDATE LEAD
        --------------------------------------------------- */
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
