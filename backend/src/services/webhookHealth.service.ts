import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string);

const PREFIX = "webhook_errors";

export const logWebhookFailure = async (
  platform: string
) => {

  const key = `${PREFIX}:${platform}`;

  await redis.incr(key);

};

export const getWebhookFailures = async (
  platform: string
) => {

  const key = `${PREFIX}:${platform}`;

  const value = await redis.get(key);

  return Number(value || 0);

};