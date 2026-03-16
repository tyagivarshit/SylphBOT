import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";

const WINDOW = 60; // seconds
const MAX_ATTEMPTS = 5;

/* ================= CHECK LIMIT ================= */

export const loginLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {

    const email =
      req.body?.email?.toLowerCase()?.trim() || "unknown";

    const key = `login:limit:${email}`;

    const attempts = await redis.get(key);
    const ttl = await redis.ttl(key);

    if (attempts && Number(attempts) >= MAX_ATTEMPTS) {

      res.setHeader("Retry-After", ttl > 0 ? ttl : WINDOW);

      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Please wait before trying again.",
        retryAfter: ttl > 0 ? ttl : WINDOW
      });

    }

    next();

  } catch (error) {

    console.error("Login limiter error:", error);

    next();

  }
};

/* ================= RECORD FAILED LOGIN ================= */

export const recordFailedLogin = async (email: string) => {

  const key = `login:limit:${email}`;

  const attempts = await redis.incr(key);

  if (attempts === 1) {
    await redis.expire(key, WINDOW);
  }

};

/* ================= RESET LIMITER ================= */

export const resetLoginLimiter = async (email: string) => {

  const key = `login:limit:${email}`;

  await redis.del(key);

};