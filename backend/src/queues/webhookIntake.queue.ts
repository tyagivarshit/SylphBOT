import crypto from "crypto";
import { JobsOptions, Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { buildQueueJobOptions, createResilientQueue } from "./queue.defaults";

export const WEBHOOK_INGEST_QUEUE_NAME = "webhook-intake";
export const WEBHOOK_RECONCILE_QUEUE_NAME = "webhook-reconcile";
export const WEBHOOK_INTAKE_DLQ_QUEUE_NAME = "webhook-intake-dlq";

const WEBHOOK_BURST_SATURATION_BACKLOG = Math.max(
  100,
  Number(process.env.WEBHOOK_BURST_SATURATION_BACKLOG || 600)
);
const WEBHOOK_QUEUE_METRIC_TTL_MS = Math.max(
  1000,
  Number(process.env.WEBHOOK_QUEUE_METRIC_TTL_MS || 5000)
);

export type InstagramMessageWebhookIngestPayload = {
  type: "INSTAGRAM_MESSAGE_INGEST";
  webhookTraceId: string;
  requestId?: string | null;
  eventId: string;
  senderId: string;
  text: string;
  pageIds: string[];
  diagnosticSenderId?: string | null;
};

export type InstagramCommentWebhookIngestPayload = {
  type: "INSTAGRAM_COMMENT_INGEST";
  webhookTraceId: string;
  requestId?: string | null;
  commentEventId: string;
  commentId?: string | null;
  commentText: string;
  mediaId: string;
  senderId: string;
  pageIds: string[];
};

export type WhatsAppMessageWebhookIngestPayload = {
  type: "WHATSAPP_MESSAGE_INGEST";
  requestId?: string | null;
  eventId?: string | null;
  from: string;
  phoneNumberIds: string[];
  eventTimestampMs: number;
  intakePayload: Record<string, unknown>;
};

export type WebhookIngestJobPayload =
  | InstagramMessageWebhookIngestPayload
  | InstagramCommentWebhookIngestPayload
  | WhatsAppMessageWebhookIngestPayload;

export type ProviderDeliveryReconcileWebhookPayload = {
  type: "PROVIDER_DELIVERY_RECONCILE";
  provider: "INSTAGRAM" | "WHATSAPP";
  traceId?: string | null;
  requestId?: string | null;
  providerMessageIds: string[];
  deliveredAtIso?: string | null;
};

export type WebhookReconcileJobPayload =
  ProviderDeliveryReconcileWebhookPayload;

export type WebhookIntakeDeadLetterPayload = {
  queueName: string;
  payload: WebhookIngestJobPayload | WebhookReconcileJobPayload;
  failedAtIso: string;
  attemptsMade: number;
  error: string;
};

const globalForWebhookQueue = globalThis as typeof globalThis & {
  __sylphWebhookIngestQueue?: Queue<WebhookIngestJobPayload>;
  __sylphWebhookReconcileQueue?: Queue<WebhookReconcileJobPayload>;
  __sylphWebhookIntakeDLQ?: Queue<WebhookIntakeDeadLetterPayload>;
};

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  attempts: 6,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
});

const queueMetricSampleState = new Map<string, number>();

const emitWebhookQueueMetric = (
  name: "webhook_burst_saturation" | "webhook_degraded",
  value: number,
  metadata?: Record<string, unknown>
) => {
  emitPerformanceMetric({
    name,
    value,
    route: "webhook_queue",
    metadata: metadata || null,
  });
};

const stableHash = (value: string) =>
  crypto.createHash("sha1").update(value).digest("hex");

const sampleQueueBacklog = async ({
  queueName,
  queue,
  reason,
}: {
  queueName: string;
  queue: Queue<any>;
  reason: string;
}) => {
  const now = Date.now();
  const nextAllowedAt = queueMetricSampleState.get(queueName) || 0;

  if (now < nextAllowedAt) {
    return;
  }

  queueMetricSampleState.set(queueName, now + WEBHOOK_QUEUE_METRIC_TTL_MS);

  const counts = await queue.getJobCounts("wait", "active", "delayed", "failed");
  const wait = Math.max(0, Number(counts.wait || 0));
  const active = Math.max(0, Number(counts.active || 0));
  const delayed = Math.max(0, Number(counts.delayed || 0));
  const failed = Math.max(0, Number(counts.failed || 0));
  const backlog = wait + active + delayed;

  if (backlog >= WEBHOOK_BURST_SATURATION_BACKLOG) {
    emitWebhookQueueMetric("webhook_burst_saturation", 1, {
      queueName,
      reason,
      backlog,
      threshold: WEBHOOK_BURST_SATURATION_BACKLOG,
      wait,
      active,
      delayed,
      failed,
    });
  }
};

export const initWebhookIntakeQueues = () => {
  if (!globalForWebhookQueue.__sylphWebhookIngestQueue) {
    globalForWebhookQueue.__sylphWebhookIngestQueue = createResilientQueue(
      new Queue<WebhookIngestJobPayload>(WEBHOOK_INGEST_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        defaultJobOptions,
      }),
      WEBHOOK_INGEST_QUEUE_NAME
    );
  }

  if (!globalForWebhookQueue.__sylphWebhookReconcileQueue) {
    globalForWebhookQueue.__sylphWebhookReconcileQueue = createResilientQueue(
      new Queue<WebhookReconcileJobPayload>(WEBHOOK_RECONCILE_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        defaultJobOptions,
      }),
      WEBHOOK_RECONCILE_QUEUE_NAME
    );
  }

  if (!globalForWebhookQueue.__sylphWebhookIntakeDLQ) {
    globalForWebhookQueue.__sylphWebhookIntakeDLQ = createResilientQueue(
      new Queue<WebhookIntakeDeadLetterPayload>(WEBHOOK_INTAKE_DLQ_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        defaultJobOptions: buildQueueJobOptions({
          attempts: 1,
        }),
      }),
      WEBHOOK_INTAKE_DLQ_QUEUE_NAME
    );
  }

  return {
    ingest: globalForWebhookQueue.__sylphWebhookIngestQueue,
    reconcile: globalForWebhookQueue.__sylphWebhookReconcileQueue,
    deadLetter: globalForWebhookQueue.__sylphWebhookIntakeDLQ,
  };
};

export const getWebhookIngestQueue = () => initWebhookIntakeQueues().ingest!;
export const getWebhookReconcileQueue = () =>
  initWebhookIntakeQueues().reconcile!;
const getWebhookIntakeDeadLetterQueue = () =>
  initWebhookIntakeQueues().deadLetter!;

export const enqueueInstagramMessageIngestJob = async (
  payload: Omit<InstagramMessageWebhookIngestPayload, "type">
) => {
  const queue = getWebhookIngestQueue();
  await sampleQueueBacklog({
    queueName: WEBHOOK_INGEST_QUEUE_NAME,
    queue,
    reason: "enqueue_instagram_message",
  }).catch((error) => {
    emitWebhookQueueMetric("webhook_degraded", 1, {
      queueName: WEBHOOK_INGEST_QUEUE_NAME,
      reason: "queue_backlog_sample_failed",
      error: String((error as { message?: unknown })?.message || error),
    });
  });

  return queue.add(
    "instagram-message-ingest",
    {
      type: "INSTAGRAM_MESSAGE_INGEST",
      ...payload,
    },
    buildQueueJobOptions({
      jobId: `webhook_ig_message:${payload.eventId}`,
    })
  );
};

export const enqueueInstagramCommentIngestJob = async (
  payload: Omit<InstagramCommentWebhookIngestPayload, "type">
) => {
  const queue = getWebhookIngestQueue();
  await sampleQueueBacklog({
    queueName: WEBHOOK_INGEST_QUEUE_NAME,
    queue,
    reason: "enqueue_instagram_comment",
  }).catch((error) => {
    emitWebhookQueueMetric("webhook_degraded", 1, {
      queueName: WEBHOOK_INGEST_QUEUE_NAME,
      reason: "queue_backlog_sample_failed",
      error: String((error as { message?: unknown })?.message || error),
    });
  });

  return queue.add(
    "instagram-comment-ingest",
    {
      type: "INSTAGRAM_COMMENT_INGEST",
      ...payload,
    },
    buildQueueJobOptions({
      jobId: `webhook_ig_comment:${payload.commentEventId}`,
    })
  );
};

export const enqueueWhatsAppMessageIngestJob = async (
  payload: Omit<WhatsAppMessageWebhookIngestPayload, "type">
) => {
  const queue = getWebhookIngestQueue();
  await sampleQueueBacklog({
    queueName: WEBHOOK_INGEST_QUEUE_NAME,
    queue,
    reason: "enqueue_whatsapp_message",
  }).catch((error) => {
    emitWebhookQueueMetric("webhook_degraded", 1, {
      queueName: WEBHOOK_INGEST_QUEUE_NAME,
      reason: "queue_backlog_sample_failed",
      error: String((error as { message?: unknown })?.message || error),
    });
  });

  const fallbackToken = stableHash(
    [
      payload.from,
      payload.phoneNumberIds.join(","),
      String(payload.eventTimestampMs || 0),
      JSON.stringify(payload.intakePayload || {}),
    ].join(":")
  );
  const eventToken =
    String(payload.eventId || "").trim() || `fallback_${fallbackToken}`;

  return queue.add(
    "whatsapp-message-ingest",
    {
      type: "WHATSAPP_MESSAGE_INGEST",
      ...payload,
    },
    buildQueueJobOptions({
      jobId: `webhook_wa_message:${eventToken}`,
    })
  );
};

export const enqueueProviderDeliveryReconcileJob = async (
  payload: Omit<ProviderDeliveryReconcileWebhookPayload, "type">
) => {
  const queue = getWebhookReconcileQueue();
  await sampleQueueBacklog({
    queueName: WEBHOOK_RECONCILE_QUEUE_NAME,
    queue,
    reason: "enqueue_delivery_reconcile",
  }).catch((error) => {
    emitWebhookQueueMetric("webhook_degraded", 1, {
      queueName: WEBHOOK_RECONCILE_QUEUE_NAME,
      reason: "queue_backlog_sample_failed",
      error: String((error as { message?: unknown })?.message || error),
    });
  });

  const uniqueToken = stableHash(
    [
      payload.provider,
      payload.providerMessageIds.join(","),
      payload.deliveredAtIso || "",
      payload.traceId || "",
    ].join(":")
  );

  return queue.add(
    "provider-delivery-reconcile",
    {
      type: "PROVIDER_DELIVERY_RECONCILE",
      ...payload,
    },
    buildQueueJobOptions({
      jobId: `webhook_reconcile:${payload.provider}:${uniqueToken}`,
    })
  );
};

export const enqueueWebhookIntakeDeadLetterJob = async ({
  queueName,
  payload,
  failedAtIso,
  attemptsMade,
  error,
}: {
  queueName: string;
  payload: WebhookIngestJobPayload | WebhookReconcileJobPayload;
  failedAtIso: string;
  attemptsMade: number;
  error: string;
}) =>
  getWebhookIntakeDeadLetterQueue().add(
    "webhook-intake-dead-letter",
    {
      queueName,
      payload,
      failedAtIso,
      attemptsMade,
      error,
    },
    buildQueueJobOptions({
      attempts: 1,
      jobId: `webhook_intake_dlq:${queueName}:${failedAtIso}:${Math.floor(
        Math.random() * 100_000
      )}`,
    })
  );

export const closeWebhookIntakeQueues = async () => {
  await globalForWebhookQueue.__sylphWebhookIngestQueue
    ?.close()
    .catch(() => undefined);
  await globalForWebhookQueue.__sylphWebhookReconcileQueue
    ?.close()
    .catch(() => undefined);
  await globalForWebhookQueue.__sylphWebhookIntakeDLQ
    ?.close()
    .catch(() => undefined);

  globalForWebhookQueue.__sylphWebhookIngestQueue = undefined;
  globalForWebhookQueue.__sylphWebhookReconcileQueue = undefined;
  globalForWebhookQueue.__sylphWebhookIntakeDLQ = undefined;
};
