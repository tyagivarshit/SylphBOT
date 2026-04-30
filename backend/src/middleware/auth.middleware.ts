import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { unauthorized } from "../utils/AppError";
import crypto from "crypto";
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
import {
  authorizeSuspiciousSessionChallenge,
  issueSessionLedger,
  trackSessionAnomaly,
} from "../services/security/securityGovernanceOS.service";

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
      businessId: true,
      email: true,
      business: {
        select: {
          id: true,
          deletedAt: true,
        },
      },
    },
  });

const resolveActiveBusinessId = (user: {
  businessId: string | null;
  business?: {
    id: string;
    deletedAt: Date | null;
  } | null;
}) => {
  if (!user.businessId) {
    return null;
  }

  if (!user.business) {
    return null;
  }

  if (user.business?.deletedAt) {
    return null;
  }

  return user.businessId;
};

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

const enforceSessionAnomalyGuard = async (req: Request, input: {
  userId: string;
  businessId: string | null;
}) => {
  const sessionKey = getSessionKeyFromRequest(req);
  if (!sessionKey) {
    return;
  }

  await issueSessionLedger({
    businessId: input.businessId,
    tenantId: input.businessId,
    userId: input.userId,
    sessionKey,
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    deviceId: String(req.headers["x-device-id"] || "").trim() || null,
    metadata: {
      source: "auth.middleware",
      requestId: req.requestId || null,
    },
  }).catch(() => undefined);

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

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
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

      if (decoded?.id && typeof decoded.tokenVersion === "number") {
        const user = await getUserWithBusiness(decoded.id);

        if (
          user &&
          user.isActive &&
          !user.deletedAt &&
          user.tokenVersion === decoded.tokenVersion
        ) {
          bindAuthenticatedContext(req, {
            id: user.id,
            role: user.role,
            email: user.email,
            businessId: resolveActiveBusinessId(user),
          });

          await enforceSessionAnomalyGuard(req, {
            userId: user.id,
            businessId: resolveActiveBusinessId(user),
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

    const newAccessToken = generateAccessToken(
      user.id,
      user.role,
      resolveActiveBusinessId(user),
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
      businessId: resolveActiveBusinessId(user),
    });

    await enforceSessionAnomalyGuard(req, {
      userId: user.id,
      businessId: resolveActiveBusinessId(user),
    });

    return next();
  } catch (err) {
    return next(err);
  }
};
