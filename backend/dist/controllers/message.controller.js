"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markConversationRead = exports.deleteMessage = exports.sendManualMessage = exports.getMessages = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const socket_server_1 = require("../sockets/socket.server");
const followup_queue_1 = require("../queues/followup.queue");
/* ======================================
GET MESSAGES
====================================== */
const getMessages = async (req, res) => {
    try {
        const leadId = req.params.leadId;
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "leadId required",
            });
        }
        const messages = await prisma_1.default.message.findMany({
            where: { leadId },
            orderBy: { createdAt: "asc" },
        });
        return res.json({
            success: true,
            messages,
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
/* ======================================
SEND MESSAGE
====================================== */
const sendManualMessage = async (req, res) => {
    try {
        const { leadId, content } = req.body;
        if (!leadId || !content) {
            return res.status(400).json({
                success: false,
                message: "leadId and content required",
            });
        }
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            include: { client: true },
        });
        if (!lead || !lead.client) {
            return res.status(404).json({
                success: false,
                message: "Lead not found",
            });
        }
        const message = await prisma_1.default.message.create({
            data: {
                leadId: lead.id,
                content,
                sender: "AGENT",
            },
        });
        const io = (0, socket_server_1.getIO)();
        io.to(`lead_${lead.id}`).emit("new_message", message);
        await prisma_1.default.lead.update({
            where: { id: lead.id },
            data: {
                lastMessageAt: new Date(),
                unreadCount: 0,
            },
        });
        await (0, followup_queue_1.cancelFollowups)(lead.id);
        return res.json({ success: true, message });
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
/* ======================================
DELETE MESSAGE
====================================== */
const deleteMessage = async (req, res) => {
    try {
        const messageId = req.params.messageId;
        if (!messageId) {
            return res.status(400).json({
                success: false,
                message: "messageId required",
            });
        }
        const message = await prisma_1.default.message.update({
            where: { id: messageId },
            data: {
                content: "This message was deleted",
            },
        });
        const io = (0, socket_server_1.getIO)();
        io.emit("message_deleted", message);
        return res.json({ success: true });
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
/* ======================================
MARK READ
====================================== */
const markConversationRead = async (req, res) => {
    try {
        const { leadId } = req.body;
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "leadId required",
            });
        }
        await prisma_1.default.lead.update({
            where: { id: leadId },
            data: { unreadCount: 0 },
        });
        return res.json({ success: true });
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
