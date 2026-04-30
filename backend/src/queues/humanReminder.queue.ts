import { Job, JobsOptions, Queue } from "bullmq";
import { env } from "../config/env";
import { getQueueRedisConnection } from "../config/redis";
import { buildQueueJobOptions, createResilientQueue } from "./queue.defaults";

export const HUMAN_REMINDER_QUEUE = "human-reminder-sweep";

export type HumanReminderSweepJobPayload = {
  businessId?: string | null;
  triggeredBy: "SCHEDULER" | "MANUAL";
  requestedAt: string;
};

type HumanReminderQueueRegistry = {
  sweep?: Queue<HumanReminderSweepJobPayload>;
};

const globalForHumanReminderQueue = globalThis as typeof globalThis & {
  __sylphHumanReminderQueues?: HumanReminderQueueRegistry;
};

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2_000,
  },
});

const getRegistry = () => {
  if (!globalForHumanReminderQueue.__sylphHumanReminderQueues) {
    globalForHumanReminderQueue.__sylphHumanReminderQueues = {};
  }

  return globalForHumanReminderQueue.__sylphHumanReminderQueues;
};

const buildQueue = () =>
  createResilientQueue(
    new Queue<HumanReminderSweepJobPayload>(HUMAN_REMINDER_QUEUE, {
      connection: getQueueRedisConnection(),
      prefix: env.AI_QUEUE_PREFIX,
      defaultJobOptions,
    }),
    HUMAN_REMINDER_QUEUE
  );

export const initHumanReminderQueue = () => {
  const registry = getRegistry();

  if (!registry.sweep) {
    registry.sweep = buildQueue();
  }

  return registry.sweep;
};

export const enqueueHumanReminderSweep = async (
  payload: HumanReminderSweepJobPayload
) =>
  initHumanReminderQueue().add("sweep", payload, {
    jobId: [
      HUMAN_REMINDER_QUEUE,
      String(payload.businessId || "all"),
      new Date(payload.requestedAt).toISOString().slice(0, 13),
    ].join(":"),
  });

export const getHumanReminderQueues = () => {
  const registry = getRegistry();
  return [registry.sweep].filter(Boolean) as Queue[];
};

export const closeHumanReminderQueue = async () => {
  const registry = globalForHumanReminderQueue.__sylphHumanReminderQueues;
  await Promise.allSettled(
    Object.values(registry || {})
      .filter(Boolean)
      .map((queue) => queue!.close())
  );
  globalForHumanReminderQueue.__sylphHumanReminderQueues = undefined;
};

export type HumanReminderQueueJob = Job<HumanReminderSweepJobPayload>;
