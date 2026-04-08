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

const hasAuthCookies = (req: Request) =>
  Boolean(req.cookies?.accessToken || req.cookies?.refreshToken);

const handleGoogleCallback = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Some browsers/providers can replay the callback URL once cookies are already set.
  // In that case, avoid reusing the same auth code and just continue to the dashboard.
  if (hasAuthCookies(req) && req.query.code) {
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }

  return passport.authenticate(
    "google",
    {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/auth/login`,
    },
    (err: any, user: any) => {
      if (err) {
        if (hasAuthCookies(req) && req.query.code) {
          return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
        }

        console.error("GOOGLE PASSPORT ERROR", {
          message: err?.message,
          code: err?.code,
          status: err?.status,
        });

        return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
      }

      if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
      }

      (req as any).user = user;
      return safeHandler(googleCallback)(req, res, next);
    }
  )(req, res, next);
};

/* ======================================
ROUTES
====================================== */

router.get("/google", oauthLimiter, safeHandler(googleAuth));

router.get(
  "/google/callback",
  oauthLimiter,
  handleGoogleCallback
);

export default router;
