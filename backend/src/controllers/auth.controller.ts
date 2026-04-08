import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../config/prisma";
import  redis  from "../config/redis";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken";
import { sendVerificationEmail } from "../services/email.service";
import {
  badRequest,
  unauthorized,
  conflict,
  tooManyRequests,
} from "../utils/AppError";

/* ======================================
UTILS
====================================== */

const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "unknown";

const getUA = (req: Request) => req.headers["user-agent"] || "unknown";

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

/* ======================================
RATE LIMIT
====================================== */

const checkGlobalLimit = async (ip: string) => {
  const key = `global:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  if (count > 60) throw tooManyRequests("Too many requests");
};

/* ======================================
COOKIE CONFIG (PRODUCTION GRADE)
====================================== */

const isProd = process.env.NODE_ENV === "production";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("none" as const) : ("lax" as const),
  ...(isProd ? { domain: ".automexiaai.in" } : {}),
  path: "/",
});

/* ======================================
SET COOKIES
====================================== */

const setCookies = (res: Response, access: string, refresh: string) => {
  const options = getCookieOptions();

  res.cookie("accessToken", access, {
    ...options,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refreshToken", refresh, {
    ...options,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  if (!isProd) {
    console.log("🍪 Cookies set");
  }
};

/* ======================================
REGISTER
====================================== */

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await checkGlobalLimit(getIP(req));

    const { name, email, password } = req.body;

    if (!name || !email || !password || password.length < 6) {
      throw badRequest("Invalid input");
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw conflict("Email already exists");

    const hashed = await bcrypt.hash(password, 12);
    const rawToken = crypto.randomBytes(32).toString("hex");

    await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        verifyToken: hashToken(rawToken),
        verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await sendVerificationEmail(
      email,
      `${process.env.FRONTEND_URL}/auth/verify-email?token=${rawToken}`
    );

    res.status(201).json({ success: true });

  } catch (err) {
    next(err);
  }
};

/* ======================================
LOGIN
====================================== */

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await checkGlobalLimit(getIP(req));

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (
      !user ||
      !user.isVerified ||
      !(await bcrypt.compare(password, user.password))
    ) {
      throw unauthorized("Invalid credentials");
    }

    let business = await prisma.business.findFirst({
      where: { ownerId: user.id },
      select: { id: true },
    });

    /* ✅ SAFETY FALLBACK (ADDED) */
    if (!business) {
      const newBusiness = await prisma.business.create({
        data: {
          name: `${user.name || "My"} Workspace`,
          ownerId: user.id,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { businessId: newBusiness.id },
      });

      business = { id: newBusiness.id };
    }

    const accessToken = generateAccessToken(
      user.id,
      user.role,
      business?.id || null,
      user.tokenVersion
    );

    const refreshRaw = generateRefreshToken(user.id, user.tokenVersion);

    const count = await prisma.refreshToken.count({
      where: { userId: user.id },
    });

    if (count >= 5) {
      const oldest = await prisma.refreshToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      });

      if (oldest) {
        await prisma.refreshToken.delete({
          where: { id: oldest.id },
        });
      }
    }

    await prisma.refreshToken.create({
      data: {
        token: hashToken(refreshRaw),
        userId: user.id,
        userAgent: getUA(req),
        ip: getIP(req),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    setCookies(res, accessToken, refreshRaw);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessId: business?.id || null,
      },
    });

  } catch (err) {
    next(err);
  }
};

/* ======================================
VERIFY EMAIL
====================================== */

export const verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = hashToken(req.query.token as string);

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: { gt: new Date() },
      },
    });

    /* ✅ IDEMPOTENT */
    if (!user) {
      return res.json({ success: true });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verifyToken: null,
        verifyTokenExpiry: null,
      },
    });

    /* ======================================
    🔥 DUPLICATE PREVENTION (ADDED)
    ====================================== */

    let existingBusiness = await prisma.business.findFirst({
      where: { ownerId: updatedUser.id },
      select: { id: true },
    });

    let business = existingBusiness;

    if (!existingBusiness) {
      business = await prisma.business.create({
        data: {
          name: `${updatedUser.name || "My"} Workspace`,
          ownerId: updatedUser.id,
        },
      });
    }

    /* ======================================
    🔥 LINK USER → BUSINESS
    ====================================== */

    await prisma.user.update({
      where: { id: updatedUser.id },
      data: {
        businessId: business!.id,
      },
    });

    res.json({ success: true });

  } catch (err) {
    next(err);
  }
};

/* ======================================
RESEND VERIFICATION
====================================== */

export const resendVerificationEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.body.email;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return res.json({ success: true });

    const raw = crypto.randomBytes(32).toString("hex");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verifyToken: hashToken(raw),
        verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await sendVerificationEmail(
      email,
      `${process.env.FRONTEND_URL}/auth/verify-email?token=${raw}`
    );

    res.json({ success: true });

  } catch (err) {
    next(err);
  }
};

/* ======================================
FORGOT PASSWORD
====================================== */

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.body.email;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return res.json({ success: true });

    const raw = crypto.randomBytes(32).toString("hex");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashToken(raw),
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await sendVerificationEmail(
      email,
      `${process.env.FRONTEND_URL}/auth/reset-password?token=${raw}`
    );

    res.json({ success: true });

  } catch (err) {
    next(err);
  }
};

/* ======================================
RESET PASSWORD
====================================== */

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;

    if (!token || !password || password.length < 6) {
      throw badRequest("Invalid input");
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashToken(token),
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) throw badRequest("Invalid token");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, 12),
        resetToken: null,
        resetTokenExpiry: null,
        tokenVersion: { increment: 1 },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    res.json({ success: true });

  } catch (err) {
    next(err);
  }
};

/* ======================================
GET ME
====================================== */

export const getMe = async (req: any, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw unauthorized("Not authenticated");

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        businessId: true, // 🔥 THIS FIXES EVERYTHING
}
    });

    res.setHeader("Cache-Control", "no-store");

    res.json({
      success: true,
      user,
    });

  } catch (err) {
    next(err);
  }
};

/* ======================================
LOGOUT
====================================== */

export const logout = async (req: any, res: Response, next: NextFunction) => {
  try {
    await prisma.refreshToken.deleteMany({
      where: { userId: req.user.id },
    });

    const options = getCookieOptions();

    res.clearCookie("accessToken", options);
    res.clearCookie("refreshToken", options);

    res.json({ success: true });

  } catch (err) {
    next(err);
  }
};
