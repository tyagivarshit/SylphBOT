import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { unauthorized } from "../utils/AppError";
import crypto from "crypto";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import {
  generateAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/generateToken";
import {
  clearAuthCookies,
  getAuthCookieOptions,
} from "../utils/authCookies";
import { updateRequestContext } from "../observability/requestContext";
import { resolveUserWorkspaceIdentity } from "../services/tenant.service";
import {
  authorizeSuspiciousSessionChallenge,
  trackSessionAnomaly,
} from "../services/security/securityGovernanceOS.service";

const AUTH_CONTEXT_CACHE_TTL_MS = 15_000;
const SESSION_ANOMALY_RECHECK_MS = 10_000;
const SESSION_ANOMALY_GUARD_TIMEOUT_MS = 450;

type CachedAuthContext = {
  userId: string;
  role: string;
  email?: string;
  businessId: string | null;
  tokenVersion: number;
  expiresAt: number;
};

const authContextCache = new Map<string, CachedAuthContext>();
const sessionAnomalyCheckedAt = new Map<string, number>();

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const getUserWithBusiness = async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      deletedAt: true,
      tokenVersion: true,
      email: true,
      businessId: true,
    },
  });

const bindAuthenticatedContext = (
  req: Request,
  user: {
    id: string;
    role: string;
    businessId: string | null;
    email?: string;
  }
) => {
  req.user = user;
  req.businessId = user.businessId;
  req.tenant = {
    businessId: user.businessId,
  };

  updateRequestContext({
    userId: user.id,
    businessId: user.businessId,
    tenantId: user.businessId,
  });
};

const getIpAddress = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  "unknown";

const getUserAgent = (req: Request) => {
  const value = req.headers["user-agent"];
  return Array.isArray(value) ? value[0] : String(value || "unknown");
};

const getSessionKeyFromRequest = (req: Request) => {
  const refreshToken = req.cookies?.refreshToken;
  const accessToken = req.cookies?.accessToken;
  const raw = String(refreshToken || accessToken || req.requestId || "").trim();
  return raw ? hashToken(raw) : null;
};

const resolveBusinessId = async (input: {
  userId: string;
  userBusinessId: string | null;
  preferredBusinessId?: string | null;
}) => {
  const fastPathBusinessId =
    String(input.userBusinessId || "").trim() ||
    String(input.preferredBusinessId || "").trim() ||
    null;

  if (fastPathBusinessId) {
    return fastPathBusinessId;
  }

  const identity = await resolveUserWorkspaceIdentity({
    userId: input.userId,
    preferredBusinessId: input.preferredBusinessId || null,
    bootstrapWorkspaceIfMissing: false,
    persistResolvedBusinessId: false,
  });

  return identity.businessId;
};

const enforceSessionAnomalyGuard = async (req: Request, input: {
  userId: string;
  businessId: string | null;
}) => {
  const sessionKey = getSessionKeyFromRequest(req);
  if (!sessionKey) {
    return;
  }

  const now = Date.now();
  const lastCheckedAt = sessionAnomalyCheckedAt.get(sessionKey) || 0;
  if (now - lastCheckedAt < SESSION_ANOMALY_RECHECK_MS) {
    return;
  }
  sessionAnomalyCheckedAt.set(sessionKey, now);

  const anomaly = await trackSessionAnomaly({
    sessionKey,
    businessId: input.businessId,
    tenantId: input.businessId,
    userId: input.userId,
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    deviceId: String(req.headers["x-device-id"] || "").trim() || null,
  }).catch(() => null);

  if (anomaly?.locked) {
    throw unauthorized("Session locked due to anomaly");
  }

  if (anomaly?.challengeRequired) {
    const challengeHeader = Array.isArray(req.headers["x-mfa-challenge"])
      ? req.headers["x-mfa-challenge"][0]
      : req.headers["x-mfa-challenge"];
    const challengeKey = String(challengeHeader || "").trim();
    if (!challengeKey) {
      throw unauthorized(
        `Suspicious login challenge required${anomaly?.challengeKey ? ` (${anomaly.challengeKey})` : ""}`
      );
    }
    const consumed = await authorizeSuspiciousSessionChallenge({
      challengeKey,
      userId: input.userId,
      sessionKey,
    }).catch(() => ({
      consumed: false,
      reason: "mfa_challenge_consume_failed",
    }));
    if (!consumed.consumed) {
      throw unauthorized("Suspicious login challenge not satisfied");
    }
  }
};

const withFastGuardTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number
) => {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("session_anomaly_guard_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const runSessionAnomalyGuard = async (
  req: Request,
  input: {
    userId: string;
    businessId: string | null;
  }
) => {
  try {
    await withFastGuardTimeout(
      enforceSessionAnomalyGuard(req, input),
      SESSION_ANOMALY_GUARD_TIMEOUT_MS
    );
  } catch (error) {
    // Fail open: auth should remain responsive even if anomaly telemetry is slow.
    req.logger?.warn(
      {
        error: (error as Error)?.message || String(error || "unknown"),
      },
      "Session anomaly guard skipped"
    );
  }
};

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startedAt = Date.now();

  try {
    if (req.user?.id && typeof req.user.role === "string") {
      bindAuthenticatedContext(req, {
        id: req.user.id,
        role: req.user.role,
        email: req.user.email,
        businessId: req.user.businessId || null,
      });
      emitPerformanceMetric({
        name: "AUTH_MS",
        value: Date.now() - startedAt,
        businessId: req.user.businessId || null,
        route: req.originalUrl,
        metadata: {
          source: "prebound",
        },
      });
      return next();
    }

    if (
      process.env.NODE_ENV === "integration" &&
      process.env.INTEGRATION_AUTH_BYPASS === "true"
    ) {
      const testUserIdHeader = req.headers["x-test-user-id"];
      const testBusinessIdHeader = req.headers["x-test-business-id"];
      const testRoleHeader = req.headers["x-test-user-role"];

      const testUserId = Array.isArray(testUserIdHeader)
        ? testUserIdHeader[0]
        : testUserIdHeader;
      const testBusinessId = Array.isArray(testBusinessIdHeader)
        ? testBusinessIdHeader[0]
        : testBusinessIdHeader;
      const testRole = Array.isArray(testRoleHeader)
        ? testRoleHeader[0]
        : testRoleHeader;

      if (
        typeof testUserId === "string" &&
        testUserId.trim() &&
        typeof testBusinessId === "string" &&
        testBusinessId.trim()
      ) {
        bindAuthenticatedContext(req, {
          id: testUserId.trim(),
          role: String(testRole || "OWNER").trim() || "OWNER",
          businessId: testBusinessId.trim(),
        });
        emitPerformanceMetric({
          name: "AUTH_MS",
          value: Date.now() - startedAt,
          businessId: testBusinessId.trim(),
          route: req.originalUrl,
          metadata: {
            source: "integration_bypass",
          },
        });

        return next();
      }
    }

    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    if (!accessToken && !refreshToken) {
      throw unauthorized("Missing session");
    }

    if (accessToken) {
      const decoded = verifyAccessToken(accessToken);
      const accessTokenKey = hashToken(accessToken);

      if (decoded?.id && typeof decoded.tokenVersion === "number") {
        const cachedContext = authContextCache.get(accessTokenKey);

        if (
          cachedContext &&
          cachedContext.expiresAt > Date.now() &&
          cachedContext.tokenVersion === decoded.tokenVersion
        ) {
          bindAuthenticatedContext(req, {
            id: cachedContext.userId,
            role: cachedContext.role,
            email: cachedContext.email,
            businessId: cachedContext.businessId,
          });

          await runSessionAnomalyGuard(req, {
            userId: cachedContext.userId,
            businessId: cachedContext.businessId,
          });

          emitPerformanceMetric({
            name: "CACHE_HIT",
            businessId: cachedContext.businessId,
            route: req.originalUrl,
            metadata: {
              cache: "auth_context",
            },
          });
          emitPerformanceMetric({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId: cachedContext.businessId,
            route: req.originalUrl,
            metadata: {
              source: "access_token_cache",
            },
          });

          return next();
        }

        emitPerformanceMetric({
          name: "CACHE_MISS",
          route: req.originalUrl,
          metadata: {
            cache: "auth_context",
          },
        });

        const user = await getUserWithBusiness(decoded.id);

        if (
          user &&
          user.isActive &&
          !user.deletedAt &&
          user.tokenVersion === decoded.tokenVersion
        ) {
          const businessId = await resolveBusinessId({
            userId: user.id,
            userBusinessId: user.businessId || null,
            preferredBusinessId: decoded.businessId || null,
          });

          bindAuthenticatedContext(req, {
            id: user.id,
            role: user.role,
            email: user.email,
            businessId,
          });

          await runSessionAnomalyGuard(req, {
            userId: user.id,
            businessId,
          });

          authContextCache.set(accessTokenKey, {
            userId: user.id,
            role: user.role,
            email: user.email,
            businessId,
            tokenVersion: user.tokenVersion,
            expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
          });

          emitPerformanceMetric({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId,
            route: req.originalUrl,
            metadata: {
              source: "access_token_db",
            },
          });

          return next();
        }
      }
    }

    if (!refreshToken) {
      throw unauthorized("Session expired");
    }

    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded?.id || typeof decoded.tokenVersion !== "number") {
      clearAuthCookies(res, req);
      throw unauthorized("Invalid refresh token");
    }

    const hashed = hashToken(refreshToken);
    const dbToken = await prisma.refreshToken.findFirst({
      where: {
        token: hashed,
        userId: decoded.id,
        expiresAt: { gt: new Date() },
      },
    });

    if (!dbToken) {
      clearAuthCookies(res, req);
      throw unauthorized("Session expired");
    }

    const user = await getUserWithBusiness(decoded.id);

    if (
      !user ||
      !user.isActive ||
      user.deletedAt ||
      user.tokenVersion !== decoded.tokenVersion
    ) {
      clearAuthCookies(res, req);
      throw unauthorized("Invalid session");
    }

    const businessId = await resolveBusinessId({
      userId: user.id,
      userBusinessId: user.businessId || null,
      preferredBusinessId: null,
    });

    const newAccessToken = generateAccessToken(
      user.id,
      user.role,
      businessId,
      user.tokenVersion
    );

    res.cookie("accessToken", newAccessToken, {
      ...getAuthCookieOptions(req),
      maxAge: 15 * 60 * 1000,
    });

    bindAuthenticatedContext(req, {
      id: user.id,
      role: user.role,
      email: user.email,
      businessId,
    });

    await runSessionAnomalyGuard(req, {
      userId: user.id,
      businessId,
    });

    authContextCache.set(hashToken(newAccessToken), {
      userId: user.id,
      role: user.role,
      email: user.email,
      businessId,
      tokenVersion: user.tokenVersion,
      expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
    });

    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      businessId,
      route: req.originalUrl,
      metadata: {
        source: "refresh_token",
      },
    });

    return next();
  } catch (err) {
    return next(err);
  }
};
