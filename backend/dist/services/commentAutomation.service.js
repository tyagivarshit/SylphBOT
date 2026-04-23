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
const handleCommentAutomation = async ({ businessId, clientId, instagramUserId, reelId, commentText, commentId, senderId, mediaId, text, }) => {
    let executed = false;
    let messageSent = false;
    try {
        const normalizedCommentText = String(commentText || text || "").trim();
        const normalizedText = normalizedCommentText.toLowerCase();
        const normalizedInstagramUserId = String(instagramUserId || senderId || "").trim();
        const normalizedReelId = String(reelId || mediaId || "").trim();
        const normalizedCommentId = String(commentId || "").trim();
        console.log("⚙️ Comment automation service received job", {
            businessId,
            clientId,
            commentId: normalizedCommentId || null,
            mediaId: normalizedReelId || null,
            senderId: normalizedInstagramUserId || null,
        });
        if (!normalizedText || !normalizedInstagramUserId || !normalizedReelId) {
            console.log("Comment automation skipped due to missing payload", {
                businessId,
                clientId,
                commentId: normalizedCommentId || null,
                mediaId: normalizedReelId || null,
                senderId: normalizedInstagramUserId || null,
                hasText: Boolean(normalizedText),
            });
            return { executed, messageSent };
        }
        try {
            await (0, rateLimiter_redis_1.incrementRate)(businessId, normalizedInstagramUserId, "COMMENT", 60);
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
        const cacheKey = `triggers:${businessId}:${clientId}:${normalizedReelId}`;
        let triggers = await redis_1.default.get(cacheKey);
        if (triggers) {
            triggers = JSON.parse(triggers);
        }
        else {
            triggers = await prisma_1.default.commentTrigger.findMany({
                where: {
                    businessId,
                    clientId,
                    reelId: normalizedReelId,
                    isActive: true,
                },
                orderBy: { createdAt: "asc" },
            });
            await redis_1.default.set(cacheKey, JSON.stringify(triggers), "EX", 300);
        }
        if (!triggers.length) {
            console.log("No comment automation triggers found", {
                businessId,
                clientId,
                reelId: normalizedReelId,
            });
            return { executed, messageSent };
        }
        console.log("🧠 CHECKING TRIGGERS FOR:", normalizedCommentText);
        const matchedTrigger = triggers.find((trigger) => {
            const keywords = trigger.keyword
                ?.toLowerCase()
                ?.split(",")
                ?.map((keyword) => keyword.trim());
            if (!keywords?.length)
                return false;
            return keywords.some((keyword) => normalizedText.includes(keyword));
        });
        if (!matchedTrigger) {
            console.log("❌ NO TRIGGER MATCH");
            console.log("No comment automation trigger matched", {
                businessId,
                clientId,
                reelId: normalizedReelId,
                commentId: normalizedCommentId || null,
            });
            return { executed, messageSent };
        }
        console.log("✅ TRIGGER MATCHED", matchedTrigger.keyword);
        console.log("🧠 Trigger matched", {
            triggerId: matchedTrigger.id,
            keyword: matchedTrigger.keyword,
            commentId: normalizedCommentId || null,
            businessId,
        });
        let lead = await prisma_1.default.lead.findFirst({
            where: {
                businessId,
                instagramId: normalizedInstagramUserId,
            },
        });
        if (!lead) {
            const createdLead = await (0, usage_service_1.runWithContactUsageLimit)(businessId, (tx) => tx.lead.create({
                data: {
                    businessId,
                    clientId,
                    instagramId: normalizedInstagramUserId,
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
                    message: buildCommentAIMessage(normalizedCommentText, matchedTrigger.aiPrompt),
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
            console.log("📤 SENDING COMMENT REPLY", {
                commentId: normalizedCommentId || null,
                message: commentReply,
            });
            if (normalizedCommentId) {
                console.log("📤 Sending IG comment reply", normalizedCommentId);
                const response = await axios_1.default.post(`https://graph.facebook.com/v19.0/${normalizedCommentId}/replies`, { message: commentReply }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    timeout: 10000,
                });
                console.log("✅ META RESPONSE SUCCESS", response.data);
                console.log("✅ IG comment reply sent", {
                    commentId: normalizedCommentId,
                    businessId,
                });
            }
            else {
                console.log("📤 Sending IG comment reply", normalizedReelId);
                const response = await axios_1.default.post(`https://graph.facebook.com/v19.0/${normalizedReelId}/comments`, { message: commentReply }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    timeout: 10000,
                });
                console.log("✅ META RESPONSE SUCCESS", response.data);
                console.log("✅ IG media comment sent", {
                    reelId: normalizedReelId,
                    businessId,
                });
            }
        }
        catch (error) {
            console.error("❌ META RESPONSE ERROR", error?.response?.data || error?.message);
            console.error("❌ IG comment reply failed", {
                businessId,
                clientId,
                commentId: normalizedCommentId || null,
                reelId: normalizedReelId,
                error: error?.response?.data || error?.message || error,
            });
        }
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
                recipient: { id: normalizedInstagramUserId },
                message: { text: replyMessage },
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            });
            messageSent = true;
            console.log("✅ IG DM sent from comment automation", {
                businessId,
                clientId,
                senderId: normalizedInstagramUserId,
            });
        }
        catch (error) {
            console.error("❌ IG DM send failed from comment automation", {
                businessId,
                clientId,
                senderId: normalizedInstagramUserId,
                error: error?.response?.data || error?.message || error,
            });
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
        console.log("🏁 COMMENT AUTOMATION FLOW COMPLETED");
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
