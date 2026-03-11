import { Request, Response } from "express";
import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { getIO } from "../sockets/socket.server";
import { cancelFollowups } from "../queues/followup.queue";

export const sendManualMessage = async (
  req: Request,
  res: Response
) => {

  try {

    const { leadId, content } = req.body;

    if (!leadId || !content) {
      return res.status(400).json({
        success: false,
        message: "leadId and content required",
      });
    }

    /* ---------------------------
    FIND LEAD
    --------------------------- */

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

    const client = lead.client;

    /* ---------------------------
    SAVE MESSAGE
    --------------------------- */

    const message = await prisma.message.create({
      data: {
        leadId: lead.id,
        content,
        sender: "AGENT",
      },
    });

    /* ---------------------------
    REALTIME SOCKET
    --------------------------- */

    const io = getIO();

    io.to(`lead_${lead.id}`).emit("new_message", message);

    /* ---------------------------
    SEND TO PLATFORM
    --------------------------- */

    const accessToken = decrypt(client.accessToken);

    /* ---------- WHATSAPP ---------- */

    if (lead.platform === "WHATSAPP") {

      await axios.post(
        `https://graph.facebook.com/v19.0/${client.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to: lead.phone,
          type: "text",
          text: { body: content },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

    }

    /* ---------- INSTAGRAM ---------- */

    if (lead.platform === "INSTAGRAM") {

      await axios.post(
        "https://graph.facebook.com/v19.0/me/messages",
        {
          recipient: { id: lead.instagramId },
          message: { text: content },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

    }

    /* ---------------------------
    UPDATE LEAD STATE
    --------------------------- */

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastMessageAt: new Date(),
        followupCount: 0,
        unreadCount: 0 // 🔥 reset unread when agent replies
      },
    });

    /* ---------------------------
    CANCEL FOLLOWUPS
    --------------------------- */

    await cancelFollowups(lead.id);

    return res.json({
      success: true,
      message,
    });

  } catch (error) {

    console.error("Manual message error:", error);

    return res.status(500).json({
      success: false,
      message: "Message send failed",
    });

  }

};

/* ======================================
MARK CONVERSATION AS READ
====================================== */

export const markConversationRead = async (
  req: Request,
  res: Response
) => {

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
      data: {
        unreadCount: 0,
      },
    });

    return res.json({
      success: true,
    });

  } catch (error) {

    console.error("Mark read error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to mark conversation as read",
    });

  }

};