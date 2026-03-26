import { redisConnection } from "../config/redis";

interface RateLimitResult {
  blocked: boolean;
  remaining: number;
}

const WINDOW_SECONDS = 60; // 1 min window
const LIMITS = {
  WHATSAPP: 20,
  INSTAGRAM: 15,
};

export const checkPlatformRateLimit = async ({
  businessId,
  leadId,
  platform,
}: {
  businessId: string;
  leadId: string;
  platform: "WHATSAPP" | "INSTAGRAM";
}): Promise<RateLimitResult> => {
  try {
    const limit = LIMITS[platform] || 10;

    const key = `rate:${platform}:${businessId}:${leadId}`;

    const current = await (redisConnection as any).incr(key);

    if (current === 1) {
      await (redisConnection as any).expire(key, WINDOW_SECONDS);
    }

    if (current > limit) {
      return {
        blocked: true,
        remaining: 0,
      };
    }

    return {
      blocked: false,
      remaining: limit - current,
    };
  } catch (error) {
    console.error("RATE LIMIT ERROR:", error);

    return {
      blocked: false,
      remaining: 0,
    };
  }
};