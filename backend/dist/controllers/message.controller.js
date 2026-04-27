"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markConversationRead = exports.deleteMessage = exports.sendManualMessage = exports.getMessages = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const socket_server_1 = require("../sockets/socket.server");
const sendMessage_service_1 = require("../services/sendMessage.service");
const getScopedLead = async (businessId, leadId) => prisma_1.default.lead.findFirst({
    where: {
        id: leadId,
        businessId,
        deletedAt: null,
    },
    include: {
        client: {
            select: {
                accessToken: true,
                phoneNumberId: true,
                platform: true,
            },
        },
    },
});
const getMessages = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const leadId = req.params.leadId;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "leadId required",
            });
        }
        const lead = await prisma_1.default.lead.findFirst({
            where: {
                id: leadId,
                businessId,
                deletedAt: null,
            },
            select: {
                id: true,
            },
        });
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found",
            });
        }
        const messages = await prisma_1.default.message.findMany({
            where: {
                leadId: lead.id,
                lead: {
                    businessId,
                    deletedAt: null,
                },
            },
            orderBy: { createdAt: "asc" },
        });
        return res.json({
            success: true,
            data: {
                messages: messages.map((message) => (0, sendMessage_service_1.formatConversationMessage)(message)),
            },
        });
    }
    catch (error) {
        console.error("Get messages error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch messages",
        });
    }
};
exports.getMessages = getMessages;
const sendManualMessage = async (req, res) => {
    try {
        const leadId = typeof req.body?.leadId === "string" ? req.body.leadId : "";
        const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
        const clientMessageId = typeof req.body?.clientMessageId === "string" &&
            req.body.clientMessageId.trim()
            ? req.body.clientMessageId.trim()
            : null;
        const businessId = req.user?.businessId || null;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        if (!leadId || !content) {
            return res.status(400).json({
                success: false,
                message: "leadId and content required",
            });
        }
        const access = await (0, subscriptionGuard_middleware_1.getSubscriptionAccess)(businessId);
        if (!access.allowed) {
            (0, subscriptionGuard_middleware_1.logSubscriptionLockedAction)({
                businessId,
                requestId: req.requestId,
                path: req.originalUrl,
                method: req.method,
                action: "manual_message_send",
                lockReason: access.lockReason,
            }, "Manual message blocked because subscription is locked");
            return res.status(403).json({
                success: false,
                message: "Subscription required",
                requestId: req.requestId,
            });
        }
        const lead = await getScopedLead(businessId, leadId);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found",
            });
        }
        const result = await (0, sendMessage_service_1.persistAndDispatchLeadMessage)({
            lead,
            content,
            sender: "AGENT",
            clientMessageId,
        });
        return res.json({
            success: result.delivery?.delivered ?? true,
            data: {
                message: result.message,
                delivery: result.delivery,
            },
        });
    }
    catch (error) {
        console.error("Send message error:", error);
        return res.status(500).json({
            success: false,
            message: "Message send failed",
        });
    }
};
exports.sendManualMessage = sendManualMessage;
const deleteMessage = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const messageId = req.params.messageId;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        if (!messageId) {
            return res.status(400).json({
                success: false,
                message: "messageId required",
            });
        }
        const message = await prisma_1.default.message.findFirst({
            where: {
                id: messageId,
                lead: {
                    businessId,
                    deletedAt: null,
                },
            },
            select: {
                id: true,
                leadId: true,
            },
        });
        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found",
            });
        }
        await prisma_1.default.message.updateMany({
            where: {
                id: message.id,
                lead: {
                    businessId,
                    deletedAt: null,
                },
            },
            data: {
                content: "This message was deleted",
            },
        });
        const io = (0, socket_server_1.getIO)();
        io.to(`lead_${message.leadId}`).emit("message_deleted", {
            id: message.id,
            leadId: message.leadId,
        });
        return res.json({
            success: true,
            data: {
                id: message.id,
            },
        });
    }
    catch (error) {
        console.error("Delete message error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete message",
        });
    }
};
exports.deleteMessage = deleteMessage;
const markConversationRead = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const leadId = typeof req.body?.leadId === "string" ? req.body.leadId : "";
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "leadId required",
            });
        }
        const lead = await prisma_1.default.lead.findFirst({
            where: {
                id: leadId,
                businessId,
                deletedAt: null,
            },
            select: {
                id: true,
            },
        });
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found",
            });
        }
        await prisma_1.default.lead.updateMany({
            where: {
                id: lead.id,
                businessId,
                deletedAt: null,
            },
            data: { unreadCount: 0 },
        });
        return res.json({
            success: true,
            data: {
                leadId: lead.id,
            },
        });
    }
    catch (error) {
        console.error("Mark read error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to mark read",
        });
    }
};
exports.markConversationRead = markConversationRead;
