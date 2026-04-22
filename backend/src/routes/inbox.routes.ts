import { Worker } from "bullmq";
import * as Sentry from "@sentry/node";
import { getWorkerRedisConnection } from "../config/redis";
import { enqueueAIBatch } from "../queues/ai.queue";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const worker =
  shouldRunWorker
    ? new Worker(
        "inboxQueue",
        withRedisWorkerFailSafe("inboxQueue", async (job: any) => {
          const { businessId, leadId, message, plan } = job.data;

          try {
            await enqueueAIBatch([
              {
                businessId,
                leadId,
                message,
                plan,
              },
            ]);
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.error("Worker failed:", error.message);
              Sentry.captureException(error);
            } else {
              console.error("Worker failed:", error);
            }

            throw error;
          }
        }),
        {
          connection: getWorkerRedisConnection(),
        }
      )
    : null;

if (!shouldRunWorker) {
  console.log("[routes/inbox.routes] RUN_WORKER disabled, worker not started");
}

export default worker;
