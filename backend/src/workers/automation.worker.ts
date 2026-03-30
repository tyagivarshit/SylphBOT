import { Worker } from "bullmq";
import Redis from "ioredis";
import { handleCommentAutomation } from "../services/commentAutomation.service";

const redis = new Redis(process.env.REDIS_URL as string);

new Worker(
  "automation",
  async (job) => {
    if (job.name === "comment") {
      await handleCommentAutomation(job.data);
    }
  },
  {
    connection: redis,
    concurrency: 20,
  }
);