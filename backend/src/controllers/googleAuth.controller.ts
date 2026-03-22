import { Request, Response, NextFunction } from "express";
import passport from "passport";
import prisma from "../config/prisma";
import crypto from "crypto";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken";

const isProd = process.env.NODE_ENV === "production";

/* ======================================
UTILS
====================================== */

const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "unknown";

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

/* 🔥 FIXED COOKIE OPTIONS */
const getCookieOptions = () => ({
  httpOnly: true,
  secure: false, // 🔥 FIX: force false for localhost
  sameSite: "lax" as const,
  path: "/",
});

/* ======================================
GOOGLE INIT
====================================== */

export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = crypto.randomBytes(32).toString("hex");

    res.cookie("oauth_state", state, {
      httpOnly: true,
      secure: false, // 🔥 FIX
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });

    passport.authenticate("google", {
      scope: ["profile", "email"],
      state,
      session: false,
    })(req, res, next);
  } catch {
    return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
  }
};

/* ======================================
GOOGLE CALLBACK
====================================== */

export const googleCallback = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const stateFromGoogle = req.query.state;
    const stateFromCookie = req.cookies?.oauth_state;

    /* ======================================
    STATE VALIDATION
    ====================================== */

    if (!stateFromGoogle || stateFromGoogle !== stateFromCookie) {
      console.warn("⚠️ OAuth state mismatch");
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    }

    res.clearCookie("oauth_state");

    if (!user || !user.id || !user.isActive) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    }

    const result = await prisma.$transaction(async (tx) => {

      const business = await tx.business.findFirst({
        where: { ownerId: user.id },
        select: { id: true },
      });

      const accessToken = generateAccessToken(
        user.id,
        user.role,
        business?.id || null,
        user.tokenVersion
      );

      const refreshRaw = generateRefreshToken(
        user.id,
        user.tokenVersion
      );

      const refreshToken = hashToken(refreshRaw);

      /* SESSION LIMIT */

      const count = await tx.refreshToken.count({
        where: { userId: user.id },
      });

      if (count >= 5) {
        const oldest = await tx.refreshToken.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
        });

        if (oldest) {
          await tx.refreshToken.delete({
            where: { id: oldest.id },
          });
        }
      }

      await tx.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          userAgent: req.headers["user-agent"],
          ip: getIP(req),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return {
        accessToken,
        refreshRaw,
        businessId: business?.id || null,
      };
    });

    /* ======================================
    SET COOKIES
    ====================================== */

    const cookieOptions = getCookieOptions();

    res.cookie("accessToken", result.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,

    });

    res.cookie("refreshToken", result.refreshRaw, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    console.log("✅ GOOGLE LOGIN SUCCESS", {
      userId: user.id,
      businessId: result.businessId,
    });

    /* ======================================
    REDIRECT
    ====================================== */

    if (!result.businessId) {
      return res.redirect(`${process.env.FRONTEND_URL}/onboarding`);
    }

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);

  } catch (err) {
    console.error("❌ GOOGLE CALLBACK ERROR", err);
    return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
  }
};