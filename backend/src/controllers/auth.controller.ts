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

/* ================= REGISTER ================= */

export const register = async (req: Request, res: Response) => {
  try {

    const name = req.body.name?.trim();
    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const hashed = await bcrypt.hash(password, 12);

    const verifyToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        verifyToken,
        verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const business = await prisma.business.create({
      data: {
        name: `${name}'s Business`,
        ownerId: user.id,
      },
    });

    const trialPlan = await prisma.plan.findUnique({
      where: { name: "FREE_TRIAL" },
    });

    await prisma.subscription.create({
      data: {
        businessId: business.id,
        planId: trialPlan!.id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.usage.create({
      data: {
        businessId: business.id,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        aiCallsUsed: 0,
        messagesUsed: 0,
        followupsUsed: 0,
      },
    });

    const link = `${process.env.FRONTEND_URL}/auth/verify-email?token=${verifyToken}`;
    await sendVerificationEmail(email, link);

    return res.status(201).json({
      success: true,
      message: "Registered. Verify email.",
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Registration failed" });
  }
};

/* ================= LOGIN ================= */

export const login = async (req: Request, res: Response) => {
  try {

    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ success: false });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: "Verify email first" });
    }

    const business = await prisma.business.findFirst({
      where: { ownerId: user.id },
    });

    const accessToken = generateAccessToken(user.id, user.role, business!.id);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 60 * 60 * 1000,
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

  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
};

/* ================= GET ME ================= */

export const getMe = async (req: Request, res: Response) => {
  try {

    if (!req.user) {
      return res.status(401).json({ success: false });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true },
    });

    return res.json({ success: true, user });

  } catch {
    return res.status(500).json({ success: false });
  }
};

/* ================= LOGOUT ================= */

export const logout = async (req: Request, res: Response) => {
  try {

    const token = req.cookies.refreshToken;

    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } });
    }

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

    const token = req.query.token as string;

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

  } catch {
    return res.status(500).json({ success: false });
  }
};

/* ================= RESEND ================= */

export const resendVerificationEmail = async (req: Request, res: Response) => {
  try {

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

  } catch {
    return res.status(500).json({ success: false });
  }
};

/* ================= FORGOT PASSWORD ================= */

export const forgotPassword = async (req: Request, res: Response) => {
  try {

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

  } catch {
    return res.status(500).json({ success: false });
  }
};

/* ================= RESET PASSWORD ================= */

export const resetPassword = async (req: Request, res: Response) => {
  try {

    const { token, password } = req.body;

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
      },
    });

    return res.json({ success: true });

  } catch {
    return res.status(500).json({ success: false });
  }
};