import { Job, Worker } from "bullmq";
import axios from "axios";
import * as Sentry from "@sentry/node";
import prisma from "../config/prisma";
import { env } from "../config/env";
import {
  AIJobPayload,
  AI_QUEUE_PARTITIONS,
  getAIQueueNames,
} from "../queues/ai.queue";
import { checkAIRateLimit } from "../services/aiRateLimiter.service";
import {
  acquireLeadProcessingLock,
  getReplyDeliveryState,
  markReplySaved,
  markReplySent,
  releaseLeadProcessingLock,
} from "../services/aiPipelineState.service";
import { routeAIMessage } from "../services/aiRouter.service";
import { runAutomationEngine } from "../services/automationEngine.service";
import { bookingPriorityRouter } from "../services/bookingPriorityRouter.service";
import { handleIncomingMessage } from "../services/executionRouter.servce";
import { getIO } from "../sockets/socket.server";
import { decrypt } from "../utils/encrypt";
import logger from "../utils/logger";
import { retryAsync } from "../utils/retry.utils";

const AI_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.AI_WORKER_CONCURRENCY || 1)
);
const INSTAGRAM_SEND_DELAY_MS = Math.max(
  0,
  Number(process.env.INSTAGRAM_SEND_DELAY_MS || 250)
);

class LeadQueueBusyError extends Error {
  constructor(leadId: string) {
    super(`Lead queue busy: ${leadId}`);
    this.name = "LeadQueueBusyError";
  }
}

type AIWorkerJob = Job<AIJobPayload>;
type NormalizedReply = {
  text: string;
  cta?: string | null;
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const buildJobKey = (job: AIWorkerJob) =>
  `${job.queueName}:${job.id ?? `${job.name}:${job.timestamp}`}`;

const normalizeReply = (aiReply: unknown): NormalizedReply | null => {
  if (typeof aiReply === "string") {
    const text = aiReply.trim();
    return text ? { text } : null;
  }

  if (!aiReply || typeof aiReply !== "object") {
    return null;
  }

  const reply = aiReply as { message?: unknown; cta?: unknown };
  const text = String(reply.message ?? "").trim();

  if (!text) {
    return null;
  }

  return {
    text,
    cta: typeof reply.cta === "string" ? reply.cta : null,
  };
};

const emitRealtimeMessage = (
  leadId: string,
  message: any,
  cta?: string | null
) => {
  try {
    const io = getIO();
    io.to(`lead_${leadId}`).emit("new_message", {
      ...message,
      cta: cta || null,
    });
  } catch {
    logger.debug({ leadId }, "Socket emit skipped for AI reply");
  }
};

const saveReplyMessage = async (
  jobKey: string,
  leadId: string,
  replyText: string,
  cta?: string | null
) => {
  const currentState = await getReplyDeliveryState(jobKey);

  if (currentState.savedMessageId) {
    const existingMessage = await prisma.message.findUnique({
      where: { id: currentState.savedMessageId },
    });

    if (existingMessage) {
      return {
        message: existingMessage,
        created: false,
      };
    }
  }

  const createdMessage = await prisma.message.create({
    data: {
      leadId,
      content: replyText,
      sender: "AI",
      metadata: {
        cta: cta || null,
        deliveryJobKey: jobKey,
      },
    },
  });

  await markReplySaved(jobKey, createdMessage.id);

  return {
    message: createdMessage,
    created: true,
  };
};

const sendPlatformReply = async (
  data: AIJobPayload,
  replyText: string
) => {
  const { platform, senderId, phoneNumberId, accessTokenEncrypted } = data;

  if (!platform) {
    return;
  }

  if (!accessTokenEncrypted) {
    throw new Error(`Missing access token for ${platform} reply delivery`);
  }

  const accessToken = decrypt(accessTokenEncrypted);

  if (!accessToken) {
    throw new Error(`Unable to decrypt access token for ${platform}`);
  }

  const normalizedPlatform = platform.toUpperCase();

  if (normalizedPlatform === "WHATSAPP") {
    if (!senderId || !phoneNumberId) {
      throw new Error("Missing WhatsApp delivery identifiers");
    }

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

    return;
  }

  if (normalizedPlatform === "INSTAGRAM") {
    if (!senderId) {
      throw new Error("Missing Instagram sender id");
    }

    if (INSTAGRAM_SEND_DELAY_MS > 0) {
      await delay(INSTAGRAM_SEND_DELAY_MS);
    }

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

    return;
  }

  logger.warn(
    {
      platform: normalizedPlatform,
      leadId: data.leadId,
    },
    "Unsupported AI delivery platform"
  );
};

const processAndSendReply = async (
  job: AIWorkerJob,
  aiReply: unknown
) => {
  const normalizedReply = normalizeReply(aiReply);

  if (!normalizedReply) {
    return;
  }

  const jobKey = buildJobKey(job);
  const existingState = await getReplyDeliveryState(jobKey);
  const replyText =
    normalizedReply.text.length > 1000
      ? normalizedReply.text.slice(0, 1000)
      : normalizedReply.text;

  if (!existingState.savedMessageId) {
    const rate = await checkAIRateLimit({
      businessId: job.data.businessId,
      leadId: job.data.leadId,
      platform: job.data.platform || "UNKNOWN",
    });

    if (rate.blocked) {
      logger.warn(
        {
          businessId: job.data.businessId,
          leadId: job.data.leadId,
          platform: job.data.platform,
          reason: rate.reason,
        },
        "AI reply blocked by rate limit"
      );
      return;
    }
  }

  const { message, created } = await saveReplyMessage(
    jobKey,
    job.data.leadId,
    replyText,
    normalizedReply.cta
  );

  if (created) {
    emitRealtimeMessage(job.data.leadId, message, normalizedReply.cta);

    await prisma.lead.update({
      where: { id: job.data.leadId },
      data: {
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });
  }

  if (existingState.sent) {
    return;
  }

  await retryAsync(
    () => sendPlatformReply(job.data, replyText),
    3,
    800
  );

  await markReplySent(jobKey);
};

const executeRouterFlow = async (job: AIWorkerJob) => {
  const reply = await handleIncomingMessage({
    ...job.data,
    plan: job.data.plan || null,
  });

  if (!reply) {
    return;
  }

  return processAndSendReply(job, reply);
};

const executeLegacyFlow = async (job: AIWorkerJob) => {
  const { businessId, leadId, message, plan } = {
    ...job.data,
    plan: job.data.plan || null,
  };

  const lowerMessage = message?.toLowerCase() || "";

  if (
    lowerMessage.includes("conversation limit reached") ||
    lowerMessage.includes("our team will assist") ||
    lowerMessage.includes("please wait")
  ) {
    logger.warn(
      { leadId },
      "Blocked loop or system message from AI queue"
    );
    return;
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { isHumanActive: true },
  });

  if (lead?.isHumanActive) {
    return;
  }

  let aiReply: string | { message: string; cta?: string } | null = null;

  try {
    const bookingReply = await bookingPriorityRouter({
      businessId,
      leadId,
      message,
      plan,
    });

    if (bookingReply) {
      aiReply = bookingReply;
    }
  } catch (error) {
    logger.warn({ error, leadId }, "Booking router failed");
  }

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
    } catch (error) {
      logger.warn({ error, leadId }, "Automation engine failed");
    }
  }

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
        : aiResponse?.message
          ? aiResponse
          : null;
  }

  if (!aiReply) {
    return;
  }

  return processAndSendReply(job, aiReply);
};

const processAIJob = async (job: AIWorkerJob) => {
  const jobKey = buildJobKey(job);
  const lockAcquired = await acquireLeadProcessingLock(job.data.leadId, jobKey);

  if (!lockAcquired) {
    throw new LeadQueueBusyError(job.data.leadId);
  }

  try {
    if (job.name === "router") {
      return await executeRouterFlow(job);
    }

    return await executeLegacyFlow(job);
  } catch (error) {
    if (!(error instanceof LeadQueueBusyError)) {
      logger.error(
        {
          jobId: job.id,
          queueName: job.queueName,
          leadId: job.data.leadId,
          error,
        },
        "AI worker job failed"
      );
      Sentry.captureException(error);
    }

    throw error;
  } finally {
    await releaseLeadProcessingLock(job.data.leadId, jobKey);
  }
};

const workers = getAIQueueNames().map((queueName) => {
  const worker = new Worker<AIJobPayload>(
    queueName,
    async (job) => processAIJob(job),
    {
      connection: { url: env.REDIS_URL },
      concurrency: AI_WORKER_CONCURRENCY,
    }
  );

  worker.on("failed", (job, error) => {
    if (error instanceof LeadQueueBusyError) {
      logger.warn(
        {
          jobId: job?.id,
          queueName,
          leadId: job?.data?.leadId,
        },
        "Lead queue busy, BullMQ will retry"
      );
      return;
    }

    logger.error(
      {
        jobId: job?.id,
        queueName,
        leadId: job?.data?.leadId,
        error,
      },
      "AI partition worker failed"
    );
  });

  return worker;
});

logger.info(
  {
    partitions: AI_QUEUE_PARTITIONS,
    workers: workers.length,
    concurrencyPerPartition: AI_WORKER_CONCURRENCY,
  },
  "AI partition workers started"
);
