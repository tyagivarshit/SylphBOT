import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

/* ======================================
CONFIG
====================================== */

const PREFIX = "ai_rate_limit";

/* ======================================
KEY BUILDER
====================================== */

export const getRateKey = (
  businessId: string,
  leadId: string,
  platform?: string
) => {
  return platform
    ? `${PREFIX}:${platform}:${businessId}:${leadId}`
    : `${PREFIX}:${businessId}:${leadId}`;
};

/* ======================================
INCREMENT (ATOMIC + SAFE)
====================================== */

export const incrementRate = async (
  businessId: string,
  leadId: string,
  platform?: string,
  windowSeconds = 60
) => {
  const key = getRateKey(businessId, leadId, platform);

  try {
    const multi = redis.multi();

    multi.incr(key);
    multi.ttl(key);

    const [[, count], [, ttl]] = (await multi.exec()) as any;

    if (ttl === -1) {
      await redis.expire(key, windowSeconds);
    }

    return count;
  } catch {
    return 0;
  }
};

/* ======================================
GET RATE
====================================== */

export const getRate = async (
  businessId: string,
  leadId: string,
  platform?: string
) => {
  const key = getRateKey(businessId, leadId, platform);

  try {
    const value = await redis.get(key);
    return Number(value || 0);
  } catch {
    return 0;
  }
};

/* ======================================
RESET RATE
====================================== */

export const resetRate = async (
  businessId: string,
  leadId: string,
  platform?: string
) => {
  const key = getRateKey(businessId, leadId, platform);

  try {
    await redis.del(key);
  } catch {}
};

/* ======================================
CLEAR ALL (SAFE SCAN)
====================================== */

export const clearAllRates = async () => {
  try {
    const stream = redis.scanStream({
      match: `${PREFIX}:*`,
      count: 100,
    });

    const pipeline = redis.pipeline();

    stream.on("data", (keys: string[]) => {
      if (keys.length) {
        keys.forEach((key) => pipeline.del(key));
      }
    });

    return new Promise<void>((resolve, reject) => {
      stream.on("end", async () => {
        await pipeline.exec();
        resolve();
      });

      stream.on("error", reject);
    });
  } catch {}
};