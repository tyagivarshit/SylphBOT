"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPlatformRateLimit = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const WINDOW_SECONDS = 60;
const LIMITS = {
    WHATSAPP: 20,
    INSTAGRAM: 15,
};
const checkPlatformRateLimit = async ({ businessId, leadId, platform, }) => {
    try {
        const limit = LIMITS[platform] || 10;
        const key = `rate:${platform}:${businessId}:${leadId}`;
        const current = await redis_1.default?.incr(key);
        if (current === 1) {
            await redis_1.default?.expire(key, WINDOW_SECONDS);
        }
        if (current && current > limit) {
            return {
                blocked: true,
                remaining: 0,
            };
        }
        return {
            blocked: false,
            remaining: limit - (current || 0),
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
