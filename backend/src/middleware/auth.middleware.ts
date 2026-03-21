import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { unauthorized, forbidden } from "../utils/AppError";
import crypto from "crypto";

const isProd = process.env.NODE_ENV === "production";

/* ======================================
UTILS
====================================== */

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

/* ======================================
TYPES
====================================== */

type AuthUser = {
  id: string;
  role: string;
  businessId: string;
};

/* ======================================
COOKIE CONFIG
====================================== */

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("none" as const) : ("lax" as const),
  path: "/",
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
};

/* ======================================
🔥 FINAL PROTECT MIDDLEWARE
====================================== */

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    /* =============================
    NO TOKENS
    ============================= */

    if (!accessToken && !refreshToken) {
      throw unauthorized("Not authorized");
    }

    /* =============================
    ACCESS TOKEN FLOW (FAST PATH)
    ============================= */

    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, env.JWT_SECRET) as any;

        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            role: true,
            isActive: true,
            tokenVersion: true,
          },
        });

        if (
          !user ||
          !user.isActive ||
          user.tokenVersion !== decoded.tokenVersion
        ) {
          throw unauthorized("Invalid session");
        }

        const business = await prisma.business.findUnique({
          where: { id: decoded.businessId },
          select: { id: true, ownerId: true },
        });

        if (!business || business.ownerId !== user.id) {
          throw forbidden("Forbidden");
        }

        (req as any).user = {
          id: user.id,
          role: user.role,
          businessId: business.id,
        } as AuthUser;

        return next();

      } catch (err: any) {
        // Only handle expiration here
        if (err.name !== "TokenExpiredError") {
          throw unauthorized("Invalid access token");
        }
      }
    }

    /* =============================
    REFRESH TOKEN FLOW (SAFE)
    ============================= */

    if (!refreshToken) {
      throw unauthorized("Session expired");
    }

    let decoded: any;

    try {
      decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
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

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        role: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.tokenVersion !== decoded.tokenVersion
    ) {
      clearAuthCookies(res);
      throw unauthorized("Invalid session");
    }

    const business = await prisma.business.findFirst({
      where: { ownerId: user.id },
      select: { id: true },
    });

    if (!business) {
      clearAuthCookies(res);
      throw unauthorized("Unauthorized");
    }

    /* ======================================
    🔥 IMPORTANT: NO ROTATION HERE
    ====================================== */

    // ❌ NO delete
    // ❌ NO create
    // ❌ NO transaction
    // ❌ NO cookie reset

    (req as any).user = {
      id: user.id,
      role: user.role,
      businessId: business.id,
    } as AuthUser;

    return next();

  } catch (err) {
    return next(err);
  }
};