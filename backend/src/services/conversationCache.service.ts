import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

const CACHE_TTL = 60 * 60; // 1 hour

/* ----------------------------------
GET CACHE
---------------------------------- */

export const getConversationCache = async (leadId: string) => {

  try {

    const key = `sylph:conversation:${leadId}`;

    const data = await redis.get(key);

    if (!data) return null;

    return JSON.parse(data);

  } catch (error) {

    console.error("Redis get cache error:", error);

    return null;

  }

};

/* ----------------------------------
SET CACHE
---------------------------------- */

export const setConversationCache = async (
  leadId: string,
  payload: any
) => {

  try {

    const key = `sylph:conversation:${leadId}`;

    await redis.set(
      key,
      JSON.stringify(payload),
      "EX",
      CACHE_TTL
    );

  } catch (error) {

    console.error("Redis set cache error:", error);

  }

};

/* ----------------------------------
DELETE CACHE
---------------------------------- */

export const deleteConversationCache = async (leadId: string) => {

  try {

    const key = `sylph:conversation:${leadId}`;

    await redis.del(key);

  } catch (error) {

    console.error("Redis delete cache error:", error);

  }

};