import { Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";

const worker =
  process.env.RUN_WORKER === "true"
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

worker.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job?.id}`, err);
});
