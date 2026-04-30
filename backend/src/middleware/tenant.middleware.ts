import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../utils/AppError";
import { updateRequestContext } from "../observability/requestContext";
import { getRequestBusinessId } from "../services/tenant.service";
import { assertTenantIsolation } from "../services/security/securityGovernanceOS.service";

const readHeaderTenantId = (req: Request) => {
  const header = req.headers["x-tenant-id"] || req.headers["x-business-id"];
  const value = Array.isArray(header) ? header[0] : header;
  const normalized = String(value || "").trim();
  return normalized || null;
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
