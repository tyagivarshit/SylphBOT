import { Redis } from "ioredis";
import { RedisOptions } from "bullmq";

/* BullMQ connection */

export const redisConnection: RedisOptions = {
  host: "127.0.0.1",
  port: 6379,
};

/* Redis client for rate limits, cache, etc */

export const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,
});