import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
export const funnelQueue = new Queue("funnelQueue", {
  connection: getQueueRedisConnection(),
  prefix: "sylph",
});
