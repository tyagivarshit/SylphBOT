import { Queue, Worker } from "bullmq";

export const exampleQueue = new Queue("example-queue", {
  connection: { url: process.env.REDIS_URL }, // ✅
});

export const exampleWorker = new Worker(
  "example-queue",
  async (job) => {
    console.log("Processing job:", job.data);
  },
  {
    connection: { url: process.env.REDIS_URL }, // ✅
  }
);