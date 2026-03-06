import { RedisOptions } from "bullmq";

export const redisConnection: RedisOptions = {
  url: process.env.REDIS_URL,
};