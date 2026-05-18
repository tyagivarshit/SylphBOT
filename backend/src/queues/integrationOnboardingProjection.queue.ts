import crypto from "crypto";
import { Queue } from "bullmq";
import {
  getQueueRedisConnection,
  getRedisReconnectSnapshot,
  isQueueRedisWritable,
} from "../config/redis";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { getRedisCircuitState, isRedisCircuitOpen } from "../redis/redisSafety";
import { recordObservabilityEvent } from "../services/reliability/reliabilityOS.service";
import { TimeoutExceededError, withTimeout } from "../utils/boundedTimeout";
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

const INTEGRATION_PROJECTION_QUEUE_FAST_FAIL_MS = Math.max(
  50,
  Number(process.env.INTEGRATION_PROJECTION_QUEUE_FAST_FAIL_MS || 120)
);

const INTEGRATION_PROJECTION_QUEUE_PRIORITY_REALTIME = 2;
const INTEGRATION_PROJECTION_QUEUE_PRIORITY_RECOVERY = 10;

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

const normalizeIdentifier = (value: unknown) => String(value || "").trim();

const isRecoverySource = (source: unknown) => {
  const normalized = normalizeIdentifier(source).toLowerCase();
  return (
    normalized.includes("deferred") ||
    normalized.includes("replay") ||
    normalized.includes("recovery")
  );
};

const resolveJobPriority = (payload: IntegrationOnboardingProjectionJobPayload) =>
  isRecoverySource(payload.source)
    ? INTEGRATION_PROJECTION_QUEUE_PRIORITY_RECOVERY
    : INTEGRATION_PROJECTION_QUEUE_PRIORITY_REALTIME;

const emitQueueWriteTelemetry = (input: {
  businessId: string;
  tenantId: string;
  source: string;
  queueUnavailable: boolean;
  reason: string;
  elapsedMs: number;
}) => {
  emitPerformanceMetric({
    name: "queue_write_fast_fail_ms",
    value: input.elapsedMs,
    businessId: input.businessId,
    route: "integration_onboarding_projection_queue",
    metadata: {
      tenantId: input.tenantId,
      source: input.source,
      queueUnavailable: input.queueUnavailable,
      reason: input.reason,
      fastFailBudgetMs: INTEGRATION_PROJECTION_QUEUE_FAST_FAIL_MS,
    },
  });

  const reconnect = getRedisReconnectSnapshot();
  emitPerformanceMetric({
    name: "redis_reconnect_attempts",
    value: reconnect.attempts,
    businessId: input.businessId,
    route: "integration_onboarding_projection_queue",
    metadata: {
      tenantId: input.tenantId,
      source: input.source,
      reason: input.reason,
      lastDelayMs: reconnect.lastDelayMs,
    },
  });

  const circuit = getRedisCircuitState();
  if (circuit.isOpen) {
    emitPerformanceMetric({
      name: "redis_circuit_open_ms",
      value: circuit.openDurationMs,
      businessId: input.businessId,
      route: "integration_onboarding_projection_queue",
      metadata: {
        tenantId: input.tenantId,
        source: input.source,
        reason: input.reason,
      },
    });
  }
};

export const enqueueIntegrationOnboardingProjectionReconcile = async (
  payload: IntegrationOnboardingProjectionJobPayload
) : Promise<IntegrationOnboardingProjectionEnqueueResult> => {
  const jobId = createJobId(payload);
  const startedAtMs = Date.now();
  const tenantId = payload.tenantId || payload.businessId;
  const source = normalizeIdentifier(payload.source) || "unknown";

  if (isRedisCircuitOpen() || !isQueueRedisWritable()) {
    const reason = isRedisCircuitOpen()
      ? "redis_circuit_open"
      : "queue_redis_not_writable";
    emitQueueWriteTelemetry({
      businessId: payload.businessId,
      tenantId,
      source,
      queueUnavailable: true,
      reason,
      elapsedMs: Date.now() - startedAtMs,
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

  try {
    const job = await withTimeout({
      label: "integration_onboarding_projection_queue_add",
      timeoutMs: INTEGRATION_PROJECTION_QUEUE_FAST_FAIL_MS,
      task: getIntegrationOnboardingProjectionQueue().add(
        "onboarding-reconcile",
        payload,
        {
          jobId,
          priority: resolveJobPriority(payload),
        }
      ),
    });

    emitQueueWriteTelemetry({
      businessId: payload.businessId,
      tenantId,
      source,
      queueUnavailable: false,
      reason: "enqueued",
      elapsedMs: Date.now() - startedAtMs,
    });

    return {
      enqueued: Boolean(job),
      deferred: false,
      duplicate: false,
      queueUnavailable: false,
      jobId,
      reason: null,
    };
  } catch (error) {
    if (error instanceof TimeoutExceededError) {
      const reason = `queue_write_timeout_${INTEGRATION_PROJECTION_QUEUE_FAST_FAIL_MS}ms`;
      emitQueueWriteTelemetry({
        businessId: payload.businessId,
        tenantId,
        source,
        queueUnavailable: true,
        reason,
        elapsedMs: Date.now() - startedAtMs,
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

    if (isDuplicateJobError(error)) {
      emitQueueWriteTelemetry({
        businessId: payload.businessId,
        tenantId,
        source,
        queueUnavailable: false,
        reason: "duplicate_jobid",
        elapsedMs: Date.now() - startedAtMs,
      });
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
      emitQueueWriteTelemetry({
        businessId: payload.businessId,
        tenantId,
        source,
        queueUnavailable: true,
        reason,
        elapsedMs: Date.now() - startedAtMs,
      });
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
      void recordObservabilityEvent({
        businessId: payload.businessId,
        tenantId: payload.tenantId || payload.businessId,
        eventType: "projection_enqueue_failed",
        message: `projection_enqueue_failed:${reason}`,
        severity: "error",
        context: {
          component: "integration_onboarding_projection_queue",
          phase: "write",
        },
        metadata: {
          queueName: INTEGRATION_ONBOARDING_PROJECTION_QUEUE_NAME,
          reason,
          source: payload.source || "unknown",
          deferred: true,
        },
      }).catch(() => undefined);

      return {
        enqueued: false,
        deferred: true,
        duplicate: false,
        queueUnavailable: true,
        jobId,
        reason,
      };
    }

    emitQueueWriteTelemetry({
      businessId: payload.businessId,
      tenantId,
      source,
      queueUnavailable: true,
      reason: String((error as Error)?.message || "queue_add_failed"),
      elapsedMs: Date.now() - startedAtMs,
    });
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
