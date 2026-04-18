import { Queue, Worker } from "bullmq";
import {
  getQueueRedisConnection,
  getWorkerRedisConnection,
} from "../config/redis";

export const exampleQueue = new Queue("example-queue", {
  connection: getQueueRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

export const exampleWorker =
  process.env.RUN_WORKER === "true"
    ? new Worker(
        "example-queue",
        async (job) => {
          console.log("Processing job:", job.data);
        },
        {
          connection: getWorkerRedisConnection(),
        }
      )
    : null;
