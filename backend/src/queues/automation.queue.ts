import { Queue } from "bullmq";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string);

export const automationQueue = new Queue("automation", {
  connection: redis,
});