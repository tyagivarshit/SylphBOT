import { Worker } from "bullmq";
import prisma from "../config/prisma";
import axios from "axios";
import { redisConnection } from "../config/redis";
import { decrypt } from "../utils/encrypt";
import { retryAsync } from "../utils/retry.utils";

import { routeAIMessage } from "../services/aiRouter.service";
import { runAutomationEngine } from "../services/automationEngine.service";
import { checkAIRateLimit } from "../services/aiRateLimiter.service";
import { bookingPriorityRouter } from "../services/bookingPriorityRouter.service";

import { getIO } from "../sockets/socket.server";
import logger from "../utils/logger";
import * as Sentry from "@sentry/node";

/* ---------------- DELAY ---------------- */
const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const worker = new Worker(
  "aiQueue",
  async (job) => {
    const {
      businessId,
      leadId,
      message,
      platform,
      senderId,
      phoneNumberId,
      accessTokenEncrypted,
    } = job.data;

    let aiReply: string | null = null;

    try {
      /* =====================================================
      🔴 LOOP PROTECTION (VERY IMPORTANT)
      ===================================================== */
      const lowerMsg = message?.toLowerCase() || "";

      if (
        lowerMsg.includes("conversation limit reached") ||
        lowerMsg.includes("our team will assist") ||
        lowerMsg.includes("please wait")
      ) {
        logger.warn("🚫 Blocked loop/system message");
        return;
      }

      /* =====================================================
      👤 HUMAN TAKEOVER CHECK
      ===================================================== */
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { isHumanActive: true },
      });

      if (lead?.isHumanActive) return;

      /* =====================================================
      🧠 STEP 1: BOOKING PRIORITY (HIGHEST)
      ===================================================== */
      try {
        const bookingReply = await bookingPriorityRouter({
          businessId,
          leadId,
          message,
        });

        if (bookingReply) {
          aiReply = bookingReply;
        }
      } catch (err) {
        logger.warn({ err }, "Booking router failed");
      }

      /* =====================================================
      ⚙️ STEP 2: AUTOMATION (SECOND)
      ===================================================== */
      if (!aiReply) {
        try {
          const automationReply = await runAutomationEngine({
            businessId,
            leadId,
            message,
          });

          if (automationReply) {
            aiReply = automationReply;
          }
        } catch (err) {
          logger.warn({ err }, "Automation failed");
        }
      }

      /* =====================================================
      🤖 STEP 3: AI BRAIN (FINAL)
      ===================================================== */
      if (!aiReply) {
        aiReply = await routeAIMessage({
          businessId,
          leadId,
          message,
        });
      }

      /* =====================================================
      🛟 FALLBACK
      ===================================================== */
      if (!aiReply || !aiReply.trim()) {
        aiReply = "Thanks for your message! 😊";
      }

      /* 🔴 LENGTH LIMIT */
      if (aiReply.length > 1000) {
        aiReply = aiReply.slice(0, 1000);
      }

      /* =====================================================
      🚦 RATE LIMIT
      ===================================================== */
      const rate = await checkAIRateLimit({
        businessId,
        leadId,
        platform,
      });

      if (rate.blocked) {
        logger.warn("🚫 Rate limit hit");
        return;
      }

      /* =====================================================
      💾 SAVE MESSAGE
      ===================================================== */
      const aiMessage = await prisma.message.create({
        data: {
          leadId,
          content: aiReply,
          sender: "AI",
        },
      });

      /* =====================================================
      🔌 SOCKET EMIT
      ===================================================== */
      try {
        const io = getIO();
        io.to(`lead_${leadId}`).emit("new_message", aiMessage);
      } catch {}

      const accessToken = decrypt(accessTokenEncrypted);

      /* =====================================================
      📤 SEND MESSAGE (INSTAGRAM / WHATSAPP)
      ===================================================== */
      const sendMessage = async () => {
        if (platform === "WHATSAPP") {
          await axios.post(
            `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
            {
              messaging_product: "whatsapp",
              to: senderId,
              type: "text",
              text: { body: aiReply },
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
              message: { text: aiReply },
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

      /* 🔁 RETRY SYSTEM */
      await retryAsync(sendMessage, 3, 800);

      /* =====================================================
      📊 UPDATE LEAD
      ===================================================== */
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          lastMessageAt: new Date(),
          unreadCount: { increment: 1 },
        },
      });

    } catch (error: any) {
      logger.error("Worker crash", error);
      Sentry.captureException(error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
  }
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Worker failed");
});

logger.info("🔥 AI Worker Started");