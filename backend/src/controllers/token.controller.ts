import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import crypto from "crypto";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken";
import { env } from "../config/env";

/* 🔐 Hash helper */
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const refreshAccessToken = async (
  req: Request,
  res: Response
) => {
  const refreshToken = req.body.refreshToken?.trim();

  if (!refreshToken) {
    return res.status(401).json({
      message: "Refresh token required",
    });
  }

  try {
    const hashedToken = hashToken(refreshToken);

    // 🔎 Check token in DB
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: hashedToken },
    });

    if (!storedToken) {
      return res.status(403).json({
        message: "Invalid refresh token",
      });
    }

    // ⏳ Expiry check
    if (new Date() > storedToken.expiresAt) {
      await prisma.refreshToken.delete({
        where: { token: hashedToken },
      });

      return res.status(403).json({
        message: "Refresh token expired",
      });
    }

    let decoded: any;

    try {
      decoded = jwt.verify(
        refreshToken,
        env.JWT_REFRESH_SECRET
      );
    } catch {
      await prisma.refreshToken.delete({
        where: { token: hashedToken },
      });

      return res.status(403).json({
        message: "Invalid refresh token",
      });
    }

    // 👤 Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return res.status(403).json({
        message: "User not found",
      });
    }

    // 🏢 Get business (important for access token payload)
    const business = await prisma.business.findFirst({
      where: { ownerId: user.id },
    });

    if (!business) {
      return res.status(403).json({
        message: "Business not found",
      });
    }

    /* 🔥 Rotation: delete old token */
    await prisma.refreshToken.delete({
      where: { token: hashedToken },
    });

    // 🔄 Generate new tokens
    const newRefreshToken = generateRefreshToken(user.id);

    const newAccessToken = generateAccessToken(
      user.id,
      user.role,
      business.id
    );

    const newHashedToken = hashToken(newRefreshToken);

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: newHashedToken,
        userId: user.id,
        expiresAt: expiry,
      },
    });

    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

  } catch (error) {
    console.error("Refresh Token Error:", error);

    return res.status(500).json({
      message: "Token refresh failed",
    });
  }
};