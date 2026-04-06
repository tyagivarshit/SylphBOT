import { Queue } from "bullmq";

import redis from "../config/redis";
const aiQueue = new Queue("aiQueue", {
  connection: redis,
});

export const getQueueHealth = async () => {

  const waiting = await aiQueue.getWaitingCount();
  const active = await aiQueue.getActiveCount();
  const delayed = await aiQueue.getDelayedCount();
  const failed = await aiQueue.getFailedCount();

  return {
    waiting,
    active,
    delayed,
    failed,
  };

};