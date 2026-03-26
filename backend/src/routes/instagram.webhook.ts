import { Router, Request, Response } from "express";
import crypto from "crypto";
import prisma from "../config/prisma";

import { scheduleFollowups, cancelFollowups } from "../queues/followup.queue";
import { addAIJob } from "../queues/ai.queue";

import { getIO } from "../sockets/socket.server";

import { handleCommentAutomation } from "../services/commentAutomation.service";
import { processWebhookEvent } from "../services/webhookDedup.service";

/* ✅ FIX: import rate limiter */
import { incrementRate } from "../redis/rateLimiter.redis";
import { createNotification } from "../services/notification.service";

const router = Router();

/* --------------------------------------------------- */

const log = (...args: any[]) => {
  console.log("[INSTAGRAM WEBHOOK]", ...args);
};

/* --------------------------------------------------- */
/* SIGNATURE VERIFY */
/* --------------------------------------------------- */

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

/* --------------------------------------------------- */
/* WEBHOOK VERIFY */
/* --------------------------------------------------- */

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

/* --------------------------------------------------- */
/* INSTAGRAM WEBHOOK */
/* --------------------------------------------------- */

router.post("/", async (req: any, res: Response) => {
  console.log("🔥 RAW BODY:", JSON.stringify(req.body, null, 2));

  console.log("🔥 INSTAGRAM WEBHOOK HIT");

  let body: any;

  try {

    body =
      Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString("utf8"))
        : req.body;

  } catch {

    log("Body parse failed");

    return res.sendStatus(400);

  }

  try {

    if (process.env.NODE_ENV === "production" && !verifySignature(req)) {

      log("Invalid signature");

      return res.sendStatus(403);

    }

    const entry = body.entry?.[0];

    if (!entry) return res.sendStatus(200);

    /* ---------------------------------------------------
    COMMENT AUTOMATION
    --------------------------------------------------- */

    for (const change of entry?.changes || []) {

  if (change.field === "comments") {

    const commentText = change.value.comment?.text;
    const instagramUserId = change.value.from?.id;
    const reelId = change.value.media?.id;
    const pageId = change.value.id;

    console.log("🔥 COMMENT EVENT:", {
      commentText,
      instagramUserId,
      reelId,
      pageId
    });

    if (!commentText || !instagramUserId || !reelId) {
      continue;
    }

    const client = await prisma.client.findFirst({
      where: {
        platform: "INSTAGRAM",
        pageId,
        isActive: true,
      },
    });

    if (!client) {
      log("Client not found for comment automation");
      continue;
    }

    await handleCommentAutomation({
      businessId: client.businessId,
      clientId: client.id,
      instagramUserId,
      reelId,
      commentText,
    });

  }
}

    /* ---------------------------------------------------
    MESSAGE DETECTION
    --------------------------------------------------- */

    let senderId: string | undefined;
    let text: string | undefined;
    let eventId: string | undefined;
    let pageId: string | undefined;

    const messaging = entry?.messaging?.[0];

    if (messaging?.message?.text && !messaging?.message?.is_echo) {

      senderId = messaging.sender?.id;
      text = messaging.message.text;
      pageId = messaging.recipient?.id || entry.id;
      eventId = messaging.message.mid;

    }

    const changeMessage = entry?.changes?.[0]?.value?.messages?.[0];

    if (!text && changeMessage?.text?.body) {

      senderId = changeMessage.from;
      text = changeMessage.text.body;
      pageId = entry.id;
      eventId = changeMessage.id;

    }

    console.log("DEBUG MESSAGE:", {
      senderId,
      text,
      eventId,
      pageId
    });

    /* ---------------------------------------------------
    BASIC VALIDATION
    --------------------------------------------------- */

    if (!senderId || !text) {

      console.log("Message ignored (missing sender/text)");

      return res.sendStatus(200);

    }

    /* ---------------------------------------------------
    SELF MESSAGE FILTER
    --------------------------------------------------- */

    if (pageId && senderId === pageId) {

      console.log("Message ignored (self message)");

      return res.sendStatus(200);

    }

    /* ---------------------------------------------------
    SYSTEM MESSAGE FILTER
    --------------------------------------------------- */

    const lowerText = text.toLowerCase();

    if (
      lowerText.includes("please wait") ||
      lowerText.includes("moment before sending")
    ) {

      console.log("System message ignored:", text);

      return res.sendStatus(200);

    }

    /* ---------------------------------------------------
    WEBHOOK DEDUP
    --------------------------------------------------- */

    if (!eventId) {

      console.log("Event ID missing");

      return res.sendStatus(200);

    }

    const shouldProcess = await processWebhookEvent({
      eventId,
      platform: "INSTAGRAM",
    });

    if (!shouldProcess) {

      log("Duplicate webhook ignored");

      return res.sendStatus(200);

    }

    /* ---------------------------------------------------
    CLIENT
    --------------------------------------------------- */

    const client = await prisma.client.findFirst({
  where: {
    platform: "INSTAGRAM",
    pageId,
    isActive: true,
  },
  include: {
    business: {
      select: {
        ownerId: true, // 
      },
    },
  },
});

    if (!client) {

      log("Client not found:", pageId);

      return res.sendStatus(200);

    }

    /* ---------------------------------------------------
    LEAD
    --------------------------------------------------- */

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
      await createNotification({
        userId: client.business.ownerId,
        title: "New Lead",
        message: "A new Instagram lead has been created",
        type: "LEAD",
      });

    }

    /* ---------------------------------------------------
    SAVE USER MESSAGE
    --------------------------------------------------- */

    const userMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        content: text,
        sender: "USER",
      },
    });
    // 🔥 ADD THIS
     await createNotification({
      userId: client.business.ownerId,
      title: "New Message",
      message: text,
      type: "MESSAGE",
    });
    try {

      const io = getIO();
      io.to(`lead_${lead.id}`).emit("new_message", userMessage);

    } catch {}



    /* ---------------------------------------------------
    ADD AI JOB
    --------------------------------------------------- */

    console.log("AI JOB DATA:", {
      businessId: client.businessId,
      leadId: lead.id,
      message: text,
      platform: "INSTAGRAM",
      senderId,
      pageId,
    });

    await addAIJob({
      businessId: client.businessId,
      leadId: lead.id,
      message: text,
      platform: "INSTAGRAM",
      senderId,
      pageId,
      accessTokenEncrypted: client.accessToken,
    });

    /* ---------------------------------------------------
    UPDATE LEAD
    --------------------------------------------------- */

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastMessageAt: new Date(),
        followupCount: 0,
        unreadCount: { increment: 1 },
      },
    });

    /* ---------------------------------------------------
    FOLLOWUP RESET
    --------------------------------------------------- */

    await cancelFollowups(lead.id);
    await scheduleFollowups(lead.id);

    return res.sendStatus(200);

  } catch (error) {

    log("Webhook error:", error);

    return res.sendStatus(500);

  }

});

export default router;