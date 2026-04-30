import { Worker } from "bullmq";
import { env } from "../config/env";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import {
  HUMAN_REMINDER_QUEUE,
  type HumanReminderSweepJobPayload,
} from "../queues/humanReminder.queue";
import { createHumanReminderService } from "../services/humanReminder.service";
import logger from "../utils/logger";

const reminderService = createHumanReminderService();

const shouldRunWorker =
  process.env.RUN_WORKER === "true" || process.env.RUN_WORKER === undefined;

const globalForHumanReminderWorker = globalThis as typeof globalThis & {
  __sylphHumanReminderWorker?: Worker<HumanReminderSweepJobPayload> | null;
};

const processReminderSweep = async (payload: HumanReminderSweepJobPayload) =>
  reminderService.emitDueReminders({
    businessId: payload.businessId || null,
  });

export const initHumanReminderWorker = () => {
  if (!shouldRunWorker) {
    return null;
  }

  if (globalForHumanReminderWorker.__sylphHumanReminderWorker) {
    return globalForHumanReminderWorker.__sylphHumanReminderWorker;
  }

  const worker = new Worker<HumanReminderSweepJobPayload>(
    HUMAN_REMINDER_QUEUE,
    withRedisWorkerFailSafe(HUMAN_REMINDER_QUEUE, async (job) =>
      processReminderSweep(job.data)
    ),
    {
      connection: getWorkerRedisConnection(),
      prefix: env.AI_QUEUE_PREFIX,
      concurrency: 2,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error(
      {
        queue: HUMAN_REMINDER_QUEUE,
        jobId: job?.id,
        error,
      },
      "Human reminder worker failed"
    );
  });

  globalForHumanReminderWorker.__sylphHumanReminderWorker = worker;
  return worker;
};

export const closeHumanReminderWorker = async () => {
  const worker = globalForHumanReminderWorker.__sylphHumanReminderWorker;

  if (!worker) {
    return;
  }

  await worker.close();
  globalForHumanReminderWorker.__sylphHumanReminderWorker = null;
};
