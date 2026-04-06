import { Worker } from "bullmq";
import { env } from "../config/env"; // ✅ add only
import { handleCommentAutomation } from "../services/commentAutomation.service";


new Worker(
  "automation",
  async (job) => {
    if (job.name === "comment") {
      await handleCommentAutomation(job.data);
    }
  },
  {
    connection: { url: process.env.REDIS_URL } ,
    concurrency: 20,
  }
);