import { Request, Response, NextFunction } from "express";
import {
  hasFeature,
  getPlanKey,
  PlanFeatures,
} from "../config/plan.config";

/* ---------------------------------------------------
TYPES
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
🔥 FEATURE MIDDLEWARE (SaaS 10/10)
--------------------------------------------------- */

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

      /* ======================================
      🔥 USE BILLING CONTEXT (NEW SYSTEM)
      ====================================== */

      const billing = (req as any).billing;

      /* FREE USER */
      if (!billing || billing.status === "NONE") {
        (req as any).feature = {
          allowed: false,
          reason: "NO_SUBSCRIPTION",
          feature,
          upgradeRequired: true,
        };

        return next(); // ✅ DO NOT BLOCK
      }

      const plan = billing.plan;
      const planKey = getPlanKey(plan);

      const featureKey = mapFeature(feature);

      const allowed = hasFeature(plan, featureKey);

      /* ======================================
      FEATURE BLOCK (SOFT)
      ====================================== */

      if (!allowed) {
        (req as any).feature = {
          allowed: false,
          reason: "FEATURE_NOT_ALLOWED",
          feature,
          plan: planKey,
          upgradeRequired: true,
        };

        return next(); // ✅ DO NOT BLOCK
      }

      /* ======================================
      ✅ ACCESS GRANTED
      ====================================== */

      (req as any).feature = {
        allowed: true,
        feature,
      };

      next();

    } catch (error) {
      console.error("❌ Feature Middleware Error:", error);

      return res.status(500).json({
        message: "Server error",
      });
    }
  };

/* ---------------------------------------------------
🔥 FEATURE MAPPING
--------------------------------------------------- */

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

    FOLLOWUPS: "automationEnabled",
    CUSTOM_FOLLOWUPS: "automationEnabled",

    AI_BOOKING_SCHEDULING: "bookingEnabled",
  };

  return mapping[feature];
};