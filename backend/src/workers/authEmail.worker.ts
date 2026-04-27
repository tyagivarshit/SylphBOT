import { Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/authEmail.service";
import type { AuthEmailJobData } from "../queues/authEmail.queue";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const globalForAuthEmailWorker = globalThis as typeof globalThis & {
  __sylphAuthEmailWorker?: Worker<AuthEmailJobData> | null;
};

export const initAuthEmailWorker = () => {
  if (!shouldRunWorker) {
    console.log("[authEmail.worker] RUN_WORKER disabled, worker not started");
    return null;
  }

  if (globalForAuthEmailWorker.__sylphAuthEmailWorker) {
    return globalForAuthEmailWorker.__sylphAuthEmailWorker;
  }

  const worker = new Worker<AuthEmailJobData>(
    "authEmail",
    withRedisWorkerFailSafe("authEmail", async (job) => {
      console.log("[EMAIL_QUEUE] received", job.name, job.data);

      if (job.data.type === "verify") {
        await sendVerificationEmail(job.data.to, job.data.link);
        return;
      }

      await sendPasswordResetEmail(job.data.to, job.data.link);
    }),
    {
      connection: getWorkerRedisConnection(),
      prefix: "sylph",
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log("[EMAIL_QUEUE] completed", {
      id: job.id,
      name: job.name,
      type: job.data.type,
      to: job.data.to,
    });
  });

  worker.on("failed", (job, error) => {
    console.error("[EMAIL_QUEUE] failed", {
      id: job?.id,
      name: job?.name,
      type: job?.data?.type,
      to: job?.data?.to,
      error: error.message,
    });
  });

  globalForAuthEmailWorker.__sylphAuthEmailWorker = worker;
  return worker;
};

export const closeAuthEmailWorker = async () => {
  await globalForAuthEmailWorker.__sylphAuthEmailWorker?.close().catch(() => undefined);
  globalForAuthEmailWorker.__sylphAuthEmailWorker = undefined;
};
