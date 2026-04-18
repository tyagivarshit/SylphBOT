import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
export const funnelQueue = new Queue("funnelQueue", {
  connection: getQueueRedisConnection(),
  prefix: "sylph",
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: true,
    removeOnFail: true,
  },
});
