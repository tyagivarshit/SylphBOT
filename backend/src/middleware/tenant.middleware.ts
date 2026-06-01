import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../utils/AppError";
import { updateRequestContext } from "../observability/requestContext";
import { getRequestBusinessId } from "../services/tenant.service";
import { assertTenantIsolation } from "../services/security/securityGovernanceOS.service";
import { runDetachedBackgroundTask } from "../utils/backgroundTask";

const readHeaderTenantId = (req: Request) => {
  const header = req.headers["x-tenant-id"] || req.headers["x-business-id"];
  const value = Array.isArray(header) ? header[0] : header;
  const normalized = String(value || "").trim();
  return normalized || null;
};

const isReadOnlyBillingFastPath = (req: Request) => {
  if (process.env.RBAC_READ_FAST_PATH_ENABLED === "false") {
    return false;
  }

  const surface = String(req.query?.surface || "").trim().toLowerCase();
  const route = String(req.originalUrl || req.path || req.url || "")
    .trim()
    .toLowerCase();

  return (
    req.method === "GET" &&
    surface === "billing" &&
    route.startsWith("/api/billing")
  );
};

const isTenantHeaderAllowed = (
  headerTenantId: string | null,
  businessId: string | null
) =>
  !headerTenantId ||
  (Boolean(businessId) && String(headerTenantId) === String(businessId));

const detachTenantIsolationAudit = (input: {
  businessId: string | null;
  headerTenantId: string | null;
  route: string;
  method: string;
  reason: string;
}) => {
  runDetachedBackgroundTask("tenant_isolation_audit", () =>
    assertTenantIsolation({
      businessId: input.businessId,
      tenantId: input.businessId,
      actorTenantId: input.businessId,
      resourceTenantId: input.headerTenantId || input.businessId,
      subsystem: "HTTP",
      reason: input.reason,
      metadata: {
        route: input.route,
        method: input.method,
        async: true,
      },
    })
  );
};

export const attachTenantContext = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const businessId = getRequestBusinessId(req);

  req.tenant = {
    businessId,
  };

  updateRequestContext({
    businessId,
    tenantId: businessId,
  });

  if (isReadOnlyBillingFastPath(req)) {
    const headerTenantId = readHeaderTenantId(req);
    if (!isTenantHeaderAllowed(headerTenantId, businessId)) {
      return next(forbidden("Cross-tenant access blocked"));
    }

    detachTenantIsolationAudit({
      businessId,
      headerTenantId,
      route: req.originalUrl,
      method: req.method,
      reason: "tenant_context_attach_fast_path",
    });
    return next();
  }

  void (async () => {
    const headerTenantId = readHeaderTenantId(req);
    const isolation = await assertTenantIsolation({
      businessId,
      tenantId: businessId,
      actorTenantId: businessId,
      resourceTenantId: headerTenantId || businessId,
      subsystem: "HTTP",
      reason: "tenant_context_attach",
      metadata: {
        route: req.originalUrl,
        method: req.method,
      },
    });

    if (!isolation.allowed) {
      return next(forbidden("Cross-tenant access blocked"));
    }

    next();
  })().catch(next);
};

export const requireBusinessContext = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const businessId = getRequestBusinessId(req);

  if (!req.user && !req.apiKey) {
    return next(unauthorized("Unauthorized"));
  }

  if (!businessId) {
    return next(forbidden("Business context is required"));
  }

  req.tenant = {
    businessId,
  };

  updateRequestContext({
    businessId,
    tenantId: businessId,
  });

  if (isReadOnlyBillingFastPath(req)) {
    const headerTenantId = readHeaderTenantId(req);
    if (!isTenantHeaderAllowed(headerTenantId, businessId)) {
      return next(forbidden("Cross-tenant access blocked"));
    }

    detachTenantIsolationAudit({
      businessId,
      headerTenantId,
      route: req.originalUrl,
      method: req.method,
      reason: "tenant_context_required_fast_path",
    });
    return next();
  }

  void (async () => {
    const headerTenantId = readHeaderTenantId(req);
    const isolation = await assertTenantIsolation({
      businessId,
      tenantId: businessId,
      actorTenantId: businessId,
      resourceTenantId: headerTenantId || businessId,
      subsystem: "HTTP",
      reason: "tenant_context_required",
      metadata: {
        route: req.originalUrl,
        method: req.method,
      },
    });

    if (!isolation.allowed) {
      return next(forbidden("Cross-tenant access blocked"));
    }

    next();
  })().catch(next);
};
