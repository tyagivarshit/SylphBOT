import type { NextFunction, Request, Response } from "express";
import { hasFeature, type FeatureKey } from "../services/feature.service";

export const featureGuard =
  (featureKey: FeatureKey) =>
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

      const allowed = await hasFeature(businessId, featureKey);

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: "Upgrade required",
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

