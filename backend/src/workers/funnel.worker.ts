import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { redisConnection } from "../config/redis";

new Worker(
  "funnelQueue",
  async (job) => {

    const { executionId } = job.data;

    const execution = await prisma.automationExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) return;

    console.log("Running funnel job:", executionId);

  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
);

console.log("🚀 Funnel Worker Started");