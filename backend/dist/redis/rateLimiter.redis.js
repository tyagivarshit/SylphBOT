"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAllRates = exports.resetRate = exports.getRate = exports.incrementRate = exports.getRateKey = exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
exports.redis = new ioredis_1.default(process.env.REDIS_URL, {
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
const getRateKey = (businessId, leadId, platform) => {
    return platform
        ? `${PREFIX}:${platform}:${businessId}:${leadId}`
        : `${PREFIX}:${businessId}:${leadId}`;
};
exports.getRateKey = getRateKey;
/* ======================================
INCREMENT (ATOMIC + SAFE)
====================================== */
const incrementRate = async (businessId, leadId, platform, windowSeconds = 60) => {
    const key = (0, exports.getRateKey)(businessId, leadId, platform);
    try {
        const multi = exports.redis.multi();
        multi.incr(key);
        multi.ttl(key);
        const [[, count], [, ttl]] = (await multi.exec());
        if (ttl === -1) {
            await exports.redis.expire(key, windowSeconds);
        }
        return count;
    }
    catch {
        return 0;
    }
};
exports.incrementRate = incrementRate;
/* ======================================
GET RATE
====================================== */
const getRate = async (businessId, leadId, platform) => {
    const key = (0, exports.getRateKey)(businessId, leadId, platform);
    try {
        const value = await exports.redis.get(key);
        return Number(value || 0);
    }
    catch {
        return 0;
    }
};
exports.getRate = getRate;
/* ======================================
RESET RATE
====================================== */
const resetRate = async (businessId, leadId, platform) => {
    const key = (0, exports.getRateKey)(businessId, leadId, platform);
    try {
        await exports.redis.del(key);
    }
    catch { }
};
exports.resetRate = resetRate;
/* ======================================
CLEAR ALL (SAFE SCAN)
====================================== */
const clearAllRates = async () => {
    try {
        const stream = exports.redis.scanStream({
            match: `${PREFIX}:*`,
            count: 100,
        });
        const pipeline = exports.redis.pipeline();
        stream.on("data", (keys) => {
            if (keys.length) {
                keys.forEach((key) => pipeline.del(key));
            }
        });
        return new Promise((resolve, reject) => {
            stream.on("end", async () => {
                await pipeline.exec();
                resolve();
            });
            stream.on("error", reject);
        });
    }
    catch { }
};
exports.clearAllRates = clearAllRates;
