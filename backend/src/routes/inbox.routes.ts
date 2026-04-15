import { Worker } from "bullmq";
import { enqueueAIBatch } from "../queues/ai.queue";
import * as Sentry from "@sentry/node";
import { getWorkerRedisConnection } from "../config/redis";


const worker =
  process.env.RUN_WORKER === "true"
    ? new Worker(
  "inboxQueue",
  async (job) => {
    const { businessId, leadId, message, plan } = job.data;

    try {
      /*
      🤖 AI
      ================================================= */
      await enqueueAIBatch([
        {
          businessId,
          leadId,
          message,
          plan,
        },
      ]);








      /* =================================================
      💬 SAVE + REALTIME (USING YOUR SERVICE 🔥)
      ================================================= */


    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("❌ Worker failed:", error.message);
        Sentry.captureException(error);
      } else {
        console.error("❌ Worker failed:", error);
      }
      throw error;
    }
  },
  {
    connection: getWorkerRedisConnection()
  }
)
    : null;

export default worker;
