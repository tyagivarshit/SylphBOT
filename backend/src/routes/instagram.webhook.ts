import { Router, Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "../services/ai.service";
import { scheduleFollowups, cancelFollowups } from "../queues/followup.queue";
import { getIO } from "../sockets/socket.server";

const router = Router();

/* ---------------------------------------------------
UTILS
--------------------------------------------------- */

const log = (...args: any[]) => {
  console.log("[INSTAGRAM WEBHOOK]", ...args);
};

const parseBody = (req: any) => {
  try {
    return JSON.parse(req.body.toString());
  } catch {
    return null;
  }
};

/* ---------------------------------------------------
SIGNATURE VERIFY
--------------------------------------------------- */

const verifySignature = (req: any): boolean => {
  try {
    const signature = req.headers["x-hub-signature-256"] as string;
    const appSecret = process.env.META_APP_SECRET;

    if (!signature || !appSecret) return false;

    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", appSecret)
        .update(req.body)
        .digest("hex");

    return signature === expected;
  } catch {
    return false;
  }
};

/* ---------------------------------------------------
WEBHOOK VERIFY (META SETUP)
--------------------------------------------------- */

router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    log("Webhook verified");
    return res.status(200).send(challenge);
  }

  log("Webhook verification failed");

  return res.sendStatus(403);
});

/* ---------------------------------------------------
INSTAGRAM MESSAGE HANDLER
--------------------------------------------------- */

router.post("/", async (req: any, res: Response) => {
  try {
    log("Webhook hit");

    const body = parseBody(req);

    if (!body) {
      log("Invalid body");
      return res.sendStatus(400);
    }

    if (process.env.NODE_ENV === "production" && !verifySignature(req)) {
      log("Invalid signature");
      return res.sendStatus(403);
    }

    const entry = body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!entry || !messaging) {
      return res.sendStatus(200);
    }

    if (!messaging.message) {
      log("Non-message event ignored");
      return res.sendStatus(200);
    }

    const senderId = messaging.sender?.id;
    const pageId = String(entry.id);
    const text = messaging.message?.text;

    if (!senderId || !text) {
      return res.sendStatus(200);
    }

    if (senderId === pageId) {
      log("Echo message ignored");
      return res.sendStatus(200);
    }

    log("Incoming message:", text);

    /* ---------- CLIENT ---------- */

    const client = await prisma.client.findFirst({
      where: {
        platform: "INSTAGRAM",
        pageId,
        isActive: true,
      },
    });

    if (!client) {
      log("Client not found:", pageId);
      return res.sendStatus(200);
    }

    /* ---------- LEAD ---------- */

    let lead = await prisma.lead.findFirst({
      where: {
        businessId: client.businessId,
        instagramId: senderId,
      },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          businessId: client.businessId,
          clientId: client.id,
          instagramId: senderId,
          platform: "INSTAGRAM",
          stage: "NEW",
        },
      });

      log("Lead created:", lead.id);
    }

    /* ---------- SAVE CLIENT MESSAGE ---------- */

    const clientMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        sender: "USER",
        content: text,
      },
    });

    /* ---------- SOCKET EMIT (CLIENT MESSAGE) ---------- */

    const io = getIO();

    io.to(`lead_${lead.id}`).emit("new_message", clientMessage);

    /* ---------- AI ---------- */

    const aiReply = await generateAIReply({
      businessId: client.businessId,
      leadId: lead.id,
      message: text,
    });

    log("AI reply generated");

    /* ---------- SAVE AI MESSAGE ---------- */

    const aiMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        sender: "AI",
        content: aiReply,
      },
    });

    /* ---------- SOCKET EMIT (AI MESSAGE) ---------- */

    io.to(`lead_${lead.id}`).emit("new_message", aiMessage);

    /* ---------- LEAD UPDATE ---------- */

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastMessageAt: new Date(),
        followupCount: 0,
      },
    });

    await cancelFollowups(lead.id);
    await scheduleFollowups(lead.id);

    /* ---------- SEND MESSAGE ---------- */

    const accessToken = decrypt(client.accessToken);

    try {
      await axios.post(
        "https://graph.facebook.com/v19.0/me/messages",
        {
          recipient: { id: senderId },
          message: { text: aiReply },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      log("Message sent to Instagram");
    } catch (err: any) {
      log("Instagram send error:", err.response?.data || err.message);
    }

    return res.sendStatus(200);

  } catch (error) {

    log("Webhook error:", error);

    return res.sendStatus(500);

  }
});

export default router;