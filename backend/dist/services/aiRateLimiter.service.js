"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAIRateLimit = void 0;
const rateLimiter_redis_1 = require("../redis/rateLimiter.redis");
const logger_1 = __importDefault(require("../utils/logger"));
const PLATFORM_LIMITS = {
    INSTAGRAM: 20,
    WHATSAPP: 30,
};
const BUSINESS_LIMIT_PER_MIN = 120; // 🔥 global safety
const checkAIRateLimit = async ({ businessId, leadId, platform, }) => {
    try {
        if (!businessId || !leadId) {
            return { blocked: false };
        }
        const normalizedPlatform = (platform || "UNKNOWN").toUpperCase();
        const limit = PLATFORM_LIMITS[normalizedPlatform] || 15;
        /* ============================= */
        /* PER-LEAD LIMIT */
        /* ============================= */
        const leadCount = await (0, rateLimiter_redis_1.incrementRate)(businessId, leadId, normalizedPlatform, 60);
        /* ============================= */
        /* BUSINESS LEVEL LIMIT */
        /* ============================= */
        const businessCount = await (0, rateLimiter_redis_1.incrementRate)(businessId, "GLOBAL", normalizedPlatform, 60);
        logger_1.default.info({
            businessId,
            leadId,
            platform: normalizedPlatform,
            leadCount,
            businessCount,
            limit,
        }, "AI RATE LIMIT CHECK");
        /* ============================= */
        /* BLOCK CONDITIONS */
        /* ============================= */
        if (leadCount > limit) {
            logger_1.default.warn({ businessId, leadId, leadCount, limit }, "LEAD RATE LIMIT TRIGGERED");
            return {
                blocked: true,
                reason: "LEAD_RATE_LIMIT",
            };
        }
        if (businessCount > BUSINESS_LIMIT_PER_MIN) {
            logger_1.default.error({ businessId, businessCount }, "BUSINESS RATE LIMIT TRIGGERED");
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
    }
    catch (error) {
        logger_1.default.error({
            businessId,
            leadId,
            platform,
            error,
        }, "AI RATE LIMIT ERROR");
        return { blocked: false };
    }
};
exports.checkAIRateLimit = checkAIRateLimit;
