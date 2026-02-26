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
📌 WEBHOOK VERIFY
---------------------------------------------------
*/
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.INSTAGRAM_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/*
---------------------------------------------------
📩 INSTAGRAM MESSAGE HANDLER
---------------------------------------------------
*/
router.post("/", async (req: any, res: Response) => {
  try {
    console.log("📸 INSTAGRAM WEBHOOK HIT");

    if (!verifySignature(req)) {
      console.log("❌ IG Signature failed");
      return res.sendStatus(403);
    }

    const body = req.body;
    const entry = body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging) return res.sendStatus(200);

    const senderId = messaging.sender?.id;
    const pageId = entry?.id; // 🔥 Page ID
    const text = messaging.message?.text;

    // 🔥 IMPORTANT FIX — ignore self messages
    if (senderId === pageId) {
      console.log("⚠️ Ignoring self message");
      return res.sendStatus(200);
    }

    if (!senderId || !text) {
      return res.sendStatus(200);
    }

    console.log("📩 IG From:", senderId);
    console.log("💬 IG Text:", text);

    /*
    ---------------------------------------------------
    🏢 IDENTIFY CLIENT (INSTAGRAM)
    ---------------------------------------------------
    */
    const client = await prisma.client.findFirst({
      where: {
        platform: "INSTAGRAM",
        isActive: true,
      },
    });

    if (!client) {
      console.log("⚠️ No active Instagram client");
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
        phone: senderId,
      },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          businessId: client.businessId,
          phone: senderId,
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

    console.log("🤖 IG AI REPLY:", aiReply);

    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastMessageAt: new Date() },
    });

    /*
    ---------------------------------------------------
    📤 SEND REPLY TO INSTAGRAM
    ---------------------------------------------------
    */
    const accessToken = decrypt(client.accessToken);

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v19.0/me/messages`,
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

      console.log("✅ IG META RESPONSE:", response.data);
    } catch (err: any) {
      console.log(
        "❌ IG META ERROR:",
        err.response?.data || err.message
      );
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("🚨 INSTAGRAM WEBHOOK ERROR:", error);
    return res.sendStatus(500);
  }
});

export default router;