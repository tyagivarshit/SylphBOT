import { JobsOptions, Queue } from "bullmq";
import prisma from "../config/prisma";
import { getQueueRedisConnection } from "../config/redis";
import { buildQueueJobOptions } from "./queue.defaults";
import { getSalesFollowupSchedule } from "../services/salesAgent/followup.service";
import type { SalesFollowupTrigger } from "../services/salesAgent/types";

export type FollowupJobData = {
  leadId: string;
  type: string;
  trigger: string;
  scheduledFor: string;
};

export const FOLLOWUP_QUEUE_NAME: string = "ai-low";
export const LEGACY_FOLLOWUP_QUEUE_NAME: string = "followupQueue";

const queueConnection = getQueueRedisConnection();
const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  backoff: {
    type: "exponential",
    delay: 5000,
  },
});

export const followupQueue = new Queue<FollowupJobData>(FOLLOWUP_QUEUE_NAME, {
  connection: queueConnection,
  prefix: "sylph",
  defaultJobOptions,
});

export const legacyFollowupQueue =
  LEGACY_FOLLOWUP_QUEUE_NAME === FOLLOWUP_QUEUE_NAME
    ? followupQueue
    : new Queue<FollowupJobData>(LEGACY_FOLLOWUP_QUEUE_NAME, {
        connection: queueConnection,
        prefix: "sylph",
        defaultJobOptions,
      });

export const scheduleFollowups = async (
  leadId: string,
  options?: {
    trigger?: SalesFollowupTrigger;
  }
) => {
  if (!leadId) return;

  /* 🔥 CHECK LEAD STATUS */
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { stage: true },
  });

  if (!lead || lead.stage === "CLOSED") return;

  const schedule = await getSalesFollowupSchedule(leadId, options);

  for (const item of schedule) {
    const jobId = `followup:${leadId}:${item.step}`;

    /* 🔥 REMOVE EXISTING (avoid duplicates) */
    const existingJob =
      (await followupQueue.getJob(jobId)) ||
      (await legacyFollowupQueue.getJob(jobId));

    if (existingJob) {
      await existingJob.remove();
    }

    await followupQueue.add(
      "sendFollowup",
      {
        leadId,
        type: item.step,
        trigger: item.trigger,
        scheduledFor: new Date(Date.now() + item.delayMs).toISOString(),
      },
      {
        jobId,
        ...buildQueueJobOptions({
          delay: item.delayMs,
        }),
      }
    );
  }

  console.log(`📅 Followups scheduled for lead ${leadId}`);
};

export const cancelFollowups = async (leadId: string) => {
  if (!leadId) return;

  const jobIds = [
    `followup:${leadId}:1h`,
    `followup:${leadId}:24h`,
    `followup:${leadId}:48h`,
    `followup:${leadId}:NO_REPLY_1H`,
    `followup:${leadId}:NO_REPLY_24H`,
    `followup:${leadId}:NO_REPLY_48H`,
    `followup:${leadId}:OPENED_NO_RESPONSE`,
    `followup:${leadId}:CLICKED_NOT_BOOKED`,
    `followup:${leadId}:2hr`,
    `followup:${leadId}:12hr`,
    `followup:${leadId}:24hr`,
  ];

  for (const jobId of jobIds) {
    try {
      const job = (await followupQueue.getJob(jobId)) || (await legacyFollowupQueue.getJob(jobId));

      if (job) {
        await job.remove();
      }
    } catch (err) {
      console.log("Followup removal error", err);
    }
  }

  console.log(`🛑 Followups cancelled for lead ${leadId}`);
};
