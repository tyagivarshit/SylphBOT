import { Queue } from "bullmq";
import prisma from "../config/prisma";

export const followupQueue = new Queue("followupQueue", {
  connection: { url: process.env.REDIS_URL } ,
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

/* 🔥 LIMIT SAFETY */
const MAX_FOLLOWUPS_PER_LEAD = 3;

export const scheduleFollowups = async (leadId: string) => {
  if (!leadId) return;

  /* 🔥 CHECK LEAD STATUS */
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { stage: true },
  });

  if (!lead || lead.stage === "CLOSED") return;

  const delays = [
    { label: "2hr", delay: 2 * 60 * 60 * 1000 },
    { label: "12hr", delay: 12 * 60 * 60 * 1000 },
    { label: "24hr", delay: 24 * 60 * 60 * 1000 },
  ];

  for (const item of delays.slice(0, MAX_FOLLOWUPS_PER_LEAD)) {
    const jobId = `followup:${leadId}:${item.label}`;

    /* 🔥 REMOVE EXISTING (avoid duplicates) */
    const existingJob = await followupQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
    }

    await followupQueue.add(
      "sendFollowup",
      {
        leadId,
        type: item.label,
      },
      {
        delay: item.delay,
        jobId,
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