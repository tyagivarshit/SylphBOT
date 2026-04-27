import { DelayedError, Job, Worker } from "bullmq";
import axios from "axios";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import { publishCRMRefreshEvent } from "../services/crm/refreshEvents.service";
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
  enqueueFollowupDeadLetterJob,
} from "../queues/followup.queue";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import {
  checkpointReplyConfirmation,
  finalizeCheckpointedReplyDelivery,
  type ReplyDeliveryMode,
  toConfirmedReplyPayload,
} from "../services/replyDeliveryPipeline.service";
import {
  acquireLeadProcessingLock,
  getReplyDeliveryState,
  markReplySaved,
  releaseLeadProcessingLock,
} from "../services/aiPipelineState.service";
import { isConsentRevoked } from "../services/consentAuthority.service";
import {
  evaluateLeadControlGate,
  isLeadHumanControlActive,
} from "../services/leadControlState.service";
import {
  buildRevenueTouchOutboundKey,
  findRevenueTouchLedgerByOutboundKey,
  isRevenueTouchStateAtLeast,
  upsertRevenueTouchLedger,
  type RevenueTouchLedgerCheckpoint,
} from "../services/revenueTouchLedger.service";
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

type FollowupJobData = {
  leadId?: string;
  type?: string;
  trigger?: string;
  scheduledFor?: string;
  cancelTokenVersion?: number | null;
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

type FollowupCheckpointSnapshot = {
  confirmedAt: string;
  deliveryMode: ReplyDeliveryMode;
  platform: string | null;
  confirmedReply: ReturnType<typeof toConfirmedReplyPayload>;
};

const isSystemGenerated = (msg: string) => {
  const normalizedMessage = msg.toLowerCase();

  return (
    normalizedMessage.includes("please wait") ||
    normalizedMessage.includes("try again later") ||
    normalizedMessage.includes("conversation limit reached")
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const extractProviderMessageId = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.message_id === "string" && value.message_id.trim()) {
    return value.message_id.trim();
  }

  if (Array.isArray(value.messages)) {
    const first = value.messages.find(
      (message) => isRecord(message) && typeof message.id === "string"
    ) as { id?: string } | undefined;

    if (typeof first?.id === "string" && first.id.trim()) {
      return first.id.trim();
    }
  }

  return null;
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

const buildFollowupCheckpointSnapshot = ({
  job,
  jobKey,
  payload,
  confirmedAt,
  providerMessageId,
}: {
  job: FollowupJob;
  jobKey: string;
  payload: FollowupPayload;
  confirmedAt: string;
  providerMessageId?: string | null;
}): FollowupCheckpointSnapshot => {
  const trackingMetadata = buildFollowupTrackingMetadata({
    job,
    jobKey,
    payload,
  });

  return {
    confirmedAt,
    deliveryMode: "platform",
    platform: payload.lead.platform || null,
    confirmedReply: toConfirmedReplyPayload({
      text: payload.message,
      cta: payload.cta,
      angle: payload.angle,
      variantId: payload.variant?.id || null,
      variantKey: payload.variant?.variantKey || null,
      leadState: payload.lead.revenueState || payload.lead.aiStage || null,
      messageType: "FOLLOWUP",
      source: "FOLLOWUP",
      traceId: String(job.id || jobKey),
      meta: {
        ...trackingMetadata,
        providerMessageId: providerMessageId || null,
      },
    }),
  };
};

const buildFollowupCheckpointMetadata = ({
  job,
  jobKey,
  payload,
  checkpoint,
  providerMessageId,
}: {
  job: FollowupJob;
  jobKey: string;
  payload: FollowupPayload;
  checkpoint: FollowupCheckpointSnapshot;
  providerMessageId?: string | null;
}) => ({
  ...buildFollowupTrackingMetadata({
    job,
    jobKey,
    payload,
  }),
  platform: payload.lead.platform || null,
  providerMessageId: providerMessageId || null,
  replyDeliveryCheckpoint: checkpoint,
});

const extractFollowupCheckpointFromTouch = (
  touch: RevenueTouchLedgerCheckpoint | null | undefined
): FollowupCheckpointSnapshot | null => {
  const metadata =
    touch?.metadata && typeof touch.metadata === "object" && !Array.isArray(touch.metadata)
      ? (touch.metadata as Record<string, unknown>)
      : {};
  const checkpoint =
    metadata.replyDeliveryCheckpoint &&
    typeof metadata.replyDeliveryCheckpoint === "object" &&
    !Array.isArray(metadata.replyDeliveryCheckpoint)
      ? (metadata.replyDeliveryCheckpoint as Record<string, unknown>)
      : null;

  if (!checkpoint || typeof checkpoint.confirmedAt !== "string") {
    return null;
  }

  if (checkpoint.deliveryMode !== "platform") {
    return null;
  }

  const confirmedReply = checkpoint.confirmedReply;

  if (
    !confirmedReply ||
    typeof confirmedReply !== "object" ||
    typeof (confirmedReply as { text?: unknown }).text !== "string"
  ) {
    return null;
  }

  return {
    confirmedAt: checkpoint.confirmedAt,
    deliveryMode: "platform",
    platform:
      typeof checkpoint.platform === "string" ? checkpoint.platform : null,
    confirmedReply: toConfirmedReplyPayload(confirmedReply as any),
  };
};

const restoreFollowupCheckpointFromTouch = async ({
  jobKey,
  touch,
}: {
  jobKey: string;
  touch: RevenueTouchLedgerCheckpoint | null | undefined;
}) => {
  const checkpoint = extractFollowupCheckpointFromTouch(touch);

  if (!checkpoint) {
    return false;
  }

  await checkpointReplyConfirmation(jobKey, {
    confirmedAt: checkpoint.confirmedAt,
    deliveryMode: checkpoint.deliveryMode,
    platform: checkpoint.platform,
    confirmedReply: checkpoint.confirmedReply,
  });

  return true;
};

const upsertFollowupTouchCheckpoint = async ({
  job,
  jobKey,
  payload,
  deliveryState,
  confirmedAt,
  providerMessageId,
  providerAcceptedAt,
  providerMessagePersistedAt,
  messageId,
}: {
  job: FollowupJob;
  jobKey: string;
  payload: FollowupPayload;
  deliveryState:
    | "RESERVED"
    | "PROVIDER_ACCEPTED"
    | "PROVIDER_MESSAGE_ID_PERSISTED"
    | "CONFIRMED"
    | "FAILED";
  confirmedAt: string;
  providerMessageId?: string | null;
  providerAcceptedAt?: Date | null;
  providerMessagePersistedAt?: Date | null;
  messageId?: string | null;
}) => {
  const checkpoint = buildFollowupCheckpointSnapshot({
    job,
    jobKey,
    payload,
    confirmedAt,
    providerMessageId,
  });

  return upsertRevenueTouchLedger({
    businessId: payload.lead.businessId,
    leadId: payload.lead.id,
    clientId: payload.lead.clientId || null,
    messageId: messageId || null,
    touchType: "FOLLOWUP",
    touchReason: payload.trigger || String(job.data.type || "FOLLOWUP"),
    channel: payload.lead.platform || "UNKNOWN",
    actor: "AI",
    source: "FOLLOWUP",
    traceId: String(job.id || jobKey),
    providerMessageId: providerMessageId || null,
    outboundKey: buildFollowupTrackingMetadata({
      job,
      jobKey,
      payload,
    }).outboundKey,
    deliveryState,
    providerAcceptedAt: providerAcceptedAt || null,
    providerMessagePersistedAt: providerMessagePersistedAt || null,
    confirmedAt: deliveryState === "CONFIRMED" ? new Date(confirmedAt) : null,
    failedAt: deliveryState === "FAILED" ? new Date() : null,
    cta: payload.cta,
    angle: payload.angle,
    leadState: payload.lead.revenueState || payload.lead.aiStage || null,
    messageType: "FOLLOWUP",
    metadata: buildFollowupCheckpointMetadata({
      job,
      jobKey,
      payload,
      checkpoint,
      providerMessageId,
    }),
  });
};

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
  outboundKey,
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
  outboundKey: string;
}) => {
  const deliveryState = await getReplyDeliveryState(jobKey);
  const touchCheckpoint = await findRevenueTouchLedgerByOutboundKey(outboundKey).catch(
    () => null
  );
  const touchMessageId = String(touchCheckpoint?.messageId || "").trim() || null;

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

  if (touchMessageId) {
    const existing = await prisma.message.findUnique({
      where: { id: touchMessageId },
    });

    if (existing) {
      await markReplySaved(jobKey, existing.id);
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
        outboundKey,
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

const validateLeadState = async (job: FollowupJob, payload: FollowupPayload) => {
  const { lead } = payload;
  const controlGate = await evaluateLeadControlGate({
    leadId: lead.id,
    expectedCancelTokenVersion:
      typeof job.data.cancelTokenVersion === "number"
        ? job.data.cancelTokenVersion
        : null,
  });

  if (!controlGate.allowed) {
    logger.info(
      {
        jobId: job.id,
        queueName: job.queueName,
        leadId: lead.id,
        businessId: lead.businessId,
        reason: controlGate.reason,
      },
      "Follow-up skipped because the lead control authority rejected the queued token"
    );
    return false;
  }

  if (isLeadHumanControlActive(controlGate.state)) {
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
  const response = await axios.post(request.url, request.body, {
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${request.accessToken}`,
    },
  });

  const providerMessageId = extractProviderMessageId(response.data);

  if (!providerMessageId) {
    throw new Error("provider_message_id_missing");
  }

  return {
    providerMessageId,
    acceptedAt: new Date().toISOString(),
  };
};

const buildFollowupTrackingMetadata = ({
  job,
  jobKey,
  payload,
}: {
  job: FollowupJob;
  jobKey: string;
  payload: FollowupPayload;
}) => ({
  outboundKey: buildRevenueTouchOutboundKey({
    source: "FOLLOWUP",
    leadId: payload.lead.id,
    deliveryJobKey: jobKey,
    step: String(job.data.type || payload.trigger || "FOLLOWUP"),
  }),
  trigger: payload.trigger,
  step: job.data.type,
  variantKey: payload.variant?.variantKey || null,
  decisionCTA: payload.decision?.cta || null,
  decisionCTAStyle: payload.decision?.ctaStyle || null,
  decisionTone: payload.decision?.tone || null,
  decisionStructure: payload.decision?.structure || null,
  decisionStrategy: payload.decision?.strategy || null,
  topPatterns: payload.decision?.topPatterns || [],
  deliveryJobKey: jobKey,
});

const finalizeConfirmedFollowupDelivery = async ({
  job,
  jobKey,
  payload,
  mode,
  platform,
  confirmedAt,
}: {
  job: FollowupJob;
  jobKey: string;
  payload: FollowupPayload;
  mode: ReplyDeliveryMode;
  platform: string | null;
  confirmedAt: string;
}) =>
  finalizeCheckpointedReplyDelivery<{ id: string }>({
    jobKey,
    fallbackDeliveryMode: mode,
    fallbackPlatform: platform,
    fallbackConfirmedAt: confirmedAt,
    persistConfirmedReply: async ({ reply }) =>
      saveFollowupMessage({
        jobKey,
        leadId: payload.lead.id,
        message: reply.text,
        cta: reply.cta || payload.cta,
        angle: reply.angle || payload.angle,
        trigger: payload.trigger,
        variantId: reply.variantId || payload.variant?.id || null,
        variantKey: reply.variantKey || payload.variant?.variantKey || null,
        decision: payload.decision,
        jobId: job.id || null,
        outboundKey: String(reply.meta?.outboundKey || buildFollowupTrackingMetadata({
          job,
          jobKey,
          payload,
        }).outboundKey),
      }),
    afterPersist: async ({ message, created }) => {
      if (!created) {
        return;
      }

      try {
        try {
          const io = getIO();
          io.to(`lead_${payload.lead.id}`).emit("new_message", message);
        } catch {}

        await prisma.lead.update({
          where: { id: payload.lead.id },
          data: {
            followupCount: { increment: 1 },
            lastFollowupAt: new Date(),
          },
        });
      } catch (error) {
        throw new Error(
          String(
            (error as { message?: unknown })?.message ||
              error ||
              "followup_finalize_persistence_failed"
          )
        );
      }
    },
    beforeSent: async ({ message, reply, mode: confirmedMode }) => {
      await trackAIMessage({
        messageId: message.id,
        businessId: payload.lead.businessId,
        leadId: payload.lead.id,
        clientId: payload.lead.clientId || null,
        variantId: reply.variantId || payload.variant?.id || null,
        source: reply.source || "FOLLOWUP",
        cta: reply.cta || payload.cta,
        angle: reply.angle || payload.angle,
        leadState:
          reply.leadState ||
          payload.lead.revenueState ||
          payload.lead.aiStage ||
          null,
        messageType: reply.messageType || "FOLLOWUP",
        traceId: reply.traceId || String(job.id || jobKey),
        metadata: {
          ...(reply.meta || {}),
          ...buildFollowupTrackingMetadata({
            job,
            jobKey,
            payload,
          }),
          deliveryConfirmed: true,
          deliveryMode: confirmedMode,
          deliveredMessageId: message.id,
        },
      });
    },
    afterSent: async ({ created }) => {
      if (!created) {
        return;
      }

      await publishCRMRefreshEvent({
        businessId: payload.lead.businessId,
        leadId: payload.lead.id,
        event: "followup_sent",
        waitForSync: true,
      });
    },
  });

const followupQueueNames = Array.from(
  new Set([FOLLOWUP_QUEUE_NAME, LEGACY_FOLLOWUP_QUEUE_NAME])
);

const markFollowupJobTerminalFailure = async (
  job: FollowupJob,
  error: unknown
) => {
  const outboundKey = buildRevenueTouchOutboundKey({
    source: "FOLLOWUP",
    leadId: String(job.data?.leadId || ""),
    deliveryJobKey: buildFollowupJobKey(job),
    step: String(job.data?.type || "FOLLOWUP"),
  });
  const existingTouch = await findRevenueTouchLedgerByOutboundKey(
    outboundKey
  ).catch(() => null);

  if (!existingTouch || isRevenueTouchStateAtLeast(existingTouch.deliveryState, "DELIVERED")) {
    return;
  }

  await upsertRevenueTouchLedger({
    businessId: existingTouch.businessId,
    leadId: existingTouch.leadId,
    clientId: existingTouch.clientId || null,
    messageId: existingTouch.messageId || null,
    touchType: existingTouch.touchType,
    touchReason: existingTouch.touchReason,
    channel: existingTouch.channel,
    actor: existingTouch.actor,
    source: existingTouch.source,
    traceId: existingTouch.traceId || buildFollowupJobKey(job),
    providerMessageId: existingTouch.providerMessageId || null,
    outboundKey: existingTouch.outboundKey,
    deliveryState: "FAILED",
    campaignId: existingTouch.campaignId || null,
    conversionWindowEndsAt: existingTouch.conversionWindowEndsAt || null,
    providerAcceptedAt: existingTouch.providerAcceptedAt || null,
    providerMessagePersistedAt: existingTouch.providerMessagePersistedAt || null,
    confirmedAt: existingTouch.confirmedAt || null,
    deliveredAt: existingTouch.deliveredAt || null,
    failedAt: new Date(),
    cta: existingTouch.cta || null,
    angle: existingTouch.angle || null,
    leadState: existingTouch.leadState || null,
    messageType: existingTouch.messageType || null,
    metadata: {
      ...((existingTouch.metadata as Record<string, unknown> | null) || {}),
      terminalFailureReason: String(
        (error as { message?: unknown })?.message || error || "job_failed"
      ),
      terminalFailureAt: new Date().toISOString(),
    },
  }).catch(() => undefined);
};

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const globalForFollowupWorker = globalThis as typeof globalThis & {
  __sylphFollowupWorkers?: Worker<FollowupJobData>[];
};

export const initFollowupWorkers = () => {
  if (!shouldRunWorker) {
    console.log("[followup.worker] RUN_WORKER disabled, worker not started");
    return [];
  }

  if (globalForFollowupWorker.__sylphFollowupWorkers) {
    return globalForFollowupWorker.__sylphFollowupWorkers;
  }

  initializeSentry();

  const workers = followupQueueNames.map((queueName) =>
    new Worker<FollowupJobData>(
      queueName,
      withRedisWorkerFailSafe(queueName, async (job) =>
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
            const jobKey = buildFollowupJobKey(job);

            try {
              // Validation
              const payload = await loadFollowupPayload(job);

              if (!payload) {
                return;
              }

              if (!(await validateSubscriptionAccess(job, payload))) {
                return;
              }

              if (!(await validateLeadState(job, payload))) {
                return;
              }

              if (!payload.message || isSystemGenerated(payload.message)) {
                return;
              }

              const lockAcquired = await acquireLeadProcessingLock(
                payload.lead.id,
                jobKey,
                {
                  waitMs: 1200,
                  pollMs: 50,
                }
              );

              if (!lockAcquired) {
                throw new Error(`followup_lead_lock_busy:${payload.lead.id}`);
              }

              try {
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
                let deliveryState = await getReplyDeliveryState(jobKey);
                const outboundKey = buildFollowupTrackingMetadata({
                  job,
                  jobKey,
                  payload,
                }).outboundKey;
                const touchCheckpoint =
                  await findRevenueTouchLedgerByOutboundKey(outboundKey).catch(
                    () => null
                  );

                if (
                  !deliveryState.confirmed &&
                  touchCheckpoint &&
                  isRevenueTouchStateAtLeast(
                    touchCheckpoint.deliveryState,
                    "PROVIDER_ACCEPTED"
                  )
                ) {
                  const restored = await restoreFollowupCheckpointFromTouch({
                    jobKey,
                    touch: touchCheckpoint,
                  });

                  if (!restored) {
                    throw new Error(
                      "followup_provider_boundary_resume_checkpoint_missing"
                    );
                  }

                  deliveryState = await getReplyDeliveryState(jobKey);
                }

                if (deliveryState.sent) {
                  logger.info(
                    {
                      jobId: job.id,
                      queueName: job.queueName,
                      leadId: payload.lead.id,
                      businessId: payload.lead.businessId,
                      step: job.data.type,
                    },
                    "Follow-up delivery already finalized"
                  );
                  return;
                }

                if (deliveryState.confirmed && deliveryState.confirmedReply) {
                  await finalizeConfirmedFollowupDelivery({
                    job,
                    jobKey,
                    payload,
                    mode:
                      (deliveryState.deliveryMode as ReplyDeliveryMode | null) ||
                      "platform",
                    platform:
                      deliveryState.platform || payload.lead.platform || null,
                    confirmedAt:
                      deliveryState.confirmedAt || new Date().toISOString(),
                  });
                } else {
                  const deliveryRequest = resolveFollowupDeliveryRequest(job, payload);

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

                  if (
                    await isConsentRevoked({
                      businessId: payload.lead.businessId,
                      leadId: payload.lead.id,
                      channel: payload.lead.platform || "UNKNOWN",
                      scope: "CONVERSATIONAL_OUTBOUND",
                    })
                  ) {
                    await upsertFollowupTouchCheckpoint({
                      job,
                      jobKey,
                      payload,
                      deliveryState: "FAILED",
                      confirmedAt: new Date().toISOString(),
                    }).catch(() => undefined);
                    logger.info(
                      {
                        jobId: job.id,
                        queueName: job.queueName,
                        leadId: payload.lead.id,
                        businessId: payload.lead.businessId,
                      },
                      "Follow-up skipped because outbound consent is revoked"
                    );
                    return;
                  }

                  const confirmedAt = new Date().toISOString();
                  await upsertFollowupTouchCheckpoint({
                    job,
                    jobKey,
                    payload,
                    deliveryState: "RESERVED",
                    confirmedAt,
                  });

                  const deliveryResult = await sendFollowupMessage(deliveryRequest);
                  const acceptedAt = deliveryResult.acceptedAt
                    ? new Date(deliveryResult.acceptedAt)
                    : new Date();
                  const providerMessagePersistedAt = new Date();

                  await upsertFollowupTouchCheckpoint({
                    job,
                    jobKey,
                    payload,
                    deliveryState: "PROVIDER_ACCEPTED",
                    confirmedAt,
                    providerMessageId: deliveryResult.providerMessageId || null,
                    providerAcceptedAt: acceptedAt,
                  });
                  await upsertFollowupTouchCheckpoint({
                    job,
                    jobKey,
                    payload,
                    deliveryState: "PROVIDER_MESSAGE_ID_PERSISTED",
                    confirmedAt,
                    providerMessageId: deliveryResult.providerMessageId || null,
                    providerAcceptedAt: acceptedAt,
                    providerMessagePersistedAt,
                  });
                  await upsertFollowupTouchCheckpoint({
                    job,
                    jobKey,
                    payload,
                    deliveryState: "CONFIRMED",
                    confirmedAt,
                    providerMessageId: deliveryResult.providerMessageId || null,
                    providerAcceptedAt: acceptedAt,
                    providerMessagePersistedAt,
                  });

                  await checkpointReplyConfirmation(jobKey, {
                    confirmedAt,
                    deliveryMode: "platform",
                    platform: payload.lead.platform || null,
                    confirmedReply: buildFollowupCheckpointSnapshot({
                      job,
                      jobKey,
                      payload,
                      confirmedAt,
                      providerMessageId:
                        deliveryResult.providerMessageId || null,
                    }).confirmedReply,
                  });

                  await finalizeConfirmedFollowupDelivery({
                    job,
                    jobKey,
                    payload,
                    mode: "platform",
                    platform: payload.lead.platform || null,
                    confirmedAt,
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
              } finally {
                await releaseLeadProcessingLock(payload.lead.id, jobKey);
              }
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

              const finalDeliveryState = await getReplyDeliveryState(jobKey).catch(
                () => null
              );

              if (finalDeliveryState?.sent) {
                return;
              }

              throw error;
            }
          }
        )),
      {
        connection: getWorkerRedisConnection(),
        concurrency: FOLLOWUP_WORKER_CONCURRENCY,
      }
    )
  );

  workers.forEach((worker) => {
    worker.on("failed", (job, error) => {
      const maxAttempts = Number(job?.opts?.attempts || 1);
      const attemptsMade = Number(job?.attemptsMade || 0);

      logger.error(
        {
          jobId: job?.id,
          queueName: job?.queueName || FOLLOWUP_QUEUE_NAME,
          leadId: job?.data?.leadId || null,
          error,
        },
        "Follow-up worker job failed"
      );

      if (!job || attemptsMade < maxAttempts) {
        return;
      }

      void markFollowupJobTerminalFailure(job, error);
      void enqueueFollowupDeadLetterJob({
        queueName: job.queueName,
        payload: {
          jobId: String(job.id || ""),
          leadId: job.data?.leadId || null,
          reason: String(
            (error as { message?: unknown })?.message || error || "job_failed"
          ),
          stack:
            typeof (error as { stack?: unknown })?.stack === "string"
              ? String((error as { stack?: string }).stack)
              : null,
          traceId: buildFollowupJobKey(job),
          payload: (job.data || null) as any,
          retryCount: attemptsMade,
          failedAt: new Date().toISOString(),
        },
      }).catch((deadLetterError) => {
        logger.error(
          {
            jobId: job.id,
            queueName: job.queueName,
            error: deadLetterError,
          },
          "Follow-up dead-letter enqueue failed"
        );
      });
    });

    worker.on("error", (error) => {
      logger.error(
        {
          queueName: worker.name,
          error,
        },
        "Follow-up worker error"
      );

      captureExceptionWithContext(error, {
        tags: {
          worker: "followup",
          queueName: worker.name,
        },
      });
    });
  });

  logger.info(
    { queueNames: followupQueueNames, concurrency: FOLLOWUP_WORKER_CONCURRENCY },
    "Follow-up workers started"
  );

  globalForFollowupWorker.__sylphFollowupWorkers = workers;
  return workers;
};

export const closeFollowupWorkers = async () => {
  const workers = globalForFollowupWorker.__sylphFollowupWorkers || [];
  await Promise.allSettled(workers.map((worker) => worker.close()));
  globalForFollowupWorker.__sylphFollowupWorkers = undefined;
};
