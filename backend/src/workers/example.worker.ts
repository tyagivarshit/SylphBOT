import { Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const worker =
  shouldRunWorker
    ? new Worker(
  "example-queue",
  withRedisWorkerFailSafe("example-queue", async (job: any) => {
    console.log("Processing job:", job.data);
  }),
  {
    connection: getWorkerRedisConnection(),
  }
)
    : ({
        on() {
          return undefined;
        },
      } as { on: (...args: any[]) => void });

if (!shouldRunWorker) {
  console.log("[example.worker] RUN_WORKER disabled, worker not started");
}

worker.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job?.id}`, err);
});
