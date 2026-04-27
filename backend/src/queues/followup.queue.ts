import { JobsOptions, Queue } from "bullmq";
import prisma from "../config/prisma";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";
import { getLeadControlAuthority } from "../services/leadControlState.service";
import { getSalesFollowupSchedule } from "../services/salesAgent/followup.service";
import type { SalesFollowupTrigger } from "../services/salesAgent/types";

export type FollowupJobData = {
  leadId: string;
  type: string;
  trigger: string;
  scheduledFor: string;
  cancelTokenVersion?: number | null;
};

export const FOLLOWUP_QUEUE_NAME: string = "ai-low";
export const LEGACY_FOLLOWUP_QUEUE_NAME: string = "followupQueue";

const globalForFollowupQueue = globalThis as typeof globalThis & {
  __sylphFollowupQueue?: Queue<FollowupJobData>;
  __sylphLegacyFollowupQueue?: Queue<FollowupJobData>;
};

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  backoff: {
    type: "exponential",
    delay: 5000,
  },
});

export const initFollowupQueues = () => {
  if (!globalForFollowupQueue.__sylphFollowupQueue) {
    globalForFollowupQueue.__sylphFollowupQueue = createResilientQueue(
      new Queue<FollowupJobData>(FOLLOWUP_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        prefix: "sylph",
        defaultJobOptions,
      }),
      FOLLOWUP_QUEUE_NAME
    );
  }

  if (
    LEGACY_FOLLOWUP_QUEUE_NAME !== FOLLOWUP_QUEUE_NAME &&
    !globalForFollowupQueue.__sylphLegacyFollowupQueue
  ) {
    globalForFollowupQueue.__sylphLegacyFollowupQueue = createResilientQueue(
      new Queue<FollowupJobData>(LEGACY_FOLLOWUP_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        prefix: "sylph",
        defaultJobOptions,
      }),
      LEGACY_FOLLOWUP_QUEUE_NAME
    );
  }

  return getFollowupQueues();
};

export const getFollowupQueue = () => {
  if (!globalForFollowupQueue.__sylphFollowupQueue) {
    initFollowupQueues();
  }

  return globalForFollowupQueue.__sylphFollowupQueue!;
};

export const getLegacyFollowupQueue = () => {
  if (LEGACY_FOLLOWUP_QUEUE_NAME === FOLLOWUP_QUEUE_NAME) {
    return getFollowupQueue();
  }

  if (!globalForFollowupQueue.__sylphLegacyFollowupQueue) {
    initFollowupQueues();
  }

  return globalForFollowupQueue.__sylphLegacyFollowupQueue!;
};

export const getFollowupQueues = () =>
  LEGACY_FOLLOWUP_QUEUE_NAME === FOLLOWUP_QUEUE_NAME
    ? [getFollowupQueue()]
    : [getFollowupQueue(), getLegacyFollowupQueue()];

export const scheduleFollowups = async (
  leadId: string,
  options?: {
    trigger?: SalesFollowupTrigger;
  }
) => {
  if (!leadId) return;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { stage: true },
  });

  if (!lead || lead.stage === "CLOSED") return;

  const schedule = await getSalesFollowupSchedule(leadId, options);
  const controlState = await getLeadControlAuthority({
    leadId,
  });
  const queue = getFollowupQueue();
  const legacyQueue = getLegacyFollowupQueue();

  for (const item of schedule) {
    const jobId = `followup:${leadId}:${item.step}`;

    const existingJob =
      (await queue.getJob(jobId)) ||
      (await legacyQueue.getJob(jobId));

    if (existingJob) {
      await existingJob.remove().catch(() => undefined);
    }

    await queue.add(
      "sendFollowup",
      {
        leadId,
        type: item.step,
        trigger: item.trigger,
        scheduledFor: new Date(Date.now() + item.delayMs).toISOString(),
        cancelTokenVersion: controlState?.cancelTokenVersion ?? 0,
      },
      {
        jobId,
        ...buildQueueJobOptions({
          delay: item.delayMs,
        }),
      }
    );
  }

  console.log("Followups scheduled for lead", leadId);
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

  const queue = getFollowupQueue();
  const legacyQueue = getLegacyFollowupQueue();

  for (const jobId of jobIds) {
    try {
      const job = (await queue.getJob(jobId)) || (await legacyQueue.getJob(jobId));

      if (job) {
        await job.remove().catch(() => undefined);
      }
    } catch (err) {
      console.log("Followup removal error", err);
    }
  }

  console.log("Followups cancelled for lead", leadId);
};

export const closeFollowupQueue = async () => {
  await Promise.allSettled(
    [
      globalForFollowupQueue.__sylphFollowupQueue,
      globalForFollowupQueue.__sylphLegacyFollowupQueue,
    ]
      .filter(Boolean)
      .map((queue) => queue!.close())
  );
  globalForFollowupQueue.__sylphFollowupQueue = undefined;
  globalForFollowupQueue.__sylphLegacyFollowupQueue = undefined;
};
