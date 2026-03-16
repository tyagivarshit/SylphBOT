import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";

const WINDOW = 60; // seconds
const MAX_ATTEMPTS = 5;

export const loginLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {

    /* ================= IP DETECTION ================= */

    const forwarded = req.headers["x-forwarded-for"] as string | undefined;

    const ip =
      forwarded?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    /* ================= EMAIL ================= */

    const email = req.body?.email?.toLowerCase()?.trim() || "unknown";

    /* ================= REDIS KEY ================= */

    const key = `login:limit:${ip}:${email}`;

    /* ================= REDIS PIPELINE ================= */

    const pipeline = redis.pipeline();

    pipeline.incr(key);
    pipeline.ttl(key);

    const results = await pipeline.exec();

    const attempts = results?.[0]?.[1] as number;
    const ttl = results?.[1]?.[1] as number;

    /* ================= FIRST ATTEMPT ================= */

    if (attempts === 1) {
      await redis.expire(key, WINDOW);
    }

    /* ================= LIMIT EXCEEDED ================= */

    if (attempts > MAX_ATTEMPTS) {

      res.setHeader("Retry-After", ttl > 0 ? ttl : WINDOW);

      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Please wait before trying again.",
        retryAfter: ttl > 0 ? ttl : WINDOW
      });

    }

    /* ================= ATTEMPTS INFO ================= */

    const remaining = MAX_ATTEMPTS - attempts;

    res.setHeader("X-Login-Attempts-Remaining", remaining);

    next();

  } catch (error) {

    console.error("Login limiter error:", error);

    /* fail-open strategy */

    next();

  }
};