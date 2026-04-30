import type { NextFunction, Request, Response } from "express";
import {
  getApiKeyAuthenticationResult,
  hasApiKeyPermission,
} from "../services/apiKey.service";
import {
  recordInvalidApiKeyAttempt,
  recordSuspiciousActivity,
} from "../services/securityAlert.service";
import { enforceSecurityGovernanceInfluence } from "../services/security/securityGovernanceOS.service";
import { forbidden, unauthorized } from "../utils/AppError";
import { updateRequestContext } from "../observability/requestContext";

const extractApiKey = (req: Request) => {
  const headerValue = req.headers["x-api-key"];

  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }

  const authorization = req.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, value] = authorization.split(" ");

  if (/^bearer$/i.test(scheme) && value?.startsWith("sylph_")) {
    return value.trim();
  }

  return null;
};

const bindApiKeyContext = (
  req: Request,
  apiKey: {
    id: string;
    businessId: string;
    permissions: string[];
    scopes: string[];
    name: string | null;
  }
) => {
  req.apiKey = {
    id: apiKey.id,
    businessId: apiKey.businessId,
    permissions: apiKey.permissions,
    scopes: apiKey.scopes,
    name: apiKey.name,
  };

  req.tenant = {
    businessId: apiKey.businessId,
  };

  updateRequestContext({
    businessId: apiKey.businessId,
    tenantId: apiKey.businessId,
  });
};

const getIpAddress = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  "unknown";

export const optionalApiKeyAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const rawKey = extractApiKey(req);

    if (!rawKey) {
      return next();
    }

    const authentication = await getApiKeyAuthenticationResult(rawKey);

    if (!("apiKey" in authentication)) {
      const invalidAuthentication = authentication;

      void recordInvalidApiKeyAttempt({
        businessId: invalidAuthentication.businessId || null,
        keyFingerprint: invalidAuthentication.keyFingerprint,
        ip: getIpAddress(req),
        path: req.originalUrl,
        method: req.method,
        reason: invalidAuthentication.reason,
      });
      return next(unauthorized("Invalid API key"));
    }

    if (!hasApiKeyPermission(authentication.apiKey, req.method)) {
      void recordSuspiciousActivity({
        businessId: authentication.apiKey.businessId,
        fingerprint: `api-key-scope:${authentication.apiKey.id}:${req.method}:${req.originalUrl}`,
        metadata: {
          apiKeyId: authentication.apiKey.id,
          method: req.method,
          path: req.originalUrl,
          scopes: authentication.apiKey.scopes,
          reason: "scope_denied",
        },
      });

      return next(forbidden("API key scope does not allow this request"));
    }

    await enforceSecurityGovernanceInfluence({
      domain: "API_CLIENT_AUTH",
      action: "messages:enqueue",
      businessId: authentication.apiKey.businessId,
      tenantId: authentication.apiKey.businessId,
      actorId: authentication.apiKey.id,
      actorType: "API_KEY",
      permissions: authentication.apiKey.permissions,
      scopes: authentication.apiKey.scopes,
      resourceType: "HTTP_REQUEST",
      resourceId: req.originalUrl,
      resourceTenantId: authentication.apiKey.businessId,
      purpose: "API_REQUEST",
      metadata: {
        method: req.method,
        path: req.originalUrl,
        keyFingerprint: authentication.keyFingerprint,
      },
    });

    bindApiKeyContext(req, authentication.apiKey);
    next();
  } catch (error) {
    next(error);
  }
};

export const requireApiKeyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  await optionalApiKeyAuth(req, res, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }

    if (!req.apiKey) {
      next(unauthorized("API key required"));
      return;
    }

    next();
  });
};
