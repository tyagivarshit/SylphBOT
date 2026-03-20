import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../config/prisma";
import { redis } from "../config/redis";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken";
import { sendVerificationEmail } from "../services/email.service";

const isProd = process.env.NODE_ENV === "production";

/* 🔥 TYPE SAFE */
type AuthRequest = Request & {
  user: {
    id: string;
    role: string;
    businessId: string;
  };
};

/* 🔥 SAFE IP (NO TS ERROR + PRODUCTION READY) */
const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "unknown";

/* 🔥 GLOBAL RATE LIMIT */
const checkGlobalLimit = async (ip: string) => {
  const key = `global:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);

  if (count > 60) {
    throw new Error("RATE_LIMIT");
  }
};

/* ================= REGISTER ================= */

export const register = async (req: Request, res: Response) => {
  try {
    const ip = getIP(req);
    await checkGlobalLimit(ip);

    const name = req.body.name?.trim();
    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ success: false });
    }

    const hashed = await bcrypt.hash(password, 12);
    const verifyToken = crypto.randomBytes(32).toString("hex");

    await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { email } });
      if (exists) throw new Error("EMAIL_EXISTS");

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashed,
          verifyToken,
          verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const business = await tx.business.create({
        data: {
          name: `${name}'s Business`,
          ownerId: user.id,
        },
      });

      const trialPlan = await tx.plan.findUnique({
        where: { name: "FREE_TRIAL" },
      });

      if (!trialPlan) throw new Error("PLAN_NOT_FOUND");

      await tx.subscription.create({
        data: {
          businessId: business.id,
          planId: trialPlan.id,
          status: "ACTIVE",
          isTrial: true,
          trialUsed: true,
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.usage.create({
        data: {
          businessId: business.id,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
        },
      });
    });

    const link = `${process.env.FRONTEND_URL}/auth/verify-email?token=${verifyToken}`;
    await sendVerificationEmail(email, link);

    return res.status(201).json({ success: true });

  } catch (e: any) {
    if (e.message === "EMAIL_EXISTS") {
      return res.status(400).json({ success: false });
    }
    if (e.message === "RATE_LIMIT") {
      return res.status(429).json({ success: false });
    }
    return res.status(500).json({ success: false });
  }
};

/* ================= LOGIN ================= */

export const login = async (req: Request, res: Response) => {
  try {
    const ip = getIP(req);
    await checkGlobalLimit(ip);

    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ success: false });
    }

    const key = `login:limit:${email}:${ip}`;

    const user = await prisma.user.findUnique({ where: { email } });

    if (
      !user ||
      !user.isActive ||
      !user.isVerified ||
      !(await bcrypt.compare(password, user.password))
    ) {
      await redis.incr(key);
      await redis.expire(key, 60 * 15);
      return res.status(400).json({ success: false });
    }

    await redis.del(key);

    const business = await prisma.business.findFirst({
      where: { ownerId: user.id },
    });

    if (!business) {
      return res.status(500).json({ success: false });
    }

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

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        userAgent: req.headers["user-agent"],
        ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    console.log("LOGIN_SUCCESS", { userId: user.id, ip });

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.json({ success: true });

  } catch (e: any) {
    if (e.message === "RATE_LIMIT") {
      return res.status(429).json({ success: false });
    }
    return res.status(500).json({ success: false });
  }
};

/* ================= GET ME ================= */

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ success: false });
    }

    return res.json({ success: true, user });

  } catch {
    return res.status(500).json({ success: false });
  }
};

/* ================= LOGOUT ================= */

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    await prisma.refreshToken.deleteMany({
      where: { userId: req.user.id },
    });

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.json({ success: true });

  } catch {
    return res.status(500).json({ success: false });
  }
};

/* ================= VERIFY EMAIL ================= */

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const ip = getIP(req);
    await checkGlobalLimit(ip);

    const token = req.body.token;

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verifyToken: null,
        verifyTokenExpiry: null,
      },
    });

    return res.json({ success: true });

  } catch (e: any) {
    if (e.message === "RATE_LIMIT") {
      return res.status(429).json({ success: false });
    }
    return res.status(500).json({ success: false });
  }
};

/* ================= RESEND ================= */

export const resendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const ip = getIP(req);
    await checkGlobalLimit(ip);

    const email = req.body.email?.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.isVerified) {
      return res.status(400).json({ success: false });
    }

    const token = crypto.randomBytes(32).toString("hex");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verifyToken: token,
        verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const link = `${process.env.FRONTEND_URL}/auth/verify-email?token=${token}`;
    await sendVerificationEmail(email, link);

    return res.json({ success: true });

  } catch (e: any) {
    if (e.message === "RATE_LIMIT") {
      return res.status(429).json({ success: false });
    }
    return res.status(500).json({ success: false });
  }
};

/* ================= FORGOT PASSWORD ================= */

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const ip = getIP(req);
    await checkGlobalLimit(ip);

    const email = req.body.email?.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.json({ success: true });
    }

    const raw = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(raw).digest("hex");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashed,
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const link = `${process.env.FRONTEND_URL}/auth/reset-password?token=${raw}`;
    await sendVerificationEmail(email, link);

    return res.json({ success: true });

  } catch (e: any) {
    if (e.message === "RATE_LIMIT") {
      return res.status(429).json({ success: false });
    }
    return res.status(500).json({ success: false });
  }
};

/* ================= RESET PASSWORD ================= */

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const ip = getIP(req);
    await checkGlobalLimit(ip);

    const { token, password } = req.body;

    if (!token || !password || password.length < 6) {
      return res.status(400).json({ success: false });
    }

    const hashed = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashed,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false });
    }

    const newPass = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newPass,
        resetToken: null,
        resetTokenExpiry: null,
        tokenVersion: { increment: 1 },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    return res.json({ success: true });

  } catch (e: any) {
    if (e.message === "RATE_LIMIT") {
      return res.status(429).json({ success: false });
    }
    return res.status(500).json({ success: false });
  }
};