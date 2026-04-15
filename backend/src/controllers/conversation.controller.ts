import { Request, Response } from "express";
import prisma from "../config/prisma";
import { fetchInstagramUsername } from "../services/instagramProfile.service";

/* ======================================================
GET CONVERSATIONS
====================================================== */
export const getConversations = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

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
GET MESSAGES BY LEAD (🔥 FIXED)
====================================================== */
export const getMessagesByLead = async (req: Request, res: Response) => {
  try {
    const leadId = req.params.leadId as string;

    if (!leadId) {
      return res.status(400).json({ message: "leadId required" });
    }

    const messages = await prisma.message.findMany({
      where: {
        leadId: leadId, // 🔥 FIX (IMPORTANT)
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res.json({ messages });

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
    const { content, sender = "USER" } = req.body; // 🔥 default fixed

    if (!leadId) {
      return res.status(400).json({ message: "leadId required" });
    }

    if (!content) {
      return res.status(400).json({ message: "Content required" });
    }

    const message = await prisma.message.create({
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

    await prisma.lead.update({
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
