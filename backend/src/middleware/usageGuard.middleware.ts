import type { NextFunction, Request, Response } from "express";
import {
  checkUsageLimit,
  type UsageFeature,
} from "../services/usage.service";

export const usageGuard =
  (feature: UsageFeature) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const businessId = req.user?.businessId;

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
          requestId: req.requestId,
        });
      }

      const usage = await checkUsageLimit({
        businessId,
        feature,
      });

      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          message: "Usage limit exceeded",
          requestId: req.requestId,
        });
      }

      return next();
    } catch {
      return res.status(500).json({
        success: false,
        message: "Server error",
        requestId: req.requestId,
      });
    }
  };

