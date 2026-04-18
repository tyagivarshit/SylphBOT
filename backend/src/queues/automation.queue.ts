import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";


export const automationQueue = new Queue("automation", {
  connection: getQueueRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: true,
    removeOnFail: true,
  },
});
