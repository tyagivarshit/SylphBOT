"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPlatformRateLimit = void 0;
const redis_1 = require("../config/redis");
const WINDOW_SECONDS = 60; // 1 min window
const LIMITS = {
    WHATSAPP: 20,
    INSTAGRAM: 15,
};
const checkPlatformRateLimit = async ({ businessId, leadId, platform, }) => {
    try {
        const limit = LIMITS[platform] || 10;
        const key = `rate:${platform}:${businessId}:${leadId}`;
        const current = await redis_1.redisConnection.incr(key);
        if (current === 1) {
            await redis_1.redisConnection.expire(key, WINDOW_SECONDS);
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
    }
    catch (error) {
        console.error("RATE LIMIT ERROR:", error);
        return {
            blocked: false,
            remaining: 0,
        };
    }
};
exports.checkPlatformRateLimit = checkPlatformRateLimit;
