import crypto from "crypto";
import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

export const INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME =
  "integration-onboarding-projection";

export type IntegrationOnboardingProjectionJobPayload = {
  type: "ONBOARDING_RECONCILE";
  businessId: string;
  tenantId?: string | null;
  reason?: string | null;
  source?: string | null;
};

export type IntegrationOnboardingProjectionEnqueueResult = {
  enqueued: boolean;
  deferred: boolean;
  duplicate: boolean;
  queueUnavailable: boolean;
  jobId: string;
  reason: string | null;
};

const globalForIntegrationOnboardingProjectionQueue =
  globalThis as typeof globalThis & {
    __sylphIntegrationOnboardingProjectionQueue?: Queue<IntegrationOnboardingProjectionJobPayload>;
  };

const createJobId = (payload: IntegrationOnboardingProjectionJobPayload) => {
  const dedupeWindow = Math.floor(Date.now() / 10_000);
  const seed = [
    payload.businessId,
    payload.tenantId || payload.businessId,
    payload.reason || "projection_refresh",
    dedupeWindow,
  ].join(":");
  return `integration-onboarding:${crypto
    .createHash("sha256")
    .update(seed)
    .digest("hex")}`;
};

export const initIntegrationOnboardingProjectionQueue = () => {
  if (!globalForIntegrationOnboardingProjectionQueue.__sylphIntegrationOnboardingProjectionQueue) {
    globalForIntegrationOnboardingProjectionQueue.__sylphIntegrationOnboardingProjectionQueue =
      createResilientQueue(
        new Queue<IntegrationOnboardingProjectionJobPayload>(
          INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME,
          {
            connection: getQueueRedisConnection(),
            prefix: "sylph",
            defaultJobOptions: buildQueueJobOptions({
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 800,
              },
            }),
          }
        ),
        INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME
      );
  }

  return globalForIntegrationOnboardingProjectionQueue.__sylphIntegrationOnboardingProjectionQueue;
};

export const getIntegrationOnboardingProjectionQueue = () =>
  initIntegrationOnboardingProjectionQueue();

const isDuplicateJobError = (error: unknown) =>
  String((error as Error)?.message || "")
    .toLowerCase()
    .includes("jobid");

const isQueueUnavailableError = (error: unknown) => {
  const message = String((error as Error)?.message || "")
    .trim()
    .toLowerCase();
  return (
    message.includes("queue_unavailable:") ||
    message.includes("redis_circuit_open")
  );
};

export const enqueueIntegrationOnboardingProjectionReconcile = async (
  payload: IntegrationOnboardingProjectionJobPayload
) : Promise<IntegrationOnboardingProjectionEnqueueResult> => {
  const jobId = createJobId(payload);
  try {
    const job = await getIntegrationOnboardingProjectionQueue().add(
      "onboarding-reconcile",
      payload,
      {
        jobId,
        priority: 2,
      }
    );

    return {
      enqueued: Boolean(job),
      deferred: false,
      duplicate: false,
      queueUnavailable: false,
      jobId,
      reason: null,
    };
  } catch (error) {
    if (isDuplicateJobError(error)) {
      return {
        enqueued: true,
        deferred: false,
        duplicate: true,
        queueUnavailable: false,
        jobId,
        reason: "duplicate_jobid",
      };
    }

    if (isQueueUnavailableError(error)) {
      const reason =
        String((error as Error)?.message || "queue_unavailable").trim() ||
        "queue_unavailable";
      console.warn("INTEGRATION_ONBOARDING_PROJECTION_QUEUE_ADD_FAILED", {
        reason,
        businessId: payload.businessId,
        tenantId: payload.tenantId || payload.businessId,
      });
      emitPerformanceMetric({
        name: "queue_unavailable_degraded_served",
        value: 1,
        businessId: payload.businessId,
        route: "integration_onboarding_projection_queue",
        metadata: {
          tenantId: payload.tenantId || payload.businessId,
          reason,
          source: payload.source || "unknown",
        },
      });

      return {
        enqueued: false,
        deferred: true,
        duplicate: false,
        queueUnavailable: true,
        jobId,
        reason,
      };
    }

    console.warn("INTEGRATION_ONBOARDING_PROJECTION_QUEUE_ADD_FAILED", {
      reason: String((error as Error)?.message || "queue_add_failed"),
      businessId: payload.businessId,
      tenantId: payload.tenantId || payload.businessId,
    });
    throw error;
  }
};

export const closeIntegrationOnboardingProjectionQueue = async () => {
  await globalForIntegrationOnboardingProjectionQueue.__sylphIntegrationOnboardingProjectionQueue
    ?.close()
    .catch(() => undefined);
  globalForIntegrationOnboardingProjectionQueue.__sylphIntegrationOnboardingProjectionQueue =
    undefined;
};
