"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const axios_1 = __importDefault(require("axios"));
const redis_1 = require("../config/redis");
const encrypt_1 = require("../utils/encrypt");
const aiRouter_service_1 = require("../services/aiRouter.service");
const automationEngine_service_1 = require("../services/automationEngine.service");
const aiRateLimiter_service_1 = require("../services/aiRateLimiter.service");
const socket_server_1 = require("../sockets/socket.server");
const logger_1 = __importDefault(require("../utils/logger"));
/* ---------------- HUMAN DELAY HELPER ---------------- */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const worker = new bullmq_1.Worker("aiQueue", async (job) => {
    const { businessId, leadId, message, platform, senderId, phoneNumberId, pageId, accessTokenEncrypted } = job.data;
    logger_1.default.info({ leadId, businessId, platform }, "AI Worker Processing");
    let aiReply = null;
    try {
        /* ---------------- HUMAN TAKEOVER CHECK ---------------- */
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            select: { isHumanActive: true }
        });
        if (lead?.isHumanActive) {
            logger_1.default.info({ leadId }, "AI paused because human agent is active");
            return;
        }
        /* ---------------- AUTOMATION ENGINE ---------------- */
        try {
            const automationReply = await (0, automationEngine_service_1.runAutomationEngine)({
                businessId,
                leadId,
                message,
            });
            if (automationReply) {
                aiReply = automationReply;
            }
        }
        catch (error) {
            logger_1.default.warn({ leadId, error }, "Automation engine failed");
        }
        /* ---------------- AI ROUTER ---------------- */
        if (!aiReply) {
            aiReply = await (0, aiRouter_service_1.routeAIMessage)({
                businessId,
                leadId,
                message,
            });
        }
        if (!aiReply || aiReply.trim().length === 0) {
            aiReply = "Thanks for your message!";
        }
        /* ---------------- RATE LIMIT CHECK ---------------- */
        const rate = await (0, aiRateLimiter_service_1.checkAIRateLimit)({
            businessId,
            leadId,
            platform,
        });
        if (rate.blocked) {
            logger_1.default.warn({ leadId, businessId, platform }, "AI message blocked by rate limiter");
            return;
        }
        /* ---------------- SAVE AI MESSAGE ---------------- */
        const aiMessage = await prisma_1.default.message.create({
            data: {
                leadId,
                content: aiReply,
                sender: "AI",
            },
        });
        /* ---------------- SOCKET EVENT ---------------- */
        try {
            const io = (0, socket_server_1.getIO)();
            io.to(`lead_${leadId}`).emit("new_message", aiMessage);
        }
        catch (error) {
            logger_1.default.warn({ leadId, error }, "Socket emit failed");
        }
        /* ---------------- SEND MESSAGE ---------------- */
        const accessToken = (0, encrypt_1.decrypt)(accessTokenEncrypted);
        /* ---------------- WHATSAPP ---------------- */
        if (platform === "WHATSAPP") {
            try {
                const response = await axios_1.default.post(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
                    messaging_product: "whatsapp",
                    to: senderId,
                    type: "text",
                    text: { body: aiReply },
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    timeout: 10000,
                });
                logger_1.default.info({ leadId, response: response.data }, "WhatsApp message sent");
            }
            catch (error) {
                logger_1.default.error({
                    leadId,
                    error: error?.response?.data || error.message
                }, "WhatsApp send failed");
            }
        }
        /* ---------------- INSTAGRAM ---------------- */
        if (platform === "INSTAGRAM") {
            if (!senderId || senderId === pageId) {
                logger_1.default.warn({ leadId, senderId, pageId }, "Skipping self message send");
            }
            else {
                try {
                    logger_1.default.info({ leadId, senderId, pageId, aiReply }, "Preparing Instagram reply");
                    /* HUMAN LIKE RANDOM DELAY (2-4 sec) */
                    const randomDelay = 2000 + Math.floor(Math.random() * 2000);
                    await delay(randomDelay);
                    /* TYPING INDICATOR */
                    await axios_1.default.post("https://graph.facebook.com/v19.0/me/messages", {
                        recipient: { id: senderId },
                        sender_action: "typing_on"
                    }, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        }
                    });
                    /* TYPING WAIT */
                    await delay(1500);
                    /* ACTUAL MESSAGE SEND */
                    const response = await axios_1.default.post("https://graph.facebook.com/v19.0/me/messages", {
                        recipient: { id: senderId },
                        message: { text: aiReply },
                    }, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        timeout: 10000,
                    });
                    logger_1.default.info({ leadId, response: response.data }, "Instagram message sent successfully");
                }
                catch (error) {
                    logger_1.default.error({
                        leadId,
                        senderId,
                        pageId,
                        error: error?.response?.data || error.message
                    }, "Instagram send failed");
                }
            }
        }
        /* ---------------- UPDATE LEAD ---------------- */
        prisma_1.default.lead.update({
            where: { id: leadId },
            data: {
                lastMessageAt: new Date(),
                unreadCount: { increment: 1 },
            },
        }).catch((error) => {
            logger_1.default.warn({ leadId, error }, "Lead update failed");
        });
        logger_1.default.info({ leadId }, "AI Worker Completed");
    }
    catch (error) {
        logger_1.default.error({
            leadId,
            error: error?.response?.data || error?.message || error
        }, "AI Worker Error");
        throw error;
    }
}, {
    connection: redis_1.redisConnection,
    concurrency: 5,
});
/* ---------------- WORKER ERROR HANDLING ---------------- */
worker.on("failed", (job, err) => {
    logger_1.default.error({ jobId: job?.id, error: err }, "AI Worker Failed");
});
logger_1.default.info("AI Worker Started");
