import { Job, Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import {
  INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME,
  type IntegrationOnboardingProjectionJobPayload,
} from "../queues/integrationOnboardingProjection.queue";
import { recordObservabilityEvent } from "../services/reliability/reliabilityOS.service";
import { runIntegrationOnboardingProjectionReconcile } from "../services/integrationOnboardingProjection.service";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const INTEGRATION_ONBOARDING_PROJECTION_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.INTEGRATION_ONBOARDING_PROJECTION_WORKER_CONCURRENCY || 1)
);

const globalForIntegrationOnboardingProjectionWorker =
  globalThis as typeof globalThis & {
    __sylphIntegrationOnboardingProjectionWorker?: Worker<IntegrationOnboardingProjectionJobPayload> | null;
  };

const processProjectionJob = async (
  job: Job<IntegrationOnboardingProjectionJobPayload>
) => {
  if (job.data.type !== "ONBOARDING_RECONCILE") {
    throw new Error(`unsupported_projection_job:${String((job.data as any)?.type || "unknown")}`);
  }

  void recordObservabilityEvent({
    businessId: job.data.businessId,
    tenantId: job.data.tenantId || job.data.businessId,
    eventType: "worker_consumption_detected",
    message: "worker_consumption_detected:integration_onboarding_projection",
    severity: "info",
    context: {
      component: "integration_onboarding_projection_worker",
      phase: "consume",
    },
    metadata: {
      queueName: INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME,
      jobId: job.id || null,
      attemptsMade: job.attemptsMade,
      reason: job.data.reason || "projection_worker_refresh",
      source: job.data.source || "projection_worker",
    },
  }).catch(() => undefined);

  await runIntegrationOnboardingProjectionReconcile({
    businessId: job.data.businessId,
    tenantId: job.data.tenantId || job.data.businessId,
    reason: job.data.reason || "projection_worker_refresh",
    source: job.data.source || "projection_worker",
  });
};

export const initIntegrationOnboardingProjectionWorker = () => {
  if (!shouldRunWorker) {
    return null;
  }

  if (globalForIntegrationOnboardingProjectionWorker.__sylphIntegrationOnboardingProjectionWorker) {
    return globalForIntegrationOnboardingProjectionWorker.__sylphIntegrationOnboardingProjectionWorker;
  }

  const worker = new Worker<IntegrationOnboardingProjectionJobPayload>(
    INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME,
    withRedisWorkerFailSafe(
      INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME,
      processProjectionJob
    ),
    {
      connection: getWorkerRedisConnection(),
      prefix: "sylph",
      concurrency: INTEGRATION_ONBOARDING_PROJECTION_WORKER_CONCURRENCY,
    }
  );

  worker.on("failed", (job, error) => {
    emitPerformanceMetric({
      name: "provider_reconcile_failures",
      value: 1,
      businessId: String(job?.data?.businessId || "").trim() || null,
      route: "integrations_onboarding_projection_worker",
      metadata: {
        reason: String((error as Error)?.message || "projection_worker_failed"),
      },
    });
  });

  worker.on("error", (error) => {
    emitPerformanceMetric({
      name: "provider_reconcile_failures",
      value: 1,
      route: "integrations_onboarding_projection_worker",
      metadata: {
        reason: "worker_error",
        error: String((error as Error)?.message || error),
      },
    });
  });

  globalForIntegrationOnboardingProjectionWorker.__sylphIntegrationOnboardingProjectionWorker =
    worker;
  return worker;
};

export const closeIntegrationOnboardingProjectionWorker = async () => {
  await globalForIntegrationOnboardingProjectionWorker.__sylphIntegrationOnboardingProjectionWorker
    ?.close()
    .catch(() => undefined);
  globalForIntegrationOnboardingProjectionWorker.__sylphIntegrationOnboardingProjectionWorker =
    undefined;
};
