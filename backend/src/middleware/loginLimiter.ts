import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";

const WINDOW = 60 * 15; // 15 min
const MAX_ATTEMPTS = 5;

/* ======================================
UTILS
====================================== */

const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  "unknown";

/* ======================================
LOGIN LIMITER (ATOMIC + DISTRIBUTED SAFE)
====================================== */

export const loginLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const email = req.body?.email?.toLowerCase().trim() || "unknown";
    const ip = getIP(req);

    const key = `login:limit:${email}:${ip}`;
    const now = Date.now();

    const multi = redis.multi();

    /* remove old */
    multi.zremrangebyscore(key, 0, now - WINDOW * 1000);

    /* add current attempt */
    multi.zadd(key, now, `${now}-${Math.random()}`);

    /* count */
    multi.zcard(key);

    /* set expiry */
    multi.expire(key, WINDOW);

    const [, , count] = (await multi.exec()) as any;

    const attempts = count[1];

    if (attempts > MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key);

      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Try again later.",
        retryAfter: ttl > 0 ? ttl : WINDOW,
      });
    }

    next();
  } catch {
    next(); // fail open but safe
  }
};