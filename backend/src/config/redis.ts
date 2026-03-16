import { Redis } from "ioredis";
import { RedisOptions } from "bullmq";

/* BullMQ connection */

export const redisConnection: RedisOptions = {
  url: process.env.REDIS_URL,
};

/* Redis client for rate limits, cache, etc */

export const redis = new Redis(process.env.REDIS_URL as string);