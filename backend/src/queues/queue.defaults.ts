import type { JobsOptions, Queue } from "bullmq";
import logger from "../utils/logger";
import {
  isRedisCircuitOpen,
  safeRedisCall,
  shouldLogRedisSkip,
} from "../redis/redisSafety";

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
    case "add":
    case "getJob":
      return null;
    case "addBulk":
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
        property === "addBulk" ||
        property === "getJob" ||
        property === "getJobs" ||
        property === "count" ||
        property === "getJobCounts"
      ) {
        return (...args: unknown[]) =>
          safeRedisCall(
            () => (value as (...methodArgs: unknown[]) => unknown).apply(target, args),
            getQueueMethodFallback(String(property)),
            {
              operation: `queue.${queueName}.${String(property)}`,
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
      if (shouldLogRedisSkip(`worker:${queueName}`)) {
        logger.warn(
          {
            queueName,
            jobId: job?.id || null,
          },
          "Redis circuit open, worker skipped job processing"
        );
      }

      return;
    }

    return handler(job);
  };
