import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { verifyPasswordWorker, hashPasswordWorker } from "../utils/bcryptWorker";
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
import { TimeoutExceededError, withTimeout } from "../utils/boundedTimeout";
import { getStartupIsolationSnapshot } from "../runtime/startupIsolation.service";

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
  return verifyPasswordWorker(plainTextPassword, storedHash);
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
const LOGIN_PASSWORD_VERIFY_BASE_BUDGET_MS = 900;
const LOGIN_DB_PERSISTENCE_BASE_BUDGET_MS = 1800;
const LOGIN_LIFECYCLE_LOCK_BASE_BUDGET_MS = LOGIN_LIFECYCLE_LOCK_WAIT_MS;
const LOGIN_TOKEN_ISSUE_BASE_BUDGET_MS = 220;
const LOGIN_RESPONSE_COMMIT_BASE_BUDGET_MS = 320;
const LOGIN_ADAPTIVE_BUDGET_MAX_MULTIPLIER = 2.4;
const LOGIN_ADAPTIVE_BUDGET_MIN_MULTIPLIER = 1;
const LOGIN_PROCESSING_RETRY_AFTER_BASE_MS = 280;
const LOGIN_PROCESSING_RETRY_AFTER_MAX_MS = 1000;

type LoginBudgetStage =
  | "password_verify_budget"
  | "db_persistence_budget"
  | "lifecycle_lock_budget"
  | "token_issue_budget"
  | "response_commit_budget";

type AdaptiveLoginBudgets = {
  stageBudgets: Record<LoginBudgetStage, number>;
  multiplier: number;
  pressureReasons: string[];
  startupWindowActive: boolean;
  startupPressure: {
    eventLoopLagMs: number;
    cpuPressurePercent: number;
  };
  requestQueue: {
    activeCritical: number;
    queuedCritical: number;
  };
  requestRemainingMs: number;
  degradedRuntime: boolean;
  processingRetryAfterMs: number;
};

type LoginProcessingReason =
  | "login_inflight"
  | "request_budget_low"
  | "db_persistence_timeout"
  | "lifecycle_lock_timeout";

class LoginStageTimeoutError extends Error {
  readonly stage: LoginBudgetStage;
  readonly budgetMs: number;
  readonly elapsedMs: number;

  constructor(stage: LoginBudgetStage, budgetMs: number, elapsedMs: number) {
    super(`auth_stage_timeout:${stage}:${budgetMs}:${elapsedMs}`);
    this.name = "LoginStageTimeoutError";
    this.stage = stage;
    this.budgetMs = budgetMs;
    this.elapsedMs = elapsedMs;
  }
}

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

const asNumber = (value: unknown, fallbackValue = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return parsed;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const withShortTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const computeAdaptiveLoginBudgets = (input: {
  req: Request;
  res: Response;
  passwordHashCost: number | null;
  startupContentionMs: number;
}) => {
  const startupSnapshot = getStartupIsolationSnapshot();
  const startupWindowActive = Boolean(startupSnapshot?.startupWindowActive);
  const startupPressure = {
    eventLoopLagMs: Math.max(0, asNumber(startupSnapshot?.pressure?.eventLoopLagMs, 0)),
    cpuPressurePercent: Math.max(
      0,
      asNumber(startupSnapshot?.pressure?.cpuPressurePercent, 0)
    ),
  };
  const requestQueue = {
    activeCritical: Math.max(
      0,
      Math.floor(asNumber(startupSnapshot?.requestPriority?.active?.critical, 0))
    ),
    queuedCritical: Math.max(
      0,
      Math.floor(asNumber(startupSnapshot?.requestPriority?.queue?.critical, 0))
    ),
  };
  const requestRemainingMs = getRequestRemainingMs(
    {
      req: input.req,
      res: input.res,
    },
    10_000
  );
  const pressureReasons: string[] = [];
  let multiplier = 1;

  if (startupWindowActive) {
    multiplier += 0.2;
    pressureReasons.push("startup_window_active");
  }
  if (input.startupContentionMs >= 150) {
    multiplier += 0.15;
    pressureReasons.push("request_priority_queue_delay");
  }
  if (startupPressure.eventLoopLagMs >= 45) {
    multiplier += 0.2;
    pressureReasons.push("event_loop_lag_elevated");
  }
  if (startupPressure.eventLoopLagMs >= 90) {
    multiplier += 0.2;
    pressureReasons.push("event_loop_lag_high");
  }
  if (startupPressure.cpuPressurePercent >= 65) {
    multiplier += 0.2;
    pressureReasons.push("cpu_pressure_elevated");
  }
  if (startupPressure.cpuPressurePercent >= 85) {
    multiplier += 0.2;
    pressureReasons.push("cpu_pressure_high");
  }
  if (requestQueue.activeCritical > 0 || requestQueue.queuedCritical > 0) {
    multiplier += 0.15;
    pressureReasons.push("critical_queue_contention");
  }
  if ((input.passwordHashCost || 0) >= 12) {
    multiplier += 0.3;
    pressureReasons.push("bcrypt_cost_high");
  }

  multiplier = clamp(
    Number(multiplier.toFixed(2)),
    LOGIN_ADAPTIVE_BUDGET_MIN_MULTIPLIER,
    LOGIN_ADAPTIVE_BUDGET_MAX_MULTIPLIER
  );
  const basePasswordBudgetMs =
    LOGIN_PASSWORD_VERIFY_BASE_BUDGET_MS +
    Math.max(0, ((input.passwordHashCost || 10) - 10) * 220);
  const stageBudgets: Record<LoginBudgetStage, number> = {
    password_verify_budget: Math.max(
      450,
      Math.round(basePasswordBudgetMs * multiplier)
    ),
    db_persistence_budget: Math.max(
      600,
      Math.round(LOGIN_DB_PERSISTENCE_BASE_BUDGET_MS * multiplier)
    ),
    lifecycle_lock_budget: Math.max(
      250,
      Math.round(LOGIN_LIFECYCLE_LOCK_BASE_BUDGET_MS * multiplier)
    ),
    token_issue_budget: Math.max(
      120,
      Math.round(LOGIN_TOKEN_ISSUE_BASE_BUDGET_MS * multiplier)
    ),
    response_commit_budget: Math.max(
      140,
      Math.round(LOGIN_RESPONSE_COMMIT_BASE_BUDGET_MS * multiplier)
    ),
  };
  const degradedRuntime =
    startupWindowActive ||
    startupPressure.eventLoopLagMs >= 45 ||
    startupPressure.cpuPressurePercent >= 65 ||
    requestQueue.queuedCritical > 0 ||
    input.startupContentionMs >= 150;
  const processingRetryAfterMs = clamp(
    Math.round(LOGIN_PROCESSING_RETRY_AFTER_BASE_MS * multiplier),
    LOGIN_PROCESSING_RETRY_AFTER_BASE_MS,
    LOGIN_PROCESSING_RETRY_AFTER_MAX_MS
  );

  return {
    stageBudgets,
    multiplier,
    pressureReasons,
    startupWindowActive,
    startupPressure,
    requestQueue,
    requestRemainingMs,
    degradedRuntime,
    processingRetryAfterMs,
  } satisfies AdaptiveLoginBudgets;
};

const emitLoginBudgetTelemetry = (input: {
  businessId: string | null;
  stage: LoginBudgetStage;
  elapsedMs: number;
  budgetMs: number;
  policy: "soft" | "hard";
  outcome: "ok" | "budget_exceeded" | "timeout";
  metadata?: Record<string, unknown>;
}) => {
  emitPerformanceMetric({
    name: "auth_processing_state",
    value: Math.max(0, Math.round(input.elapsedMs)),
    businessId: input.businessId,
    route: "auth.login",
    metadata: {
      stage: input.stage,
      policy: input.policy,
      budgetMs: input.budgetMs,
      elapsedMs: input.elapsedMs,
      withinBudget: input.elapsedMs <= input.budgetMs,
      outcome: input.outcome,
      ...(input.metadata || {}),
    },
  });
};

const sendLoginProcessing = (input: {
  res: Response;
  startedAt: number;
  businessId: string | null;
  code: LoginProcessingReason;
  message: string;
  retryAfterMs: number;
  metadata?: Record<string, unknown>;
}) =>
  input.res.status(202).json({
    success: false,
    processing: true,
    retryable: true,
    code: "AUTH_LOGIN_PROCESSING",
    processingCode: input.code,
    retryAfterMs: input.retryAfterMs,
    message: input.message,
    authLifecycle: {
      processingState: "PROCESSING",
      lifecycleState: "PROCESSING",
      sessionReady: false,
      retryable: true,
      retryAfterMs: input.retryAfterMs,
      terminal: false,
      reason: input.code,
    },
    metadata: {
      elapsedMs: Date.now() - input.startedAt,
      ...(input.metadata || {}),
    },
  });

const withFastTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  return withShortTimeout(task, timeoutMs, "fast_operation_timeout");
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
    const count = await withFastTimeout(redis.incr(key), 80);

    if (count === 1) {
      await withFastTimeout(redis.expire(key, 60), 80);
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

    const hashed = await hashPasswordWorker(password, 12);
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
    const ip = getIP(req);
    const userAgent = String(getUA(req));

    await checkGlobalLimit(ip);

    const email = normalizeEmail(String(req.body.email || ""));
    const password = String(req.body.password || "");

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordVerified = user
      ? await verifyPassword(password, user.password)
      : false;

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
      throw unauthorized("Invalid credentials");
    }

    const resolvedUser = {
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      email: user.email,
      name: user.name,
    };
    const businessId = user.businessId || null;

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

    await prisma.refreshToken.create({
      data: {
        token: hashedRefreshToken,
        userId: resolvedUser.id,
        userAgent,
        ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

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

    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      businessId,
      route: "auth.login",
      metadata: {
        source: "password",
      },
    });

    runDetachedAuthTask("auth.login.prune_refresh_tokens", async () => {
      await withFastTimeout(
        pruneRefreshTokens(resolvedUser.id, 4),
        LOGIN_BACKGROUND_TASK_TIMEOUT_MS
      );
    });

    runDetachedAuthTask("auth.login.session_ledger", async () => {
      const sessionLedgerStartedAt = Date.now();
      let outcome = "ok";
      try {
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
      } catch (error) {
        outcome = "error";
        throw error;
      } finally {
        emitPerformanceMetric({
          name: "session_ledger_ms",
          value: Date.now() - sessionLedgerStartedAt,
          businessId,
          route: "auth.login",
          metadata: {
            source: "auth.login.session_ledger",
            outcome,
          },
        });
      }
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
        shouldRun: () => true,
      }
    );

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
        password: await hashPasswordWorker(password, 12),
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
      name: req.user?.name || "Workspace User",
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



