import { Request, Response, NextFunction } from "express";
import {
  hasFeature,
  getPlanKey,
  PlanFeatures,
} from "../config/plan.config";
import prisma from "../config/prisma";

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

const HARD_BLOCK_FEATURES: Feature[] = [
  "WHATSAPP_AUTOMATION",
  "FOLLOWUPS",
  "CUSTOM_FOLLOWUPS",
  "AI_BOOKING_SCHEDULING",
];

export const requireFeature =
  (feature: Feature) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const businessId = req.user?.businessId;

      if (!businessId) {
        return res.status(401).json({
          code: "UNAUTHORIZED",
          message: "Unauthorized",
        });
      }

      const billing = (req as any).billing;

      const plan = billing?.plan || null;
      const planKey = billing?.planKey || "FREE_LOCKED";

      const featureKey = mapFeature(feature);

      const allowed =
        planKey === "FREE_LOCKED"
          ? false
          : hasFeature(plan, featureKey);

      (req as any).feature = {
        allowed,
        feature,
        plan: planKey,
      };

      /* 🔴 HARD BLOCK */
      if (!allowed && HARD_BLOCK_FEATURES.includes(feature)) {
        return res.status(403).json({
          code: "FEATURE_NOT_ALLOWED",
          feature,
          plan: planKey,
          upgradeRequired: true,
        });
      }

      /* 🔥 BASIC LIMIT */
      if (planKey === "BASIC" && feature === "INSTAGRAM_DM") {
        const flowCount = await prisma.automationFlow.count({
          where: { businessId },
        });

        if (flowCount >= 5) {
          return res.status(403).json({
            code: "LIMIT_REACHED",
            message: "Automation limit reached (5 max in BASIC)",
            upgradeRequired: true,
          });
        }
      }

      next();

    } catch (error) {
      console.error("❌ Feature Middleware Error:", error);

      return res.status(500).json({
        message: "Server error",
      });
    }
  };

const mapFeature = (
  feature: Feature
): keyof PlanFeatures => {
  const mapping: Record<Feature, keyof PlanFeatures> = {
    INSTAGRAM_DM: "automationEnabled",
    INSTAGRAM_COMMENT_AUTOMATION: "automationEnabled",
    COMMENT_TO_DM: "automationEnabled",
    REEL_AUTOMATION_CONTROL: "automationEnabled",

    WHATSAPP_AUTOMATION: "whatsappEnabled",

    CRM: "crmEnabled",

    FOLLOWUPS: "followupsEnabled",
    CUSTOM_FOLLOWUPS: "followupsEnabled",

    AI_BOOKING_SCHEDULING: "bookingEnabled",
  };

  return mapping[feature];
};