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

/* ================= REGISTER ================= */

export const register = async (req: Request, res: Response) => {
  try {

    const name = req.body.name?.trim();
    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpiry = new Date();
    verifyTokenExpiry.setHours(verifyTokenExpiry.getHours() + 24);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        verifyToken,
        verifyTokenExpiry,
      },
    });

    const verifyLink =
      `${process.env.FRONTEND_URL}/auth/verify-email?token=${verifyToken}`;

    await sendVerificationEmail(email, verifyLink);

    const business = await prisma.business.create({
      data: {
        name: `${name}'s Business`,
        ownerId: user.id,
      },
    });

    const trialPlan = await prisma.plan.findUnique({
      where: { name: "FREE_TRIAL" },
    });

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    await prisma.subscription.create({
      data: {
        businessId: business.id,
        planId: trialPlan!.id,
        status: "ACTIVE",
        currentPeriodEnd: trialEnd,
      },
    });

    const now = new Date();

    await prisma.usage.create({
      data: {
        businessId: business.id,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        aiCallsUsed: 0,
        messagesUsed: 0,
        followupsUsed: 0,
      },
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully. Please verify your email.",
    });

  } catch (error) {

    console.error("Register Error:", error);

    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });

  }
};

/* ================= LOGIN ================= */

export const login = async (req: Request, res: Response) => {

  try {

    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    /* ===== CHECK LIMITER ===== */

    const limiterKey = `login:limit:${email}`;
    const attempts = await redis.get(limiterKey);

    if (attempts && Number(attempts) >= 5) {

      const ttl = await redis.ttl(limiterKey);

      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Please wait before trying again.",
        retryAfter: ttl > 0 ? ttl : 60
      });

    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {

      await redis.incr(limiterKey);
      await redis.expire(limiterKey, 60);

      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {

      const attempts = await redis.incr(limiterKey);

      if (attempts === 1) {
        await redis.expire(limiterKey, 60);
      }

      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });

    }

    const business = await prisma.business.findFirst({
      where: { ownerId: user.id },
    });

    const accessToken = generateAccessToken(
      user.id,
      user.role,
      business!.id
    );

    const refreshToken = generateRefreshToken(user.id);

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: expiry,
      },
    });

    /* ===== RESET LIMITER ON SUCCESS ===== */

    await redis.del(limiterKey);

    /* ===== SET COOKIES ===== */

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
    });

  } catch (error) {

    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });

  }

};

/* ================= GET CURRENT USER ================= */

export const getMe = async (req: Request, res: Response) => {

  try {

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    return res.status(200).json({
      success: true,
      user
    });

  } catch (error) {

    console.error("GetMe Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });

  }

};

/* ================= VERIFY EMAIL ================= */

export const verifyEmail = async (req: Request, res: Response) => {

  try {

    const token = req.query.token as string;

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verifyToken: null,
        verifyTokenExpiry: null,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });

  } catch (error) {

    console.error("Verify Email Error:", error);

    return res.status(500).json({
      success: false,
      message: "Verification failed",
    });

  }

};

/* ================= LOGOUT ================= */

export const logout = async (req: Request, res: Response) => {

  try {

    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("refreshToken", { path: "/" });

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });

  } catch (error) {

    console.error("Logout Error:", error);

    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });

  }

};

/* ================= RESEND VERIFICATION ================= */

export const resendVerificationEmail = async (req: Request, res: Response) => {

  try {

    const email = req.body.email?.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    const verifyToken = crypto.randomBytes(32).toString("hex");

    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verifyToken,
        verifyTokenExpiry: expiry,
      },
    });

    const verifyLink =
      `${process.env.FRONTEND_URL}/auth/verify-email?token=${verifyToken}`;

    await sendVerificationEmail(email, verifyLink);

    return res.status(200).json({
      success: true,
      message: "Verification email sent",
    });

  } catch (error) {

    console.error("Resend Verify Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to resend verification email",
    });

  }

};

/* ================= FORGOT PASSWORD ================= */

export const forgotPassword = async (req: Request, res: Response) => {

  try {

    const email = req.body.email?.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this email exists, a reset link has been sent",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry: expiry,
      },
    });

    const resetLink =
      `${process.env.FRONTEND_URL}/auth/reset-password?token=${rawToken}`;

    await sendVerificationEmail(email, resetLink);

    return res.status(200).json({
      success: true,
      message: "If this email exists, a reset link has been sent",
    });

  } catch (error) {

    console.error("Forgot Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send reset link",
    });

  }

};

/* ================= RESET PASSWORD ================= */

export const resetPassword = async (req: Request, res: Response) => {

  try {

    const { token, password } = req.body;

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });

  } catch (error) {

    console.error("Reset Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Password reset failed",
    });

  }

};