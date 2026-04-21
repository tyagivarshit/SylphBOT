import { Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";

export const startLearningWorker = () => {
  if (process.env.RUN_WORKER !== "true") {
    return null;
  }

  const worker = new Worker(
    "learning-queue",
    withRedisWorkerFailSafe("learning-queue", async (job: any) => {
      console.log("Processing Learning Job:", job.data);
    }),
    {
      connection: getWorkerRedisConnection(),
    }
  );

  worker.on("completed", (job) => {
    console.log(`Job completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job failed: ${job?.id}`, err);
  });

  console.log("Learning Worker Started");
  return worker;
};
