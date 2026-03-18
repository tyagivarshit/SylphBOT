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

      console.log("SUBSCRIPTION DEBUG:", subscription);
      console.log("PLAN DEBUG:", subscription?.plan);

      /* 🔥 SAFE MODE: NO 403 SPAM */

      if (!subscription || !subscription.plan) {
        (req as any).featureDenied = true;
        return next();
      }

      if (subscription.status !== "ACTIVE") {
        (req as any).featureDenied = true;
        return next();
      }

      if (
        subscription.isTrial &&
        subscription.currentPeriodEnd &&
        new Date() > subscription.currentPeriodEnd
      ) {
        (req as any).featureDenied = true;
        return next();
      }

      const planType = subscription.plan.type;

      const allowedFeatures = planFeatures[planType];

      if (!allowedFeatures) {
        (req as any).featureDenied = true;
        return next();
      }

      if (!allowedFeatures.includes(feature)) {
        (req as any).featureDenied = true;
        return next();
      }

      /* ✅ ACCESS GRANTED */
      (req as any).featureDenied = false;

      next();

    } catch (error) {

      console.error("Plan Feature Middleware Error:", error);

      return res.status(500).json({
        message: "Server error",
      });

    }

  };