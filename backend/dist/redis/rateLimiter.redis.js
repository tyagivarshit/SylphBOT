"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeBusinessMessageMinuteRate = exports.consumeBusinessAIHourlyRate = exports.incrementDailyAIUsage = exports.clearAllRates = exports.resetRate = exports.getRate = exports.incrementRate = exports.buildMessageRateKey = exports.buildAIRateKey = exports.buildAIUsageKey = exports.getRateKey = exports.getRedisMinuteKey = exports.getRedisHourKey = exports.getRedisDateKey = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const redisSafety_1 = require("./redisSafety");
/* ======================================
CONFIG
====================================== */
const LEGACY_RATE_PREFIX = "ai_rate_limit";
const AI_USAGE_TTL_SECONDS = 24 * 60 * 60;
const AI_HOURLY_RATE_TTL_SECONDS = 60 * 60;
const MESSAGE_MINUTE_RATE_TTL_SECONDS = 60;
/* ======================================
TIME KEYS
====================================== */
const pad = (value) => String(value).padStart(2, "0");
const getRedisDateKey = (date = new Date()) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
exports.getRedisDateKey = getRedisDateKey;
const getRedisHourKey = (date = new Date()) => `${(0, exports.getRedisDateKey)(date)}:${pad(date.getUTCHours())}`;
exports.getRedisHourKey = getRedisHourKey;
const getRedisMinuteKey = (date = new Date()) => `${(0, exports.getRedisHourKey)(date)}:${pad(date.getUTCMinutes())}`;
exports.getRedisMinuteKey = getRedisMinuteKey;
/* ======================================
KEY BUILDERS
====================================== */
const getRateKey = (businessId, leadId, platform) => platform
    ? `${LEGACY_RATE_PREFIX}:${platform}:${businessId}:${leadId}`
    : `${LEGACY_RATE_PREFIX}:${businessId}:${leadId}`;
exports.getRateKey = getRateKey;
const buildAIUsageKey = (businessId, dateKey = (0, exports.getRedisDateKey)()) => `ai:usage:${businessId}:${dateKey}`;
exports.buildAIUsageKey = buildAIUsageKey;
const buildAIRateKey = (businessId, hourKey = (0, exports.getRedisHourKey)()) => `ai:rate:${businessId}:${hourKey}`;
exports.buildAIRateKey = buildAIRateKey;
const buildMessageRateKey = (businessId, minuteKey = (0, exports.getRedisMinuteKey)()) => `msg:rate:${businessId}:${minuteKey}`;
exports.buildMessageRateKey = buildMessageRateKey;
/* ======================================
LUA HELPERS
====================================== */
const incrementWithTtlScript = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local current = redis.call('INCR', key)
local keyTtl = redis.call('TTL', key)

if keyTtl < 0 then
  redis.call('EXPIRE', key, ttl)
  keyTtl = ttl
end

return {current, keyTtl}
`;
const consumeWindowScript = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', key) or '0')
local keyTtl = redis.call('TTL', key)

if keyTtl < 0 and current > 0 then
  redis.call('EXPIRE', key, ttl)
  keyTtl = ttl
end

if current >= limit then
  if keyTtl < 0 then
    keyTtl = ttl
  end

  return {0, current, keyTtl}
end

local nextCount = redis.call('INCR', key)

if nextCount == 1 then
  redis.call('EXPIRE', key, ttl)
  keyTtl = ttl
else
  keyTtl = redis.call('TTL', key)
  if keyTtl < 0 then
    redis.call('EXPIRE', key, ttl)
    keyTtl = ttl
  end
end

return {1, nextCount, keyTtl}
`;
const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const incrementExpiringCounter = async (key, ttlSeconds) => {
    return (0, redisSafety_1.safeRedisCall)(async () => {
        const raw = (await redis_1.default.eval(incrementWithTtlScript, 1, key, String(ttlSeconds)));
        return {
            count: toNumber(raw?.[0]),
            ttlSeconds: Math.max(toNumber(raw?.[1]), ttlSeconds),
        };
    }, () => ({
        count: 0,
        ttlSeconds,
    }), {
        operation: "redis.rateLimiter.incrementExpiringCounter",
    });
};
const consumeRateWindow = async (key, limit, ttlSeconds) => {
    if (limit <= 0) {
        return {
            allowed: false,
            count: 0,
            ttlSeconds,
        };
    }
    return (0, redisSafety_1.safeRedisCall)(async () => {
        const raw = (await redis_1.default.eval(consumeWindowScript, 1, key, String(ttlSeconds), String(limit)));
        return {
            allowed: toNumber(raw?.[0]) === 1,
            count: toNumber(raw?.[1]),
            ttlSeconds: Math.max(toNumber(raw?.[2]), ttlSeconds),
        };
    }, () => ({
        allowed: true,
        count: 0,
        ttlSeconds,
    }), {
        operation: "redis.rateLimiter.consumeRateWindow",
    });
};
/* ======================================
LEGACY API
====================================== */
const incrementRate = async (businessId, leadId, platform, windowSeconds = 60) => {
    const key = (0, exports.getRateKey)(businessId, leadId, platform);
    try {
        const result = await incrementExpiringCounter(key, windowSeconds);
        return result.count;
    }
    catch {
        return 0;
    }
};
exports.incrementRate = incrementRate;
const getRate = async (businessId, leadId, platform) => {
    const key = (0, exports.getRateKey)(businessId, leadId, platform);
    const value = await (0, redisSafety_1.safeRedisCall)(() => redis_1.default.get(key), null, {
        operation: "redis.rateLimiter.getRate",
    });
    return Number(value || 0);
};
exports.getRate = getRate;
const resetRate = async (businessId, leadId, platform) => {
    const key = (0, exports.getRateKey)(businessId, leadId, platform);
    await (0, redisSafety_1.safeRedisCall)(() => redis_1.default.del(key), 0, {
        operation: "redis.rateLimiter.resetRate",
    });
};
exports.resetRate = resetRate;
const clearAllRates = async () => {
    await (0, redisSafety_1.safeRedisCall)(async () => {
        const stream = redis_1.default.scanStream({
            match: `${LEGACY_RATE_PREFIX}:*`,
            count: 100,
        });
        const pipeline = redis_1.default.pipeline();
        stream.on("data", (keys) => {
            if (keys.length) {
                keys.forEach((key) => pipeline.del(key));
            }
        });
        await new Promise((resolve, reject) => {
            stream.on("end", () => {
                void pipeline
                    .exec()
                    .then(() => resolve())
                    .catch(reject);
            });
            stream.on("error", reject);
        });
    }, undefined, {
        operation: "redis.rateLimiter.clearAllRates",
    });
};
exports.clearAllRates = clearAllRates;
/* ======================================
SCALING HELPERS
====================================== */
const incrementDailyAIUsage = async (businessId) => incrementExpiringCounter((0, exports.buildAIUsageKey)(businessId), AI_USAGE_TTL_SECONDS);
exports.incrementDailyAIUsage = incrementDailyAIUsage;
const consumeBusinessAIHourlyRate = async (businessId, limit) => consumeRateWindow((0, exports.buildAIRateKey)(businessId), limit, AI_HOURLY_RATE_TTL_SECONDS);
exports.consumeBusinessAIHourlyRate = consumeBusinessAIHourlyRate;
const consumeBusinessMessageMinuteRate = async (businessId, limit) => consumeRateWindow((0, exports.buildMessageRateKey)(businessId), limit, MESSAGE_MINUTE_RATE_TTL_SECONDS);
exports.consumeBusinessMessageMinuteRate = consumeBusinessMessageMinuteRate;
