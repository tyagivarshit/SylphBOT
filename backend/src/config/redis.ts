import { Redis } from "ioredis";
import { RedisOptions } from "bullmq";

/* BullMQ connection */

export const redisConnection: RedisOptions | undefined = process.env.REDIS_URL
  ? {
      host: new URL(process.env.REDIS_URL).hostname,
      port: Number(new URL(process.env.REDIS_URL).port),
    }
  : undefined;

/* Redis client */

export let redis: Redis | undefined;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
}