import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";

const WINDOW = 60 * 15; // 15 min
const MAX_ATTEMPTS = 5;

export const loginLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {

    const email = req.body?.email?.toLowerCase().trim() || "unknown";
    const ip = req.ip;

    const key = `login:limit:${email}:${ip}`;
    const now = Date.now();

    /* 🔥 remove old attempts */
    await redis.zremrangebyscore(key, 0, now - WINDOW * 1000);

    /* 🔥 count attempts in window */
    const attempts = await redis.zcard(key);

    if (attempts >= MAX_ATTEMPTS) {

      const ttl = await redis.ttl(key);

      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Try again later.",
        retryAfter: ttl > 0 ? ttl : WINDOW,
      });
    }

    next();

  } catch (error) {
    console.error("Limiter error:", error);
    next();
  }
};