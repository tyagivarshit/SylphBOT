import { Worker } from "bullmq";
import axios from "axios";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import { decrypt } from "../utils/encrypt";
import { getIO } from "../sockets/socket.server";

/* 🔥 SMART FOLLOWUP GENERATOR (UPGRADED 🔥) */
const generateSmartFollowup = (
  type: string,
  stage: string,
  aiStage?: string
) => {

  const isHot = stage === "READY_TO_BUY" || aiStage === "HOT";
  const isWarm = stage === "INTERESTED" || aiStage === "WARM";

  /* ================= HOT (CLOSE FAST 🔥) ================= */
  if (isHot) {

    if (type === "2hr") {
      return `Hey 👋

I can lock this for you right now before it gets booked.

👉 Want me to confirm it for you?`;
    }

    if (type === "12hr") {
      return `Quick heads up ⏳

This is getting booked quickly right now.

👉 Should I reserve a slot for you?`;
    }

    return `Last reminder ⚡

I can still help you secure this before it's gone.

👉 Want me to lock it now?`;
  }

  /* ================= WARM (GUIDE + NURTURE) ================= */
  if (isWarm) {

    if (type === "2hr") {
      return `Hey 😊

I can suggest the best option based on your requirement.

👉 Want me to help you choose?`;
    }

    if (type === "12hr") {
      return `Most people at this stage usually go for a quick walkthrough 🙂

I can guide you step-by-step.

👉 Want me to show you how it works?`;
    }

    return `Just a quick note ⚡

People usually move forward at this point to avoid missing out.

👉 Want me to check availability for you?`;
  }

  /* ================= COLD (REMOVE FRICTION) ================= */

  if (type === "2hr") {
    return `Hey 👋

No rush at all 🙂

👉 Tell me what you're looking for and I'll guide you.`;
  }

  if (type === "12hr") {
    return `Just checking in 😊

I can explain everything simply if you want.

👉 Want me to help you understand?`;
  }

  return `Final follow-up 👍

Whenever you're ready, I’m here to help.

👉 Just tell me your requirement.`;
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

if (process.env.RUN_WORKER === "true") {
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
    connection: getWorkerRedisConnection(),
    concurrency: 5,
  }
  );

  console.log("🚀 Followup Worker Started");
}
