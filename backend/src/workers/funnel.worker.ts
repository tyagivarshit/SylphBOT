import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";

/* SENTRY MONITORING */
import * as Sentry from "@sentry/node";

const worker =
  process.env.RUN_WORKER === "true"
    ? new Worker(
  "funnelQueue",
  async (job) => {

    const { executionId } = job.data;

    try {

      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });

      if (!execution) return;

      console.log("Running funnel job:", executionId);

    } catch (error) {

      console.error("Funnel worker error:", error);
      Sentry.captureException(error);

      throw error;

    }

  },
  {
    connection: getWorkerRedisConnection(),
    concurrency: 3,
  }
)
    : ({
        on() {
          return undefined;
        },
      } as { on: (...args: any[]) => void });

/* WORKER FAILURE MONITORING */

worker.on("failed", (job, err) => {

  console.error("Funnel Worker Failed:", job?.id, err);
  Sentry.captureException(err);

});

if (process.env.RUN_WORKER === "true") {
  console.log("🚀 Funnel Worker Started");
}
