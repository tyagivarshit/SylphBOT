"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const encrypt_1 = require("../utils/encrypt");
const socket_server_1 = require("../sockets/socket.server");
const followup_service_1 = require("../services/salesAgent/followup.service");
const conversionTracker_service_1 = require("../services/salesAgent/conversionTracker.service");
const aiPipelineState_service_1 = require("../services/aiPipelineState.service");
const logger_1 = __importDefault(require("../utils/logger"));
/* 🔥 SYSTEM MESSAGE FILTER */
const isSystemGenerated = (msg) => {
    const m = msg.toLowerCase();
    return (m.includes("please wait") ||
        m.includes("try again later") ||
        m.includes("conversation limit reached"));
};
const buildFollowupJobKey = (job) => `followup:${String(job.id || `${job.data?.leadId || "unknown"}:${job.data?.type || "step"}`)}`;
const saveFollowupMessage = async ({ jobKey, leadId, message, cta, angle, trigger, variantId, variantKey, decision, jobId, }) => {
    const deliveryState = await (0, aiPipelineState_service_1.getReplyDeliveryState)(jobKey);
    if (deliveryState.savedMessageId) {
        const existing = await prisma_1.default.message.findUnique({
            where: { id: deliveryState.savedMessageId },
        });
        if (existing) {
            return {
                message: existing,
                created: false,
            };
        }
    }
    const aiMessage = await prisma_1.default.message.create({
        data: {
            leadId,
            content: message,
            sender: "AI",
            metadata: {
                source: "FOLLOWUP",
                cta,
                angle,
                trigger,
                variantId: variantId || null,
                variantKey: variantKey || null,
                jobId: jobId || null,
                deliveryJobKey: jobKey,
                decisionCTA: decision?.cta || null,
                decisionCTAStyle: decision?.ctaStyle || null,
                decisionTone: decision?.tone || null,
                decisionStructure: decision?.structure || null,
                decisionStrategy: decision?.strategy || null,
                topPatterns: decision?.topPatterns || [],
            },
        },
    });
    await (0, aiPipelineState_service_1.markReplySaved)(jobKey, aiMessage.id);
    return {
        message: aiMessage,
        created: true,
    };
};
if (process.env.RUN_WORKER === "true") {
    new bullmq_1.Worker("followupQueue", async (job) => {
        try {
            const { leadId, type, trigger } = job.data;
            console.log(`⏳ Processing followup ${type} for lead ${leadId}`);
            logger_1.default.info({ leadId, type, trigger }, "Processing sales follow-up");
            const payload = await (0, followup_service_1.generateSalesFollowupMessage)({
                leadId,
                step: type,
            });
            if (!payload)
                return;
            const { lead, message, cta, angle, planKey, temperature, decision, variant, } = payload;
            const jobKey = buildFollowupJobKey(job);
            /* ---------------- HARD STOP CONDITIONS ---------------- */
            if (lead.isHumanActive) {
                console.log("🛑 Human takeover active");
                return;
            }
            if (lead.stage === "CLOSED" || lead.stage === "BOOKED_CALL") {
                console.log("🛑 Lead already converted");
                return;
            }
            /* USER REPLIED → STOP */
            if (false) {
                console.log("🛑 User replied, stopping followups");
                return;
            }
            /* LIMIT */
            if ((lead.followupCount ?? 0) >= 2) {
                console.log("🚫 Followup limit reached");
                return;
            }
            if (!message || isSystemGenerated(message)) {
                return;
            }
            const deliveryState = await (0, aiPipelineState_service_1.getReplyDeliveryState)(jobKey);
            const accessToken = (0, encrypt_1.decrypt)(lead.client.accessToken);
            const { message: aiMessage, created } = await saveFollowupMessage({
                jobKey,
                leadId: lead.id,
                message,
                cta,
                angle,
                trigger: payload.trigger,
                variantId: variant?.id || null,
                variantKey: variant?.variantKey || null,
                decision,
                jobId: job.id || null,
            });
            /* ---------------- SEND MESSAGE ---------------- */
            if (!deliveryState.sent) {
                if (lead.platform === "WHATSAPP") {
                    if (!lead.client.phoneNumberId || !lead.phone)
                        return;
                    await axios_1.default.post(`https://graph.facebook.com/v19.0/${lead.client.phoneNumberId}/messages`, {
                        messaging_product: "whatsapp",
                        to: lead.phone,
                        type: "text",
                        text: { body: message },
                    }, {
                        timeout: 10000,
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    });
                }
                else if (lead.platform === "INSTAGRAM") {
                    if (!lead.instagramId)
                        return;
                    await axios_1.default.post(`https://graph.facebook.com/v19.0/me/messages`, {
                        recipient: { id: lead.instagramId },
                        message: { text: message },
                    }, {
                        timeout: 10000,
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    });
                }
                await (0, aiPipelineState_service_1.markReplySent)(jobKey);
            }
            await (0, conversionTracker_service_1.trackAIMessage)({
                messageId: aiMessage.id,
                businessId: lead.businessId,
                leadId: lead.id,
                clientId: lead.clientId || null,
                variantId: variant?.id || null,
                source: "FOLLOWUP",
                cta,
                angle,
                leadState: lead.revenueState || lead.aiStage || null,
                messageType: "FOLLOWUP",
                traceId: String(job.id || ""),
                metadata: {
                    trigger: payload.trigger,
                    step: type,
                    variantKey: variant?.variantKey || null,
                    decisionCTA: decision?.cta || null,
                    decisionCTAStyle: decision?.ctaStyle || null,
                    decisionTone: decision?.tone || null,
                    decisionStructure: decision?.structure || null,
                    decisionStrategy: decision?.strategy || null,
                    topPatterns: decision?.topPatterns || [],
                },
            }).catch((error) => {
                logger_1.default.warn({
                    leadId: lead.id,
                    messageId: aiMessage.id,
                    error,
                }, "Follow-up message attribution failed");
            });
            /* ---------------- SOCKET ---------------- */
            if (created) {
                try {
                    const io = (0, socket_server_1.getIO)();
                    io.to(`lead_${lead.id}`).emit("new_message", aiMessage);
                }
                catch { }
            }
            /* ---------------- UPDATE ---------------- */
            if (created) {
                await prisma_1.default.lead.update({
                    where: { id: lead.id },
                    data: {
                        followupCount: { increment: 1 },
                        lastFollowupAt: new Date(),
                    },
                });
            }
            console.log(`✅ Followup ${type} sent`);
            await (0, followup_service_1.logSalesFollowupMessage)({
                businessId: lead.businessId,
                leadId: lead.id,
                step: type,
                cta,
                angle,
                planKey,
                temperature,
                trigger: payload.trigger,
                variantId: variant?.id || null,
            });
        }
        catch (err) {
            console.log("🚨 FOLLOWUP WORKER ERROR:");
            console.log(err.response?.data ||
                err.message ||
                err);
            throw err;
        }
    }, {
        connection: (0, redis_1.getWorkerRedisConnection)(),
        concurrency: 5,
    });
    console.log("🚀 Followup Worker Started");
}
