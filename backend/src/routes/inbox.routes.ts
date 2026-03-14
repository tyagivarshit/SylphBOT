import { Worker } from "bullmq";
import prisma from "../config/prisma";
import axios from "axios";
import { redisConnection } from "../config/redis";
import { decrypt } from "../utils/encrypt";

import { routeAIMessage } from "../services/aiRouter.service";
import { runAutomationEngine } from "../services/automationEngine.service";
import { checkAIRateLimit } from "../services/aiRateLimiter.service";

import { getIO } from "../sockets/socket.server";
import logger from "../utils/logger";

/* ---------------- HUMAN DELAY HELPER ---------------- */

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
      pageId,
      accessTokenEncrypted
    } = job.data;

    logger.info({ leadId, businessId, platform }, "AI Worker Processing");

    let aiReply: string | null = null;

    try {

      /* ---------------- HUMAN TAKEOVER CHECK ---------------- */

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { isHumanActive: true }
      });

      if (lead?.isHumanActive) {

        logger.info(
          { leadId },
          "AI paused because human agent is active"
        );

        return;

      }

      /* ---------------- AUTOMATION ENGINE ---------------- */

      try {

        const automationReply = await runAutomationEngine({
          businessId,
          leadId,
          message,
        });

        if (automationReply) {
          aiReply = automationReply;
        }

      } catch (error) {

        logger.warn({ leadId, error }, "Automation engine failed");

      }

      /* ---------------- AI ROUTER ---------------- */

      if (!aiReply) {

        aiReply = await routeAIMessage({
          businessId,
          leadId,
          message,
        });

      }

      if (!aiReply || aiReply.trim().length === 0) {
        aiReply = "Thanks for your message!";
      }

      /* ---------------- RATE LIMIT CHECK ---------------- */

      const rate = await checkAIRateLimit({
        businessId,
        leadId,
        platform,
      });

      if (rate.blocked) {

        logger.warn(
          { leadId, businessId, platform },
          "AI message blocked by rate limiter"
        );

        return;

      }

      /* ---------------- SAVE AI MESSAGE ---------------- */

      const aiMessage = await prisma.message.create({
        data: {
          leadId,
          content: aiReply,
          sender: "AI",
        },
      });

      /* ---------------- SOCKET EVENT ---------------- */

      try {

        const io = getIO();
        io.to(`lead_${leadId}`).emit("new_message", aiMessage);

      } catch (error) {

        logger.warn({ leadId, error }, "Socket emit failed");

      }

      /* ---------------- SEND MESSAGE ---------------- */

      const accessToken = decrypt(accessTokenEncrypted);

      /* ---------------- WHATSAPP ---------------- */

      if (platform === "WHATSAPP") {

        try {

          const response = await axios.post(
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
                "Content-Type": "application/json",
              },
              timeout: 10000,
            }
          );

          logger.info(
            { leadId, response: response.data },
            "WhatsApp message sent"
          );

        } catch (error: any) {

          logger.error(
            {
              leadId,
              error: error?.response?.data || error.message
            },
            "WhatsApp send failed"
          );

        }

      }

      /* ---------------- INSTAGRAM ---------------- */

      if (platform === "INSTAGRAM") {

        if (!senderId || senderId === pageId) {

          logger.warn(
            { leadId, senderId, pageId },
            "Skipping self message send"
          );

        } else {

          try {

            logger.info(
              { leadId, senderId, pageId, aiReply },
              "Preparing Instagram reply"
            );

            /* HUMAN LIKE RANDOM DELAY (2-4 sec) */

            const randomDelay = 2000 + Math.floor(Math.random() * 2000);
            await delay(randomDelay);

            /* TYPING INDICATOR */

            await axios.post(
              "https://graph.facebook.com/v19.0/me/messages",
              {
                recipient: { id: senderId },
                sender_action: "typing_on"
              },
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                }
              }
            );

            /* TYPING WAIT */

            await delay(1500);

            /* ACTUAL MESSAGE SEND */

            const response = await axios.post(
              "https://graph.facebook.com/v19.0/me/messages",
              {
                recipient: { id: senderId },
                message: { text: aiReply },
              },
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                timeout: 10000,
              }
            );

            logger.info(
              { leadId, response: response.data },
              "Instagram message sent successfully"
            );

          } catch (error: any) {

            logger.error(
              {
                leadId,
                senderId,
                pageId,
                error: error?.response?.data || error.message
              },
              "Instagram send failed"
            );

          }

        }

      }

      /* ---------------- UPDATE LEAD ---------------- */

      prisma.lead.update({
        where: { id: leadId },
        data: {
          lastMessageAt: new Date(),
          unreadCount: { increment: 1 },
        },
      }).catch((error) => {
        logger.warn({ leadId, error }, "Lead update failed");
      });

      logger.info({ leadId }, "AI Worker Completed");

    } catch (error: any) {

      logger.error(
        {
          leadId,
          error: error?.response?.data || error?.message || error
        },
        "AI Worker Error"
      );

      throw error;

    }

  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

/* ---------------- WORKER ERROR HANDLING ---------------- */

worker.on("failed", (job, err) => {

  logger.error(
    { jobId: job?.id, error: err },
    "AI Worker Failed"
  );

});

logger.info("AI Worker Started");