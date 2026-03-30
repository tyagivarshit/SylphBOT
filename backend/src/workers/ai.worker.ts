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
      /* ---------------- HUMAN CHECK ---------------- */
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { isHumanActive: true },
      });

      if (lead?.isHumanActive) return;

      /* ---------------- AUTOMATION ---------------- */
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

      /* ---------------- AI ---------------- */
      if (!aiReply) {
        aiReply = await routeAIMessage({
          businessId,
          leadId,
          message,
        });
      }

      /* ---------------- BOOKING ---------------- */
      try {
        const bookingReply = await bookingPriorityRouter({
          businessId,
          leadId,
          message,
        });

        if (bookingReply) aiReply = bookingReply;
      } catch {}

      /* ---------------- FALLBACK ---------------- */
      if (!aiReply || !aiReply.trim()) {
        aiReply = "Thanks for your message!";
      }

      /* 🔴 LENGTH LIMIT */
      if (aiReply.length > 1000) {
        aiReply = aiReply.slice(0, 1000);
      }

      /* ---------------- RATE LIMIT ---------------- */
      const rate = await checkAIRateLimit({
        businessId,
        leadId,
        platform,
      });

      if (rate.blocked) return;

      /* ---------------- SAVE ---------------- */
      const aiMessage = await prisma.message.create({
        data: {
          leadId,
          content: aiReply,
          sender: "AI",
        },
      });

      /* ---------------- SOCKET ---------------- */
      try {
        const io = getIO();
        io.to(`lead_${leadId}`).emit("new_message", aiMessage);
      } catch {}

      const accessToken = decrypt(accessTokenEncrypted);

      /* ---------------- SEND ---------------- */

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

          /* small delay (optimized) */
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

      /* 🔥 RETRY SYSTEM */
      await retryAsync(sendMessage, 3, 800);

      /* ---------------- UPDATE LEAD ---------------- */
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
    concurrency: 10, // 🔥 upgraded
  }
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Worker failed");
});

logger.info("🔥 AI Worker Started");