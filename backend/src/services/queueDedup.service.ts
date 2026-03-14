import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string);

const PREFIX = "queue_dedup";

const TTL = 60; // seconds

export const isDuplicateJob = async (
  jobId: string
) => {

  const key = `${PREFIX}:${jobId}`;

  const exists = await redis.get(key);

  if (exists) {
    return true;
  }

  await redis.set(key, "1", "EX", TTL);

  return false;

};