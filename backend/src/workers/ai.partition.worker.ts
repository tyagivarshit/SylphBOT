import { Job, Worker } from "bullmq";
import axios from "axios";
import * as Sentry from "@sentry/node";
import { env } from "../config/env";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import {
  AIJobPayload,
  AIMessagePayload,
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
type AIWorkerMessage = AIMessagePayload;
type AIWorkerMessageKind = NonNullable<AIWorkerMessage["kind"]>;
type AIWorkerTask = {
  job: AIWorkerJob;
  message: AIWorkerMessage;
  jobKey: string;
  kind: AIWorkerMessageKind;
};
type NormalizedReply = {
  text: string;
  cta?: string | null;
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const buildJobKey = (job: AIWorkerJob) =>
  `${job.queueName}:${job.id ?? `${job.name}:${job.timestamp}`}`;

const buildMessageJobKey = (
  job: AIWorkerJob,
  messageIndex: number
) => `${buildJobKey(job)}:${messageIndex}`;

const getTaskKind = (
  job: AIWorkerJob,
  message: AIWorkerMessage
): AIWorkerMessageKind =>
  message.kind || (job.data.source === "router" ? "router" : "message");

const createWorkerTask = (
  job: AIWorkerJob,
  message: AIWorkerMessage,
  messageIndex: number
): AIWorkerTask => ({
  job,
  message,
  jobKey: buildMessageJobKey(job, messageIndex),
  kind: getTaskKind(job, message),
});

const getJobLeadId = (job?: AIWorkerJob | null) =>
  job?.data?.messages?.[0]?.leadId;

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
  data: AIWorkerMessage,
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
  task: AIWorkerTask,
  aiReply: unknown
) => {
  const normalizedReply = normalizeReply(aiReply);

  if (!normalizedReply) {
    return;
  }

  const existingState = await getReplyDeliveryState(task.jobKey);
  const replyText =
    normalizedReply.text.length > 1000
      ? normalizedReply.text.slice(0, 1000)
      : normalizedReply.text;

  if (!existingState.savedMessageId) {
    const rate = await checkAIRateLimit({
      businessId: task.message.businessId,
      leadId: task.message.leadId,
      platform: task.message.platform || "UNKNOWN",
    });

    if (rate.blocked) {
      logger.warn(
        {
          businessId: task.message.businessId,
          leadId: task.message.leadId,
          platform: task.message.platform,
          reason: rate.reason,
        },
        "AI reply blocked by rate limit"
      );
      return;
    }
  }

  const { message, created } = await saveReplyMessage(
    task.jobKey,
    task.message.leadId,
    replyText,
    normalizedReply.cta
  );

  if (created) {
    emitRealtimeMessage(task.message.leadId, message, normalizedReply.cta);

    await prisma.lead.update({
      where: { id: task.message.leadId },
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
    () => sendPlatformReply(task.message, replyText),
    3,
    800
  );

  await markReplySent(task.jobKey);
};

const executeRouterFlow = async (task: AIWorkerTask) => {
  const reply = await handleIncomingMessage({
    ...task.message,
    plan: task.message.plan || null,
  });

  if (!reply) {
    return;
  }

  return processAndSendReply(task, reply);
};

const executeLegacyFlow = async (task: AIWorkerTask) => {
  const { businessId, leadId, message, plan } = {
    ...task.message,
    plan: task.message.plan || null,
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

  return processAndSendReply(task, aiReply);
};

const processAIMessage = async (task: AIWorkerTask) => {
  const lockAcquired = await acquireLeadProcessingLock(
    task.message.leadId,
    task.jobKey
  );

  if (!lockAcquired) {
    throw new LeadQueueBusyError(task.message.leadId);
  }

  try {
    if (task.kind === "router") {
      return await executeRouterFlow(task);
    }

    return await executeLegacyFlow(task);
  } catch (error) {
    if (!(error instanceof LeadQueueBusyError)) {
      logger.error(
        {
          jobId: task.job.id,
          queueName: task.job.queueName,
          leadId: task.message.leadId,
          error,
        },
        "AI worker job failed"
      );
      Sentry.captureException(error);
    }

    throw error;
  } finally {
    await releaseLeadProcessingLock(task.message.leadId, task.jobKey);
  }
};

const processAIJob = async (job: AIWorkerJob) => {
  if (!job.data.messages.length) {
    logger.warn(
      {
        jobId: job.id,
        queueName: job.queueName,
      },
      "AI worker received empty batch"
    );
    return;
  }

  for (const [messageIndex, message] of job.data.messages.entries()) {
    await processAIMessage(createWorkerTask(job, message, messageIndex));
  }
};

const workers =
  process.env.RUN_WORKER === "true"
    ? getAIQueueNames().map((queueName) => {
        const worker = new Worker<AIJobPayload>(
          queueName,
          async (job) => processAIJob(job),
          {
            connection: getWorkerRedisConnection(),
            prefix: env.AI_QUEUE_PREFIX,
            concurrency: AI_WORKER_CONCURRENCY,
          }
        );

        worker.on("failed", (job, error) => {
          if (error instanceof LeadQueueBusyError) {
            logger.warn(
              {
                jobId: job?.id,
                queueName,
                leadId: getJobLeadId(job),
              },
              "Lead queue busy, BullMQ will retry"
            );
            return;
          }

          logger.error(
            {
              jobId: job?.id,
              queueName,
              leadId: getJobLeadId(job),
              error,
            },
            "AI partition worker failed"
          );
        });

        return worker;
      })
    : [];

logger.info(
  {
    partitions: AI_QUEUE_PARTITIONS,
    workers: workers.length,
    concurrencyPerPartition: AI_WORKER_CONCURRENCY,
  },
  "AI partition workers started"
);
