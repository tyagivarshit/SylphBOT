import { Worker } from "bullmq";
import redis from "../config/redis";
import { handleCommentAutomation } from "../services/commentAutomation.service";


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