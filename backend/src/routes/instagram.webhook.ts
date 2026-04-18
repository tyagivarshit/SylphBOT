import { Request, Response, Router } from "express";
import crypto from "crypto";
import prisma from "../config/prisma";
import { enqueueAIBatch } from "../queues/ai.queue";
import { automationQueue } from "../queues/automation.queue";
import { cancelFollowups, scheduleFollowups } from "../queues/followup.queue";
import { getIO } from "../sockets/socket.server";
import { fetchInstagramUsername } from "../services/instagramProfile.service";
import { createNotification } from "../services/notification.service";
import { recordConversionEvent } from "../services/salesAgent/conversionTracker.service";
import { processWebhookEvent } from "../services/webhookDedup.service";

const router = Router();
const WEBHOOK_DEBUG = process.env.LOG_WEBHOOK_DEBUG === "true";
const isProduction = process.env.NODE_ENV === "production";

const log = (...args: any[]) => {
  console.log("[INSTAGRAM WEBHOOK]", ...args);
};

const verifySignature = (req: any): boolean => {
  try {
    const signature = req.headers["x-hub-signature-256"] as string;
    const appSecret = process.env.META_APP_SECRET;
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : req.body;

    if (!signature || !appSecret || !Buffer.isBuffer(rawBody)) {
      return false;
    }

    const expected = Buffer.from(
      "sha256=" +
        crypto
          .createHmac("sha256", appSecret)
          .update(rawBody)
          .digest("hex")
    );
    const received = Buffer.from(signature);

    if (expected.length !== received.length) {
      return false;
    }

    return crypto.timingSafeEqual(received, expected);
  } catch {
    return false;
  }
};

const parseWebhookBody = (req: any) => {
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString("utf8"));
  }

  if (Buffer.isBuffer(req.rawBody)) {
    return JSON.parse(req.rawBody.toString("utf8"));
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  throw new Error("Invalid webhook body");
};

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

router.post("/", async (req: any, res: Response) => {
  let body: any;

  try {
    body = parseWebhookBody(req);
  } catch (error) {
    log("Body parse failed", {
      message: (error as { message?: string })?.message || "Unknown error",
    });
    return res.sendStatus(400);
  }

  try {
    if (WEBHOOK_DEBUG) {
      log("Webhook received", {
        entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
      });
    }

    if (isProduction && !verifySignature(req)) {
      log("Signature verification failed");
      return res.sendStatus(403);
    }

    const entry = body.entry?.[0];
    if (!entry) {
      return res.sendStatus(200);
    }

    for (const change of entry?.changes || []) {
      if (change.field !== "comments") {
        continue;
      }

      const commentText = change.value.comment?.text;
      const instagramUserId = change.value.from?.id;
      const reelId = change.value.media?.id;
      const pageId = change.value.id;

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
        continue;
      }

      await automationQueue.add("comment", {
        businessId: client.businessId,
        clientId: client.id,
        instagramUserId,
        reelId,
        commentText,
      });
    }

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

    if (!senderId || !text || !pageId) {
      return res.sendStatus(200);
    }

    if (senderId === pageId) {
      return res.sendStatus(200);
    }

    const lowerText = text.toLowerCase();
    if (
      lowerText.includes("please wait") ||
      lowerText.includes("moment before sending")
    ) {
      return res.sendStatus(200);
    }

    if (!eventId) {
      return res.sendStatus(200);
    }

    const shouldProcess = await processWebhookEvent({
      eventId,
      platform: "INSTAGRAM",
    });

    if (!shouldProcess) {
      return res.sendStatus(200);
    }

    const client = await prisma.client.findFirst({
      where: {
        platform: "INSTAGRAM",
        pageId,
        isActive: true,
      },
      include: {
        business: {
          select: {
            ownerId: true,
            subscription: {
              include: {
                plan: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      return res.sendStatus(200);
    }

    let lead = await prisma.lead.findFirst({
      where: {
        businessId: client.businessId,
        instagramId: senderId,
      },
    });

    const instagramUsername = await fetchInstagramUsername(
      senderId,
      client.accessToken
    );

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          businessId: client.businessId,
          clientId: client.id,
          name: instagramUsername || null,
          instagramId: senderId,
          platform: "INSTAGRAM",
          stage: "NEW",
        },
      });

      await createNotification({
        userId: client.business.ownerId,
        title: "New Lead",
        message: "A new Instagram lead has been created",
        type: "LEAD",
      });
    } else if (instagramUsername && !lead.name) {
      lead = await prisma.lead.update({
        where: {
          id: lead.id,
        },
        data: {
          name: instagramUsername,
        },
      });
    }

    const userMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        content: text,
        sender: "USER",
        metadata: {
          externalEventId: eventId,
          platform: "INSTAGRAM",
        },
      },
    });

    await recordConversionEvent({
      businessId: client.businessId,
      leadId: lead.id,
      outcome: "replied",
      source: "INSTAGRAM_WEBHOOK",
      idempotencyKey: `reply:${eventId}`,
      occurredAt: userMessage.createdAt,
      metadata: {
        platform: "INSTAGRAM",
        externalEventId: eventId,
      },
    }).catch(() => {});

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

    const plan = client.business?.subscription?.plan || null;

    if (WEBHOOK_DEBUG) {
      log("Router job data", {
        businessId: client.businessId,
        leadId: lead.id,
        message: text,
        planType: plan?.type || null,
      });
    }

    await enqueueAIBatch(
      [
        {
          businessId: client.businessId,
          leadId: lead.id,
          message: text,
          kind: "router",
          plan,
          platform: "INSTAGRAM",
          senderId,
          pageId,
          accessTokenEncrypted: client.accessToken,
          externalEventId: eventId,
          skipInboundPersist: true,
        },
      ],
      {
        source: "router",
        idempotencyKey: eventId,
      }
    );

    log("Queued AI reply", {
      businessId: client.businessId,
      leadId: lead.id,
      eventId,
      pageId,
      senderId,
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastMessageAt: new Date(),
        followupCount: 0,
        unreadCount: { increment: 1 },
      },
    });

    await cancelFollowups(lead.id);
    await scheduleFollowups(lead.id);

    return res.sendStatus(200);
  } catch (error) {
    log("Webhook error:", error);
    return res.sendStatus(500);
  }
});

export default router;
