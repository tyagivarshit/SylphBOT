import { DelayedError, Job, Worker } from "bullmq";
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
  FOLLOWUP_QUEUE_NAME,
  LEGACY_FOLLOWUP_QUEUE_NAME,
} from "../queues/followup.queue";
import {
  getReplyDeliveryState,
  markReplySaved,
  markReplySent,
} from "../services/aiPipelineState.service";
import logger from "../utils/logger";
import {
  captureExceptionWithContext,
  initializeSentry,
} from "../observability/sentry";
import {
  runWithRequestContext,
  updateRequestContext,
} from "../observability/requestContext";
import {
  getSubscriptionAccess,
  logSubscriptionLockedAction,
} from "../middleware/subscriptionGuard.middleware";
import { reserveUsage } from "../services/usage.service";
import { resolvePlanContext } from "../services/feature.service";
import {
  consumeBusinessAIHourlyRate,
  consumeBusinessMessageMinuteRate,
  incrementDailyAIUsage,
} from "../redis/rateLimiter.redis";
import {
  getThroughputLimits,
  getWorkerCount,
  resolveWorkerConcurrency,
} from "./workerManager";

initializeSentry();

type FollowupJobData = {
  leadId?: string;
  type?: string;
  trigger?: string;
  scheduledFor?: string;
};

type FollowupJob = Job<FollowupJobData>;
type FollowupPayload = NonNullable<
  Awaited<ReturnType<typeof generateSalesFollowupMessage>>
>;
type FollowupDeliveryRequest = {
  url: string;
  body: Record<string, unknown>;
  accessToken: string;
};

const isSystemGenerated = (msg: string) => {
  const normalizedMessage = msg.toLowerCase();

  return (
    normalizedMessage.includes("please wait") ||
    normalizedMessage.includes("try again later") ||
    normalizedMessage.includes("conversation limit reached")
  );
};

const buildFollowupJobKey = (job: { id?: string | number | null; data?: any }) =>
  `followup:${String(
    job.id || `${job.data?.leadId || "unknown"}:${job.data?.type || "step"}`
  )}`;

const FOLLOWUP_WORKER_CONCURRENCY = resolveWorkerConcurrency(
  "FOLLOWUP_WORKER_CONCURRENCY",
  Math.max(2, getWorkerCount()),
  {
    min: 1,
    max: 32,
  }
);

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

const loadFollowupPayload = async (job: FollowupJob) => {
  const { leadId, type, trigger } = job.data;

  logger.info(
    {
      jobId: job.id,
      queueName: job.queueName,
      leadId,
      businessId: null,
      type,
      trigger,
    },
    "Processing sales follow-up"
  );

  const payload = await generateSalesFollowupMessage({
    leadId: leadId as string,
    step: type as any,
  });

  if (!payload) {
    return null;
  }

  updateRequestContext({
    businessId: payload.lead.businessId,
    leadId: payload.lead.id,
  });

  return payload;
};

const validateSubscriptionAccess = async (
  job: FollowupJob,
  payload: FollowupPayload
) => {
  const subscriptionAccess = await getSubscriptionAccess(
    payload.lead.businessId
  ).catch(() => null);

  if (!subscriptionAccess?.allowed) {
    logSubscriptionLockedAction(
      {
        businessId: payload.lead.businessId,
        queueName: job.queueName,
        jobId: job.id,
        leadId: payload.lead.id,
        action: "followup_worker_job",
        lockReason: subscriptionAccess?.lockReason,
      },
      "Follow-up worker skipped job because subscription is locked"
    );
    return false;
  }

  return true;
};

const validateLeadState = (job: FollowupJob, payload: FollowupPayload) => {
  const { lead } = payload;

  if (lead.isHumanActive) {
    logger.info(
      {
        jobId: job.id,
        queueName: job.queueName,
        leadId: lead.id,
        businessId: lead.businessId,
      },
      "Follow-up skipped because human takeover is active"
    );
    return false;
  }

  if (lead.stage === "CLOSED" || lead.stage === "BOOKED_CALL") {
    logger.info(
      {
        jobId: job.id,
        queueName: job.queueName,
        leadId: lead.id,
        businessId: lead.businessId,
      },
      "Follow-up skipped because lead is already converted"
    );
    return false;
  }

  if ((lead.followupCount ?? 0) >= 2) {
    logger.info(
      {
        jobId: job.id,
        queueName: job.queueName,
        leadId: lead.id,
        businessId: lead.businessId,
      },
      "Follow-up skipped because limit was reached"
    );
    return false;
  }

  return true;
};

const resolveFollowupThroughput = async (businessId: string) => {
  const planContext = await resolvePlanContext(businessId).catch(() => null);
  return getThroughputLimits(planContext?.planKey || "LOCKED");
};

const delayRateLimitedJob = async (
  job: FollowupJob,
  retryAfterMs: number,
  scope: "messages" | "ai"
) => {
  const delayMs = Math.max(1000, retryAfterMs);

  await job.moveToDelayed(Date.now() + delayMs, job.token);

  logger.warn(
    {
      jobId: job.id,
      queueName: job.queueName,
      leadId: job.data?.leadId || null,
      retryAfterMs: delayMs,
      scope,
    },
    "Follow-up worker delayed job because business throughput limit was reached"
  );

  throw new DelayedError();
};

const resolveFollowupDeliveryRequest = (
  job: FollowupJob,
  payload: FollowupPayload
): FollowupDeliveryRequest | null => {
  const { lead, message } = payload;

  if (lead.platform === "WHATSAPP") {
    if (!lead.client.phoneNumberId || !lead.phone) {
      return null;
    }

    return {
      url: `https://graph.facebook.com/v19.0/${lead.client.phoneNumberId}/messages`,
      body: {
        messaging_product: "whatsapp",
        to: lead.phone,
        type: "text",
        text: { body: message },
      },
      accessToken: decrypt(lead.client.accessToken),
    };
  }

  if (lead.platform === "INSTAGRAM") {
    if (!lead.instagramId) {
      return null;
    }

    return {
      url: "https://graph.facebook.com/v19.0/me/messages",
      body: {
        recipient: { id: lead.instagramId },
        message: { text: message },
      },
      accessToken: decrypt(lead.client.accessToken),
    };
  }

  logger.warn(
    {
      jobId: job.id,
      queueName: job.queueName,
      leadId: lead.id,
      businessId: lead.businessId,
      platform: lead.platform,
    },
    "Follow-up delivery skipped because platform is unsupported"
  );

  return null;
};

const sendFollowupMessage = async (request: FollowupDeliveryRequest) => {
  await axios.post(request.url, request.body, {
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${request.accessToken}`,
    },
  });
};

const followupQueueNames = Array.from(
  new Set([FOLLOWUP_QUEUE_NAME, LEGACY_FOLLOWUP_QUEUE_NAME])
);

if (process.env.RUN_WORKER === "true") {
  const workers = followupQueueNames.map((queueName) =>
    new Worker<FollowupJobData>(
      queueName,
      async (job) =>
        runWithRequestContext(
          {
            requestId: String(job.id || buildFollowupJobKey(job)),
            source: "worker",
            route: `queue:${job.queueName}`,
            queueName: job.queueName,
            jobId: String(job.id || buildFollowupJobKey(job)),
            leadId: job.data?.leadId || null,
          },
          async () => {
            let messageUsageReserved = false;

            try {
              // Validation
              const payload = await loadFollowupPayload(job);

              if (!payload) {
                return;
              }

              if (!(await validateSubscriptionAccess(job, payload))) {
                return;
              }

              if (!validateLeadState(job, payload)) {
                return;
              }

              if (!payload.message || isSystemGenerated(payload.message)) {
                return;
              }

              // Generation and limits
              const throughput = await resolveFollowupThroughput(
                payload.lead.businessId
              );
              const aiWindow = await consumeBusinessAIHourlyRate(
                payload.lead.businessId,
                throughput.aiPerHour
              );

              if (!aiWindow.allowed) {
                await delayRateLimitedJob(
                  job,
                  aiWindow.ttlSeconds * 1000,
                  "ai"
                );
              }

              await incrementDailyAIUsage(payload.lead.businessId).catch(
                () => undefined
              );

              const jobKey = buildFollowupJobKey(job);
              const { message: aiMessage, created } = await saveFollowupMessage({
                jobKey,
                leadId: payload.lead.id,
                message: payload.message,
                cta: payload.cta,
                angle: payload.angle,
                trigger: payload.trigger,
                variantId: payload.variant?.id || null,
                variantKey: payload.variant?.variantKey || null,
                decision: payload.decision,
                jobId: job.id || null,
              });

              // Send
              const deliveryState = await getReplyDeliveryState(jobKey);

              if (!deliveryState.sent) {
                const deliveryRequest = resolveFollowupDeliveryRequest(
                  job,
                  payload
                );

                if (!deliveryRequest) {
                  return;
                }

                const messageWindow = await consumeBusinessMessageMinuteRate(
                  payload.lead.businessId,
                  throughput.messagesPerMinute
                );

                if (!messageWindow.allowed) {
                  await delayRateLimitedJob(
                    job,
                    messageWindow.ttlSeconds * 1000,
                    "messages"
                  );
                }

                try {
                  await reserveUsage({
                    businessId: payload.lead.businessId,
                    feature: "messages_sent",
                  });
                  messageUsageReserved = true;
                } catch (error) {
                  if ((error as { code?: string })?.code === "LIMIT_REACHED") {
                    logger.warn(
                      {
                        jobId: job.id,
                        queueName: job.queueName,
                        leadId: payload.lead.id,
                        businessId: payload.lead.businessId,
                      },
                      "Follow-up delivery skipped because message usage limit exceeded"
                    );
                    return;
                  }

                  throw error;
                }

                await sendFollowupMessage(deliveryRequest);
                await markReplySent(jobKey);
              }

              // Tracking
              await trackAIMessage({
                messageId: aiMessage.id,
                businessId: payload.lead.businessId,
                leadId: payload.lead.id,
                clientId: payload.lead.clientId || null,
                variantId: payload.variant?.id || null,
                source: "FOLLOWUP",
                cta: payload.cta,
                angle: payload.angle,
                leadState:
                  payload.lead.revenueState || payload.lead.aiStage || null,
                messageType: "FOLLOWUP",
                traceId: String(job.id || ""),
                metadata: {
                  trigger: payload.trigger,
                  step: job.data.type,
                  variantKey: payload.variant?.variantKey || null,
                  decisionCTA: payload.decision?.cta || null,
                  decisionCTAStyle: payload.decision?.ctaStyle || null,
                  decisionTone: payload.decision?.tone || null,
                  decisionStructure: payload.decision?.structure || null,
                  decisionStrategy: payload.decision?.strategy || null,
                  topPatterns: payload.decision?.topPatterns || [],
                },
              }).catch((error) => {
                logger.warn(
                  {
                    jobId: job.id,
                    queueName: job.queueName,
                    leadId: payload.lead.id,
                    businessId: payload.lead.businessId,
                    messageId: aiMessage.id,
                    error,
                  },
                  "Follow-up message attribution failed"
                );
              });

              if (created) {
                try {
                  const io = getIO();
                  io.to(`lead_${payload.lead.id}`).emit("new_message", aiMessage);
                } catch {}
              }

              if (created) {
                await prisma.lead.update({
                  where: { id: payload.lead.id },
                  data: {
                    followupCount: { increment: 1 },
                    lastFollowupAt: new Date(),
                  },
                });
              }

              logger.info(
                {
                  jobId: job.id,
                  queueName: job.queueName,
                  leadId: payload.lead.id,
                  businessId: payload.lead.businessId,
                  step: job.data.type,
                },
                "Follow-up sent"
              );

              await logSalesFollowupMessage({
                businessId: payload.lead.businessId,
                leadId: payload.lead.id,
                step: job.data.type as any,
                cta: payload.cta,
                angle: payload.angle,
                planKey: payload.planKey,
                temperature: payload.temperature,
                trigger: payload.trigger,
                variantId: payload.variant?.id || null,
              });
            } catch (error) {
              if (
                error instanceof DelayedError ||
                (error as { name?: string })?.name === "DelayedError"
              ) {
                throw error;
              }

              logger.error(
                {
                  jobId: job.id,
                  queueName: job.queueName,
                  leadId: job.data?.leadId || null,
                  businessId: null,
                  error,
                },
                "Follow-up worker error"
              );

              captureExceptionWithContext(error, {
                tags: {
                  worker: "followup",
                  queueName: job.queueName,
                },
                extras: {
                  jobId: job.id,
                  leadId: job.data?.leadId || null,
                },
              });

              if (messageUsageReserved) {
                return;
              }

              throw error;
            }
          }
        ),
      {
        connection: getWorkerRedisConnection(),
        concurrency: FOLLOWUP_WORKER_CONCURRENCY,
      }
    )
  );

  workers.forEach((worker) => {
    worker.on("failed", (job, error) => {
      logger.error(
        {
          jobId: job?.id,
          queueName: job?.queueName || FOLLOWUP_QUEUE_NAME,
          leadId: job?.data?.leadId || null,
          error,
        },
        "Follow-up worker job failed"
      );
    });
  });

  logger.info(
    { queueNames: followupQueueNames, concurrency: FOLLOWUP_WORKER_CONCURRENCY },
    "Follow-up workers started"
  );
}
