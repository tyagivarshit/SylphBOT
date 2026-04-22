import { Queue, Worker } from "bullmq";
import {
  getQueueRedisConnection,
  getWorkerRedisConnection,
} from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
  withRedisWorkerFailSafe,
} from "./queue.defaults";
import {
  getWorkerCount,
  resolveWorkerConcurrency,
} from "../workers/workerManager";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

export const exampleQueue = createResilientQueue(
  new Queue("example-queue", {
    connection: getQueueRedisConnection(),
    defaultJobOptions: buildQueueJobOptions(),
  }),
  "example-queue"
);

export const exampleWorker =
  shouldRunWorker
    ? new Worker(
        "example-queue",
        withRedisWorkerFailSafe("example-queue", async (job: any) => {
          console.log("Processing job:", job.data);
        }),
        {
          connection: getWorkerRedisConnection(),
          concurrency: resolveWorkerConcurrency(
            "EXAMPLE_WORKER_CONCURRENCY",
            Math.max(1, getWorkerCount())
          ),
        }
      )
    : null;

if (!shouldRunWorker) {
  console.log("[queues/example.queue] RUN_WORKER disabled, worker not started");
}
