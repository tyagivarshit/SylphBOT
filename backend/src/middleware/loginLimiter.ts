import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";

const WINDOW = 60;
const MAX_ATTEMPTS = process.env.NODE_ENV === "production" ? 5 : 1000;

export const loginLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {

    /* DEV MODE → SKIP LIMITER */

    if (process.env.NODE_ENV !== "production") {
      return next();
    }

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