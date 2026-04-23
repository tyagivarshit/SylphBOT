import { Job, Worker } from "bullmq";
import axios from "axios";
import { env } from "../config/env";
import prisma from "../config/prisma";
import {
  closeRedisConnection,
  getWorkerRedisConnection,
} from "../config/redis";
import {
  AIJobPayload,
  AIMessagePayload,
  AIQueuePayload,
  AI_QUEUE_PARTITIONS,
  CommentReplyJobPayload,
  enqueueAIBatch,
  getAIQueueNames,
} from "../queues/ai.queue";
import {
  acquireLeadProcessingLock,
  getReplyDeliveryState,
  markReplySaved,
  markReplySent,
  releaseLeadProcessingLock,
} from "../services/aiPipelineState.service";
import { handleIncomingMessage } from "../services/executionRouter.servce";
import { scheduleFollowups } from "../queues/followup.queue";
import { clearSalesReplyState } from "../services/salesAgent/replyCache.service";
import { trackAIMessage } from "../services/salesAgent/conversionTracker.service";
import { getIO } from "../sockets/socket.server";
import { decrypt } from "../utils/encrypt";
import logger from "../utils/logger";
import { retryAsync } from "../utils/retry.utils";
import {
  captureExceptionWithContext,
  initializeSentry,
} from "../observability/sentry";
import { runWithRequestContext } from "../observability/requestContext";
import {
  getSubscriptionAccess,
  logSubscriptionLockedAction,
} from "../middleware/subscriptionGuard.middleware";
import {
  finalizeAIUsageExecution,
  releaseAIUsageExecution,
  reserveAIUsageExecution,
  reserveUsage,
} from "../services/usage.service";
import {
  consumeBusinessAIHourlyRate,
  consumeBusinessMessageMinuteRate,
  incrementDailyAIUsage,
} from "../redis/rateLimiter.redis";
import { buildSalesAgentRecoveryReply } from "../services/salesAgent/reply.service";
import { resolvePlanContext } from "../services/feature.service";
import { getPlanKey } from "../config/plan.config";
import {
  getThroughputLimits,
  getWorkerCount,
  resolveWorkerConcurrency,
} from "./workerManager";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import { handleCommentAutomation } from "../services/commentAutomation.service";

initializeSentry();

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

console.log("🚀 Worker starting...");
console.log("RUN_WORKER:", process.env.RUN_WORKER);

const AI_WORKER_CONCURRENCY = Math.max(
  1,
  resolveWorkerConcurrency(
    "AI_WORKER_CONCURRENCY",
    Number(process.env.AI_WORKER_CONCURRENCY || env.AI_WORKER_CONCURRENCY || Math.max(getWorkerCount(), 4))
  )
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

class BusinessRateLimitError extends Error {
  retryAfterMs: number;
  scope: "messages" | "ai";

  constructor(
    scope: "messages" | "ai",
    retryAfterMs: number,
    message?: string
  ) {
    super(message || `Business ${scope} rate limit reached`);
    this.name = "BusinessRateLimitError";
    this.scope = scope;
    this.retryAfterMs = retryAfterMs;
  }
}

type AIWorkerJob = Job<AIQueuePayload>;
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

type ThroughputBudget = {
  messagesPerMinute: number;
  aiPerHour: number;
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
  message.kind ||
  (isAIBatchPayload(job.data) && job.data.source === "router"
    ? "router"
    : "message");

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

const isCommentReplyJobPayload = (
  payload: AIQueuePayload | null | undefined
): payload is CommentReplyJobPayload =>
  Boolean(
    payload &&
      typeof payload === "object" &&
      "type" in payload &&
      payload.type === "comment-reply"
  );

const isAIBatchPayload = (
  payload: AIQueuePayload | null | undefined
): payload is AIJobPayload =>
  Boolean(
    payload &&
      typeof payload === "object" &&
      "messages" in payload &&
      Array.isArray((payload as AIJobPayload).messages)
  );

const getJobLeadId = (job?: AIWorkerJob | null) => {
  if (!job?.data) {
    return null;
  }

  if (isAIBatchPayload(job.data)) {
    return job.data.messages?.[0]?.leadId || null;
  }

  return null;
};

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

const isLocalPreviewTask = (task: AIWorkerTask) => {
  const metadata = (task.message.metadata || {}) as Record<string, unknown>;

  return (
    metadata.onboardingDemo === true || metadata.internalSimulation === true
  );
};

const getTaskPlanThroughput = async (
  task: AIWorkerTask
): Promise<ThroughputBudget> => {
  const planFromPayload =
    task.message.plan && typeof task.message.plan === "object"
      ? task.message.plan
      : null;

  if (planFromPayload) {
    return getThroughputLimits(
      getPlanKey(planFromPayload as { type?: string | null; name?: string | null })
    );
  }

  const planContext = await resolvePlanContext(task.message.businessId).catch(
    () => null
  );

  return getThroughputLimits(planContext?.planKey || "LOCKED");
};

const scheduleRateLimitedRetry = async (
  task: AIWorkerTask,
  retryAfterMs: number,
  reason: "messages" | "ai"
) => {
  const delayMs = Math.max(1000, retryAfterMs);

  await enqueueAIBatch(
    [
      {
        ...task.message,
        retryCount: (task.message.retryCount || 0) + 1,
        metadata: {
          ...(task.message.metadata || {}),
          throttledBy: reason,
          throttledAt: new Date().toISOString(),
        },
      },
    ],
    {
      source: "retry",
      delayMs,
      forceUniqueJobId: true,
    }
  );

  logger.warn(
    {
      leadId: task.message.leadId,
      businessId: task.message.businessId,
      jobKey: task.jobKey,
      retryAfterMs: delayMs,
      retryCount: (task.message.retryCount || 0) + 1,
      reason,
    },
    "AI reply rescheduled because business throughput limit was reached"
  );
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
  const subscriptionAccess = await getSubscriptionAccess(
    task.message.businessId
  ).catch(() => null);

  if (!subscriptionAccess?.allowed) {
    logSubscriptionLockedAction(
      {
        businessId: task.message.businessId,
        queueName: task.job.queueName,
        jobId: task.job.id,
        leadId: task.message.leadId,
        action: "ai_platform_delivery",
        lockReason: subscriptionAccess?.lockReason,
      },
      "AI reply delivery skipped because subscription is locked"
    );
    return false;
  }

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
    return true;
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

    return true;
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

    return true;
  }

  logger.warn(
    {
      platform: normalizedPlatform,
      leadId: task.message.leadId,
      jobKey: task.jobKey,
    },
    "Unsupported AI delivery platform"
  );

  return true;
};

const processAndSendReply = async (
  task: AIWorkerTask,
  aiReply: unknown
) => {
  const normalizedReply = normalizeReply(aiReply);
  const localPreviewOnly = isLocalPreviewTask(task);

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

  const { message, created } = await saveReplyMessage(
    task,
    replyText,
    normalizedReply
  );

  if (!localPreviewOnly) {
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
  }

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
    await clearSalesReplyState(task.message.leadId).catch((error) => {
      logger.warn(
        {
          leadId: task.message.leadId,
          jobKey: task.jobKey,
          error,
        },
        "Sales reply cache cleanup skipped after duplicate send detection"
      );
    });

    logger.info(
      {
        leadId: task.message.leadId,
        jobKey: task.jobKey,
      },
      "Skipping platform delivery because reply was already sent"
    );
    return;
  }

  if (localPreviewOnly) {
    await markReplySent(task.jobKey);
    await clearSalesReplyState(task.message.leadId).catch((error) => {
      logger.warn(
        {
          leadId: task.message.leadId,
          jobKey: task.jobKey,
          error,
        },
        "Sales reply cache cleanup skipped after local preview"
      );
    });

    logger.info(
      {
        leadId: task.message.leadId,
        jobKey: task.jobKey,
      },
      "AI reply kept local for onboarding preview"
    );
    return;
  }

  const normalizedPlatform = String(task.message.platform || "").toUpperCase();
  const requiresMessageReservation =
    normalizedPlatform === "WHATSAPP" || normalizedPlatform === "INSTAGRAM";

  if (requiresMessageReservation) {
    const throughput = await getTaskPlanThroughput(task);
    const rateWindow = await consumeBusinessMessageMinuteRate(
      task.message.businessId,
      throughput.messagesPerMinute
    );

    if (!rateWindow.allowed) {
      if ((task.message.retryCount || 0) < 3) {
        await scheduleRateLimitedRetry(
          task,
          rateWindow.ttlSeconds * 1000,
          "messages"
        );
        return;
      }

      throw new BusinessRateLimitError(
        "messages",
        rateWindow.ttlSeconds * 1000,
        "Business message throughput limit reached"
      );
    }
  }

  if (requiresMessageReservation) {
    try {
      await reserveUsage({
        businessId: task.message.businessId,
        feature: "messages_sent",
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "LIMIT_REACHED") {
        logger.warn(
          {
            leadId: task.message.leadId,
            jobKey: task.jobKey,
            businessId: task.message.businessId,
          },
          "AI reply delivery skipped because message usage limit exceeded"
        );
        return;
      }

      throw error;
    }
  }

  const delivered = await retryAsync(() => sendPlatformReply(task, replyText), 3, 800);

  if (!delivered) {
    return;
  }

  await markReplySent(task.jobKey);
  await clearSalesReplyState(task.message.leadId).catch((error) => {
    logger.warn(
      {
        leadId: task.message.leadId,
        jobKey: task.jobKey,
        error,
      },
      "Sales reply cache cleanup skipped after send"
    );
  });

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
  const throughput = await getTaskPlanThroughput(task);
  const aiWindow = await consumeBusinessAIHourlyRate(
    task.message.businessId,
    throughput.aiPerHour
  );

  if (!aiWindow.allowed) {
    if ((task.message.retryCount || 0) < 3) {
      await scheduleRateLimitedRetry(task, aiWindow.ttlSeconds * 1000, "ai");
      return;
    }

    await processAndSendReply(
      task,
      buildSalesAgentRecoveryReply(task.message.message)
    );
    return;
  }

  await incrementDailyAIUsage(task.message.businessId).catch(() => undefined);

  const reply = await handleIncomingMessage({
    ...task.message,
    plan: task.message.plan || null,
    traceId: task.jobKey,
    beforeAIReply: async () => {
      const reservation = await reserveAIUsageExecution({
        businessId: task.message.businessId,
      });

      return {
        finalize: () => finalizeAIUsageExecution(reservation),
        release: () => releaseAIUsageExecution(reservation),
      };
    },
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

  await processAndSendReply(task, reply);
};

const executeLegacyFlow = async (task: AIWorkerTask) =>
  executeRouterFlow(task);

const processAIMessage = async (task: AIWorkerTask) => {
  const metadata = (task.message.metadata || {}) as Record<string, unknown>;
  const metadataRequestId =
    typeof metadata.requestId === "string" ? metadata.requestId.trim() : "";
  const requestId =
    metadataRequestId || `worker-${String(task.job.id ?? "unknown")}`;

  return runWithRequestContext(
    {
      requestId,
      source: "worker",
      route: `queue:${task.job.queueName}`,
      queueName: task.job.queueName,
      jobId: String(task.job.id || task.jobKey),
      leadId: task.message.leadId,
      businessId: task.message.businessId,
      userId:
        typeof metadata.userId === "string" ? metadata.userId : undefined,
    },
    async () => {
      const subscriptionAccess = await getSubscriptionAccess(
        task.message.businessId
      ).catch(() => null);

      if (!subscriptionAccess?.allowed) {
        logSubscriptionLockedAction(
          {
            businessId: task.message.businessId,
            queueName: task.job.queueName,
            jobId: task.job.id,
            leadId: task.message.leadId,
            action: "ai_worker_job",
            lockReason: subscriptionAccess?.lockReason,
          },
          "AI worker skipped job because subscription is locked"
        );
        return;
      }

      logger.info(
        {
          jobId: task.job.id,
          queueName: task.job.queueName,
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
        if (error instanceof BusinessRateLimitError) {
          logger.warn(
            {
              jobId: task.job.id,
              queueName: task.job.queueName,
              leadId: task.message.leadId,
              businessId: task.message.businessId,
              retryAfterMs: error.retryAfterMs,
              scope: error.scope,
            },
            "AI worker throttled job because business throughput limit was reached"
          );
          throw error;
        }

        if (!(error instanceof LeadQueueBusyError)) {
          logger.error(
            {
              jobId: task.job.id,
              queueName: task.job.queueName,
              leadId: task.message.leadId,
              businessId: task.message.businessId,
              error,
            },
            "AI worker job failed"
          );
          captureExceptionWithContext(error, {
            tags: {
              worker: "ai.partition",
            },
          });
        }
        throw error;
      } finally {
        await releaseLeadProcessingLock(task.message.leadId, task.jobKey);
      }
    }
  );
};

const processCommentReplyJob = async (job: AIWorkerJob) => {
  if (!isCommentReplyJobPayload(job.data)) {
    return;
  }

  console.log("⚙️ WORKER RECEIVED JOB", job.data);
  console.log("🔍 JOB TYPE:", job.data.type);

  const payload = job.data;

  return runWithRequestContext(
    {
      requestId: `comment-reply-${String(job.id || "unknown")}`,
      source: "worker",
      route: `queue:${job.queueName}`,
      queueName: job.queueName,
      jobId: String(job.id || `${job.queueName}:${job.name}`),
      leadId: null,
      businessId: payload.businessId,
    },
    async () => {
      const subscriptionAccess = await getSubscriptionAccess(
        payload.businessId
      ).catch(() => null);

      if (!subscriptionAccess?.allowed) {
        logSubscriptionLockedAction(
          {
            businessId: payload.businessId,
            queueName: job.queueName,
            jobId: job.id,
            leadId: null,
            action: "comment_reply_worker_job",
            lockReason: subscriptionAccess?.lockReason,
          },
          "Comment reply worker skipped job because subscription is locked"
        );
        return;
      }

      console.log("Processing comment reply job");

      logger.info(
        {
          jobId: job.id,
          queueName: job.queueName,
          businessId: payload.businessId,
          clientId: payload.clientId,
          commentId: payload.commentId || null,
          jobType: payload.type,
        },
        "Comment reply worker job started"
      );

      await handleCommentAutomation(payload);

      logger.info(
        {
          jobId: job.id,
          queueName: job.queueName,
          businessId: payload.businessId,
          clientId: payload.clientId,
          commentId: payload.commentId || null,
          jobType: payload.type,
        },
        "Comment reply worker job completed"
      );
    }
  );
};

const processAIJob = async (job: AIWorkerJob) => {
  if (isCommentReplyJobPayload(job.data)) {
    await processCommentReplyJob(job);
    return;
  }

  if (!isAIBatchPayload(job.data) || !job.data.messages.length) {
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
  shouldRunWorker
    ? getAIQueueNames().map((queueName) => {
        const worker = new Worker<AIQueuePayload>(
          queueName,
          withRedisWorkerFailSafe(queueName, async (job) => processAIJob(job)),
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

          if (error instanceof BusinessRateLimitError) {
            logger.warn(
              {
                jobId: job?.id,
                queueName,
                leadId: getJobLeadId(job),
                retryAfterMs: error.retryAfterMs,
                scope: error.scope,
              },
              "AI worker moved throttled job to failed set after retry budget was exhausted"
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
          captureExceptionWithContext(error, {
            tags: {
              worker: "ai.partition",
              queueName,
            },
            extras: {
              jobId: job?.id,
              leadId: getJobLeadId(job),
            },
          });
        });

        worker.on("error", (error) => {
          logger.error(
            {
              queueName,
              error,
            },
            "AI partition worker error"
          );
          captureExceptionWithContext(error, {
            tags: {
              worker: "ai.partition",
              queueName,
            },
          });
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

if (workers.length > 0) {
  console.log("✅ Worker initialized", {
    queues: getAIQueueNames(),
  });
} else {
  console.error("❌ No workers started — check RUN_WORKER or Redis config");
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  logger.error({ error }, "AI worker uncaught exception");
  captureExceptionWithContext(error, {
    tags: {
      worker: "ai.partition",
      event: "uncaughtException",
    },
  });
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (error) => {
  logger.error({ error }, "AI worker unhandled rejection");
  captureExceptionWithContext(error, {
    tags: {
      worker: "ai.partition",
      event: "unhandledRejection",
    },
  });
});
