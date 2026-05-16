import { Job, Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { captureExceptionWithContext } from "../observability/sentry";
import { runWithRequestContext } from "../observability/requestContext";
import {
  enqueueWebhookIntakeDeadLetterJob,
  type WebhookIngestJobPayload,
  type WebhookReconcileJobPayload,
  WEBHOOK_INGEST_QUEUE_NAME,
  WEBHOOK_RECONCILE_QUEUE_NAME,
} from "../queues/webhookIntake.queue";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import {
  processInstagramCommentWebhookIngest,
  processInstagramMessageWebhookIngest,
  processProviderDeliveryReconcileWebhook,
  processWhatsAppMessageWebhookIngest,
} from "../services/webhookIntakeRuntime.service";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const WEBHOOK_INGEST_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.WEBHOOK_INGEST_WORKER_CONCURRENCY || 8)
);
const WEBHOOK_RECONCILE_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.WEBHOOK_RECONCILE_WORKER_CONCURRENCY || 4)
);

const globalForWebhookIntakeWorker = globalThis as typeof globalThis & {
  __sylphWebhookIngestWorker?: Worker<WebhookIngestJobPayload> | null;
  __sylphWebhookReconcileWorker?: Worker<WebhookReconcileJobPayload> | null;
};

const computeQueueWaitMs = (
  job?: Job<WebhookIngestJobPayload | WebhookReconcileJobPayload> | null
) => {
  const queuedAt = Number(job?.timestamp || 0);
  const startedAt = Number(job?.processedOn || Date.now());

  if (!Number.isFinite(queuedAt) || queuedAt <= 0) {
    return 0;
  }

  return Math.max(0, startedAt - queuedAt);
};

const emitWebhookWorkerMetric = (
  name: "webhook_queue_wait_ms" | "webhook_degraded",
  value: number,
  metadata?: Record<string, unknown>
) => {
  emitPerformanceMetric({
    name,
    value,
    route: "webhook_intake_worker",
    metadata: metadata || null,
  });
};

const processWebhookIngestJob = async (job: Job<WebhookIngestJobPayload>) =>
  runWithRequestContext(
    {
      requestId: String(job.id || `${WEBHOOK_INGEST_QUEUE_NAME}:job`),
      traceId:
        String((job.data as { webhookTraceId?: unknown })?.webhookTraceId || "").trim() ||
        String(job.id || `${WEBHOOK_INGEST_QUEUE_NAME}:job`),
      correlationId:
        String((job.data as { webhookTraceId?: unknown })?.webhookTraceId || "").trim() ||
        String(job.id || `${WEBHOOK_INGEST_QUEUE_NAME}:job`),
      source: "worker",
      route: `queue:${WEBHOOK_INGEST_QUEUE_NAME}`,
      queueName: WEBHOOK_INGEST_QUEUE_NAME,
      queueJobId: String(job.id || `${WEBHOOK_INGEST_QUEUE_NAME}:job`),
      component: "workers",
      phase: "webhook-ingestion",
      workerId: "webhook-intake",
    },
    async () => {
      switch (job.data.type) {
        case "INSTAGRAM_MESSAGE_INGEST":
          await processInstagramMessageWebhookIngest(job.data);
          return;
        case "INSTAGRAM_COMMENT_INGEST":
          await processInstagramCommentWebhookIngest(job.data);
          return;
        case "WHATSAPP_MESSAGE_INGEST":
          await processWhatsAppMessageWebhookIngest(job.data);
          return;
        default:
          throw new Error(`unsupported_webhook_ingest_job:${(job.data as any)?.type || "unknown"}`);
      }
    }
  );

const processWebhookReconcileJob = async (
  job: Job<WebhookReconcileJobPayload>
) =>
  runWithRequestContext(
    {
      requestId: String(job.id || `${WEBHOOK_RECONCILE_QUEUE_NAME}:job`),
      traceId:
        String((job.data as { traceId?: unknown })?.traceId || "").trim() ||
        String(job.id || `${WEBHOOK_RECONCILE_QUEUE_NAME}:job`),
      correlationId:
        String((job.data as { traceId?: unknown })?.traceId || "").trim() ||
        String(job.id || `${WEBHOOK_RECONCILE_QUEUE_NAME}:job`),
      source: "worker",
      route: `queue:${WEBHOOK_RECONCILE_QUEUE_NAME}`,
      queueName: WEBHOOK_RECONCILE_QUEUE_NAME,
      queueJobId: String(job.id || `${WEBHOOK_RECONCILE_QUEUE_NAME}:job`),
      component: "workers",
      phase: "webhook-reconciliation",
      workerId: "webhook-intake",
    },
    async () => {
      switch (job.data.type) {
        case "PROVIDER_DELIVERY_RECONCILE":
          await processProviderDeliveryReconcileWebhook(job.data);
          return;
        default:
          throw new Error(`unsupported_webhook_reconcile_job:${(job.data as any)?.type || "unknown"}`);
      }
    }
  );

const enqueueDeadLetter = async ({
  queueName,
  payload,
  attemptsMade,
  error,
}: {
  queueName: string;
  payload: WebhookIngestJobPayload | WebhookReconcileJobPayload;
  attemptsMade: number;
  error: unknown;
}) => {
  const failedAtIso = new Date().toISOString();
  const errorMessage = String(
    (error as { message?: unknown })?.message || error || "webhook_worker_failed"
  );

  await enqueueWebhookIntakeDeadLetterJob({
    queueName,
    payload,
    failedAtIso,
    attemptsMade,
    error: errorMessage,
  }).catch(() => undefined);

  emitWebhookWorkerMetric("webhook_degraded", 1, {
    queueName,
    reason: "worker_terminal_failure",
    attemptsMade,
    error: errorMessage,
  });
};

const buildIngestWorker = () => {
  const worker = new Worker<WebhookIngestJobPayload>(
    WEBHOOK_INGEST_QUEUE_NAME,
    withRedisWorkerFailSafe(WEBHOOK_INGEST_QUEUE_NAME, processWebhookIngestJob),
    {
      connection: getWorkerRedisConnection(),
      concurrency: WEBHOOK_INGEST_WORKER_CONCURRENCY,
    }
  );

  worker.on("active", (job) => {
    emitWebhookWorkerMetric("webhook_queue_wait_ms", computeQueueWaitMs(job), {
      queueName: WEBHOOK_INGEST_QUEUE_NAME,
      type: job.data.type,
    });
  });

  worker.on("failed", (job, error) => {
    if (!job) {
      return;
    }

    captureExceptionWithContext(error, {
      tags: {
        worker: "webhook.ingest",
        queueName: WEBHOOK_INGEST_QUEUE_NAME,
      },
      extras: {
        jobId: job.id,
        type: job.data.type,
      },
    });

    const attemptsMade = Number(job.attemptsMade || 0);
    const maxAttempts = Number(job.opts.attempts || 1);

    if (attemptsMade < maxAttempts) {
      return;
    }

    void enqueueDeadLetter({
      queueName: WEBHOOK_INGEST_QUEUE_NAME,
      payload: job.data,
      attemptsMade,
      error,
    });
  });

  worker.on("error", (error) => {
    emitWebhookWorkerMetric("webhook_degraded", 1, {
      queueName: WEBHOOK_INGEST_QUEUE_NAME,
      reason: "worker_error",
      error: String((error as { message?: unknown })?.message || error),
    });
  });

  return worker;
};

const buildReconcileWorker = () => {
  const worker = new Worker<WebhookReconcileJobPayload>(
    WEBHOOK_RECONCILE_QUEUE_NAME,
    withRedisWorkerFailSafe(
      WEBHOOK_RECONCILE_QUEUE_NAME,
      processWebhookReconcileJob
    ),
    {
      connection: getWorkerRedisConnection(),
      concurrency: WEBHOOK_RECONCILE_WORKER_CONCURRENCY,
    }
  );

  worker.on("active", (job) => {
    emitWebhookWorkerMetric("webhook_queue_wait_ms", computeQueueWaitMs(job), {
      queueName: WEBHOOK_RECONCILE_QUEUE_NAME,
      type: job.data.type,
    });
  });

  worker.on("failed", (job, error) => {
    if (!job) {
      return;
    }

    captureExceptionWithContext(error, {
      tags: {
        worker: "webhook.reconcile",
        queueName: WEBHOOK_RECONCILE_QUEUE_NAME,
      },
      extras: {
        jobId: job.id,
        type: job.data.type,
      },
    });

    const attemptsMade = Number(job.attemptsMade || 0);
    const maxAttempts = Number(job.opts.attempts || 1);

    if (attemptsMade < maxAttempts) {
      return;
    }

    void enqueueDeadLetter({
      queueName: WEBHOOK_RECONCILE_QUEUE_NAME,
      payload: job.data,
      attemptsMade,
      error,
    });
  });

  worker.on("error", (error) => {
    emitWebhookWorkerMetric("webhook_degraded", 1, {
      queueName: WEBHOOK_RECONCILE_QUEUE_NAME,
      reason: "worker_error",
      error: String((error as { message?: unknown })?.message || error),
    });
  });

  return worker;
};

export const initWebhookIntakeWorkers = () => {
  if (!shouldRunWorker) {
    return [];
  }

  if (
    globalForWebhookIntakeWorker.__sylphWebhookIngestWorker &&
    globalForWebhookIntakeWorker.__sylphWebhookReconcileWorker
  ) {
    return [
      globalForWebhookIntakeWorker.__sylphWebhookIngestWorker,
      globalForWebhookIntakeWorker.__sylphWebhookReconcileWorker,
    ].filter(Boolean) as Worker[];
  }

  const ingestWorker =
    globalForWebhookIntakeWorker.__sylphWebhookIngestWorker ||
    buildIngestWorker();
  const reconcileWorker =
    globalForWebhookIntakeWorker.__sylphWebhookReconcileWorker ||
    buildReconcileWorker();

  globalForWebhookIntakeWorker.__sylphWebhookIngestWorker = ingestWorker;
  globalForWebhookIntakeWorker.__sylphWebhookReconcileWorker = reconcileWorker;

  return [ingestWorker, reconcileWorker];
};

export const closeWebhookIntakeWorkers = async () => {
  await globalForWebhookIntakeWorker.__sylphWebhookIngestWorker
    ?.close()
    .catch(() => undefined);
  await globalForWebhookIntakeWorker.__sylphWebhookReconcileWorker
    ?.close()
    .catch(() => undefined);

  globalForWebhookIntakeWorker.__sylphWebhookIngestWorker = undefined;
  globalForWebhookIntakeWorker.__sylphWebhookReconcileWorker = undefined;
};
