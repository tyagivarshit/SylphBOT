"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const axios_1 = __importDefault(require("axios"));
const encrypt_1 = require("../utils/encrypt");
const retry_utils_1 = require("../utils/retry.utils");
const executionRouter_servce_1 = require("../services/executionRouter.servce"); // 🔥 FINAL ROUTER
const aiRouter_service_1 = require("../services/aiRouter.service"); // fallback only
const automationEngine_service_1 = require("../services/automationEngine.service");
const aiRateLimiter_service_1 = require("../services/aiRateLimiter.service");
const bookingPriorityRouter_service_1 = require("../services/bookingPriorityRouter.service");
const socket_server_1 = require("../sockets/socket.server");
const logger_1 = __importDefault(require("../utils/logger"));
const Sentry = __importStar(require("@sentry/node"));
/* ---------------- DELAY ---------------- */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const worker = new bullmq_1.Worker("aiQueue", async (job) => {
    /* =====================================================
    🧠 LEVEL 4 ROUTER ENTRY (MAIN SYSTEM)
    ===================================================== */
    if (job.name === "router") {
        try {
            const reply = await (0, executionRouter_servce_1.handleIncomingMessage)({
                ...job.data,
                plan: job.data.plan || null, // 🔥 FORCE PLAN PASS
            });
            if (!reply)
                return;
            return await processAndSendReply(job.data, reply);
        }
        catch (err) {
            logger_1.default.error({
                error: err?.message || err,
                stack: err?.stack,
                jobData: job.data,
            }, "❌ Router execution failed");
            throw err;
        }
    }
    /* =====================================================
    🔁 FALLBACK FLOW (OLD SYSTEM - SAFE MODE)
    ===================================================== */
    return await legacyExecution({
        ...job.data,
        plan: job.data.plan || null, // 🔥 ALSO FIX HERE
    });
}, {
    connection: { url: process.env.REDIS_URL },
    concurrency: 10,
});
/* =====================================================
📤 COMMON RESPONSE HANDLER
===================================================== */
const processAndSendReply = async (data, aiReply) => {
    const { businessId, leadId, platform, senderId, phoneNumberId, accessTokenEncrypted, } = data;
    try {
        /* =====================================================
        🔥 SAFE PARSE (NEW FIX - NO LOGIC CHANGE)
        ===================================================== */
        let replyText = typeof aiReply === "string"
            ? aiReply
            : aiReply?.message || "Thanks for your message! 😊";
        const cta = typeof aiReply === "object" ? aiReply?.cta : undefined;
        /* 🔥 TRIM SAME (YOUR ORIGINAL LOGIC SAFE) */
        replyText = replyText.trim();
        if (!replyText)
            return;
        /* ===================================================== */
        if (replyText.length > 1000) {
            replyText = replyText.slice(0, 1000);
        }
        const rate = await (0, aiRateLimiter_service_1.checkAIRateLimit)({
            businessId,
            leadId,
            platform,
        });
        if (rate.blocked) {
            logger_1.default.warn("🚫 Rate limit hit");
            return;
        }
        const aiMessage = await prisma_1.default.message.create({
            data: {
                leadId,
                content: replyText,
                sender: "AI",
                metadata: {
                    cta: cta || null, // 🔥 STORE CTA
                },
            },
        });
        try {
            const io = (0, socket_server_1.getIO)();
            io.to(`lead_${leadId}`).emit("new_message", {
                ...aiMessage,
                cta: cta || null, // 🔥 SEND CTA REALTIME
            });
        }
        catch { }
        const accessToken = (0, encrypt_1.decrypt)(accessTokenEncrypted);
        const sendMessage = async () => {
            if (platform === "WHATSAPP") {
                await axios_1.default.post(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
                    messaging_product: "whatsapp",
                    to: senderId,
                    type: "text",
                    text: { body: replyText },
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    timeout: 10000,
                });
            }
            if (platform === "INSTAGRAM") {
                if (!senderId)
                    return;
                await delay(500 + Math.random() * 1000);
                await axios_1.default.post("https://graph.facebook.com/v19.0/me/messages", {
                    recipient: { id: senderId },
                    message: { text: replyText },
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    timeout: 10000,
                });
            }
        };
        await (0, retry_utils_1.retryAsync)(sendMessage, 3, 800);
        await prisma_1.default.lead.update({
            where: { id: leadId },
            data: {
                lastMessageAt: new Date(),
                unreadCount: { increment: 1 },
            },
        });
    }
    catch (error) {
        if (error instanceof Error) {
            logger_1.default.error("❌ Legacy flow failed: " + error.message);
        }
        Sentry.captureException(error);
        throw error;
    }
};
/* =====================================================
🧠 LEGACY EXECUTION (FIXED PLAN PASS)
===================================================== */
const legacyExecution = async (data) => {
    const { businessId, leadId, message, plan, } = data;
    let aiReply = null;
    try {
        const lowerMsg = message?.toLowerCase() || "";
        if (lowerMsg.includes("conversation limit reached") ||
            lowerMsg.includes("our team will assist") ||
            lowerMsg.includes("please wait")) {
            logger_1.default.warn("🚫 Blocked loop/system message");
            return;
        }
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            select: { isHumanActive: true },
        });
        if (lead?.isHumanActive)
            return;
        /* ---------------- BOOKING ---------------- */
        try {
            const bookingReply = await (0, bookingPriorityRouter_service_1.bookingPriorityRouter)({
                businessId,
                leadId,
                message,
                plan, // 🔥 FIXED
            });
            if (bookingReply)
                aiReply = bookingReply;
        }
        catch (err) {
            logger_1.default.warn({ err }, "Booking failed");
        }
        /* ---------------- AUTOMATION ---------------- */
        if (!aiReply) {
            try {
                const automationReply = await (0, automationEngine_service_1.runAutomationEngine)({
                    businessId,
                    leadId,
                    message,
                });
                if (automationReply)
                    aiReply = automationReply;
            }
            catch (err) {
                logger_1.default.warn({ err }, "Automation failed");
            }
        }
        /* ---------------- AI ---------------- */
        if (!aiReply) {
            const aiResponse = await (0, aiRouter_service_1.routeAIMessage)({
                businessId,
                leadId,
                message,
                plan,
            });
            aiReply =
                typeof aiResponse === "string"
                    ? aiResponse
                    : aiResponse?.message;
        }
        if (!aiReply)
            return;
        return await processAndSendReply(data, aiReply);
    }
    catch (error) {
        if (error instanceof Error) {
            logger_1.default.error("❌ Legacy flow failed: " + error.message);
        }
        Sentry.captureException(error);
        throw error;
    }
};
/* ===================================================== */
worker.on("failed", (job, err) => {
    logger_1.default.error({ jobId: job?.id, err }, "Worker failed");
});
logger_1.default.info("🔥 AI Worker Started (Level 4 Fixed)");
