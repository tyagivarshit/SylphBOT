import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../utils/AppError";
import {
  hasPermission,
  type PermissionAction,
} from "../services/rbac.service";
import { assertAuthorizedAccess } from "../services/security/securityGovernanceOS.service";
import { getRequestBusinessId } from "../services/tenant.service";

const getHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const requirePermission = (action: PermissionAction) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const principal = req.apiKey
        ? {
            permissions: req.apiKey.permissions,
          }
        : req.user
          ? {
              role: req.user.role,
            }
          : null;

      if (!principal) {
        return next(unauthorized("Unauthorized"));
      }

      if (!hasPermission(principal, action)) {
        return next(forbidden("Insufficient permissions"));
      }

      const businessId = getRequestBusinessId(req);
      const mfaHeader = getHeaderValue(req.headers["x-mfa-verified"]);
      const mfaChallengeHeader = getHeaderValue(req.headers["x-mfa-challenge"]);
      const elevationHeader = getHeaderValue(req.headers["x-elevation-token"]);
      const mfaVerified =
        typeof mfaHeader === "string"
          ? ["true", "1", "yes", "on"].includes(mfaHeader.trim().toLowerCase())
          : false;

      await assertAuthorizedAccess({
        action,
        businessId,
        tenantId: businessId,
        actorId: req.user?.id || req.apiKey?.id || null,
        actorType: req.apiKey ? "API_KEY" : "USER",
        role: req.user?.role || null,
        permissions: req.apiKey?.permissions || null,
        scopes: req.apiKey?.scopes || null,
        resourceTenantId: businessId,
        mfaVerified,
        mfaChallengeKey:
          typeof mfaChallengeHeader === "string"
            ? mfaChallengeHeader.trim()
            : null,
        sessionKey: req.cookies?.refreshToken || req.requestId || null,
        deviceId: String(req.headers["x-device-id"] || "").trim() || null,
        ip:
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          req.socket.remoteAddress ||
          req.ip ||
          null,
        approvalToken:
          typeof elevationHeader === "string" ? elevationHeader.trim() : null,
        metadata: {
          route: req.originalUrl,
          method: req.method,
          requestId: req.requestId || null,
        },
      });

      next();
    } catch (error) {
      next(error);
    }
  };
