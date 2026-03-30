import { incrementRate } from "../redis/rateLimiter.redis";
import logger from "../utils/logger";

const PLATFORM_LIMITS: Record<string, number> = {
  INSTAGRAM: 20,
  WHATSAPP: 30,
};

const BUSINESS_LIMIT_PER_MIN = 120; // 🔥 global safety

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
    if (!businessId || !leadId) {
      return { blocked: false };
    }

    const normalizedPlatform = (platform || "UNKNOWN").toUpperCase();

    const limit = PLATFORM_LIMITS[normalizedPlatform] || 15;

    /* ============================= */
    /* PER-LEAD LIMIT */
    /* ============================= */

    const leadCount = await incrementRate(
      businessId,
      leadId,
      normalizedPlatform,
      60
    );

    /* ============================= */
    /* BUSINESS LEVEL LIMIT */
    /* ============================= */

    const businessCount = await incrementRate(
      businessId,
      "GLOBAL",
      normalizedPlatform,
      60
    );

    logger.info(
      {
        businessId,
        leadId,
        platform: normalizedPlatform,
        leadCount,
        businessCount,
        limit,
      },
      "AI RATE LIMIT CHECK"
    );

    /* ============================= */
    /* BLOCK CONDITIONS */
    /* ============================= */

    if (leadCount > limit) {
      logger.warn(
        { businessId, leadId, leadCount, limit },
        "LEAD RATE LIMIT TRIGGERED"
      );

      return {
        blocked: true,
        reason: "LEAD_RATE_LIMIT",
      };
    }

    if (businessCount > BUSINESS_LIMIT_PER_MIN) {
      logger.error(
        { businessId, businessCount },
        "BUSINESS RATE LIMIT TRIGGERED"
      );

      return {
        blocked: true,
        reason: "BUSINESS_RATE_LIMIT",
      };
    }

    return {
      blocked: false,
      leadCount,
      businessCount,
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

    return { blocked: false };
  }
};