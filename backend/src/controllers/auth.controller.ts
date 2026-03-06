import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../config/prisma";
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

    /* 🔥 Create User */
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    /* 🔥 Email Verification Token */
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpiry = new Date();
    verifyTokenExpiry.setHours(verifyTokenExpiry.getHours() + 24);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verifyToken,
        verifyTokenExpiry,
      },
    });

    /* 🔥 Send Verification Email */
    const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;

    await sendVerificationEmail(email, verifyLink);

    /* 🔥 Business Create */
    const business = await prisma.business.create({
      data: {
        name: `${name}'s Business`,
        ownerId: user.id,
      },
    });

    /* 🔥 Free Trial Plan */
    const trialPlan = await prisma.plan.findUnique({
      where: { name: "FREE_TRIAL" },
    });

    if (!trialPlan) {
      return res.status(500).json({
        success: false,
        message: "Trial plan not configured",
      });
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    await prisma.subscription.create({
      data: {
        businessId: business.id,
        planId: trialPlan.id,
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
      message:
        "User registered successfully. Please verify your email.",
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

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
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
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    /* 🔥 Fetch user's business */
    const business = await prisma.business.findFirst({
      where: { ownerId: user.id },
    });

    if (!business) {
      return res.status(500).json({
        success: false,
        message: "Business not found",
      });
    }

    /* 🔐 Generate Tokens */
    const accessToken = generateAccessToken(
      user.id,
      user.role,
      business.id
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

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

/* ================= VERIFY EMAIL ================= */

export const verifyEmail = async (
  req: Request,
  res: Response
) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification token",
      });
    }

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