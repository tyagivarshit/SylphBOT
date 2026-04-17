import { Worker } from "bullmq";
import axios from "axios";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import { decrypt } from "../utils/encrypt";
import { getIO } from "../sockets/socket.server";
import {
  generateSalesFollowupMessage,
  logSalesFollowupMessage,
} from "../services/salesAgent/followup.service";
import { trackAIMessage } from "../services/salesAgent/conversionTracker.service";
import {
  getReplyDeliveryState,
  markReplySaved,
  markReplySent,
} from "../services/aiPipelineState.service";
import logger from "../utils/logger";

/* 🔥 SYSTEM MESSAGE FILTER */
const isSystemGenerated = (msg: string) => {
  const m = msg.toLowerCase();

  return (
    m.includes("please wait") ||
    m.includes("try again later") ||
    m.includes("conversation limit reached")
  );
};

const buildFollowupJobKey = (job: { id?: string | number | null; data?: any }) =>
  `followup:${String(job.id || `${job.data?.leadId || "unknown"}:${job.data?.type || "step"}`)}`;

const saveFollowupMessage = async ({
  jobKey,
  leadId,
  message,
  cta,
  angle,
  trigger,
  variantId,
  variantKey,
  decision,
  jobId,
}: {
  jobKey: string;
  leadId: string;
  message: string;
  cta: string;
  angle: string;
  trigger: string;
  variantId?: string | null;
  variantKey?: string | null;
  decision?: any;
  jobId?: string | number | null;
}) => {
  const deliveryState = await getReplyDeliveryState(jobKey);

  if (deliveryState.savedMessageId) {
    const existing = await prisma.message.findUnique({
      where: { id: deliveryState.savedMessageId },
    });

    if (existing) {
      return {
        message: existing,
        created: false,
      };
    }
  }

  const aiMessage = await prisma.message.create({
    data: {
      leadId,
      content: message,
      sender: "AI",
      metadata: {
        source: "FOLLOWUP",
        cta,
        angle,
        trigger,
        variantId: variantId || null,
        variantKey: variantKey || null,
        jobId: jobId || null,
        deliveryJobKey: jobKey,
        decisionCTA: decision?.cta || null,
        decisionCTAStyle: decision?.ctaStyle || null,
        decisionTone: decision?.tone || null,
        decisionStructure: decision?.structure || null,
        decisionStrategy: decision?.strategy || null,
        topPatterns: decision?.topPatterns || [],
      },
    },
  });

  await markReplySaved(jobKey, aiMessage.id);

  return {
    message: aiMessage,
    created: true,
  };
};

if (process.env.RUN_WORKER === "true") {
  new Worker(
  "followupQueue",
  async (job) => {

    try {

      const { leadId, type, trigger } = job.data;

      console.log(`⏳ Processing followup ${type} for lead ${leadId}`);

      logger.info({ leadId, type, trigger }, "Processing sales follow-up");

      const payload = await generateSalesFollowupMessage({
        leadId,
        step: type,
      });

      if (!payload) return;

      const {
        lead,
        message,
        cta,
        angle,
        planKey,
        temperature,
        decision,
        variant,
      } = payload;
      const jobKey = buildFollowupJobKey(job);

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
      if (false) {
        console.log("🛑 User replied, stopping followups");
        return;
      }

      /* LIMIT */
      if ((lead.followupCount ?? 0) >= 2) {
        console.log("🚫 Followup limit reached");
        return;
      }

      if (!message || isSystemGenerated(message)) {
        return;
      }

      const deliveryState = await getReplyDeliveryState(jobKey);
      const accessToken = decrypt(lead.client.accessToken);

      const { message: aiMessage, created } = await saveFollowupMessage({
        jobKey,
        leadId: lead.id,
        message,
        cta,
        angle,
        trigger: payload.trigger,
        variantId: variant?.id || null,
        variantKey: variant?.variantKey || null,
        decision,
        jobId: job.id || null,
      });

      /* ---------------- SEND MESSAGE ---------------- */

      if (!deliveryState.sent) {
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

        await markReplySent(jobKey);
      }

      await trackAIMessage({
        messageId: aiMessage.id,
        businessId: lead.businessId,
        leadId: lead.id,
        clientId: lead.clientId || null,
        variantId: variant?.id || null,
        source: "FOLLOWUP",
        cta,
        angle,
        leadState: lead.revenueState || lead.aiStage || null,
        messageType: "FOLLOWUP",
        traceId: String(job.id || ""),
        metadata: {
          trigger: payload.trigger,
          step: type,
          variantKey: variant?.variantKey || null,
          decisionCTA: decision?.cta || null,
          decisionCTAStyle: decision?.ctaStyle || null,
          decisionTone: decision?.tone || null,
          decisionStructure: decision?.structure || null,
          decisionStrategy: decision?.strategy || null,
          topPatterns: decision?.topPatterns || [],
        },
      }).catch((error) => {
        logger.warn(
          {
            leadId: lead.id,
            messageId: aiMessage.id,
            error,
          },
          "Follow-up message attribution failed"
        );
      });

      /* ---------------- SOCKET ---------------- */

      if (created) {
        try {
          const io = getIO();
          io.to(`lead_${lead.id}`).emit("new_message", aiMessage);
        } catch {}
      }

      /* ---------------- UPDATE ---------------- */

      if (created) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            followupCount: { increment: 1 },
            lastFollowupAt: new Date(),
          },
        });
      }

      console.log(`✅ Followup ${type} sent`);

      await logSalesFollowupMessage({
        businessId: lead.businessId,
        leadId: lead.id,
        step: type,
        cta,
        angle,
        planKey,
        temperature,
        trigger: payload.trigger,
        variantId: variant?.id || null,
      });

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
