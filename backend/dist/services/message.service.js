"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markLeadAsRead = exports.getMessages = exports.handleIncomingMessage = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/* ======================================================
SAVE MESSAGE (REAL-TIME CHAT ENGINE)
====================================================== */
const handleIncomingMessage = async ({ leadId, content, sender = "USER", io, }) => {
    try {
        if (!leadId || !content)
            return null;
        /* ======================================================
        SAVE MESSAGE
        ====================================================== */
        const message = await prisma_1.default.message.create({
            data: {
                leadId: String(leadId),
                content,
                sender,
            },
        });
        /* ======================================================
        GET LEAD
        ====================================================== */
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: String(leadId) },
        });
        if (!lead)
            return message;
        /* ======================================================
        UPDATE LEAD (LAST MESSAGE + UNREAD COUNT)
        ====================================================== */
        await prisma_1.default.lead.update({
            where: { id: String(leadId) },
            data: {
                lastMessageAt: new Date(),
                // 🔥 unread logic (only for incoming messages)
                unreadCount: sender === "USER"
                    ? (lead.unreadCount || 0) + 1
                    : lead.unreadCount || 0,
            },
        });
        /* ======================================================
        SOCKET EMIT (REAL-TIME)
        ====================================================== */
        io?.to(leadId).emit("new_message", message);
        return message;
    }
    catch (error) {
        console.error("Message service error:", error);
        return null;
    }
};
exports.handleIncomingMessage = handleIncomingMessage;
/* ======================================================
FETCH MESSAGES (OPEN CHAT)
====================================================== */
const getMessages = async (leadId) => {
    if (!leadId)
        return [];
    return prisma_1.default.message.findMany({
        where: { leadId: String(leadId) },
        orderBy: { createdAt: "asc" },
    });
};
exports.getMessages = getMessages;
/* ======================================================
MARK AS READ (WHEN CHAT OPEN)
====================================================== */
const markLeadAsRead = async (leadId) => {
    if (!leadId)
        return;
    return prisma_1.default.lead.update({
        where: { id: String(leadId) },
        data: {
            unreadCount: 0,
        },
    });
};
exports.markLeadAsRead = markLeadAsRead;
