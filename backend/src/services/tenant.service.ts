import type { Request } from "express";

export const getRequestBusinessId = (req: Request) =>
  req.user?.businessId || req.apiKey?.businessId || req.tenant?.businessId || null;

export const getTenantFilter = <T extends Record<string, unknown>>(
  businessId: string,
  extraWhere?: T
) =>
  ({
    businessId,
    ...(extraWhere || {}),
  }) as T & { businessId: string };

export const isTenantScopedRequest = (req: Request) =>
  Boolean(getRequestBusinessId(req));

export const assertBusinessOwnership = (
  requestBusinessId: string | null,
  candidateBusinessId: string | null | undefined
) =>
  Boolean(
    requestBusinessId &&
      candidateBusinessId &&
      String(requestBusinessId) === String(candidateBusinessId)
  );
