import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL as string);

const PREFIX = "ai_rate_limit";

/* -------------------------------------------------- */
/* RATE LIMIT KEY */
/* -------------------------------------------------- */

export const getRateKey = (
  businessId: string,
  leadId: string,
  platform?: string
) => {

  if (platform) {
    return `${PREFIX}:${businessId}:${leadId}:${platform}`;
  }

  return `${PREFIX}:${businessId}:${leadId}`;

};

/* -------------------------------------------------- */
/* INCREMENT RATE */
/* -------------------------------------------------- */

export const incrementRate = async (
  businessId: string,
  leadId: string,
  platform?: string,
  windowSeconds = 60
) => {

  const key = getRateKey(businessId, leadId, platform);

  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  return count;

};

/* -------------------------------------------------- */
/* GET CURRENT RATE */
/* -------------------------------------------------- */

export const getRate = async (
  businessId: string,
  leadId: string,
  platform?: string
) => {

  const key = getRateKey(businessId, leadId, platform);

  const value = await redis.get(key);

  return Number(value || 0);

};