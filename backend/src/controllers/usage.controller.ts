import type { Request, Response } from "express";
import { getUsageOverview } from "../services/usage.service";

export class UsageController {
  static async getUsage(req: Request, res: Response) {
    try {
      const businessId = req.user?.businessId;

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
          requestId: req.requestId,
        });
      }

      return res.json(await getUsageOverview(businessId));
    } catch (error) {
      req.logger?.error({ error }, "Usage API error");

      return res.status(500).json({
        success: false,
        message: "Failed to fetch usage",
        requestId: req.requestId,
      });
    }
  }
}
