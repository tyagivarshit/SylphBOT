import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { getOrCreateUsage } from "../services/usage.service";

type LimitType = "ai" | "message" | "followup";

export const checkPlanLimit =
  (type: LimitType) =>
  async (req: Request, res: Response, next: NextFunction) => {

    try {

      const businessId = req.user?.businessId;

      if (!businessId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const subscription =
        await prisma.subscription.findUnique({
          where: { businessId },
          include: { plan: true },
        });

      if (
        !subscription ||
        subscription.status.toLowerCase() !== "active"
      ) {
        return res.status(403).json({
          message: "Inactive subscription",
        });
      }

      const usage = await getOrCreateUsage(businessId);

      /* -----------------------------
      AI (UNLIMITED)
      ----------------------------- */

      if (type === "ai") {
        return next(); // AI unlimited
      }

      /* -----------------------------
      MESSAGE LIMIT
      ----------------------------- */

      if (
        type === "message" &&
        subscription.plan.maxMessages !== null &&
        usage.messagesUsed >= subscription.plan.maxMessages
      ) {
        return res.status(403).json({
          message: "Message limit reached",
        });
      }

      /* -----------------------------
      FOLLOWUP LIMIT
      ----------------------------- */

      if (
        type === "followup" &&
        subscription.plan.maxFollowups !== null &&
        usage.followupsUsed >= subscription.plan.maxFollowups
      ) {
        return res.status(403).json({
          message: "Followup limit reached",
        });
      }

      next();

    } catch (error) {

      console.error("Plan Limit Middleware Error:", error);

      return res.status(500).json({
        message: "Server error",
      });

    }

  };