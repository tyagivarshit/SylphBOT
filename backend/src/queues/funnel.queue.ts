import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

export const funnelQueue = createResilientQueue(
  new Queue("funnelQueue", {
    connection: getQueueRedisConnection(),
    prefix: "sylph",
    defaultJobOptions: buildQueueJobOptions(),
  }),
  "funnelQueue"
);
