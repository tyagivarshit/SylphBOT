import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const funnelQueue = new Queue("funnelQueue", {
  connection: redisConnection,
  prefix: "sylph",
});