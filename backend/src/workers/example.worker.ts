import { Worker } from "bullmq";
import {env} from "../config/env";

const worker = new Worker(
  "example-queue",
  async (job) => {
    console.log("Processing job:", job.data);
  },
  {
    connection: { url: env.REDIS_URL } ,
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job?.id}`, err);
});