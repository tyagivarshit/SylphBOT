import crypto from "crypto";
import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";
import { runIntegrationOnboardingProjectionReconcile } from "../services/integrationOnboardingProjection.service";

export const INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME =
  "integration-onboarding-projection";

export type IntegrationOnboardingProjectionJobPayload = {
  type: "ONBOARDING_RECONCILE";
  businessId: string;
  tenantId?: string | null;
  reason?: string | null;
  source?: string | null;
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

const fallbackLocalReconcile = (
  payload: IntegrationOnboardingProjectionJobPayload
) => {
  setTimeout(() => {
    void runIntegrationOnboardingProjectionReconcile({
      businessId: payload.businessId,
      tenantId: payload.tenantId || payload.businessId,
      reason: payload.reason || "projection_queue_fallback",
      source: "queue_fallback",
    }).catch(() => undefined);
  }, 35);
};

export const enqueueIntegrationOnboardingProjectionReconcile = async (
  payload: IntegrationOnboardingProjectionJobPayload
) => {
  try {
    const job = await getIntegrationOnboardingProjectionQueue().add(
      "onboarding-reconcile",
      payload,
      {
        jobId: createJobId(payload),
      }
    );

    if (job) {
      return job;
    }
  } catch (error) {
    console.warn("INTEGRATION_ONBOARDING_PROJECTION_QUEUE_ADD_FAILED", {
      reason: String((error as Error)?.message || "queue_add_failed"),
      businessId: payload.businessId,
      tenantId: payload.tenantId || payload.businessId,
    });
  }

  fallbackLocalReconcile(payload);
  return null;
};

export const closeIntegrationOnboardingProjectionQueue = async () => {
  await globalForIntegrationOnboardingProjectionQueue.__sylphIntegrationOnboardingProjectionQueue
    ?.close()
    .catch(() => undefined);
  globalForIntegrationOnboardingProjectionQueue.__sylphIntegrationOnboardingProjectionQueue =
    undefined;
};
