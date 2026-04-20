import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../utils/AppError";
import {
  hasPermission,
  type PermissionAction,
} from "../services/rbac.service";

export const requirePermission = (action: PermissionAction) =>
  (req: Request, _res: Response, next: NextFunction) => {
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

    next();
  };
