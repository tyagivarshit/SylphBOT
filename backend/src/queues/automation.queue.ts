import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";


export const automationQueue = new Queue("automation", {
  connection: getQueueRedisConnection(),
});
