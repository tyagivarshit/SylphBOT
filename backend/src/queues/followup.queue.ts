import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const followupQueue = new Queue("followupQueue", {
  connection: redisConnection,

  prefix: "sylph",

  defaultJobOptions: {
    attempts: 3,

    backoff: {
      type: "exponential",
      delay: 5000,
    },

    removeOnComplete: {
      age: 3600,
      count: 500,
    },

    removeOnFail: {
      age: 24 * 3600,
    },
  },
});

export const scheduleFollowups = async (leadId: string) => {

  if (!leadId) return;

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
        removeOnComplete: true,
      }
    );

  }

  console.log(`📅 Followups scheduled for lead ${leadId}`);

};

export const cancelFollowups = async (leadId: string) => {

  if (!leadId) return;

  const jobIds = [
    `followup:${leadId}:2hr`,
    `followup:${leadId}:12hr`,
    `followup:${leadId}:24hr`,
  ];

  for (const jobId of jobIds) {

    try {

      const job = await followupQueue.getJob(jobId);

      if (job) {
        await job.remove();
      }

    } catch (err) {

      console.log("Followup removal error", err);

    }

  }

  console.log(`🛑 Followups cancelled for lead ${leadId}`);

};