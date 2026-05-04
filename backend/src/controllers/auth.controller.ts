import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { env } from "../config/env";
import prisma from "../config/prisma";
import  redis  from "../config/redis";
import { isRedisHealthy, isRedisWritable } from "../config/redis";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken";
import {
  scheduleOnboardingEmail,
  schedulePasswordResetEmail,
  scheduleVerificationEmail,
} from "../queues/authEmail.queue";
import {
  badRequest,
  unauthorized,
  conflict,
  tooManyRequests,
} from "../utils/AppError";
import {
  clearAuthCookies,
  setAuthCookies,
} from "../utils/authCookies";
import { createAuditLog } from "../services/audit.service";
import { recordFailedLoginAttempt } from "../services/securityAlert.service";
import {
  issueSessionLedger,
  recordFraudSignal,
} from "../services/security/securityGovernanceOS.service";
import { ensureAuthBootstrapContext } from "../services/authBootstrap.service";
import { withDistributedLock } from "../services/distributedLock.service";
import { emitPerformanceMetric } from "../observability/performanceMetrics";

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

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const verifyPassword = async (
  plainTextPassword: string,
  storedHash: string
) => {
  try {
    return await bcrypt.compare(plainTextPassword, storedHash);
  } catch {
    return false;
  }
};

const isStrongPassword = (password: string) =>
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(password);

const withFastTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("auth_rate_limit_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

/* ======================================
RATE LIMIT
====================================== */

const checkGlobalLimit = async (ip: string) => {
  if (!isRedisHealthy() || !isRedisWritable()) {
    return;
  }

  const key = `global:${ip}`;

  try {
    const count = await withFastTimeout(redis.incr(key), 350);

    if (count === 1) {
      await withFastTimeout(redis.expire(key, 60), 350);
    }

    if (count > 60) {
      throw tooManyRequests("Too many requests");
    }
  } catch (error) {
    if (
      (error as { code?: unknown })?.code === "RATE_LIMIT" ||
      (error as { statusCode?: unknown })?.statusCode === 429
    ) {
      throw error;
    }

    // Fail open when Redis is degraded so auth endpoints remain responsive.
    return;
  }
};

/* ======================================
COOKIE CONFIG (PRODUCTION GRADE)
====================================== */


/* ======================================
SET COOKIES
====================================== */

const setCookies = (
  req: Request,
  res: Response,
  access: string,
  refresh: string
) => {
  setAuthCookies(res, req, access, refresh);



};

const writeAuthAuditLog = (
  req: Request,
  input: {
    action: string;
    userId?: string | null;
    businessId?: string | null;
    metadata?: Record<string, unknown>;
  }
) =>
  createAuditLog({
    action: input.action,
    userId: input.userId || null,
    businessId: input.businessId || null,
    metadata: input.metadata || {},
    ip: getIP(req),
    userAgent: String(getUA(req)),
    requestId: req.requestId || null,
  });

const pruneRefreshTokens = async (userId: string, retainCount = 4) => {
  const staleTokens = await prisma.refreshToken.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: Math.max(0, retainCount),
    select: {
      id: true,
    },
  });

  if (!staleTokens.length) {
    return;
  }

  await prisma.refreshToken.deleteMany({
    where: {
      id: {
        in: staleTokens.map((token) => token.id),
      },
    },
  });
};

/* ======================================
REGISTER
====================================== */

export const register = async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  try {
    await checkGlobalLimit(getIP(req));

    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(String(req.body.email || ""));
    const password = String(req.body.password || "");

    if (!name || !email || !password || !isStrongPassword(password)) {
      throw badRequest(
        "Password must be at least 8 characters and include uppercase, lowercase, and a number"
      );
    }

    const hashed = await bcrypt.hash(password, 12);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const verifyToken = hashToken(rawToken);
    const verifyTokenExpiry = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        isVerified: true,
      },
    });

    if (existingUser?.isVerified) {
      throw conflict("Email already exists");
    }

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name,
          password: hashed,
          verifyToken,
          verifyTokenExpiry,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          name,
          email,
          password: hashed,
          verifyToken,
          verifyTokenExpiry,
        },
      });
    }

    const verifyLink = `${env.FRONTEND_URL}/auth/verify-email?token=${rawToken}`;

    res.status(201).json({
      success: true,
      verificationRequired: true,
    });

    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      route: "auth.register",
      metadata: {
        status: "verification_required",
      },
    });

    void scheduleVerificationEmail(email, verifyLink);

  } catch (err) {
    next(err);
  }
};

/* ======================================
LOGIN
====================================== */

export const login = async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  try {
    await checkGlobalLimit(getIP(req));

    const email = normalizeEmail(String(req.body.email || ""));
    const password = String(req.body.password || "");

    const user = await prisma.user.findUnique({ where: { email } });

    if (
      !user ||
      user.deletedAt ||
      !user.isActive ||
      !user.isVerified ||
      !(await verifyPassword(password, user.password))
    ) {
      void writeAuthAuditLog(req, {
        action: "auth.login_failed",
        userId: user?.id || null,
        businessId: user?.businessId || null,
        metadata: {
          email,
        },
      });
      void recordFailedLoginAttempt({
        businessId: user?.businessId || null,
        userId: user?.id || null,
        email,
        ip: getIP(req),
      });
      void recordFraudSignal({
        businessId: user?.businessId || null,
        tenantId: user?.businessId || null,
        signalType: "credential_stuffing",
        actorId: user?.id || email,
        ipFingerprint: hashToken(getIP(req)).slice(0, 20),
        severity: "MEDIUM",
        metadata: {
          email,
          route: req.originalUrl,
        },
      }).catch(() => undefined);
      throw unauthorized("Invalid credentials");
    }

    const bootstrap = await ensureAuthBootstrapContext({
      userId: user.id,
      preferredBusinessId: user.businessId || null,
      profileSeed: {
        email: user.email,
        name: user.name,
        avatar: user.avatar || null,
      },
    });
    const businessId = bootstrap.identity.businessId;

    const accessToken = generateAccessToken(
      bootstrap.user.id,
      bootstrap.user.role,
      businessId,
      bootstrap.user.tokenVersion
    );

    const refreshRaw = generateRefreshToken(
      bootstrap.user.id,
      bootstrap.user.tokenVersion
    );

    await pruneRefreshTokens(bootstrap.user.id, 4);

    await prisma.refreshToken.create({
      data: {
        token: hashToken(refreshRaw),
        userId: bootstrap.user.id,
        userAgent: getUA(req),
        ip: getIP(req),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await issueSessionLedger({
      businessId,
      tenantId: businessId,
      userId: bootstrap.user.id,
      sessionKey: hashToken(refreshRaw),
      ip: getIP(req),
      userAgent: String(getUA(req)),
      deviceId: String(req.headers["x-device-id"] || "").trim() || null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      metadata: {
        source: "auth.login",
      },
    }).catch(() => undefined);

    void writeAuthAuditLog(req, {
      action: "auth.login",
      userId: bootstrap.user.id,
      businessId,
      metadata: {
        email: bootstrap.user.email,
        role: bootstrap.user.role,
      },
    });

    setCookies(req, res, accessToken, refreshRaw);

    res.json({
      success: true,
      user: {
        id: bootstrap.user.id,
        email: bootstrap.user.email,
        name: bootstrap.user.name,
        businessId,
      },
    });

    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      businessId,
      route: "auth.login",
      metadata: {
        source: "password",
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
    const rawToken = String(req.query.token || "").trim();

    if (!rawToken) {
      throw badRequest("Verification token is required");
    }

    const token = hashToken(rawToken);
    let onboardingEmailTarget: {
      email: string;
      workspaceName: string | null;
    } | null = null;

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: { gt: new Date() },
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification link",
      });
    }

    await withDistributedLock({
      key: `auth:verify-email:${user.id}`,
      ttlMs: 15_000,
      waitMs: 5_000,
      pollMs: 75,
      run: async () => {
        const current = await prisma.user.findUnique({
          where: {
            id: user.id,
          },
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            businessId: true,
            isVerified: true,
          },
        });

        if (!current) {
          return;
        }

        const shouldSendOnboardingEmail = !current.isVerified;

        const updatedUser = current.isVerified
          ? current
          : await prisma.user.update({
              where: { id: current.id },
              data: {
                isVerified: true,
                verifyToken: null,
                verifyTokenExpiry: null,
              },
              select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
                businessId: true,
                isVerified: true,
              },
            });

        const bootstrap = await ensureAuthBootstrapContext({
          userId: updatedUser.id,
          preferredBusinessId: updatedUser.businessId || null,
          profileSeed: {
            email: updatedUser.email,
            name: updatedUser.name,
            avatar: updatedUser.avatar || null,
          },
        });

        if (shouldSendOnboardingEmail && updatedUser.email) {
          onboardingEmailTarget = {
            email: updatedUser.email,
            workspaceName: bootstrap.identity.workspace?.name || null,
          };
        }
      },
    });

    if (onboardingEmailTarget?.email) {
      void scheduleOnboardingEmail(
        onboardingEmailTarget.email,
        onboardingEmailTarget.workspaceName
      );
    }

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
    const email = normalizeEmail(String(req.body.email || ""));

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.isVerified) return res.json({ success: true });

    const raw = crypto.randomBytes(32).toString("hex");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verifyToken: hashToken(raw),
        verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await scheduleVerificationEmail(
      email,
      `${env.FRONTEND_URL}/auth/verify-email?token=${raw}`
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
    const email = normalizeEmail(String(req.body.email || ""));

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

    await schedulePasswordResetEmail(
      email,
      `${env.FRONTEND_URL}/auth/reset-password?token=${raw}`
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

    if (!token || !password || !isStrongPassword(password)) {
      throw badRequest(
        "Password must be at least 8 characters and include uppercase, lowercase, and a number"
      );
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

    void writeAuthAuditLog(req, {
      action: "auth.password_reset",
      userId: user.id,
      businessId: user.businessId || null,
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
  const startedAt = Date.now();
  try {
    if (!req.user?.id) throw unauthorized("Not authenticated");

    const bootstrap = await ensureAuthBootstrapContext({
      userId: req.user.id,
      preferredBusinessId: req.user?.businessId || null,
      profileSeed: {
        email: req.user?.email || null,
      },
    });

    res.setHeader("Cache-Control", "no-store");

    res.json({
      success: true,
      user: {
        id: bootstrap.user.id,
        name: bootstrap.user.name,
        email: bootstrap.user.email,
        role: bootstrap.user.role,
        businessId: bootstrap.identity.businessId,
      },
    });

    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      businessId: bootstrap.identity.businessId,
      route: "auth.me",
    });

  } catch (err) {
    next(err);
  }
};

/* ======================================
LOGOUT
====================================== */

export const logout = async (req: any, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  try {
    await prisma.refreshToken.deleteMany({
      where: { userId: req.user.id },
    });

    void writeAuthAuditLog(req, {
      action: "auth.logout",
      userId: req.user?.id || null,
      businessId: req.user?.businessId || null,
    });

    clearAuthCookies(res, req);

    res.json({ success: true });

    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      businessId: req.user?.businessId || null,
      route: "auth.logout",
    });

  } catch (err) {
    next(err);
  }
};



