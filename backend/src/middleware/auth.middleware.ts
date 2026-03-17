import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { generateAccessToken } from "../utils/generateToken";

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {

  const accessToken = req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;
  const headerToken = req.headers.authorization?.split(" ")[1];

  const token = accessToken || headerToken;

  /* ================= NO TOKEN ================= */

  if (!token && !refreshToken) {
    return res.status(401).json({ message: "Not authorized" });
  }

  /* ================= TRY ACCESS TOKEN ================= */

  if (token) {
    try {

      const decoded = jwt.verify(token, env.JWT_SECRET) as any;

      req.user = {
        id: decoded.id,
        role: decoded.role,
        email: decoded.email,
        businessId: decoded.businessId
      };

      return next();

    } catch (err) {
      // access expired → try refresh
    }
  }

  /* ================= REFRESH TOKEN FLOW ================= */

  if (!refreshToken) {
    return res.status(401).json({ message: "Session expired" });
  }

  try {

    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as any;

    const dbToken = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId: decoded.id,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (!dbToken) {
      return res.status(401).json({ message: "Invalid session" });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    const business = await prisma.business.findFirst({
      where: { ownerId: decoded.id }
    });

    if (!user || !business) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    /* 🔥 NEW ACCESS TOKEN */

    const newAccessToken = generateAccessToken(
      user.id,
      user.role,
      business.id
    );

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
      maxAge: 60 * 60 * 1000,
    });

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      businessId: business.id
    };

    next();

  } catch (error) {

    return res.status(401).json({ message: "Session expired" });

  }

};