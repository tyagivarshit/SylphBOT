import { Job, Worker } from "bullmq";
import axios from "axios";
import * as Sentry from "@sentry/node";
import { env } from "../config/env";
import prisma from "../config/prisma";
import {
  closeRedisConnection,
  getWorkerRedisConnection,
} from "../config/redis";
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
import { handleIncomingMessage } from "../services/executionRouter.servce";
import { scheduleFollowups } from "../queues/followup.queue";
import { trackAIMessage } from "../services/salesAgent/conversionTracker.service";
import { getIO } from "../sockets/socket.server";
import { decrypt } from "../utils/encrypt";
import logger from "../utils/logger";
import { retryAsync } from "../utils/retry.utils";

const AI_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.AI_WORKER_CONCURRENCY || env.AI_WORKER_CONCURRENCY || 1)
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
  angle?: string | null;
  variantId?: string | null;
  variantKey?: string | null;
  leadState?: string | null;
  messageType?: string | null;
  meta?: Record<string, unknown>;
  source?: string | null;
  latencyMs?: number | null;
  traceId?: string | null;
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

  const reply = aiReply as {
    message?: unknown;
    cta?: unknown;
    source?: unknown;
    latencyMs?: unknown;
    traceId?: unknown;
    angle?: unknown;
    variantId?: unknown;
    variantKey?: unknown;
    leadState?: unknown;
    messageType?: unknown;
    meta?: {
      source?: unknown;
      latencyMs?: unknown;
      traceId?: unknown;
      angle?: unknown;
      variantId?: unknown;
      variantKey?: unknown;
      leadState?: unknown;
      messageType?: unknown;
    };
  };
  const text = String(reply.message ?? "").trim();

  if (!text) {
    return null;
  }

  return {
    text,
    cta: typeof reply.cta === "string" ? reply.cta : null,
    angle:
      typeof reply.angle === "string"
        ? reply.angle
        : typeof reply.meta?.angle === "string"
          ? reply.meta.angle
          : null,
    variantId:
      typeof reply.variantId === "string"
        ? reply.variantId
        : typeof reply.meta?.variantId === "string"
          ? reply.meta.variantId
          : null,
    variantKey:
      typeof reply.variantKey === "string"
        ? reply.variantKey
        : typeof reply.meta?.variantKey === "string"
          ? reply.meta.variantKey
          : null,
    leadState:
      typeof reply.leadState === "string"
        ? reply.leadState
        : typeof reply.meta?.leadState === "string"
          ? reply.meta.leadState
          : null,
    messageType:
      typeof reply.messageType === "string"
        ? reply.messageType
        : typeof reply.meta?.messageType === "string"
          ? reply.meta.messageType
          : null,
    meta:
      reply.meta && typeof reply.meta === "object"
        ? (reply.meta as Record<string, unknown>)
        : {},
    source:
      typeof reply.source === "string"
        ? reply.source
        : typeof reply.meta?.source === "string"
          ? reply.meta.source
          : null,
    latencyMs:
      typeof reply.latencyMs === "number"
        ? reply.latencyMs
        : typeof reply.meta?.latencyMs === "number"
          ? reply.meta.latencyMs
          : null,
    traceId:
      typeof reply.traceId === "string"
        ? reply.traceId
        : typeof reply.meta?.traceId === "string"
          ? reply.meta.traceId
          : null,
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
  task: AIWorkerTask,
  replyText: string,
  reply: NormalizedReply
) => {
  const currentState = await getReplyDeliveryState(task.jobKey);

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
      leadId: task.message.leadId,
      content: replyText,
      sender: "AI",
      metadata: {
        ...(reply.meta || {}),
        cta: reply.cta || null,
        angle: reply.angle || null,
        variantId: reply.variantId || null,
        variantKey: reply.variantKey || null,
        leadState: reply.leadState || null,
        messageType: reply.messageType || "AI_REPLY",
        deliveryJobKey: task.jobKey,
        sourceKind: task.kind,
        replySource: reply.source || task.kind,
        platform: task.message.platform || null,
        externalEventId: task.message.externalEventId || null,
        latencyMs: reply.latencyMs || null,
        traceId: reply.traceId || task.jobKey,
      },
    },
  });

  await markReplySaved(task.jobKey, createdMessage.id);

  return {
    message: createdMessage,
    created: true,
  };
};

const sendPlatformReply = async (
  task: AIWorkerTask,
  replyText: string
) => {
  const { platform, senderId, phoneNumberId, accessTokenEncrypted } =
    task.message;

  if (!platform) {
    logger.info(
      {
        leadId: task.message.leadId,
        jobKey: task.jobKey,
      },
      "AI reply kept local because no platform delivery was requested"
    );
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

  logger.info(
    {
      leadId: task.message.leadId,
      jobKey: task.jobKey,
      platform: normalizedPlatform,
      senderId: senderId || null,
    },
    "Sending AI reply to platform"
  );

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
      leadId: task.message.leadId,
      jobKey: task.jobKey,
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
    logger.warn(
      {
        leadId: task.message.leadId,
        jobKey: task.jobKey,
      },
      "AI reply generation returned an empty payload"
    );
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
          jobKey: task.jobKey,
          reason: rate.reason,
        },
        "AI reply blocked by rate limit"
      );
      return;
    }
  }

  const { message, created } = await saveReplyMessage(
    task,
    replyText,
    normalizedReply
  );

  await trackAIMessage({
    messageId: message.id,
    businessId: task.message.businessId,
    leadId: task.message.leadId,
    variantId: normalizedReply.variantId || null,
    source: normalizedReply.source || task.kind || "AI_ROUTER",
    cta: normalizedReply.cta || null,
    angle: normalizedReply.angle || null,
    leadState: normalizedReply.leadState || null,
    messageType: normalizedReply.messageType || "AI_REPLY",
    traceId: normalizedReply.traceId || task.jobKey,
    metadata: {
      ...(normalizedReply.meta || {}),
      platform: task.message.platform || null,
      externalEventId: task.message.externalEventId || null,
      deliveryJobKey: task.jobKey,
      sourceKind: task.kind,
    },
  }).catch((error) => {
    logger.warn(
      {
        businessId: task.message.businessId,
        leadId: task.message.leadId,
        messageId: message.id,
        jobKey: task.jobKey,
        error,
      },
      "AI reply attribution failed"
    );
  });

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
    logger.info(
      {
        leadId: task.message.leadId,
        jobKey: task.jobKey,
      },
      "Skipping platform delivery because reply was already sent"
    );
    return;
  }

  await retryAsync(() => sendPlatformReply(task, replyText), 3, 800);

  await markReplySent(task.jobKey);

  if (created) {
    void scheduleFollowups(task.message.leadId).catch((error) => {
      logger.warn(
        {
          leadId: task.message.leadId,
          jobKey: task.jobKey,
          error,
        },
        "Follow-up scheduling after AI reply failed"
      );
    });
  }

  logger.info(
    {
      leadId: task.message.leadId,
      jobKey: task.jobKey,
      replySource: normalizedReply.source || task.kind,
      latencyMs: normalizedReply.latencyMs || null,
    },
    "AI reply completed"
  );
};

const executeRouterFlow = async (task: AIWorkerTask) => {
  const reply = await handleIncomingMessage({
    ...task.message,
    plan: task.message.plan || null,
    traceId: task.jobKey,
  });

  if (!reply) {
    logger.info(
      {
        leadId: task.message.leadId,
        jobKey: task.jobKey,
      },
      "AI reply task ended without a reply"
    );
    return;
  }

  return processAndSendReply(task, reply);
};

const executeLegacyFlow = async (task: AIWorkerTask) =>
  executeRouterFlow(task);

const processAIMessage = async (task: AIWorkerTask) => {
  logger.info(
    {
      leadId: task.message.leadId,
      businessId: task.message.businessId,
      jobKey: task.jobKey,
      source: task.kind,
      platform: task.message.platform || null,
      externalEventId: task.message.externalEventId || null,
    },
    "AI reply task started"
  );

  const lockAcquired = await acquireLeadProcessingLock(
    task.message.leadId,
    task.jobKey,
    {
      waitMs: 1200,
      pollMs: 50,
    }
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

  logger.info(
    {
      jobId: job.id,
      queueName: job.queueName,
      batchId: job.data.batchId,
      source: job.data.source,
      messages: job.data.messages.length,
      leadIds: Array.from(
        new Set(job.data.messages.map((message) => message.leadId))
      ),
    },
    "AI worker batch started"
  );

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

        worker.on("active", (job) => {
          logger.info(
            {
              jobId: job.id,
              queueName,
              leadId: getJobLeadId(job),
            },
            "AI worker activated job"
          );
        });

        worker.on("completed", (job) => {
          logger.info(
            {
              jobId: job.id,
              queueName,
              leadId: getJobLeadId(job),
            },
            "AI worker completed job"
          );
        });

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

        worker.on("error", (error) => {
          logger.error(
            {
              queueName,
              error,
            },
            "AI partition worker error"
          );
        });

        return worker;
      })
    : [];

let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([prisma.$disconnect(), closeRedisConnection()]);

  if (signal === "uncaughtException") {
    process.exit(1);
  }
};

logger.info(
  {
    partitions: AI_QUEUE_PARTITIONS,
    workers: workers.length,
    concurrencyPerPartition: AI_WORKER_CONCURRENCY,
  },
  "AI partition workers started"
);

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  logger.error({ error }, "AI worker uncaught exception");
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (error) => {
  logger.error({ error }, "AI worker unhandled rejection");
});
