import { redis } from "../config/redis";

export const incrementRate = async (
  key: string,
  limit: number,
  windowSec = 60
) => {
  const redisKey = `rate:${key}`;

  const current = await redis.incr(redisKey);

  if (current === 1) {
    await redis.expire(redisKey, windowSec);
  }

  if (current > limit) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  return {
    current,
    remaining: Math.max(limit - current, 0),
  };
};