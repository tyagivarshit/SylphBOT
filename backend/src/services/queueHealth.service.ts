import type { Queue } from "bullmq";
import { getAIQueues } from "../queues/ai.queue";
import { authEmailQueue } from "../queues/authEmail.queue";
import { automationQueue } from "../queues/automation.queue";
import { bookingReminderQueue } from "../queues/bookingReminder.queue";
import { followupQueue } from "../queues/followup.queue";
import { funnelQueue } from "../queues/funnel.queue";

export type QueueHealthSnapshot = {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
};

const QUEUE_HEALTH_CACHE_TTL_MS = 5000;

type QueueHealthCacheState = {
  value?: QueueHealthSnapshot[];
  expiresAt: number;
  promise?: Promise<QueueHealthSnapshot[]>;
};

const queueHealthCache: QueueHealthCacheState = {
  expiresAt: 0,
};

const getQueueSnapshot = async (
  queue: Queue
): Promise<QueueHealthSnapshot> => {
  const counts = await queue.getJobCounts("wait", "active", "failed", "delayed");

  return {
    name: queue.name,
    waiting: counts.wait ?? 0,
    active: counts.active ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
};

const getAllQueues = () => [
  ...getAIQueues(),
  followupQueue,
  automationQueue,
  bookingReminderQueue,
  authEmailQueue,
  funnelQueue,
];

const loadQueueHealth = async () =>
  Promise.all(getAllQueues().map(getQueueSnapshot));

export const getQueueHealth = async () => {
  const now = Date.now();

  if (queueHealthCache.value && queueHealthCache.expiresAt > now) {
    return queueHealthCache.value;
  }

  if (queueHealthCache.promise) {
    return queueHealthCache.promise;
  }

  queueHealthCache.promise = loadQueueHealth()
    .then((snapshot) => {
      queueHealthCache.value = snapshot;
      queueHealthCache.expiresAt = Date.now() + QUEUE_HEALTH_CACHE_TTL_MS;
      return snapshot;
    })
    .finally(() => {
      queueHealthCache.promise = undefined;
    });

  return queueHealthCache.promise;
};
