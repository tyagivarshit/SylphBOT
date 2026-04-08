"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementRate = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const incrementRate = async (key, limit, windowSec = 60) => {
    const redisKey = `rate:${key}`;
    const current = await redis_1.default.incr(redisKey);
    if (current === 1) {
        await redis_1.default.expire(redisKey, windowSec);
    }
    if (current > limit) {
        throw new Error("RATE_LIMIT_EXCEEDED");
    }
    return {
        current,
        remaining: Math.max(limit - current, 0),
    };
};
exports.incrementRate = incrementRate;
