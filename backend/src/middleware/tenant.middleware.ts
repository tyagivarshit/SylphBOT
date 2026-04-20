import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../utils/AppError";
import { updateRequestContext } from "../observability/requestContext";
import { getRequestBusinessId } from "../services/tenant.service";

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
  });

  next();
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
  });

  next();
};
