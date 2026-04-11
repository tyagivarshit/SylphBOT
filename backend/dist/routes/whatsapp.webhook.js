"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../config/prisma"));
const ai_queue_1 = require("../queues/ai.queue");
const followup_queue_1 = require("../queues/followup.queue");
const socket_server_1 = require("../sockets/socket.server");
const webhookDedup_service_1 = require("../services/webhookDedup.service");
const router = (0, express_1.Router)();
/*
---------------------------------------------------
SIGNATURE VERIFICATION
---------------------------------------------------
*/
function verifySignature(req) {
    const signature = req.headers["x-hub-signature-256"];
    const appSecret = process.env.META_APP_SECRET;
    if (!signature || !appSecret)
        return false;
    const expected = "sha256=" +
        crypto_1.default
            .createHmac("sha256", appSecret)
            .update(req.rawBody)
            .digest("hex");
    return signature === expected;
}
/*
---------------------------------------------------
WEBHOOK VERIFY
---------------------------------------------------
*/
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
/*
---------------------------------------------------
WHATSAPP WEBHOOK
---------------------------------------------------
*/
router.post("/", async (req, res) => {
    try {
        console.log("🔥 WHATSAPP WEBHOOK HIT");
        /*
        SIGNATURE VERIFY
        */
        if (process.env.NODE_ENV === "production") {
            if (!verifySignature(req)) {
                console.log("❌ Signature verification failed");
                return res.sendStatus(403);
            }
        }
        const body = JSON.parse(req.body.toString());
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message)
            return res.sendStatus(200);
        /*
        WEBHOOK DEDUP
        */
        const eventId = message?.id;
        const shouldProcess = await (0, webhookDedup_service_1.processWebhookEvent)({
            eventId,
            platform: "WHATSAPP",
        });
        if (!shouldProcess) {
            console.log("⚠️ Duplicate webhook ignored");
            return res.sendStatus(200);
        }
        const from = message.from;
        const text = message.text?.body;
        const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
        if (!from || !text || !phoneNumberId) {
            return res.sendStatus(200);
        }
        console.log("📩 Incoming:", text);
        /*
        FIND CLIENT
        */
        const client = await prisma_1.default.client.findFirst({
            where: {
                platform: "WHATSAPP",
                phoneNumberId: phoneNumberId,
                isActive: true,
            },
        });
        if (!client) {
            console.log("⚠️ Client not found");
            return res.sendStatus(200);
        }
        /*
        PLAN CHECK
        */
        const subscription = await prisma_1.default.subscription.findUnique({
            where: { businessId: client.businessId },
            include: { plan: true },
        });
        if (!subscription || !subscription.plan) {
            console.log("❌ No subscription");
            return res.sendStatus(200);
        }
        const planName = subscription.plan.name;
        if (planName === "BASIC") {
            console.log("🚫 BASIC plan blocked");
            return res.sendStatus(200);
        }
        /*
        FIND OR CREATE LEAD
        */
        let lead = await prisma_1.default.lead.findFirst({
            where: {
                businessId: client.businessId,
                phone: from,
            },
        });
        if (!lead) {
            lead = await prisma_1.default.lead.create({
                data: {
                    businessId: client.businessId,
                    clientId: client.id,
                    phone: from,
                    platform: "WHATSAPP",
                    stage: "NEW",
                    followupCount: 0,
                },
            });
            console.log("👤 Lead created");
        }
        /*
        SAVE USER MESSAGE
        */
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
        /*
        REALTIME SOCKET
        */
        const io = (0, socket_server_1.getIO)();
        io.to(`lead_${lead.id}`).emit("new_message", userMessage);
        /*
        ADD AI JOB
        */
        await (0, ai_queue_1.addRouterJob)({
            businessId: client.businessId,
            leadId: lead.id,
            message: text,
            plan: subscription.plan,
            platform: "WHATSAPP",
            senderId: from,
            phoneNumberId,
            accessTokenEncrypted: client.accessToken,
            externalEventId: eventId,
        });
        /*
        UPDATE LEAD
        */
        await prisma_1.default.lead.update({
            where: { id: lead.id },
            data: {
                lastMessageAt: new Date(),
                followupCount: 0,
                unreadCount: { increment: 1 },
            },
        });
        /*
        RESET FOLLOWUPS
        */
        await (0, followup_queue_1.cancelFollowups)(lead.id);
        await (0, followup_queue_1.scheduleFollowups)(lead.id);
        return res.sendStatus(200);
    }
    catch (error) {
        console.error("🚨 WHATSAPP WEBHOOK ERROR:", error);
        return res.sendStatus(500);
    }
});
exports.default = router;
