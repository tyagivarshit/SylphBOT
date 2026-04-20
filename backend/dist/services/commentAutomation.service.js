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
const usage_service_1 = require("./usage.service");
const redis_1 = __importDefault(require("../config/redis"));
const buildCommentAIMessage = (commentText, aiPrompt) => {
    const sections = [`Lead message:\n${String(commentText || "").trim()}`];
    const prompt = String(aiPrompt || "").trim();
    if (prompt) {
        sections.push(`Reply instruction:\n${prompt}`);
    }
    return sections.join("\n\n");
};
const handleCommentAutomation = async ({ businessId, clientId, instagramUserId, reelId, commentText, }) => {
    let executed = false;
    let messageSent = false;
    try {
        const text = commentText?.toLowerCase()?.trim();
        if (!text) {
            return { executed, messageSent };
        }
        try {
            await (0, rateLimiter_redis_1.incrementRate)(businessId, instagramUserId, "COMMENT", 60);
        }
        catch {
            return { executed, messageSent };
        }
        const subscription = await prisma_1.default.subscription.findUnique({
            where: { businessId },
            include: { plan: true },
        });
        const plan = subscription?.plan || null;
        if (!(0, plan_config_1.hasFeature)(plan, "automationEnabled")) {
            return { executed, messageSent };
        }
        const cacheKey = `triggers:${businessId}:${clientId}:${reelId}`;
        let triggers = await redis_1.default.get(cacheKey);
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
            await redis_1.default.set(cacheKey, JSON.stringify(triggers), "EX", 300);
        }
        if (!triggers.length) {
            return { executed, messageSent };
        }
        const matchedTrigger = triggers.find((trigger) => {
            const keywords = trigger.keyword
                ?.toLowerCase()
                ?.split(",")
                ?.map((keyword) => keyword.trim());
            if (!keywords?.length)
                return false;
            return keywords.some((keyword) => text.includes(keyword));
        });
        if (!matchedTrigger) {
            return { executed, messageSent };
        }
        let lead = await prisma_1.default.lead.findFirst({
            where: {
                businessId,
                instagramId: instagramUserId,
            },
        });
        if (!lead) {
            const createdLead = await (0, usage_service_1.runWithContactUsageLimit)(businessId, (tx) => tx.lead.create({
                data: {
                    businessId,
                    clientId,
                    instagramId: instagramUserId,
                    platform: "INSTAGRAM",
                    stage: "NEW",
                    followupCount: 0,
                },
            })).catch((error) => {
                if (error?.code === "LIMIT_REACHED") {
                    return null;
                }
                throw error;
            });
            if (!createdLead) {
                return { executed, messageSent };
            }
            lead = createdLead.result;
        }
        const recentAIMessage = await prisma_1.default.message.findFirst({
            where: {
                leadId: lead.id,
                sender: "AI",
            },
            orderBy: { createdAt: "desc" },
        });
        if (recentAIMessage) {
            const diff = Date.now() - new Date(recentAIMessage.createdAt).getTime();
            if (diff < 5 * 60 * 1000) {
                return { executed, messageSent };
            }
        }
        const client = await prisma_1.default.client.findUnique({
            where: { id: clientId },
        });
        if (!client?.accessToken) {
            return { executed, messageSent };
        }
        const accessToken = (0, encrypt_1.decrypt)(client.accessToken);
        let replyMessage = matchedTrigger.dmText ||
            matchedTrigger.replyText ||
            "Thanks for your comment!";
        if (!matchedTrigger.dmText && matchedTrigger.aiPrompt) {
            let aiReservation = null;
            try {
                aiReservation = await (0, usage_service_1.reserveAIUsageExecution)({
                    businessId,
                });
                const aiResponse = await (0, ai_service_1.generateAIReply)({
                    businessId,
                    leadId: lead.id,
                    message: buildCommentAIMessage(commentText, matchedTrigger.aiPrompt),
                    source: "COMMENT_AUTOMATION",
                });
                if (aiResponse) {
                    replyMessage = aiResponse;
                    await (0, usage_service_1.finalizeAIUsageExecution)(aiReservation);
                    aiReservation = null;
                }
                else if (aiReservation) {
                    await (0, usage_service_1.releaseAIUsageExecution)(aiReservation);
                    aiReservation = null;
                }
            }
            catch (error) {
                if (aiReservation) {
                    await (0, usage_service_1.releaseAIUsageExecution)(aiReservation).catch(() => undefined);
                }
                if (error?.code !== "LIMIT_REACHED" &&
                    error?.code !== "HOURLY_LIMIT_REACHED" &&
                    error?.code !== "USAGE_CHECK_FAILED") {
                    console.error("Comment automation AI fallback error:", error);
                }
            }
        }
        try {
            await (0, usage_service_1.reserveUsage)({
                businessId,
                feature: "automation_runs",
            });
        }
        catch (error) {
            if (error?.code === "LIMIT_REACHED") {
                return { executed, messageSent };
            }
            throw error;
        }
        executed = true;
        const commentReply = matchedTrigger.replyText || "Check your DM";
        try {
            await axios_1.default.post(`https://graph.facebook.com/v19.0/${reelId}/comments`, { message: commentReply }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                timeout: 10000,
            });
        }
        catch { }
        try {
            await (0, usage_service_1.reserveUsage)({
                businessId,
                feature: "messages_sent",
            });
        }
        catch (error) {
            if (error?.code === "LIMIT_REACHED") {
                return { executed, messageSent };
            }
            throw error;
        }
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
            messageSent = true;
        }
        catch {
            return { executed, messageSent };
        }
        if (messageSent) {
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
        return {
            executed,
            messageSent,
        };
    }
    catch (error) {
        console.error("Comment automation error:", error);
        return {
            executed,
            messageSent,
        };
    }
};
exports.handleCommentAutomation = handleCommentAutomation;
