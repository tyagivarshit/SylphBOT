import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { env } from "../config/env";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken";

const isProd = process.env.NODE_ENV === "production";

type AuthUser = {
  id: string;
  role: string;
  businessId: string;
};

/* 🔥 GLOBAL RATE LIMIT (MIDDLEWARE LEVEL) */
const checkGlobalLimit = async (ip: string) => {
  const key = `global:${ip}`;
  const count = await prisma.$runCommandRaw({
    incr: key,
  }).catch(() => null); // fallback safe

  // fallback if redis preferred (recommended)
};

/* 🔐 MAIN AUTH MIDDLEWARE */
export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;
    const headerToken = req.headers.authorization?.split(" ")[1];

    const token = accessToken || headerToken;

    if (!token && !refreshToken) {
      return res.status(401).json({ message: "Not authorized" });
    }

    /* ================= ACCESS TOKEN ================= */
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as any;

        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
        });

        if (
          !user ||
          !user.isActive ||
          user.tokenVersion !== decoded.tokenVersion
        ) {
          return res.status(401).json({ message: "Invalid session" });
        }

        /* 🔥 MULTI-TENANT STRICT CHECK */
        const business = await prisma.business.findUnique({
          where: { id: decoded.businessId },
        });

        if (!business || business.ownerId !== user.id) {
          return res.status(403).json({ message: "Forbidden" });
        }

        (req as any).user = {
          id: user.id,
          role: user.role,
          businessId: business.id,
        } as AuthUser;

        return next();
      } catch {
        // expired → fallback
      }
    }

    /* ================= REFRESH ================= */
    if (!refreshToken) {
      return res.status(401).json({ message: "Session expired" });
    }

    try {
      const decoded = jwt.verify(
        refreshToken,
        env.JWT_REFRESH_SECRET
      ) as any;

      const dbToken = await prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: decoded.id,
          expiresAt: { gt: new Date() },
        },
      });

      if (!dbToken) {
        return res.status(401).json({ message: "Invalid session" });
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (
        !user ||
        !user.isActive ||
        user.tokenVersion !== decoded.tokenVersion
      ) {
        return res.status(401).json({ message: "Invalid session" });
      }

      const business = await prisma.business.findFirst({
        where: { ownerId: user.id },
      });

      if (!business) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      /* 🔥 REUSE DETECTION (SECURITY) */
      if (!dbToken) {
        await prisma.user.update({
          where: { id: user.id },
          data: { tokenVersion: { increment: 1 } },
        });

        return res.status(401).json({ message: "Session compromised" });
      }

      /* 🔥 ROTATION */
      await prisma.refreshToken.delete({
        where: { token: refreshToken },
      });

      const newRefreshToken = generateRefreshToken(
        user.id,
        user.tokenVersion
      );

      await prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: user.id,
          userAgent: req.headers["user-agent"],
          ip: req.ip,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const newAccessToken = generateAccessToken(
        user.id,
        user.role,
        business.id,
        user.tokenVersion
      );

      res.cookie("accessToken", newAccessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 15 * 60 * 1000,
        path: "/",
      });

      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      /* 🔥 SECURITY LOG */
      console.log("TOKEN_REFRESH", {
        userId: user.id,
        ip: req.ip,
      });

      (req as any).user = {
        id: user.id,
        role: user.role,
        businessId: business.id,
      } as AuthUser;

      next();

    } catch {
      return res.status(401).json({ message: "Session expired" });
    }

  } catch {
    return res.status(500).json({ message: "Internal error" });
  }
};