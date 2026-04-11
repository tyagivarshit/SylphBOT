import { getAIQueues } from "../queues/ai.queue";
export const getQueueHealth = async () => {
  const aiQueues = getAIQueues();
  const queueStats = await Promise.all(
    aiQueues.map(async (queue) => ({
      name: queue.name,
      waiting: await queue.getWaitingCount(),
      active: await queue.getActiveCount(),
      delayed: await queue.getDelayedCount(),
      failed: await queue.getFailedCount(),
    }))
  );

  const waiting = queueStats.reduce((total, item) => total + item.waiting, 0);
  const active = queueStats.reduce((total, item) => total + item.active, 0);
  const delayed = queueStats.reduce((total, item) => total + item.delayed, 0);
  const failed = queueStats.reduce((total, item) => total + item.failed, 0);

  return {
    waiting,
    active,
    delayed,
    failed,
    partitions: queueStats,
  };

};
