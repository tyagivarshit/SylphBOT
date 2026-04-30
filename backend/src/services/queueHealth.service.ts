import type { Queue } from "bullmq";
import { getAIQueues } from "../queues/ai.queue";
import { getAuthEmailQueue } from "../queues/authEmail.queue";
import { getBookingReminderQueue } from "../queues/bookingReminder.queue";
import { getFollowupQueue } from "../queues/followup.queue";
import { getHumanReminderQueues } from "../queues/humanReminder.queue";
import {
  getReceptionRuntimeQueues,
  RECEPTION_RUNTIME_WRITE_ONLY_DLQ_QUEUES,
} from "../queues/receptionRuntime.queue";
import { recordMetricSnapshot } from "./reliability/reliabilityOS.service";

export type QueueHealthSnapshot = {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  class: "operational" | "observability";
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
    class: RECEPTION_RUNTIME_WRITE_ONLY_DLQ_QUEUES.includes(queue.name as any)
      ? "observability"
      : "operational",
  };
};

const getAllQueues = () => [
  ...getAIQueues(),
  getFollowupQueue(),
  getBookingReminderQueue(),
  getAuthEmailQueue(),
  ...getHumanReminderQueues(),
  ...getReceptionRuntimeQueues(),
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
      const waiting = snapshot.reduce(
        (acc, queue) => acc + Math.max(0, Number(queue.waiting || 0)),
        0
      );
      const failed = snapshot.reduce(
        (acc, queue) => acc + Math.max(0, Number(queue.failed || 0)),
        0
      );
      const delayed = snapshot.reduce(
        (acc, queue) => acc + Math.max(0, Number(queue.delayed || 0)),
        0
      );
      const active = snapshot.reduce(
        (acc, queue) => acc + Math.max(0, Number(queue.active || 0)),
        0
      );
      const total = Math.max(1, waiting + failed + delayed + active);

      void recordMetricSnapshot({
        subsystem: "QUEUES",
        queueLag: waiting,
        workerUtilization: active / Math.max(1, waiting + active),
        dlqRate: failed / total,
        retryRate: delayed / total,
        lockContention: 0,
        providerErrorRate: 0,
        metadata: {
          queueCount: snapshot.length,
        },
      }).catch(() => undefined);
      return snapshot;
    })
    .finally(() => {
      queueHealthCache.promise = undefined;
    });

  return queueHealthCache.promise;
};
