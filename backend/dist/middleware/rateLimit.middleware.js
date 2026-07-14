"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executiveLimiter = exports.userActionLimiter = exports.securityLimiter = exports.globalLimiter = exports.aiLimiter = exports.authLimiter = exports.__rateLimitTestInternals = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limit_redis_1 = __importDefault(require("rate-limit-redis"));
const redis_1 = require("../config/redis");
const redisSafety_1 = require("../redis/redisSafety");
const isProd = process.env.NODE_ENV === "production";
const buildFallbackRateLimitResult = () => [1, Date.now() + 60000];
const createStore = (prefix) => new rate_limit_redis_1.default({
    sendCommand: async (...args) => {
        const command = String(args?.[0] || "").toUpperCase();
        const subcommand = String(args?.[1] || "").toUpperCase();
        if (!(0, redis_1.isRedisWritable)()) {
            if (command === "SCRIPT" && subcommand === "LOAD") {
                return "redis_not_writable_script_stub";
            }
            return [...buildFallbackRateLimitResult()];
        }
        try {
            const result = await (0, redis_1.getResilientSharedRedisConnection)().call(...args);
            if (command === "SCRIPT" && subcommand === "LOAD") {
                return result || "redis_not_writable_script_stub";
            }
            if (result === null || result === undefined || !Array.isArray(result)) {
                return [...buildFallbackRateLimitResult()];
            }
            return result;
        }
        catch (error) {
            if (command === "SCRIPT" && subcommand === "LOAD") {
                return "redis_not_writable_script_stub";
            }
            return [...buildFallbackRateLimitResult()];
        }
    },
    prefix,
});
const getIP = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown";
const keyGenerator = (req) => {
    if (req.user?.id) {
        return `user_${req.user.id}`;
    }
    if (req.user?.businessId) {
        return `biz_${req.user.businessId}`;
    }
    return `ip_${getIP(req)}`;
};
const securityKeyGenerator = (req) => req.user?.id ? `security_user_${req.user.id}` : `security_ip_${getIP(req)}`;
const handler = (_req, res) => res.status(429).json({
    success: false,
    code: "RATE_LIMIT",
    message: "Too many requests. Please try again later.",
});
const isCheckoutOrBillingRoute = (req) => {
    if (!req)
        return false;
    const path = String(req.originalUrl || req.path || req.url || "").trim().toLowerCase();
    const isCheckoutPath = path.startsWith("/api/billing") ||
        path.includes("/checkout") ||
        path.includes("/plans") ||
        String(req.query?.surface || "").trim().toLowerCase() === "checkout";
    return isCheckoutPath;
};
const shouldSkipRedisRateLimit = (req) => {
    if (req && isCheckoutOrBillingRoute(req)) {
        return true;
    }
    return (0, redisSafety_1.isRedisCircuitOpen)() || !(0, redis_1.isRedisHealthy)() || !(0, redis_1.isRedisWritable)();
};
exports.__rateLimitTestInternals = {
    shouldSkipRedisRateLimit,
};
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("auth"),
    skipSuccessfulRequests: true,
    skip: shouldSkipRedisRateLimit,
    passOnStoreError: true,
    handler,
});
exports.aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: isProd ? 30 : 100,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("ai"),
    skip: shouldSkipRedisRateLimit,
    passOnStoreError: true,
    handler,
});
exports.globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: isProd ? 100 : 500,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("global"),
    skip: shouldSkipRedisRateLimit,
    passOnStoreError: true,
    handler,
});
exports.securityLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: isProd ? 60 : 180,
    keyGenerator: securityKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("security"),
    skip: shouldSkipRedisRateLimit,
    passOnStoreError: true,
    handler,
});
exports.userActionLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: isProd ? 30 : 90,
    keyGenerator: securityKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("user-actions"),
    skip: shouldSkipRedisRateLimit,
    passOnStoreError: true,
    handler,
});
exports.executiveLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: isProd ? 15 : 60,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("executive"),
    skip: shouldSkipRedisRateLimit,
    passOnStoreError: true,
    handler,
});
