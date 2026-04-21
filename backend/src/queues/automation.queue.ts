import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";


export const automationQueue = createResilientQueue(
  new Queue("automation", {
    connection: getQueueRedisConnection(),
    defaultJobOptions: buildQueueJobOptions(),
  }),
  "automation"
);
