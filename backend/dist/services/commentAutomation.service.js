"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCommentAutomation = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const axios_1 = __importDefault(require("axios"));
const encrypt_1 = require("../utils/encrypt");
const ai_service_1 = require("./ai.service");
const plan_config_1 = require("../config/plan.config");
const rateLimiter_redis_1 = require("../redis/rateLimiter.redis");
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default(process.env.REDIS_URL);
const handleCommentAutomation = async ({ businessId, clientId, instagramUserId, reelId, commentText, }) => {
    try {
        const text = commentText?.toLowerCase()?.trim();
        if (!text)
            return;
        /* RATE LIMIT */
        try {
            await (0, rateLimiter_redis_1.incrementRate)(businessId, instagramUserId, "COMMENT", 60);
        }
        catch {
            return;
        }
        /* PLAN CHECK */
        const subscription = await prisma_1.default.subscription.findUnique({
            where: { businessId },
            include: { plan: true },
        });
        const plan = subscription?.plan || null;
        if (!(0, plan_config_1.hasFeature)(plan, "automationEnabled"))
            return;
        /* FETCH TRIGGERS */
        const cacheKey = `triggers:${businessId}:${clientId}:${reelId}`;
        let triggers = await redis.get(cacheKey);
        if (triggers) {
            triggers = JSON.parse(triggers);
        }
        else {
            triggers = await prisma_1.default.commentTrigger.findMany({
                where: {
                    businessId,
                    clientId,
                    reelId,
                    isActive: true,
                },
                orderBy: { createdAt: "asc" },
            });
            await redis.set(cacheKey, JSON.stringify(triggers), "EX", 300);
        }
        if (!triggers.length)
            return;
        /* 🔥 MULTI KEYWORD MATCH */
        const matchedTrigger = triggers.find((t) => {
            const keywords = t.keyword
                ?.toLowerCase()
                ?.split(",")
                ?.map((k) => k.trim());
            if (!keywords?.length)
                return false;
            return keywords.some((k) => text.includes(k));
        });
        if (!matchedTrigger)
            return;
        /* LEAD */
        let lead = await prisma_1.default.lead.findFirst({
            where: {
                businessId,
                instagramId: instagramUserId,
            },
        });
        if (!lead) {
            lead = await prisma_1.default.lead.create({
                data: {
                    businessId,
                    clientId,
                    instagramId: instagramUserId,
                    platform: "INSTAGRAM",
                    stage: "NEW",
                    followupCount: 0,
                },
            });
        }
        /* DUPLICATE PROTECTION */
        const recentAIMessage = await prisma_1.default.message.findFirst({
            where: {
                leadId: lead.id,
                sender: "AI",
            },
            orderBy: { createdAt: "desc" },
        });
        if (recentAIMessage) {
            const diff = Date.now() - new Date(recentAIMessage.createdAt).getTime();
            if (diff < 5 * 60 * 1000)
                return;
        }
        /* CLIENT TOKEN */
        const client = await prisma_1.default.client.findUnique({
            where: { id: clientId },
        });
        if (!client?.accessToken)
            return;
        const accessToken = (0, encrypt_1.decrypt)(client.accessToken);
        /* 🔥 REPLY LOGIC */
        let replyMessage = matchedTrigger.dmText ||
            matchedTrigger.replyText ||
            "Thanks for your comment!";
        /* 🔥 AI ONLY IF NEEDED */
        if (!matchedTrigger.dmText && matchedTrigger.aiPrompt) {
            try {
                const aiResponse = await (0, ai_service_1.generateAIReply)({
                    businessId,
                    leadId: lead.id,
                    message: commentText +
                        "\n\nContext: " +
                        matchedTrigger.aiPrompt,
                });
                if (aiResponse)
                    replyMessage = aiResponse;
            }
            catch { }
        }
        /* COMMENT REPLY */
        const commentReply = matchedTrigger.replyText || "Check your DM 👀";
        try {
            await axios_1.default.post(`https://graph.facebook.com/v19.0/${reelId}/comments`, { message: commentReply }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                timeout: 10000,
            });
        }
        catch { }
        /* DM SEND */
        try {
            await axios_1.default.post("https://graph.facebook.com/v19.0/me/messages", {
                recipient: { id: instagramUserId },
                message: { text: replyMessage },
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            });
        }
        catch { }
        /* SAVE */
        await prisma_1.default.message.create({
            data: {
                leadId: lead.id,
                content: replyMessage,
                sender: "AI",
            },
        });
        await prisma_1.default.lead.update({
            where: { id: lead.id },
            data: {
                lastMessageAt: new Date(),
            },
        });
    }
    catch (error) {
        console.error("🚨 Comment automation error:", error);
    }
};
exports.handleCommentAutomation = handleCommentAutomation;
