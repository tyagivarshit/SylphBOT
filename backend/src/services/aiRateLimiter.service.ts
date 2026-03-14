import { incrementRate } from "../redis/rateLimiter.redis";
import logger from "../utils/logger";

const PLATFORM_LIMITS: Record<string, number> = {
  INSTAGRAM: 25,
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

  try {

    /* BASIC VALIDATION */

    if (!businessId || !leadId) {
      return { blocked: false };
    }

    /* NORMALIZE PLATFORM */

    const normalizedPlatform = (platform || "UNKNOWN").toUpperCase();

    const limit = PLATFORM_LIMITS[normalizedPlatform] || 20;

    /* REDIS COUNTER */

    const current = await incrementRate(
      businessId,
      leadId,
      normalizedPlatform,
      60 // ⬅️ 60 second window
    );

    logger.info(
      {
        businessId,
        leadId,
        platform: normalizedPlatform,
        current,
        limit,
      },
      "AI RATE LIMIT CHECK"
    );

    /* BLOCK CONDITION */

    if (current > limit) {

      logger.warn(
        {
          businessId,
          leadId,
          platform: normalizedPlatform,
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

  } catch (error) {

    logger.error(
      {
        businessId,
        leadId,
        platform,
        error,
      },
      "AI RATE LIMIT ERROR"
    );

    /* FAIL SAFE */

    return {
      blocked: false,
    };

  }

};