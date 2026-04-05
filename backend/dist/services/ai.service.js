"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIReply = void 0;
const openai_1 = __importDefault(require("openai"));
const prisma_1 = __importDefault(require("../config/prisma"));
const monthlyUsage_helper_1 = require("../utils/monthlyUsage.helper");
/* FUNNEL */
const aiFunnel_service_1 = require("./aiFunnel.service");
/* MEMORY */
const aiMemoryEngine_service_1 = require("./aiMemoryEngine.service");
/* SUMMARY */
const conversationSummary_service_1 = require("./conversationSummary.service");
const openai = new openai_1.default({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});
/* ---------------- SYSTEM FILTER ---------------- */
const isSystemMessage = (message) => {
    const msg = message.toLowerCase();
    return (msg.includes("please wait") ||
        msg.includes("moment before sending") ||
        msg.includes("try again later") ||
        msg.includes("conversation limit reached"));
};
/* ---------------- ABUSE CHECK ---------------- */
const checkAIAbuse = async (leadId, message) => {
    const normalized = message.toLowerCase().trim();
    const recentMessages = await prisma_1.default.message.findMany({
        where: { leadId, sender: "USER" },
        orderBy: { createdAt: "desc" },
        take: 5,
    });
    const sameCount = recentMessages.filter((m) => m.content?.toLowerCase().trim() === normalized).length;
    if (sameCount >= 3) {
        return { blocked: true, reason: "SPAM" };
    }
    const aiCount = await prisma_1.default.message.count({
        where: { leadId, sender: "AI" },
    });
    if (aiCount >= 100) {
        return { blocked: true, reason: "LIMIT" };
    }
    return { blocked: false };
};
/* ---------------- USAGE ---------------- */
const checkUsage = async (businessId) => {
    const { month, year } = (0, monthlyUsage_helper_1.getCurrentMonthYear)();
    const subscription = await prisma_1.default.subscription.findUnique({
        where: { businessId },
        include: { plan: true },
    });
    if (!subscription || subscription.status !== "ACTIVE") {
        return { blocked: true, reason: "INACTIVE" };
    }
    let usage = await prisma_1.default.usage.findUnique({
        where: {
            businessId_month_year: { businessId, month, year },
        },
    });
    if (!usage) {
        usage = await prisma_1.default.usage.create({
            data: {
                businessId,
                month,
                year,
                aiCallsUsed: 0,
                messagesUsed: 0,
                followupsUsed: 0,
            },
        });
    }
    if (usage.aiCallsUsed >= subscription.plan.maxAiCalls) {
        return { blocked: true, reason: "LIMIT" };
    }
    return { blocked: false, plan: subscription.plan.name };
};
const incrementUsage = async (businessId) => {
    const { month, year } = (0, monthlyUsage_helper_1.getCurrentMonthYear)();
    await prisma_1.default.usage.update({
        where: {
            businessId_month_year: { businessId, month, year },
        },
        data: {
            aiCallsUsed: { increment: 1 },
            messagesUsed: { increment: 1 },
        },
    });
};
/* ---------------- MAIN AI ---------------- */
const generateAIReply = async ({ businessId, leadId, message, }) => {
    try {
        const cleanMessage = message?.trim();
        if (!cleanMessage)
            return null;
        if (isSystemMessage(cleanMessage))
            return null;
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            select: { isHumanActive: true },
        });
        if (lead?.isHumanActive)
            return null;
        const abuse = await checkAIAbuse(leadId, cleanMessage);
        if (abuse.blocked) {
            if (abuse.reason === "SPAM") {
                return "Please avoid repeating the same message.";
            }
            return null;
        }
        const usage = await checkUsage(businessId);
        if (usage.blocked)
            return null;
        const plan = usage.plan || "FREE";
        let finalReply = null;
        /* ============================= */
        /* FUNNEL */
        /* ============================= */
        if (plan === "PRO" || plan === "ENTERPRISE") {
            const reply = await (0, aiFunnel_service_1.generateAIFunnelReply)({
                businessId,
                leadId,
                message: cleanMessage,
            });
            if (typeof reply === "string") {
                const cleaned = reply.trim();
                if (cleaned.length > 0) {
                    finalReply = cleaned;
                }
            }
        }
        /* ============================= */
        /* FINAL CHECK */
        /* ============================= */
        if (!finalReply)
            return null;
        const safeReply = finalReply;
        /* SAVE */
        await prisma_1.default.message.create({
            data: {
                leadId,
                content: safeReply,
                sender: "AI",
            },
        });
        await incrementUsage(businessId);
        /* MEMORY */
        const cleanForMemory = safeReply.toLowerCase().trim();
        await (0, aiMemoryEngine_service_1.buildMemoryContext)(leadId);
        await (0, aiMemoryEngine_service_1.updateMemory)(leadId, cleanForMemory);
        /* SUMMARY */
        const count = await prisma_1.default.message.count({
            where: { leadId },
        });
        if (count % 10 === 0) {
            await (0, conversationSummary_service_1.generateConversationSummary)(leadId);
        }
        return safeReply;
    }
    catch (error) {
        console.error("🚨 AI SERVICE ERROR:", error);
        return null;
    }
};
exports.generateAIReply = generateAIReply;
