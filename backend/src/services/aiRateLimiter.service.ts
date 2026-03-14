import { incrementRate } from "../redis/rateLimiter.redis";
import logger from "../utils/logger";

const PLATFORM_LIMITS: Record<string, number> = {
  INSTAGRAM: 15,
  WHATSAPP: 40,
};

interface RateInput {
  businessId: string;
  leadId: string;
  platform: string;
}

export const checkAIRateLimit = async ({
  businessId,
  leadId,
  platform,
}: RateInput) => {

  const limit = PLATFORM_LIMITS[platform] || 10;

  /* PLATFORM SPECIFIC REDIS COUNTER */

  const current = await incrementRate(
    businessId,
    leadId,
    platform, // 👈 important fix
    30
  );

  if (current > limit) {

    logger.warn(
      {
        businessId,
        leadId,
        platform,
        current,
        limit,
      },
      "AI RATE LIMIT TRIGGERED"
    );

    return {
      blocked: true,
      reason: "RATE_LIMIT",
      limit,
      current,
    };

  }

  return {
    blocked: false,
    limit,
    current,
  };

};