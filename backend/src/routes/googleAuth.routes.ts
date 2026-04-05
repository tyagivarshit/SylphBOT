import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import  redis  from "../config/redis";
import {
  googleAuth,
  googleCallback,
} from "../controllers/googleAuth.controller";

const router = Router();

/* ======================================
UTILS
====================================== */

const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  "unknown";

/* ======================================
OAUTH LIMITER (ATOMIC + SAFE)
====================================== */

const oauthLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ip = getIP(req);
    const key = `oauth:${ip}`;

    const multi = redis.multi();
    multi.incr(key);
    multi.ttl(key);

    const [[, count], [, ttl]] = (await multi.exec()) as any;

    if (ttl === -1) {
      await redis.expire(key, 60);
    }

    if (count > 20) {
      return res.status(429).json({
        success: false,
        message: "Too many OAuth attempts. Try again later.",
      });
    }

    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many requests",
    });
  }
};

/* ======================================
SAFE WRAPPER
====================================== */

const safeHandler =
  (fn: any) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(() => {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    });

/* ======================================
ROUTES
====================================== */

router.get("/google", oauthLimiter, safeHandler(googleAuth));

router.get(
  "/google/callback",
  oauthLimiter,
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/auth/login`,
  }),
  safeHandler(googleCallback)
);

export default router;