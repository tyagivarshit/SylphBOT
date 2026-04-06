import { Worker } from "bullmq";
import redis from "../config/redis";

const worker = new Worker(
  "example-queue",
  async (job) => {
    console.log("Processing job:", job.data);
  },
  {
    connection: redis,
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job?.id}`, err);
});