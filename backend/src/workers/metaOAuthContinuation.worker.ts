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
import logger from "../utils/logger";

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

  await runMetaOAuthContinuationFromQueueJob({
    ...job.data,
    jobId: job.id || "",
    attemptsMade: job.attemptsMade || 0,
    source: "queue_worker",
  });
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
