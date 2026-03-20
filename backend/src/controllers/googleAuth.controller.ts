import { Request, Response, NextFunction } from "express";
import passport from "passport";
import prisma from "../config/prisma";
import crypto from "crypto";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken";

const isProd = process.env.NODE_ENV === "production";

/* 🔥 SAFE IP */
const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "unknown";

/* 🔥 GOOGLE INIT (STATE + WRAPPER) */
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

/* 🔥 CALLBACK (FULL HARDENED) */
export const googleCallback = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    /* 🔐 STATE CHECK (CSRF PROTECTION) */
    const stateFromGoogle = req.query.state;
    const stateFromCookie = req.cookies?.oauth_state;

    if (!stateFromGoogle || stateFromGoogle !== stateFromCookie) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    }

    res.clearCookie("oauth_state");

    /* 🔐 USER VALIDATION */
    if (!user || !user.id || !user.isActive) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    }

    /* 🔥 MULTI-TENANT SAFE (STRICT) */
    let business = await prisma.business.findFirst({
      where: { ownerId: user.id },
    });

    if (!business) {
      business = await prisma.business.create({
        data: {
          name: `${user.name || "My"} Business`,
          ownerId: user.id,
        },
      });
    }

    /* 🔐 TOKENS (WITH VERSION) */
    const accessToken = generateAccessToken(
      user.id,
      user.role,
      business.id,
      user.tokenVersion
    );

    const refreshToken = generateRefreshToken(
      user.id,
      user.tokenVersion
    );

    const ip = getIP(req);

    /* 🔄 STORE SESSION (DEVICE + IP) */
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        userAgent: req.headers["user-agent"],
        ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    /* 🔐 COOKIES */
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    /* 🔥 SECURITY LOG */
    console.log("GOOGLE_LOGIN_SUCCESS", {
      userId: user.id,
      ip,
    });

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);

  } catch (error) {
    console.error("Google Auth Error:", error);

    return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
  }
};