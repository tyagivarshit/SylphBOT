"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userActionLimiter = exports.securityLimiter = exports.globalLimiter = exports.aiLimiter = exports.authLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limit_redis_1 = __importDefault(require("rate-limit-redis"));
const redis_1 = require("../config/redis");
const redisSafety_1 = require("../redis/redisSafety");
const isProd = process.env.NODE_ENV === "production";
const createStore = (prefix) => new rate_limit_redis_1.default({
    sendCommand: (...args) => (0, redis_1.getSharedRedisConnection)().call(...args),
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
const shouldSkipRedisRateLimit = () => (0, redisSafety_1.isRedisCircuitOpen)() || !(0, redis_1.isRedisHealthy)();
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
