import { Queue, Worker } from "bullmq";
import redis from "../config/redis";

// 🔥 reuse same connection
export const exampleQueue = new Queue("example-queue", {
  connection: redis,
});

// 🔥 worker
export const exampleWorker = new Worker(
  "example-queue",
  async (job) => {
    console.log("Processing job:", job.data);
  },
  {
    connection: redis,
  }
);