import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string);

const PREFIX = "webhook_errors";
const TTL = 60 * 60 * 24; // 24 hours

/* ======================================
KEY WITH TIME BUCKET (🔥 IMPORTANT)
====================================== */

const getKey = (platform: string) => {
  const now = new Date();
  const hour = now.getHours();

  return `${PREFIX}:${platform}:${hour}`;
};

/* ======================================
LOG FAILURE
====================================== */

export const logWebhookFailure = async (
  platform: string
) => {

  const key = getKey(platform);

  const count = await redis.incr(key);

  /* 🔥 SET TTL ONLY ON FIRST HIT */
  if (count === 1) {
    await redis.expire(key, TTL);
  }

  return count;

};

/* ======================================
GET CURRENT HOUR FAILURES
====================================== */

export const getWebhookFailures = async (
  platform: string
) => {

  const key = getKey(platform);

  const value = await redis.get(key);

  return Number(value || 0);

};