import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

const aiQueue = new Queue("aiQueue", {
  connection: redisConnection,
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