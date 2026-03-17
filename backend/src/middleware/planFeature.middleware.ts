import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";

/* ---------------------------------------------------
FEATURE TYPES
--------------------------------------------------- */

type Feature =
  | "INSTAGRAM_DM"
  | "INSTAGRAM_COMMENT_AUTOMATION"
  | "COMMENT_TO_DM"
  | "REEL_AUTOMATION_CONTROL"
  | "WHATSAPP_AUTOMATION"
  | "CRM"
  | "FOLLOWUPS"
  | "CUSTOM_FOLLOWUPS"
  | "AI_BOOKING_SCHEDULING";

/* ---------------------------------------------------
PLAN → FEATURE MAP
--------------------------------------------------- */

const planFeatures: Record<string, Feature[]> = {

  BASIC: [
    "INSTAGRAM_DM",
    "INSTAGRAM_COMMENT_AUTOMATION",
    "COMMENT_TO_DM",
    "REEL_AUTOMATION_CONTROL"
  ],

  PRO: [
    "INSTAGRAM_DM",
    "INSTAGRAM_COMMENT_AUTOMATION",
    "COMMENT_TO_DM",
    "REEL_AUTOMATION_CONTROL",

    "WHATSAPP_AUTOMATION",
    "CRM",
    "FOLLOWUPS",
    "CUSTOM_FOLLOWUPS"
  ],

  ELITE: [
    "INSTAGRAM_DM",
    "INSTAGRAM_COMMENT_AUTOMATION",
    "COMMENT_TO_DM",
    "REEL_AUTOMATION_CONTROL",

    "WHATSAPP_AUTOMATION",
    "CRM",
    "FOLLOWUPS",
    "CUSTOM_FOLLOWUPS",

    "AI_BOOKING_SCHEDULING"
  ]

};

/* ---------------------------------------------------
MIDDLEWARE
--------------------------------------------------- */

export const requireFeature =
  (feature: Feature) =>
  async (req: Request, res: Response, next: NextFunction) => {

    try {

      const businessId = req.user?.businessId;

      if (!businessId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        include: { plan: true },
      });

      if (!subscription || !subscription.plan) {
        return res.status(403).json({
          message: "No active subscription",
        });
      }

      /* -----------------------------
      STATUS CHECK
      ----------------------------- */

      if (subscription.status !== "ACTIVE") {
        return res.status(403).json({
          message: "Subscription inactive",
        });
      }

      /* -----------------------------
      TRIAL EXPIRY CHECK
      ----------------------------- */

      if (
        subscription.plan.name === "FREE_TRIAL" &&
        subscription.currentPeriodEnd &&
        new Date() > subscription.currentPeriodEnd
      ) {
        return res.status(403).json({
          message: "Trial expired. Please upgrade.",
        });
      }

      const planName = subscription.plan.name;

      const allowedFeatures = planFeatures[planName];

      if (!allowedFeatures) {
        return res.status(403).json({
          message: "Invalid subscription plan",
        });
      }

      if (!allowedFeatures.includes(feature)) {
        return res.status(403).json({
          message: "Feature not available in your plan",
        });
      }

      next();

    } catch (error) {

      console.error("Plan Feature Middleware Error:", error);

      return res.status(500).json({
        message: "Server error",
      });

    }

  };