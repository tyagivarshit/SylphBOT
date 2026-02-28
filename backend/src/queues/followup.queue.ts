import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const followupQueue = new Queue("followupQueue", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const scheduleFollowups = async (leadId: string) => {
  const delays = [
    { label: "2hr", delay: 2 * 60 * 60 * 1000 },
    { label: "12hr", delay: 12 * 60 * 60 * 1000 },
    { label: "24hr", delay: 24 * 60 * 60 * 1000 },
  ];

  for (const item of delays) {
    await followupQueue.add(
      "sendFollowup",
      {
        leadId,
        type: item.label,
      },
      {
        delay: item.delay,
        jobId: `followup:${leadId}:${item.label}`,
      }
    );
  }

  console.log(`📅 Followups scheduled for lead ${leadId}`);
};

export const cancelFollowups = async (leadId: string) => {
  const jobs = await followupQueue.getJobs([
    "delayed",
    "waiting",
    "active",
  ]);

  for (const job of jobs) {
    if (job.id?.toString().startsWith(`followup:${leadId}:`)) {
      await job.remove();
    }
  }

  console.log(`🛑 Followups cancelled for lead ${leadId}`);
};