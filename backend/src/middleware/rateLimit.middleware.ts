import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import {
  getResilientSharedRedisConnection,
  isRedisHealthy,
  isRedisWritable,
} from "../config/redis";
import { isRedisCircuitOpen } from "../redis/redisSafety";

const isProd = process.env.NODE_ENV === "production";
const buildFallbackRateLimitResult = () => [1, Date.now() + 60000] as const;

const createStore = (prefix: string) =>
  new RedisStore({
    sendCommand: async (...args: any[]) => {
      const command = String(args?.[0] || "").toUpperCase();
      const subcommand = String(args?.[1] || "").toUpperCase();

      if (!isRedisWritable()) {
        if (command === "SCRIPT" && subcommand === "LOAD") {
          return "redis_not_writable_script_stub";
        }
        return [...buildFallbackRateLimitResult()];
      }

      try {
        const result = await (getResilientSharedRedisConnection() as any).call(...args);
        if (command === "SCRIPT" && subcommand === "LOAD") {
          return result || "redis_not_writable_script_stub";
        }
        if (result === null || result === undefined || !Array.isArray(result)) {
          return [...buildFallbackRateLimitResult()];
        }
        return result;
      } catch (error) {
        if (command === "SCRIPT" && subcommand === "LOAD") {
          return "redis_not_writable_script_stub";
        }
        return [...buildFallbackRateLimitResult()];
      }
    },
    prefix,
  });

const getIP = (req: any) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket?.remoteAddress ||
  req.ip ||
  "unknown";

const keyGenerator = (req: any) => {
  if (req.user?.id) {
    return `user_${req.user.id}`;
  }

  if (req.user?.businessId) {
    return `biz_${req.user.businessId}`;
  }

  return `ip_${getIP(req)}`;
};

const securityKeyGenerator = (req: any) =>
  req.user?.id ? `security_user_${req.user.id}` : `security_ip_${getIP(req)}`;

const handler = (_req: any, res: any) =>
  res.status(429).json({
    success: false,
    code: "RATE_LIMIT",
    message: "Too many requests. Please try again later.",
  });

const isCheckoutOrBillingRoute = (req: any): boolean => {
  if (!req) return false;
  const path = String(req.originalUrl || req.path || req.url || "").trim().toLowerCase();
  const isCheckoutPath =
    path.startsWith("/api/billing") ||
    path.includes("/checkout") ||
    path.includes("/plans") ||
    String(req.query?.surface || "").trim().toLowerCase() === "checkout";
  return isCheckoutPath;
};

const shouldSkipRedisRateLimit = (req?: any) => {
  if (req && isCheckoutOrBillingRoute(req)) {
    return true;
  }
  return isRedisCircuitOpen() || !isRedisHealthy() || !isRedisWritable();
};

export const __rateLimitTestInternals = {
  shouldSkipRedisRateLimit,
};

export const authLimiter = rateLimit({
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

export const aiLimiter = rateLimit({
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

export const globalLimiter = rateLimit({
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

export const securityLimiter = rateLimit({
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

export const userActionLimiter = rateLimit({
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

export const executiveLimiter = rateLimit({
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
