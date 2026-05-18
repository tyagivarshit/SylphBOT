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
import {
  ensureAuthBootstrapContext,
  primeAuthBootstrapContext,
} from "../services/authBootstrap.service";
import { withDistributedLock } from "../services/distributedLock.service";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import {
  getRequestRemainingMs,
  isRequestLifecycleAborted,
  throwIfRequestLifecycleAborted,
} from "../utils/requestLifecycle";
import { primeAuthContextCacheForToken } from "../middleware/auth.middleware";

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

const extractBcryptCost = (storedHash: string) => {
  const match = /^\$2[abxy]\$(\d{2})\$/.exec(String(storedHash || "").trim());
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
};

const isStrongPassword = (password: string) =>
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(password);

const LOGIN_SESSION_LEDGER_TIMEOUT_MS = 400;
const AUTH_ME_FALLBACK_QUERY_TIMEOUT_MS = 700;
const LOGIN_REFRESH_TOKEN_TIMEOUT_MS = 1800;
const LOGIN_BACKGROUND_TASK_TIMEOUT_MS = 1200;
const LOGIN_LIFECYCLE_LOCK_TTL_MS = 15_000;
const LOGIN_LIFECYCLE_LOCK_WAIT_MS = 450;
const LOGIN_LIFECYCLE_LOCK_POLL_MS = 60;
const LOGIN_PASSWORD_VERIFY_BUDGET_MS = 400;

const buildLoginLifecycleLockKey = (input: {
  userId?: string | null;
  email: string;
  ip: string;
  userAgent: string;
}) => {
  const stableIdentity =
    String(input.userId || "").trim() || String(input.email || "").trim().toLowerCase();
  const fingerprint = hashToken(
    `${stableIdentity}:${String(input.ip || "").trim()}:${String(input.userAgent || "").trim()}`
  );
  return `auth:login:lifecycle:${fingerprint.slice(0, 28)}`;
};

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
          reject(new Error("auth_operation_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const runDetachedAuthTask = (
  label: string,
  task: () => Promise<void>
) => {
  setTimeout(() => {
    void task().catch((error) => {
      console.warn("AUTH_BACKGROUND_TASK_FAILED", {
        label,
        reason: String((error as Error)?.message || "auth_background_task_failed"),
      });
    });
  }, 20);
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
  const loginWaterfallMs: Record<string, number> = {};
  const measureStep = (label: string, stepStartedAt: number) => {
    loginWaterfallMs[label] = Date.now() - stepStartedAt;
  };
  try {
    throwIfRequestLifecycleAborted({
      req,
      res,
      stage: "auth.login.start",
    });
    const ip = getIP(req);
    const userAgent = String(getUA(req));
    const globalLimitStartedAt = Date.now();
    await checkGlobalLimit(ip);
    measureStep("globalLimit", globalLimitStartedAt);

    const email = normalizeEmail(String(req.body.email || ""));
    const password = String(req.body.password || "");

    const userLookupStartedAt = Date.now();
    const user = await prisma.user.findUnique({ where: { email } });
    measureStep("userLookup", userLookupStartedAt);
    const passwordVerifyStartedAt = Date.now();
    const passwordHashCost = user ? extractBcryptCost(user.password) : null;
    const passwordVerified = user
      ? await verifyPassword(password, user.password)
      : false;
    const passwordVerifyMs = Date.now() - passwordVerifyStartedAt;
    loginWaterfallMs.passwordVerify = passwordVerifyMs;
    emitPerformanceMetric({
      name: "password_verify_ms",
      value: passwordVerifyMs,
      businessId: user?.businessId || null,
      route: "auth.login",
      metadata: {
        source: "password_login",
        hashCost: passwordHashCost,
        withinBudget: passwordVerifyMs <= LOGIN_PASSWORD_VERIFY_BUDGET_MS,
      },
    });

    if (
      !user ||
      user.deletedAt ||
      !user.isActive ||
      !user.isVerified ||
      !passwordVerified
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
        ip,
      });
      void recordFraudSignal({
        businessId: user?.businessId || null,
        tenantId: user?.businessId || null,
        signalType: "credential_stuffing",
        actorId: user?.id || email,
        ipFingerprint: hashToken(ip).slice(0, 20),
        severity: "MEDIUM",
        metadata: {
          email,
          route: req.originalUrl,
        },
      }).catch(() => undefined);
      emitPerformanceMetric({
        name: "auth_terminal_failure",
        value: Date.now() - startedAt,
        businessId: user?.businessId || null,
        route: "auth.login",
        metadata: {
          reason: "invalid_credentials",
        },
      });
      emitPerformanceMetric({
        name: "auth_login_total_ms",
        value: Date.now() - startedAt,
        businessId: user?.businessId || null,
        route: "auth.login",
        metadata: {
          outcome: "invalid_credentials",
        },
      });
      console.info("AUTH_LOGIN_WATERFALL", {
        status: "invalid_credentials",
        userId: user?.id || null,
        businessId: user?.businessId || null,
        totalMs: Date.now() - startedAt,
        loginWaterfallMs,
      });
      throw unauthorized("Invalid credentials");
    }
    throwIfRequestLifecycleAborted({
      req,
      res,
      stage: "auth.login.verified",
    });
    const startupContentionMs = Math.max(
      0,
      Number((res.locals as Record<string, unknown>)?.requestQueueWaitMs || 0)
    );
    emitPerformanceMetric({
      name: "auth_startup_contention_ms",
      value: startupContentionMs,
      businessId: user.businessId || null,
      route: "auth.login",
      metadata: {
        priorityClass: String(
          (res.locals as Record<string, unknown>)?.requestPriorityClass || "UNKNOWN"
        )
          .trim()
          .toUpperCase(),
        source: "request_priority_queue",
      },
    });

    const resolvedUser = {
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      email: user.email,
      name: user.name,
    };
    const businessId = user.businessId || null;
    const lockKey = buildLoginLifecycleLockKey({
      userId: resolvedUser.id,
      email,
      ip,
      userAgent,
    });

    type LoginLifecycleResult =
      | {
          completed: false;
          lockHoldMs: number;
        }
      | {
          completed: true;
          accessToken: string;
          refreshRaw: string;
          hashedRefreshToken: string;
          lockHoldMs: number;
        };

    const lockLifecycleStartedAt = Date.now();
    const loginResult = await withDistributedLock<LoginLifecycleResult | null>({
      key: lockKey,
      ttlMs: LOGIN_LIFECYCLE_LOCK_TTL_MS,
      waitMs: LOGIN_LIFECYCLE_LOCK_WAIT_MS,
      pollMs: LOGIN_LIFECYCLE_LOCK_POLL_MS,
      onUnavailable: async () => null,
      run: async () => {
        const lockHoldStartedAt = Date.now();
        const tokenIssueStartedAt = Date.now();
        const accessToken = generateAccessToken(
          resolvedUser.id,
          resolvedUser.role,
          businessId,
          resolvedUser.tokenVersion
        );

        const refreshRaw = generateRefreshToken(
          resolvedUser.id,
          resolvedUser.tokenVersion
        );
        const hashedRefreshToken = hashToken(refreshRaw);
        measureStep("tokenIssue", tokenIssueStartedAt);

        const refreshPersistStartedAt = Date.now();
        await withFastTimeout(
          prisma.refreshToken.create({
            data: {
              token: hashedRefreshToken,
              userId: resolvedUser.id,
              userAgent,
              ip,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          }),
          LOGIN_REFRESH_TOKEN_TIMEOUT_MS
        );
        measureStep("refreshPersist", refreshPersistStartedAt);

        throwIfRequestLifecycleAborted({
          req,
          res,
          stage: "auth.login.session_persisted",
        });

        if (isRequestLifecycleAborted({ req, res }) || res.headersSent || res.writableEnded) {
          return {
            completed: false,
            lockHoldMs: Date.now() - lockHoldStartedAt,
          };
        }

        return {
          completed: true,
          accessToken,
          refreshRaw,
          hashedRefreshToken,
          lockHoldMs: Date.now() - lockHoldStartedAt,
        };
      },
    });
    measureStep("lockLifecycle", lockLifecycleStartedAt);
    if (loginResult?.lockHoldMs !== undefined) {
      emitPerformanceMetric({
        name: "auth_lock_hold_ms",
        value: loginResult.lockHoldMs,
        businessId,
        route: "auth.login",
        metadata: {
          lockKey,
        },
      });
    }

    if (!loginResult) {
      emitPerformanceMetric({
        name: "auth_duplicate_login_blocked",
        value: Date.now() - startedAt,
        businessId,
        route: "auth.login",
        metadata: {
          reason: "inflight_lock_unavailable",
          lockKey,
        },
      });
      emitPerformanceMetric({
        name: "auth_processing_state",
        value: Date.now() - startedAt,
        businessId,
        route: "auth.login",
        metadata: {
          state: "PROCESSING",
          reason: "login_inflight",
        },
      });
      emitPerformanceMetric({
        name: "auth_inflight_reused",
        value: Date.now() - startedAt,
        businessId,
        route: "auth.login",
        metadata: {
          source: "distributed_lock",
        },
      });
      console.info("AUTH_LOGIN_WATERFALL", {
        status: "lock_unavailable",
        userId: resolvedUser.id,
        businessId,
        requestId: req.requestId || null,
        totalMs: Date.now() - startedAt,
        loginWaterfallMs,
      });
      emitPerformanceMetric({
        name: "auth_login_total_ms",
        value: Date.now() - startedAt,
        businessId,
        route: "auth.login",
        metadata: {
          outcome: "processing",
        },
      });
      return res.status(202).json({
        success: false,
        processing: true,
        retryable: true,
        code: "AUTH_LOGIN_PROCESSING",
        message: "Login is still processing. Please wait a moment and retry.",
      });
    }

    if (!loginResult.completed) {
      return;
    }

    if (isRequestLifecycleAborted({ req, res }) || res.headersSent || res.writableEnded) {
      return;
    }

    const accessToken = loginResult.accessToken;
    const refreshRaw = loginResult.refreshRaw;
    const hashedRefreshToken = loginResult.hashedRefreshToken;

    primeAuthContextCacheForToken({
      accessToken,
      userId: resolvedUser.id,
      role: resolvedUser.role,
      tokenVersion: resolvedUser.tokenVersion,
      email: resolvedUser.email,
      businessId,
    });

    void writeAuthAuditLog(req, {
      action: "auth.login",
      userId: resolvedUser.id,
      businessId,
      metadata: {
        email: resolvedUser.email,
        role: resolvedUser.role,
      },
    });

    const responseCommitStartedAt = Date.now();
    setCookies(req, res, accessToken, refreshRaw);

    res.json({
      success: true,
      user: {
        id: resolvedUser.id,
        email: resolvedUser.email,
        name: resolvedUser.name,
        businessId,
      },
    });
    measureStep("responseCommit", responseCommitStartedAt);

    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      businessId,
      route: "auth.login",
      metadata: {
        source: "password",
      },
    });
    emitPerformanceMetric({
      name: "auth_bootstrap_ms",
      value: Date.now() - startedAt,
      businessId,
      route: "auth.login",
      metadata: {
        stage: "response_committed",
        source: "password",
      },
    });
    emitPerformanceMetric({
      name: "auth_session_ready",
      value: Date.now() - startedAt,
      businessId,
      route: "auth.login",
      metadata: {
        stage: "session_persisted",
        source: "password",
      },
    });
    emitPerformanceMetric({
      name: "auth_login_total_ms",
      value: Date.now() - startedAt,
      businessId,
      route: "auth.login",
      metadata: {
        outcome: "success",
      },
    });

    runDetachedAuthTask("auth.login.prune_refresh_tokens", async () => {
      await withFastTimeout(
        pruneRefreshTokens(resolvedUser.id, 4),
        LOGIN_BACKGROUND_TASK_TIMEOUT_MS
      );
    });

    runDetachedAuthTask("auth.login.session_ledger", async () => {
      await withFastTimeout(
        issueSessionLedger({
          businessId,
          tenantId: businessId,
          userId: resolvedUser.id,
          sessionKey: hashedRefreshToken,
          ip,
          userAgent,
          deviceId: String(req.headers["x-device-id"] || "").trim() || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          metadata: {
            source: "auth.login",
          },
        }),
        Math.max(LOGIN_SESSION_LEDGER_TIMEOUT_MS, LOGIN_BACKGROUND_TASK_TIMEOUT_MS)
      );
    });

    primeAuthBootstrapContext(
      {
        userId: resolvedUser.id,
        preferredBusinessId: businessId,
        profileSeed: {
          email: resolvedUser.email,
          name: resolvedUser.name,
          avatar: user.avatar || null,
        },
      },
      {
        shouldRun: () => !isRequestLifecycleAborted({ req, res }),
      }
    );

    console.info("AUTH_LOGIN_WATERFALL", {
      status: "success",
      userId: resolvedUser.id,
      businessId,
      requestId: req.requestId || null,
      totalMs: Date.now() - startedAt,
      loginWaterfallMs,
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
    throwIfRequestLifecycleAborted({
      req,
      res,
      stage: "auth.me.start",
    });
    if (!req.user?.id) throw unauthorized("Not authenticated");

    let payload = {
      id: String(req.user.id),
      name: "Workspace User",
      email: String(req.user?.email || ""),
      role: String(req.user?.role || "AGENT"),
      businessId: String(req.user?.businessId || "").trim() || null,
    };

    if (
      (payload.businessId == null || !payload.email || payload.name === "Workspace User") &&
      getRequestRemainingMs({ req, res }, 0) > AUTH_ME_FALLBACK_QUERY_TIMEOUT_MS + 150
    ) {
      const fallbackUser = await prisma.user
        .findUnique({
          where: { id: req.user.id },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            businessId: true,
          },
        })
        .catch(() => null);

      if (fallbackUser) {
        payload = {
          id: fallbackUser.id,
          name: fallbackUser.name,
          email: fallbackUser.email,
          role: fallbackUser.role,
          businessId: fallbackUser.businessId || null,
        };
      }
    }

    if (isRequestLifecycleAborted({ req, res }) || res.headersSent || res.writableEnded) {
      return;
    }

    primeAuthBootstrapContext(
      {
        userId: String(req.user.id),
        preferredBusinessId: payload.businessId,
        profileSeed: {
          email: payload.email || null,
          name: payload.name || null,
        },
      },
      {
        shouldRun: () => !isRequestLifecycleAborted({ req, res }),
      }
    );

    res.setHeader("Cache-Control", "no-store");

    res.json({
      success: true,
      user: payload,
    });

    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      businessId: payload.businessId,
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



