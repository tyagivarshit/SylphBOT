import { Worker } from "bullmq";
import prisma from "../config/prisma";
import axios from "axios";
import { decrypt } from "../utils/encrypt";
import { retryAsync } from "../utils/retry.utils";

import { handleIncomingMessage } from "../services/executionRouter.servce"; // 🔥 FINAL ROUTER

import { routeAIMessage } from "../services/aiRouter.service"; // fallback only
import { runAutomationEngine } from "../services/automationEngine.service";
import { checkAIRateLimit } from "../services/aiRateLimiter.service";
import { bookingPriorityRouter } from "../services/bookingPriorityRouter.service";

import { getIO } from "../sockets/socket.server";
import logger from "../utils/logger";
import * as Sentry from "@sentry/node";
import { env } from "../config/env"; 
/* ---------------- DELAY ---------------- */
const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const worker = new Worker(
  "aiQueue",
  async (job) => {

    /* =====================================================
    🧠 LEVEL 4 ROUTER ENTRY (MAIN SYSTEM)
    ===================================================== */
    if (job.name === "router") {
      try {
        const reply = await handleIncomingMessage({
          ...job.data,
          plan: job.data.plan || null, // 🔥 FORCE PLAN PASS
        });

        if (!reply) return;

        return await processAndSendReply(job.data, reply);

      } catch (err: any) {
        logger.error(
          {
            error: err?.message || err,
            stack: err?.stack,
            jobData: job.data,
          },
          "❌ Router execution failed"
        );
        throw err;
      }
    }

    /* =====================================================
    🔁 FALLBACK FLOW (OLD SYSTEM - SAFE MODE)
    ===================================================== */

    return await legacyExecution({
      ...job.data,
      plan: job.data.plan || null, // 🔥 ALSO FIX HERE
    });
  },
  {
    connection: { url: process.env.REDIS_URL } ,
    concurrency: 10,
  }
);

/* =====================================================
📤 COMMON RESPONSE HANDLER
===================================================== */

const processAndSendReply = async (data: any, aiReply: any) => {

  const {
    businessId,
    leadId,
    platform,
    senderId,
    phoneNumberId,
    accessTokenEncrypted,
  } = data;

  try {

    /* =====================================================
    🔥 SAFE PARSE (NEW FIX - NO LOGIC CHANGE)
    ===================================================== */

    let replyText =
      typeof aiReply === "string"
        ? aiReply
        : aiReply?.message || "Thanks for your message! 😊";

    const cta =
      typeof aiReply === "object" ? aiReply?.cta : undefined;

    /* 🔥 TRIM SAME (YOUR ORIGINAL LOGIC SAFE) */
    replyText = replyText.trim();

    if (!replyText) return;

    /* ===================================================== */

    if (replyText.length > 1000) {
      replyText = replyText.slice(0, 1000);
    }

    const rate = await checkAIRateLimit({
      businessId,
      leadId,
      platform,
    });

    if (rate.blocked) {
      logger.warn("🚫 Rate limit hit");
      return;
    }

    const aiMessage = await prisma.message.create({
      data: {
        leadId,
        content: replyText,
        sender: "AI",
        metadata: {
          cta: cta || null, // 🔥 STORE CTA
        },
      },
    });

    try {
      const io = getIO();
      io.to(`lead_${leadId}`).emit("new_message", {
        ...aiMessage,
        cta: cta || null, // 🔥 SEND CTA REALTIME
      });
    } catch {}

    const accessToken = decrypt(accessTokenEncrypted);

    const sendMessage = async () => {

      if (platform === "WHATSAPP") {
        await axios.post(
          `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to: senderId,
            type: "text",
            text: { body: replyText },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 10000,
          }
        );
      }

      if (platform === "INSTAGRAM") {
        if (!senderId) return;

        await delay(500 + Math.random() * 1000);

        await axios.post(
          "https://graph.facebook.com/v19.0/me/messages",
          {
            recipient: { id: senderId },
            message: { text: replyText },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 10000,
          }
        );
      }
    };

    await retryAsync(sendMessage, 3, 800);

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

  } catch (error: any) {
    if (error instanceof Error) {
      logger.error("❌ Legacy flow failed: " + error.message);
    }
    Sentry.captureException(error);
    throw error;
  }
};

/* =====================================================
🧠 LEGACY EXECUTION (FIXED PLAN PASS)
===================================================== */

const legacyExecution = async (data: any) => {

  const {
    businessId,
    leadId,
    message,
    plan,
  } = data;

  let aiReply: string | null = null;

  try {

    const lowerMsg = message?.toLowerCase() || "";

    if (
      lowerMsg.includes("conversation limit reached") ||
      lowerMsg.includes("our team will assist") ||
      lowerMsg.includes("please wait")
    ) {
      logger.warn("🚫 Blocked loop/system message");
      return;
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { isHumanActive: true },
    });

    if (lead?.isHumanActive) return;

    /* ---------------- BOOKING ---------------- */
    try {
      const bookingReply = await bookingPriorityRouter({
        businessId,
        leadId,
        message,
        plan, // 🔥 FIXED
      });

      if (bookingReply) aiReply = bookingReply;

    } catch (err) {
      logger.warn({ err }, "Booking failed");
    }

    /* ---------------- AUTOMATION ---------------- */
    if (!aiReply) {
      try {
        const automationReply = await runAutomationEngine({
          businessId,
          leadId,
          message,
        });

        if (automationReply) aiReply = automationReply;

      } catch (err) {
        logger.warn({ err }, "Automation failed");
      }
    }

    /* ---------------- AI ---------------- */
    if (!aiReply) {
      const aiResponse = await routeAIMessage({
  businessId,
  leadId,
  message,
  plan,
});

aiReply =
  typeof aiResponse === "string"
    ? aiResponse
    : (aiResponse as any)?.message;
    }

    if (!aiReply) return;

    return await processAndSendReply(data, aiReply);

  } catch (error: any) {
    if (error instanceof Error) {
      logger.error("❌ Legacy flow failed: " + error.message);
    }
    Sentry.captureException(error);
    throw error;
  }
};

/* ===================================================== */

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Worker failed");
});

logger.info("🔥 AI Worker Started (Level 4 Fixed)");