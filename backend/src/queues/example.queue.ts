import { Queue, Worker } from "bullmq";
import {
  getQueueRedisConnection,
  getWorkerRedisConnection,
} from "../config/redis";
import { buildQueueJobOptions } from "./queue.defaults";
import {
  getWorkerCount,
  resolveWorkerConcurrency,
} from "../workers/workerManager";

export const exampleQueue = new Queue("example-queue", {
  connection: getQueueRedisConnection(),
  defaultJobOptions: buildQueueJobOptions(),
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
          concurrency: resolveWorkerConcurrency(
            "EXAMPLE_WORKER_CONCURRENCY",
            Math.max(1, getWorkerCount())
          ),
        }
      )
    : null;
