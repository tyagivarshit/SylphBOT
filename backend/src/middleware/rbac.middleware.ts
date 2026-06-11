import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../utils/AppError";
import {
  hasPermission,
  type PermissionAction,
} from "../services/rbac.service";
import {
  assertAuthorizedAccess,
  evaluateReadOnlyAccessFastPath,
} from "../services/security/securityGovernanceOS.service";
import { getRequestBusinessId } from "../services/tenant.service";
import { runDetachedBackgroundTask } from "../utils/backgroundTask";
import {
  getAnalyticsDashboardCorrelationId,
  getAnalyticsDashboardLifecycleElapsedMs,
  isAnalyticsDashboardRequest,
  logAnalyticsDashboardLifecycle,
} from "../utils/analyticsDashboardLifecycleTrace";

const getHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const isReadOnlyBillingFastPath = (req: Request, action: PermissionAction) => {
  if (process.env.RBAC_READ_FAST_PATH_ENABLED === "false") {
    return false;
  }

  const surface = String(req.query?.surface || "").trim().toLowerCase();
  const route = String(req.originalUrl || req.path || req.url || "")
    .trim()
    .toLowerCase();

  return (
    action === "billing:view" &&
    req.method === "GET" &&
    surface === "billing" &&
    route.startsWith("/api/billing")
  );
};

export const requirePermission = (action: PermissionAction) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const isAnalyticsDashboardFeatureGate =
      action === "analytics:view" && isAnalyticsDashboardRequest(req);
    let featureGateEndLogged = false;
    const logFeatureGateEnd = () => {
      if (!isAnalyticsDashboardFeatureGate || featureGateEndLogged) {
        return;
      }
      featureGateEndLogged = true;
      logAnalyticsDashboardLifecycle("FEATURE_GATE_END", {
        correlationId: getAnalyticsDashboardCorrelationId({ req, res: _res }),
        requestId: req.requestId || null,
        elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res: _res }),
        route: req.originalUrl,
        method: req.method,
        action,
      });
    };
    const originalNext = next;
    next = ((...args: Parameters<NextFunction>) => {
      logFeatureGateEnd();
      return originalNext(...args);
    }) as NextFunction;
    if (isAnalyticsDashboardFeatureGate) {
      logAnalyticsDashboardLifecycle("FEATURE_GATE_START", {
        correlationId: getAnalyticsDashboardCorrelationId({ req, res: _res }),
        requestId: req.requestId || null,
        elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res: _res }),
        route: req.originalUrl,
        method: req.method,
        action,
      });
    }
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
        logFeatureGateEnd();
        return next(unauthorized("Unauthorized"));
      }

      if (!hasPermission(principal, action)) {
        logFeatureGateEnd();
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

      const accessRequest = {
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
      };

      if (isReadOnlyBillingFastPath(req, action)) {
        const fastPathVerdict = evaluateReadOnlyAccessFastPath(accessRequest);
        if (!fastPathVerdict.allowed) {
          logFeatureGateEnd();
          return next(forbidden(`Access denied (${fastPathVerdict.reason})`));
        }

        runDetachedBackgroundTask("rbac_governance_audit", () =>
          assertAuthorizedAccess({
            ...accessRequest,
            metadata: {
              ...accessRequest.metadata,
              async: true,
            },
          })
        );

        return next();
      }

      await assertAuthorizedAccess(accessRequest);

      logFeatureGateEnd();
      next();
    } catch (error) {
      logFeatureGateEnd();
      next(error);
    }
  };
