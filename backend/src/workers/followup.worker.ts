import { Worker } from "bullmq";
import axios from "axios";
import prisma from "../config/prisma";
import { redisConnection } from "../config/redis";
import { decrypt } from "../utils/encrypt";
import { getIO } from "../sockets/socket.server";

/* 🔥 SMART FOLLOWUP GENERATOR */
const generateSmartFollowup = (
  type: string,
  stage: string,
  aiStage?: string
) => {

  /* HOT LEADS (🔥 close fast) */
  if (stage === "READY_TO_BUY" || aiStage === "HOT") {
    return "Hey 👋 Just checking — want me to lock a slot for you before it fills up?";
  }

  /* WARM LEADS */
  if (stage === "INTERESTED" || aiStage === "WARM") {
    if (type === "2hr") {
      return "Hey 😊 Just wanted to follow up — any questions I can help you with?";
    }

    if (type === "12hr") {
      return "Quick check — would you like me to show you how this works on a short call?";
    }

    return "Slots are filling fast today ⚡ Want me to book one for you?";
  }

  /* COLD LEADS */
  return "Hey 👋 Just checking if you're still interested. Happy to help!";
};

/* 🔥 SYSTEM MESSAGE FILTER */
const isSystemGenerated = (msg: string) => {
  const m = msg.toLowerCase();

  return (
    m.includes("please wait") ||
    m.includes("try again later") ||
    m.includes("conversation limit reached")
  );
};

new Worker(
  "followupQueue",
  async (job) => {

    try {

      const { leadId, type } = job.data;

      console.log(`⏳ Processing followup ${type} for lead ${leadId}`);

      /* ---------------- FETCH LEAD ---------------- */

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { client: true },
      });

      if (!lead || !lead.client) return;

      /* ---------------- HARD STOP CONDITIONS ---------------- */

      if (lead.isHumanActive) {
        console.log("🛑 Human takeover active");
        return;
      }

      if (lead.stage === "CLOSED" || lead.stage === "BOOKED_CALL") {
        console.log("🛑 Lead already converted");
        return;
      }

      /* USER REPLIED → STOP */
      if (lead.unreadCount > 0) {
        console.log("🛑 User replied, stopping followups");
        return;
      }

      /* LIMIT */
      if ((lead.followupCount ?? 0) >= 3) {
        console.log("🚫 Followup limit reached");
        return;
      }

      /* ---------------- SMART MESSAGE ---------------- */

      const message = generateSmartFollowup(
        type,
        lead.stage || "NEW",
        (lead as any).aiStage
      );

      if (!message || isSystemGenerated(message)) {
        return;
      }

      const accessToken = decrypt(lead.client.accessToken);

      /* ---------------- SEND MESSAGE ---------------- */

      if (lead.platform === "WHATSAPP") {

        if (!lead.client.phoneNumberId || !lead.phone) return;

        await axios.post(
          `https://graph.facebook.com/v19.0/${lead.client.phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to: lead.phone,
            type: "text",
            text: { body: message },
          },
          {
            timeout: 10000,
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      } else if (lead.platform === "INSTAGRAM") {

        if (!lead.instagramId) return;

        await axios.post(
          `https://graph.facebook.com/v19.0/me/messages`,
          {
            recipient: { id: lead.instagramId },
            message: { text: message },
          },
          {
            timeout: 10000,
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
      }

      /* ---------------- SAVE ---------------- */

      const aiMessage = await prisma.message.create({
        data: {
          leadId: lead.id,
          content: message,
          sender: "AI",
        },
      });

      /* ---------------- SOCKET ---------------- */

      try {
        const io = getIO();
        io.to(`lead_${lead.id}`).emit("new_message", aiMessage);
      } catch {}

      /* ---------------- UPDATE ---------------- */

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          followupCount: { increment: 1 },
          lastFollowupAt: new Date(),
        },
      });

      console.log(`✅ Followup ${type} sent`);

    } catch (err: any) {

      console.log("🚨 FOLLOWUP WORKER ERROR:");

      console.log(
        err.response?.data ||
        err.message ||
        err
      );

      throw err;
    }

  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

console.log("🚀 Followup Worker Started");