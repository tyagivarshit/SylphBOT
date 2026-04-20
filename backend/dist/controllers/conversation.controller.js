"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAsRead = exports.sendMessage = exports.getMessagesByLead = exports.getConversations = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const instagramProfile_service_1 = require("../services/instagramProfile.service");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
/* ======================================================
GET CONVERSATIONS
====================================================== */
const getConversations = async (req, res) => {
    try {
        const user = req.user;
        if (!user?.businessId) {
            return res.json({ conversations: [] });
        }
        const leads = await prisma_1.default.lead.findMany({
            where: {
                businessId: user.businessId,
            },
            include: {
                client: {
                    select: {
                        accessToken: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
            },
            orderBy: {
                lastMessageAt: "desc",
            },
        });
        const conversations = await Promise.all(leads.map(async (lead) => {
            let instagramUsername = lead.name || null;
            if (!instagramUsername &&
                lead.platform === "INSTAGRAM" &&
                lead.instagramId &&
                lead.client?.accessToken) {
                instagramUsername = await (0, instagramProfile_service_1.fetchInstagramUsername)(lead.instagramId, lead.client.accessToken);
                if (instagramUsername) {
                    await prisma_1.default.lead
                        .update({
                        where: { id: lead.id },
                        data: { name: instagramUsername },
                    })
                        .catch(() => null);
                }
            }
            return {
                id: lead.id,
                name: lead.platform === "WHATSAPP"
                    ? lead.phone || lead.name || "User"
                    : instagramUsername || lead.name || "User",
                phone: lead.phone || null,
                instagramId: lead.instagramId || null,
                platform: lead.platform || null,
                lastMessage: lead.messages[0]?.content || "",
                lastMessageTime: lead.messages[0]?.createdAt || null,
                unreadCount: lead.unreadCount || 0,
            };
        }));
        return res.json({ conversations });
    }
    catch (error) {
        console.error("Get conversations error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch conversations",
        });
    }
};
exports.getConversations = getConversations;
/* ======================================================
GET MESSAGES BY LEAD
====================================================== */
const getMessagesByLead = async (req, res) => {
    try {
        const leadId = req.params.leadId;
        if (!leadId) {
            return res.status(400).json({ message: "leadId required" });
        }
        const messages = await prisma_1.default.message.findMany({
            where: {
                leadId,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        return res.json({ messages });
    }
    catch (error) {
        console.error("Get messages error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch messages",
        });
    }
};
exports.getMessagesByLead = getMessagesByLead;
/* ======================================================
SEND MESSAGE
====================================================== */
const sendMessage = async (req, res) => {
    try {
        const leadId = req.params.leadId;
        const { content, sender = "USER" } = req.body;
        const businessId = req.user?.businessId;
        if (!leadId) {
            return res.status(400).json({ message: "leadId required" });
        }
        if (!content) {
            return res.status(400).json({ message: "Content required" });
        }
        const access = await (0, subscriptionGuard_middleware_1.getSubscriptionAccess)(businessId || "");
        if (!access.allowed) {
            (0, subscriptionGuard_middleware_1.logSubscriptionLockedAction)({
                businessId,
                requestId: req.requestId,
                path: req.originalUrl,
                method: req.method,
                action: "conversation_message_send",
                lockReason: access.lockReason,
            }, "Conversation message blocked because subscription is locked");
            return res.status(403).json({
                success: false,
                message: "Subscription required",
                requestId: req.requestId,
            });
        }
        const message = await prisma_1.default.message.create({
            data: {
                content,
                sender,
                lead: {
                    connect: {
                        id: leadId,
                    },
                },
            },
        });
        await prisma_1.default.lead.update({
            where: {
                id: leadId,
            },
            data: {
                lastMessageAt: new Date(),
                ...(sender === "USER"
                    ? { unreadCount: { increment: 1 } }
                    : {}),
            },
        });
        return res.json({ message });
    }
    catch (error) {
        console.error("Send message error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to send message",
        });
    }
};
exports.sendMessage = sendMessage;
/* ======================================================
MARK AS READ
====================================================== */
const markAsRead = async (req, res) => {
    try {
        const leadId = req.params.leadId;
        if (!leadId) {
            return res.status(400).json({ message: "leadId required" });
        }
        await prisma_1.default.lead.update({
            where: {
                id: leadId,
            },
            data: {
                unreadCount: 0,
            },
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("Mark as read error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to mark as read",
        });
    }
};
exports.markAsRead = markAsRead;
