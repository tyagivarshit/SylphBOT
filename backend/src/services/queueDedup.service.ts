import redis from "../config/redis";
import {
  IDEMPOTENCY_TTL_SECONDS,
  buildIdempotencyRedisKey,
} from "./redisState.service";

export const isDuplicateJob = async (
  jobId: string
) => {
  const key = buildIdempotencyRedisKey(`queue:${jobId}`);

  const exists = await redis.get(key);

  if (exists) {
    return true;
  }

  await redis.set(key, "1", "EX", IDEMPOTENCY_TTL_SECONDS);

  return false;

};
