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

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
    businessId?: string | null;
  };
};

const normalizeSender = (value: unknown): SupportedMessageSender => {
  const normalizedSender = String(value || "USER").trim().toUpperCase();

  if (
    normalizedSender === "USER" ||
    normalizedSender === "AI" ||
    normalizedSender === "AGENT"
  ) {
    return normalizedSender;
  }

  return "USER";
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

export const getConversations = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;

    if (!businessId) {
      return res.json({
        success: true,
        data: {
          conversations: [],
        },
      });
    }

    const leads = await prisma.lead.findMany({
      where: {
        businessId,
        deletedAt: null,
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
            await prisma.lead.updateMany({
              where: {
                id: lead.id,
                businessId,
                deletedAt: null,
              },
              data: { name: instagramUsername },
            });
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

    return res.json({
      success: true,
      data: {
        conversations,
      },
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
};

export const getMessagesByLead = async (
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
      return res.status(400).json({ success: false, message: "leadId required" });
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
      orderBy: {
        createdAt: "asc",
      },
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

export const sendMessage = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const leadId = req.params.leadId as string;
    const sender = normalizeSender(req.body?.sender);
    const clientMessageId =
      typeof req.body?.clientMessageId === "string" &&
      req.body.clientMessageId.trim()
        ? req.body.clientMessageId.trim()
        : null;
    const businessId = req.user?.businessId || null;
    const humanId = req.user?.id || null;
    const content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const interactionId =
      typeof req.body?.interactionId === "string" && req.body.interactionId.trim()
        ? req.body.interactionId.trim()
        : null;
    const resolved = req.body?.resolved === true;
    const resolutionCode =
      typeof req.body?.resolutionCode === "string" && req.body.resolutionCode.trim()
        ? req.body.resolutionCode.trim()
        : null;
    const releaseOutcome =
      typeof req.body?.releaseOutcome === "string" && req.body.releaseOutcome.trim()
        ? req.body.releaseOutcome.trim()
        : null;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!leadId) {
      return res.status(400).json({ success: false, message: "leadId required" });
    }

    if (!content) {
      return res.status(400).json({ success: false, message: "Content required" });
    }

    const access = await getSubscriptionAccess(businessId);

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
      sender,
      clientMessageId,
      humanTakeover:
        sender === "AGENT"
          ? {
              interactionId,
              humanId,
              resolved,
              resolutionCode,
              releaseOutcome,
            }
          : null,
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
      message: "Failed to send message",
    });
  }
};

export const markAsRead = async (
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
      return res.status(400).json({ success: false, message: "leadId required" });
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
      data: {
        unreadCount: 0,
      },
    });

    return res.json({
      success: true,
      data: {
        leadId: lead.id,
      },
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark as read",
    });
  }
};
