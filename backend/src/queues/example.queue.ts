import { Queue, Worker } from "bullmq";
import { env } from "../config/env"; // ✅

export const exampleQueue = new Queue("example-queue", {
  connection: { url: env.REDIS_URL }, // ✅
});

export const exampleWorker = new Worker(
  "example-queue",
  async (job) => {
    console.log("Processing job:", job.data);
  },
  {
    connection: { url: env.REDIS_URL }, // ✅
  }
);