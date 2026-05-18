import { Job, Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import { recordObservabilityEvent } from "../services/reliability/reliabilityOS.service";
import {
  META_OAUTH_CONTINUATION_QUEUE_NAME,
  type MetaOAuthContinuationJobPayload,
} from "../queues/metaOAuthContinuation.queue";
import { runMetaOAuthContinuationFromQueueJob } from "../controllers/client.controller";
import { getMetaOAuthLifecycleSnapshot } from "../services/metaOAuthLifecycle.service";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const META_OAUTH_CONTINUATION_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.META_OAUTH_CONTINUATION_WORKER_CONCURRENCY || 2)
);

const globalForMetaOAuthContinuationWorker =
  globalThis as typeof globalThis & {
    __sylphMetaOAuthContinuationWorker?: Worker<MetaOAuthContinuationJobPayload> | null;
  };

const processMetaOAuthContinuationJob = async (
  job: Job<MetaOAuthContinuationJobPayload>
) => {
  if (job.data.type !== "META_OAUTH_CONTINUATION") {
    throw new Error(
      `unsupported_meta_oauth_job:${String((job.data as any)?.type || "unknown")}`
    );
  }

  const startedAtMs = Date.now();
  const resumeCount = Number(job.attemptsMade || 0);

  emitPerformanceMetric({
    name: "onboarding_resume_count",
    value: resumeCount,
    businessId: job.data.businessId,
    route: "meta_oauth_continuation_worker",
    metadata: {
      operationId: job.data.operationId,
      replayToken: job.data.replayToken,
      resumeCount,
    },
  });
  emitPerformanceMetric({
    name: "continuation_async_only",
    value: 1,
    businessId: job.data.businessId,
    route: "meta_oauth_continuation_worker",
    metadata: {
      operationId: job.data.operationId,
      replayToken: job.data.replayToken,
      source: job.data.source || "queue_worker",
    },
  });
  void recordObservabilityEvent({
    businessId: job.data.businessId,
    tenantId: job.data.businessId,
    eventType: "worker_consumption_detected",
    message: "worker_consumption_detected:meta_oauth_continuation",
    severity: "info",
    context: {
      component: "meta_oauth_continuation_worker",
      phase: "consume",
    },
    metadata: {
      operationId: job.data.operationId,
      replayToken: job.data.replayToken,
      queueName: META_OAUTH_CONTINUATION_QUEUE_NAME,
      attemptsMade: job.attemptsMade,
      source: job.data.source || "queue_worker",
    },
  }).catch(() => undefined);

  await runMetaOAuthContinuationFromQueueJob({
    ...job.data,
    source: job.data.source || "queue_worker",
  });

  const durationMs = Date.now() - startedAtMs;
  const deferredSinceMs = job.data.queuedAtIso
    ? Math.max(0, Date.now() - new Date(job.data.queuedAtIso).getTime())
    : null;

  emitPerformanceMetric({
    name: "onboarding_async_completion_ms",
    value: durationMs,
    businessId: job.data.businessId,
    route: "meta_oauth_continuation_worker",
    metadata: {
      operationId: job.data.operationId,
      replayToken: job.data.replayToken,
      platform: job.data.platform,
      mode: job.data.mode,
      deferredSinceMs,
    },
  });

  if (deferredSinceMs !== null) {
    emitPerformanceMetric({
      name: "callback_deferred_work_ms",
      value: deferredSinceMs,
      businessId: job.data.businessId,
      route: "meta_oauth_continuation_worker",
      metadata: {
        operationId: job.data.operationId,
        replayToken: job.data.replayToken,
      },
    });
  }

  const lifecycle = await getMetaOAuthLifecycleSnapshot({
    attemptKey: job.data.operationId,
    replayToken: job.data.replayToken,
    platform: job.data.platform,
  }).catch(() => null);

  const metadata =
    lifecycle?.metadata && typeof lifecycle.metadata === "object"
      ? (lifecycle.metadata as Record<string, unknown>)
      : {};
  const stageDurations =
    metadata.stageDurationsMs && typeof metadata.stageDurationsMs === "object"
      ? (metadata.stageDurationsMs as Record<string, unknown>)
      : {};
  const webhookActivationAsyncMs = Number(stageDurations.WEBHOOK_ACTIVATION || 0);
  if (Number.isFinite(webhookActivationAsyncMs) && webhookActivationAsyncMs > 0) {
    emitPerformanceMetric({
      name: "webhook_activation_async_ms",
      value: webhookActivationAsyncMs,
      businessId: job.data.businessId,
      route: "meta_oauth_continuation_worker",
      metadata: {
        operationId: job.data.operationId,
        replayToken: job.data.replayToken,
      },
    });
  }
};

export const initMetaOAuthContinuationWorker = () => {
  if (!shouldRunWorker) {
    return null;
  }

  if (globalForMetaOAuthContinuationWorker.__sylphMetaOAuthContinuationWorker) {
    return globalForMetaOAuthContinuationWorker.__sylphMetaOAuthContinuationWorker;
  }

  const worker = new Worker<MetaOAuthContinuationJobPayload>(
    META_OAUTH_CONTINUATION_QUEUE_NAME,
    withRedisWorkerFailSafe(
      META_OAUTH_CONTINUATION_QUEUE_NAME,
      processMetaOAuthContinuationJob
    ),
    {
      connection: getWorkerRedisConnection(),
      prefix: "sylph",
      concurrency: META_OAUTH_CONTINUATION_WORKER_CONCURRENCY,
    }
  );

  worker.on("failed", (job, error) => {
    emitPerformanceMetric({
      name: "provider_reconcile_failures",
      value: 1,
      businessId: String(job?.data?.businessId || "").trim() || null,
      route: "meta_oauth_continuation_worker",
      metadata: {
        operationId: job?.data?.operationId || null,
        reason: String((error as Error)?.message || "meta_oauth_worker_failed"),
      },
    });
  });

  worker.on("error", (error) => {
    emitPerformanceMetric({
      name: "provider_reconcile_failures",
      value: 1,
      route: "meta_oauth_continuation_worker",
      metadata: {
        reason: "worker_error",
        error: String((error as Error)?.message || error),
      },
    });
  });

  globalForMetaOAuthContinuationWorker.__sylphMetaOAuthContinuationWorker = worker;
  return worker;
};

export const closeMetaOAuthContinuationWorker = async () => {
  await globalForMetaOAuthContinuationWorker.__sylphMetaOAuthContinuationWorker
    ?.close()
    .catch(() => undefined);
  globalForMetaOAuthContinuationWorker.__sylphMetaOAuthContinuationWorker =
    undefined;
};
