import type { JobsOptions, Queue } from "bullmq";
import logger from "../utils/logger";
import {
  isRedisCircuitOpen,
  safeRedisCall,
  shouldLogRedisSkip,
} from "../redis/redisSafety";
import {
  recordMetricSnapshot,
  recordObservabilityEvent,
} from "../services/reliability/reliabilityOS.service";

export const QUEUE_REMOVE_ON_COMPLETE = {
  count: 1000,
} as const;

export const QUEUE_REMOVE_ON_FAIL = {
  count: 5000,
} as const;

export const buildQueueJobOptions = (
  overrides: Partial<JobsOptions> = {}
): JobsOptions => ({
  attempts: 3,
  removeOnComplete: QUEUE_REMOVE_ON_COMPLETE,
  removeOnFail: QUEUE_REMOVE_ON_FAIL,
  ...overrides,
});

const getQueueMethodFallback = (methodName: string) => {
  switch (methodName) {
    case "getJob":
      return null;
    case "getJobs":
      return [];
    case "count":
      return 0;
    case "getJobCounts":
      return {};
    default:
      return null;
  }
};

const throwQueueWriteUnavailable = (queueName: string, methodName: string) => {
  void recordObservabilityEvent({
    eventType: "queue.write.unavailable",
    message: `Queue unavailable for ${queueName}.${methodName}`,
    severity: "error",
    context: {
      component: "queue",
      phase: "write",
    },
    metadata: {
      queueName,
      methodName,
    },
  }).catch(() => undefined);
  throw new Error(`queue_unavailable:${queueName}.${methodName}`);
};

export const createResilientQueue = <T extends Queue<any>>(
  queue: T,
  queueName: string
) =>
  new Proxy(queue, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") {
        return value;
      }

      if (
        property === "add" ||
        property === "getJob" ||
        property === "getJobs" ||
        property === "count" ||
        property === "getJobCounts"
      ) {
        const methodName = String(property);

        return (...args: unknown[]) =>
          safeRedisCall(
            () => (value as (...methodArgs: unknown[]) => unknown).apply(target, args),
            property === "add"
              ? () => throwQueueWriteUnavailable(queueName, methodName)
              : getQueueMethodFallback(methodName),
            {
              operation: `queue.${queueName}.${methodName}`,
            }
          );
      }

      if (property === "addBulk") {
        const methodName = String(property);

        return (...args: unknown[]) =>
          safeRedisCall(
            () => (value as (...methodArgs: unknown[]) => unknown).apply(target, args),
            () => throwQueueWriteUnavailable(queueName, methodName),
            {
              operation: `queue.${queueName}.${methodName}`,
            }
          );
      }

      return (...args: unknown[]) =>
        (value as (...methodArgs: unknown[]) => unknown).apply(target, args);
    },
  }) as T;

export const withRedisWorkerFailSafe = <
  TJob extends {
    id?: string | number | null;
    queueName?: string;
  },
>(
  queueName: string,
  handler: (job: TJob) => Promise<unknown>
) =>
  async (job: TJob) => {
    if (isRedisCircuitOpen()) {
      void recordMetricSnapshot({
        subsystem: "REDIS",
        queueLag: 0,
        workerUtilization: 0,
        dlqRate: 0,
        retryRate: 1,
        lockContention: 0,
        providerErrorRate: 1,
        metadata: {
          queueName,
          jobId: job?.id || null,
          event: "redis_circuit_open",
        },
      }).catch(() => undefined);

      if (shouldLogRedisSkip(`worker:${queueName}`)) {
        logger.warn(
          {
            queueName,
            jobId: job?.id || null,
          },
          "Redis circuit open, worker skipped job processing"
        );
      }

      throw new Error(`redis_circuit_open:${queueName}`);
    }

    return handler(job);
  };
