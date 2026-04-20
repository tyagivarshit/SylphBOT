import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import { buildQueueJobOptions } from "./queue.defaults";


export const automationQueue = new Queue("automation", {
  connection: getQueueRedisConnection(),
  defaultJobOptions: buildQueueJobOptions(),
});
