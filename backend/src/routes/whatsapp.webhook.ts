import { Router, Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "../services/ai.service";

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
📌 1️⃣ WEBHOOK VERIFY (Meta setup time)
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
📩 2️⃣ INCOMING MESSAGE HANDLER
---------------------------------------------------
*/
router.post("/", async (req: any, res: Response) => {
  try {
    console.log("🔥 WEBHOOK HIT");

    if (!verifySignature(req)) {
      console.log("❌ Signature verification failed");
      return res.sendStatus(403);
    }

    const body = req.body;

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
        isActive: true,
      },
    });

    if (!client) {
      console.log("⚠️ No active WhatsApp client found");
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
          phone: from,
          stage: "NEW",
        },
      });
    }

    /*
    ---------------------------------------------------
    🤖 AI CALL
    ---------------------------------------------------
    */
    const aiReply = await generateAIReply({
      businessId: client.businessId,
      leadId: lead.id,
      message: text,
    });

    console.log("🤖 AI REPLY:", aiReply);

    /*
    ---------------------------------------------------
    ⏱ UPDATE lastMessageAt
    ---------------------------------------------------
    */
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastMessageAt: new Date() },
    });

    /*
    ---------------------------------------------------
    📤 SEND REPLY TO WHATSAPP
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
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("🚨 WHATSAPP WEBHOOK ERROR:", error);
    return res.sendStatus(500);
  }
});

export default router;