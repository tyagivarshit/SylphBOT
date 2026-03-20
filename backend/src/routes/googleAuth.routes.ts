import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { redis } from "../config/redis";
import {
  googleAuth,
  googleCallback,
} from "../controllers/googleAuth.controller";

const router = Router();

/* 🔥 SAFE IP */
const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "unknown";

/* 🔥 RATE LIMIT (OAUTH ABUSE PROTECTION) */
const oauthLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ip = getIP(req);
    const key = `oauth:${ip}`;

    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);

    if (count > 20) {
      return res.status(429).json({ message: "Too many requests" });
    }

    next();
  } catch {
    next(); // fail open (important for auth)
  }
};

/* 🔥 SAFE WRAPPER (PREVENT CRASH) */
const safeHandler =
  (fn: any) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(() => {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    });

/* ================= GOOGLE LOGIN ================= */

router.get(
  "/google",
  oauthLimiter,
  safeHandler(googleAuth)
);

/* ================= GOOGLE CALLBACK ================= */

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