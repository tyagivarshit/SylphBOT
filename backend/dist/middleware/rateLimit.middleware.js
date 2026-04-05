"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalLimiter = exports.aiLimiter = exports.authLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limit_redis_1 = require("rate-limit-redis");
const redis_1 = require("../config/redis");
/* ======================================
CONFIG
====================================== */
const isProd = process.env.NODE_ENV === "production";
/* ======================================
🔥 CREATE SEPARATE STORE (FIX)
====================================== */
const createStore = (prefix) => new rate_limit_redis_1.RedisStore({
    sendCommand: (...args) => redis_1.redis.call(...args),
    prefix, // 🔥 IMPORTANT (unique per limiter)
});
/* ======================================
KEY GENERATOR
====================================== */
const getIP = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown";
const keyGenerator = (req) => {
    if (req.user?.businessId) {
        return `biz_${req.user.businessId}`;
    }
    return `ip_${getIP(req)}`;
};
/* ======================================
HANDLER
====================================== */
const handler = (_req, res) => {
    return res.status(429).json({
        success: false,
        code: "RATE_LIMIT",
        message: "Too many requests. Please try again later.",
    });
};
/* ======================================
AUTH LIMITER
====================================== */
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("auth"), // 🔥 FIX
    skipSuccessfulRequests: true,
    handler,
});
/* ======================================
AI LIMITER
====================================== */
exports.aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: isProd ? 30 : 100,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("ai"), // 🔥 FIX
    handler,
});
/* ======================================
GLOBAL LIMITER
====================================== */
exports.globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: isProd ? 100 : 500,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore("global"), // 🔥 FIX
    handler,
});
