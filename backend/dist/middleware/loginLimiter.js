"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginLimiter = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const logger_1 = __importDefault(require("../utils/logger"));
const WINDOW = 60 * 15; // 15 min
const MAX_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 20;
/* ======================================
UTILS
====================================== */
const getIP = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    "unknown";
const getEmail = (req) => req.body?.email?.toLowerCase().trim() || "unknown";
/* ======================================
CORE LIMITER LOGIC
====================================== */
const checkLimit = async (key, limit) => {
    const now = Date.now();
    const multi = redis_1.default.multi();
    multi.zremrangebyscore(key, 0, now - WINDOW * 1000);
    multi.zadd(key, now, `${now}-${Math.random()}`);
    multi.zcard(key);
    multi.expire(key, WINDOW);
    const [, , count] = (await multi.exec());
    const attempts = count[1];
    return attempts > limit;
};
/* ======================================
LOGIN LIMITER (PRODUCTION GRADE)
====================================== */
const loginLimiter = async (req, res, next) => {
    try {
        const email = getEmail(req);
        const ip = getIP(req);
        const emailIPKey = `login:limit:${email}:${ip}`;
        const ipKey = `login:limit:ip:${ip}`;
        /* ======================================
        CHECK LIMITS
        ====================================== */
        const [isEmailBlocked, isIPBlocked] = await Promise.all([
            checkLimit(emailIPKey, MAX_ATTEMPTS),
            checkLimit(ipKey, MAX_IP_ATTEMPTS),
        ]);
        if (isEmailBlocked || isIPBlocked) {
            const ttl = await redis_1.default.ttl(emailIPKey);
            const retryAfter = ttl > 0 ? ttl : WINDOW;
            logger_1.default.warn({
                email,
                ip,
                isEmailBlocked,
                isIPBlocked,
                retryAfter,
            }, "Login rate limited");
            return res.status(429).json({
                success: false,
                message: "Too many attempts. Please try again later.",
                retryAfter,
            });
        }
        next();
    }
    catch (err) {
        logger_1.default.error({
            err,
            email: getEmail(req),
            ip: getIP(req),
        }, "Login limiter failed open");
        next(); // fail open
    }
};
exports.loginLimiter = loginLimiter;
