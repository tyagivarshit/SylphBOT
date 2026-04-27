import { Request, Response } from "express";
import prisma from "../config/prisma";
import {
  getSubscriptionAccess,
  logSubscriptionLockedAction,
} from "../middleware/subscriptionGuard.middleware";
import { getIO } from "../sockets/socket.server";
import {
  formatConversationMessage,
  persistAndDispatchLeadMessage,
} from "../services/sendMessage.service";

type AuthenticatedRequest = Request & {
  user?: {
    businessId?: string | null;
  };
};

const getScopedLead = async (businessId: string, leadId: string) =>
  prisma.lead.findFirst({
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

export const getMessages = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const leadId = req.params.leadId as string;

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

    const lead = await prisma.lead.findFirst({
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

    const messages = await prisma.message.findMany({
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
        messages: messages.map((message) => formatConversationMessage(message)),
      },
    });
  } catch (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
};

export const sendManualMessage = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const leadId = typeof req.body?.leadId === "string" ? req.body.leadId : "";
    const content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const clientMessageId =
      typeof req.body?.clientMessageId === "string" &&
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

    const access = await getSubscriptionAccess(businessId);

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

    const lead = await getScopedLead(businessId, leadId);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    const result = await persistAndDispatchLeadMessage({
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
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({
      success: false,
      message: "Message send failed",
    });
  }
};

export const deleteMessage = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const messageId = req.params.messageId as string;

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

    const message = await prisma.message.findFirst({
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

    await prisma.message.updateMany({
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

    const io = getIO();
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
  } catch (error) {
    console.error("Delete message error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete message",
    });
  }
};

export const markConversationRead = async (
  req: AuthenticatedRequest,
  res: Response
) => {
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

    const lead = await prisma.lead.findFirst({
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

    await prisma.lead.updateMany({
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
  } catch (error) {
    console.error("Mark read error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark read",
    });
  }
};
