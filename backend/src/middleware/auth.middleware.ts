import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { unauthorized } from "../utils/AppError";
import crypto from "crypto";
import { generateAccessToken } from "../utils/generateToken";

const isProd = process.env.NODE_ENV === "production";

/* ======================================
UTILS
====================================== */

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

/* ======================================
COOKIE CONFIG
====================================== */

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("none" as const) : ("lax" as const),
  ...(isProd ? { domain: ".automexiaai.in" } : {}),
  path: "/",
};

/* ======================================
CLEAR COOKIES
====================================== */

export const clearAuthCookies = (res: Response) => {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
};

/* ======================================
GET USER
====================================== */

const getUserWithBusiness = async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      tokenVersion: true,
      businessId: true,
    },
  });
};

/* ======================================
PROTECT MIDDLEWARE (FINAL FIXED)
====================================== */

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    console.log("🍪 Cookies:", req.cookies);

    if (!accessToken && !refreshToken) {
      throw unauthorized("Not authorized");
    }

    /* =============================
    ACCESS TOKEN (FAST PATH)
    ============================= */

    if (accessToken) {
      try {
        const decoded = jwt.verify(
          accessToken,
          env.JWT_SECRET
        ) as any;

        // 🔥 token type check (bonus security)
        if (decoded.type !== "access") {
          throw unauthorized("Invalid token type");
        }

        const user = await getUserWithBusiness(decoded.id);

        if (
          !user ||
          !user.isActive ||
          user.tokenVersion !== decoded.tokenVersion
        ) {
          throw unauthorized("Invalid session");
        }

        (req as any).user = {
          id: user.id,
          role: user.role,
          businessId: user.businessId || null,
        };

        return next();

      } catch (err: any) {
        if (err.name !== "TokenExpiredError") {
          throw unauthorized("Invalid access token");
        }
        // expired → go to refresh flow
      }
    }

    /* =============================
    REFRESH TOKEN FLOW
    ============================= */

    if (!refreshToken) {
      throw unauthorized("Session expired");
    }

    let decoded: any;

    try {
      decoded = jwt.verify(
        refreshToken,
        env.JWT_REFRESH_SECRET
      ) as any;

      if (decoded.type !== "refresh") {
        throw unauthorized("Invalid token type");
      }

    } catch {
      clearAuthCookies(res);
      throw unauthorized("Invalid refresh token");
    }

    const hashed = hashToken(refreshToken);

    const dbToken = await prisma.refreshToken.findFirst({
      where: {
        token: hashed,
        userId: decoded.id,
        expiresAt: { gt: new Date() },
      },
    });

    if (!dbToken) {
      clearAuthCookies(res);
      throw unauthorized("Session expired");
    }

    const user = await getUserWithBusiness(decoded.id);

    if (
      !user ||
      !user.isActive ||
      user.tokenVersion !== decoded.tokenVersion
    ) {
      clearAuthCookies(res);
      throw unauthorized("Invalid session");
    }

    /* =============================
    NEW ACCESS TOKEN
    ============================= */

    const newAccessToken = generateAccessToken(
      user.id,
      user.role,
      user.businessId || null,
      user.tokenVersion
    );

    res.cookie("accessToken", newAccessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    (req as any).user = {
      id: user.id,
      role: user.role,
      businessId: user.businessId || null,
    };

    return next();

  } catch (err) {
    return next(err);
  }
};
