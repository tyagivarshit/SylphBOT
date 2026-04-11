import { Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { handleCommentAutomation } from "../services/commentAutomation.service";


if (process.env.RUN_WORKER === "true") {
  new Worker(
  "automation",
  async (job) => {
    if (job.name === "comment") {
      await handleCommentAutomation(job.data);
    }
  },
  {
    connection: getWorkerRedisConnection(),
    concurrency: 20,
  }
  );
}
