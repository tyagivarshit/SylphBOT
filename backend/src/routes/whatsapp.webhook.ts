import { Router, Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "../services/ai.service";
import { generateAIFunnelReply } from "../services/aiFunnel.service";
import { scheduleFollowups, cancelFollowups } from "../queues/followup.queue";
import { getIO } from "../sockets/socket.server";

const router = Router();

/*
---------------------------------------------------
🔐 SIGNATURE VERIFICATION
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
📌 WEBHOOK VERIFY
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
📩 INCOMING MESSAGE HANDLER
---------------------------------------------------
*/
router.post("/", async (req: any, res: Response) => {

  try {

    console.log("🔥 WHATSAPP WEBHOOK HIT");

    if (process.env.NODE_ENV === "production") {
      if (!verifySignature(req)) {
        console.log("❌ Signature verification failed");
        return res.sendStatus(403);
      }
    }

    const body = JSON.parse(req.body.toString());

    const message =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body;

    const phoneNumberId =
      body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (!from || !text || !phoneNumberId) {
      return res.sendStatus(200);
    }

    console.log("📩 Incoming from:", from);
    console.log("💬 Text:", text);

    /*
    ---------------------------------------------------
    🏢 IDENTIFY CLIENT
    ---------------------------------------------------
    */

    const client = await prisma.client.findFirst({
      where: {
        platform: "WHATSAPP",
        phoneNumberId: phoneNumberId,
        isActive: true,
      },
    });

    if (!client) {
      console.log("⚠️ No active WhatsApp client found");
      return res.sendStatus(200);
    }

    /*
    ---------------------------------------------------
    🚨 PLAN CHECK
    ---------------------------------------------------
    */

    const subscription = await prisma.subscription.findUnique({
      where: { businessId: client.businessId },
      include: { plan: true },
    });

    if (!subscription || !subscription.plan) {
      console.log("❌ No subscription found");
      return res.sendStatus(200);
    }

    const plan = subscription.plan.name;

    if (plan === "BASIC") {
      console.log("🚫 BASIC plan cannot use WhatsApp automation");
      return res.sendStatus(200);
    }

    /*
    ---------------------------------------------------
    👤 FIND OR CREATE LEAD
    ---------------------------------------------------
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

    }

    /*
    ---------------------------------------------------
    📝 STORE USER MESSAGE
    ---------------------------------------------------
    */

    const userMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        content: text,
        sender: "USER",
      },
    });

    const io = getIO();

    io.to(`lead_${lead.id}`).emit("new_message", userMessage);

    /*
    ---------------------------------------------------
    🤖 AI REPLY (PLAN BASED)
    ---------------------------------------------------
    */

    let aiReply;

    if (plan === "PRO" || plan === "ENTERPRISE") {

      aiReply = await generateAIFunnelReply({
        businessId: client.businessId,
        leadId: lead.id,
        message: text,
      });

    } else {

      aiReply = await generateAIReply({
        businessId: client.businessId,
        leadId: lead.id,
        message: text,
      });

    }

    console.log("🤖 AI REPLY:", aiReply);

    /*
    ---------------------------------------------------
    📝 STORE AI MESSAGE
    ---------------------------------------------------
    */

    const aiMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        content: aiReply,
        sender: "AI",
      },
    });

    io.to(`lead_${lead.id}`).emit("new_message", aiMessage);

    /*
    ---------------------------------------------------
    📤 SEND MESSAGE TO WHATSAPP
    ---------------------------------------------------
    */

    const accessToken = decrypt(client.accessToken);

    try {

      const response = await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: aiReply },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ META RESPONSE:", response.data);

    } catch (err: any) {

      console.log(
        "❌ META ERROR:",
        err.response?.data || err.message
      );

      return res.sendStatus(200);

    }

    /*
    ---------------------------------------------------
    ⏱ UPDATE LEAD
    ---------------------------------------------------
    */

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastMessageAt: new Date(),
        followupCount: 0,
        unreadCount: { increment: 1 }
      },
    });

    /*
    ---------------------------------------------------
    🔄 RESET FOLLOWUPS
    ---------------------------------------------------
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