import { Queue } from "bullmq";
import redis from "../config/redis";
export const funnelQueue = new Queue("funnelQueue", {
  connection: redis,
  prefix: "sylph",
});