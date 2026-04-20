import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import { buildQueueJobOptions } from "./queue.defaults";
export const funnelQueue = new Queue("funnelQueue", {
  connection: getQueueRedisConnection(),
  prefix: "sylph",
  defaultJobOptions: buildQueueJobOptions(),
});
