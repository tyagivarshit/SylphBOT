import { Request, Response } from "express";
import prisma from "../config/prisma";
import { fetchInstagramUsername } from "../services/instagramProfile.service";
import {
  getSubscriptionAccess,
  logSubscriptionLockedAction,
} from "../middleware/subscriptionGuard.middleware";
import {
  formatConversationMessage,
  persistAndDispatchLeadMessage,
  type SupportedMessageSender,
} from "../services/sendMessage.service";

const normalizeSender = (value: unknown): SupportedMessageSender => {
  const normalizedSender = String(value || "USER")
    .trim()
    .toUpperCase();

  if (
    normalizedSender === "USER" ||
    normalizedSender === "AI" ||
    normalizedSender === "AGENT"
  ) {
    return normalizedSender;
  }

  return "USER";
};

/* ======================================================
GET CONVERSATIONS
====================================================== */
export const getConversations = async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user?.businessId) {
      return res.json({ conversations: [] });
    }

    const leads = await prisma.lead.findMany({
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

    const conversations = await Promise.all(
      leads.map(async (lead) => {
        let instagramUsername = lead.name || null;

        if (
          !instagramUsername &&
          lead.platform === "INSTAGRAM" &&
          lead.instagramId &&
          lead.client?.accessToken
        ) {
          instagramUsername = await fetchInstagramUsername(
            lead.instagramId,
            lead.client.accessToken
          );

          if (instagramUsername) {
            await prisma.lead
              .update({
                where: { id: lead.id },
                data: { name: instagramUsername },
              })
              .catch(() => null);
          }
        }

        return {
          id: lead.id,
          name:
            lead.platform === "WHATSAPP"
              ? lead.phone || lead.name || "User"
              : instagramUsername || lead.name || "User",
          phone: lead.phone || null,
          instagramId: lead.instagramId || null,
          platform: lead.platform || null,
          lastMessage: lead.messages[0]?.content || "",
          lastMessageTime: lead.messages[0]?.createdAt || null,
          unreadCount: lead.unreadCount || 0,
        };
      })
    );

    return res.json({ conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
};

/* ======================================================
GET MESSAGES BY LEAD
====================================================== */
export const getMessagesByLead = async (req: Request, res: Response) => {
  try {
    const leadId = req.params.leadId as string;

    if (!leadId) {
      return res.status(400).json({ message: "leadId required" });
    }

    const messages = await prisma.message.findMany({
      where: {
        leadId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res.json({
      messages: messages.map((message) => formatConversationMessage(message)),
    });
  } catch (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
};

/* ======================================================
SEND MESSAGE
====================================================== */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const leadId = req.params.leadId as string;
    const sender = normalizeSender(req.body?.sender);
    const clientMessageId =
      typeof req.body?.clientMessageId === "string" &&
      req.body.clientMessageId.trim()
        ? req.body.clientMessageId.trim()
        : null;
    const businessId = req.user?.businessId;
    const content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";

    if (!leadId) {
      return res.status(400).json({ message: "leadId required" });
    }

    if (!content) {
      return res.status(400).json({ message: "Content required" });
    }

    const access = await getSubscriptionAccess(businessId || "");

    if (!access.allowed) {
      logSubscriptionLockedAction(
        {
          businessId,
          requestId: req.requestId,
          path: req.originalUrl,
          method: req.method,
          action: "conversation_message_send",
          lockReason: access.lockReason,
        },
        "Conversation message blocked because subscription is locked"
      );

      return res.status(403).json({
        success: false,
        message: "Subscription required",
        requestId: req.requestId,
      });
    }

    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        ...(businessId ? { businessId } : {}),
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

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    const result = await persistAndDispatchLeadMessage({
      lead,
      content,
      sender,
      clientMessageId,
    });

    return res.json({
      success: result.delivery?.delivered ?? true,
      message: result.message,
      delivery: result.delivery,
    });
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

/* ======================================================
MARK AS READ
====================================================== */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const leadId = req.params.leadId as string;

    if (!leadId) {
      return res.status(400).json({ message: "leadId required" });
    }

    await prisma.lead.update({
      where: {
        id: leadId,
      },
      data: {
        unreadCount: 0,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Mark as read error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark as read",
    });
  }
};
