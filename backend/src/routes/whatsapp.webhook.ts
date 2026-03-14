import { Router, Request, Response } from "express";
import crypto from "crypto";
import prisma from "../config/prisma";

import { addAIJob } from "../queues/ai.queue";
import { scheduleFollowups, cancelFollowups } from "../queues/followup.queue";

import { getIO } from "../sockets/socket.server";
import { processWebhookEvent } from "../services/webhookDedup.service";

const router = Router();

/*
---------------------------------------------------
SIGNATURE VERIFICATION
---------------------------------------------------
*/

function verifySignature(req: any): boolean {

  const signature = req.headers["x-hub-signature-256"] as string;

  const appSecret = process.env.META_APP_SECRET as string;

  if (!signature || !appSecret) return false;

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", appSecret)
      .update(req.rawBody)
      .digest("hex");

  return signature === expected;

}

/*
---------------------------------------------------
WEBHOOK VERIFY
---------------------------------------------------
*/

router.get("/", (req: Request, res: Response) => {

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];

  const token = req.query["hub.verify_token"];

  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    return res.status(200).send(challenge);

  }

  return res.sendStatus(403);

});

/*
---------------------------------------------------
WHATSAPP WEBHOOK
---------------------------------------------------
*/

router.post("/", async (req: any, res: Response) => {

  try {

    console.log("🔥 WHATSAPP WEBHOOK HIT");

    /*
    SIGNATURE VERIFY
    */

    if (process.env.NODE_ENV === "production") {

      if (!verifySignature(req)) {

        console.log("❌ Signature verification failed");

        return res.sendStatus(403);

      }

    }

    const body = JSON.parse(req.body.toString());

    const message =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    /*
    WEBHOOK DEDUP
    */

    const eventId = message?.id;

    const shouldProcess = await processWebhookEvent({
      eventId,
      platform: "WHATSAPP",
    });

    if (!shouldProcess) {

      console.log("⚠️ Duplicate webhook ignored");

      return res.sendStatus(200);

    }

    const from = message.from;

    const text = message.text?.body;

    const phoneNumberId =
      body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (!from || !text || !phoneNumberId) {

      return res.sendStatus(200);

    }

    console.log("📩 Incoming:", text);

    /*
    FIND CLIENT
    */

    const client = await prisma.client.findFirst({
      where: {
        platform: "WHATSAPP",
        phoneNumberId: phoneNumberId,
        isActive: true,
      },
    });

    if (!client) {

      console.log("⚠️ Client not found");

      return res.sendStatus(200);

    }

    /*
    PLAN CHECK
    */

    const subscription = await prisma.subscription.findUnique({
      where: { businessId: client.businessId },
      include: { plan: true },
    });

    if (!subscription || !subscription.plan) {

      console.log("❌ No subscription");

      return res.sendStatus(200);

    }

    const plan = subscription.plan.name;

    if (plan === "BASIC") {

      console.log("🚫 BASIC plan blocked");

      return res.sendStatus(200);

    }

    /*
    FIND OR CREATE LEAD
    */

    let lead = await prisma.lead.findFirst({
      where: {
        businessId: client.businessId,
        phone: from,
      },
    });

    if (!lead) {

      lead = await prisma.lead.create({
        data: {
          businessId: client.businessId,
          clientId: client.id,
          phone: from,
          platform: "WHATSAPP",
          stage: "NEW",
          followupCount: 0,
        },
      });

      console.log("👤 Lead created");

    }

    /*
    SAVE USER MESSAGE
    */

    const userMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        content: text,
        sender: "USER",
      },
    });

    /*
    REALTIME SOCKET
    */

    const io = getIO();

    io.to(`lead_${lead.id}`).emit("new_message", userMessage);

    /*
    ADD AI JOB
    */

    await addAIJob({
      businessId: client.businessId,
      leadId: lead.id,
      message: text,
      platform: "WHATSAPP",
      senderId: from,
      phoneNumberId,
      accessTokenEncrypted: client.accessToken,
    });

    /*
    UPDATE LEAD
    */

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastMessageAt: new Date(),
        followupCount: 0,
        unreadCount: { increment: 1 },
      },
    });

    /*
    RESET FOLLOWUPS
    */

    await cancelFollowups(lead.id);

    await scheduleFollowups(lead.id);

    return res.sendStatus(200);

  } catch (error) {

    console.error("🚨 WHATSAPP WEBHOOK ERROR:", error);

    return res.sendStatus(500);

  }

});

export default router;