import { Request, Response } from "express";
import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { getIO } from "../sockets/socket.server";
import { cancelFollowups } from "../queues/followup.queue";
import {
  getSubscriptionAccess,
  logSubscriptionLockedAction,
} from "../middleware/subscriptionGuard.middleware";

/* ======================================
GET MESSAGES
====================================== */

export const getMessages = async (req: Request, res: Response) => {
  try {

    const leadId = req.params.leadId as string;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "leadId required",
      });
    }

    const messages = await prisma.message.findMany({
      where: { leadId },
      orderBy: { createdAt: "asc" },
    });

    return res.json({
      success: true,
      messages,
    });

  } catch (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
};

/* ======================================
SEND MESSAGE
====================================== */

export const sendManualMessage = async (req: Request, res: Response) => {
  try {
    const { leadId, content } = req.body;
    const businessId = req.user?.businessId;

    if (!leadId || !content) {
      return res.status(400).json({
        success: false,
        message: "leadId and content required",
      });
    }

    const access = await getSubscriptionAccess(businessId || "");

    if (!access.allowed) {
      logSubscriptionLockedAction(
        {
          businessId,
          requestId: req.requestId,
          path: req.originalUrl,
          method: req.method,
          action: "manual_message_send",
          lockReason: access.lockReason,
        },
        "Manual message blocked because subscription is locked"
      );

      return res.status(403).json({
        success: false,
        message: "Subscription required",
        requestId: req.requestId,
      });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { client: true },
    });

    if (!lead || !lead.client) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    const message = await prisma.message.create({
      data: {
        leadId: lead.id,
        content,
        sender: "AGENT",
      },
    });

    const io = getIO();
    io.to(`lead_${lead.id}`).emit("new_message", message);

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastMessageAt: new Date(),
        unreadCount: 0,
      },
    });

    await cancelFollowups(lead.id);

    return res.json({ success: true, message });

  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({
      success: false,
      message: "Message send failed",
    });
  }
};

/* ======================================
DELETE MESSAGE
====================================== */

export const deleteMessage = async (req: Request, res: Response) => {
  try {

    const messageId = req.params.messageId as string;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: "messageId required",
      });
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: "This message was deleted",
      },
    });

    const io = getIO();
    io.emit("message_deleted", message);

    return res.json({ success: true });

  } catch (error) {
    console.error("Delete message error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete message",
    });
  }
};

/* ======================================
MARK READ
====================================== */

export const markConversationRead = async (req: Request, res: Response) => {
  try {

    const { leadId } = req.body;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "leadId required",
      });
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: { unreadCount: 0 },
    });

    return res.json({ success: true });

  } catch (error) {
    console.error("Mark read error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark read",
    });
  }
};
