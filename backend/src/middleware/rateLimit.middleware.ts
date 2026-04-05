import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redis from "../config/redis";

/* ======================================
CONFIG
====================================== */

const isProd = process.env.NODE_ENV === "production";

/* ======================================
🔥 CREATE SEPARATE STORE (FIX)
====================================== */

const createStore = (prefix: string) =>
  new RedisStore({
    sendCommand: (...args: any[]) => (redis as any).call(...args),
    prefix, // 🔥 IMPORTANT (unique per limiter)
  });

/* ======================================
KEY GENERATOR
====================================== */

const getIP = (req: any) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket?.remoteAddress ||
  req.ip ||
  "unknown";

const keyGenerator = (req: any) => {
  if (req.user?.businessId) {
    return `biz_${req.user.businessId}`;
  }
  return `ip_${getIP(req)}`;
};

/* ======================================
HANDLER
====================================== */

const handler = (_req: any, res: any) => {
  return res.status(429).json({
    success: false,
    code: "RATE_LIMIT",
    message: "Too many requests. Please try again later.",
  });
};

/* ======================================
AUTH LIMITER
====================================== */

export const authLimiter = rateLimit({
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

export const aiLimiter = rateLimit({
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

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 100 : 500,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("global"), // 🔥 FIX
  handler,
});