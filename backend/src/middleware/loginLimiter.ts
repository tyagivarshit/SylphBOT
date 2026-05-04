import { Request, Response, NextFunction } from "express";
import redis from "../config/redis";
import { isRedisHealthy, isRedisWritable } from "../config/redis";
import logger from "../utils/logger";

const WINDOW = 60 * 15; // 15 min
const MAX_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 20;

/* ======================================
UTILS
====================================== */

const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  "unknown";

const getEmail = (req: Request) =>
  req.body?.email?.toLowerCase().trim() || "unknown";

/* ======================================
CORE LIMITER LOGIC
====================================== */

const checkLimit = async (key: string, limit: number) => {
  const now = Date.now();

  const multi = redis.multi();

  multi.zremrangebyscore(key, 0, now - WINDOW * 1000);
  multi.zadd(key, now, `${now}-${Math.random()}`);
  multi.zcard(key);
  multi.expire(key, WINDOW);

  const [, , count] = (await multi.exec()) as any;
  const attempts = count[1];

  return attempts > limit;
};

/* ======================================
LOGIN LIMITER (PRODUCTION GRADE)
====================================== */

export const loginLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!isRedisHealthy() || !isRedisWritable()) {
      return next();
    }

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
      const ttl = await redis.ttl(emailIPKey);
      const retryAfter = ttl > 0 ? ttl : WINDOW;

      logger.warn(
        {
          email,
          ip,
          isEmailBlocked,
          isIPBlocked,
          retryAfter,
        },
        "Login rate limited"
      );

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please try again later.",
        retryAfter,
      });
    }

    next();
  } catch (err) {
    logger.error(
      {
        err,
        email: getEmail(req),
        ip: getIP(req),
      },
      "Login limiter failed open"
    );
    next(); // fail open
  }
};
