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
    return `${PREFIX}:${platform}:${businessId}:${leadId}`;
  }

  return `${PREFIX}:${businessId}:${leadId}`;

};

/* -------------------------------------------------- */
/* INCREMENT RATE (CORRECT WINDOW LOGIC) */
/* -------------------------------------------------- */

export const incrementRate = async (
  businessId: string,
  leadId: string,
  platform?: string,
  windowSeconds = 60
) => {

  const key = getRateKey(businessId, leadId, platform);

  try {

    const count = await redis.incr(key);

    /* TTL ONLY FIRST TIME */

    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    return count;

  } catch (error) {

    console.error("RATE LIMIT REDIS ERROR:", error);

    /* FAIL SAFE */
    return 0;

  }

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

/* -------------------------------------------------- */
/* RESET RATE (MANUAL UNBLOCK) */
/* -------------------------------------------------- */

export const resetRate = async (
  businessId: string,
  leadId: string,
  platform?: string
) => {

  const key = getRateKey(businessId, leadId, platform);

  await redis.del(key);

};

/* -------------------------------------------------- */
/* CLEAR ALL RATE LIMITS (ADMIN TOOL) */
/* -------------------------------------------------- */

export const clearAllRates = async () => {

  const keys = await redis.keys(`${PREFIX}:*`);

  if (keys.length > 0) {
    await redis.del(keys);
  }

};