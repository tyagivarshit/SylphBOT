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

const getCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("none" as const) : ("lax" as const),
  path: "/",
});

/* ======================================
GOOGLE INIT
====================================== */

export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = crypto.randomBytes(16).toString("hex");

    res.cookie("oauth_state", state, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });

    passport.authenticate("google", {
      scope: ["profile", "email"],
      state,
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

    if (!stateFromGoogle || stateFromGoogle !== stateFromCookie) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    }

    res.clearCookie("oauth_state");

    if (!user || !user.id || !user.isActive) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    }

    const result = await prisma.$transaction(async (tx) => {
      let business = await tx.business.findFirst({
        where: { ownerId: user.id },
      });

      if (!business) {
        business = await tx.business.create({
          data: {
            name: `${user.name || "My"} Business`,
            ownerId: user.id,
          },
        });
      }

      const accessToken = generateAccessToken(
        user.id,
        user.role,
        business.id,
        user.tokenVersion
      );

      const refreshRaw = generateRefreshToken(
        user.id,
        user.tokenVersion
      );

      const refreshToken = hashToken(refreshRaw);

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
      };
    });

    const cookieOptions = getCookieOptions();

    res.cookie("accessToken", result.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", result.refreshRaw, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);

  } catch {
    return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
  }
};