import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import {
  hasFeature,
  getPlanKey,
  PlanFeatures,
} from "../config/plan.config";

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
MIDDLEWARE (10/10 FINAL)
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

      /* 🔥 PRO TIP APPLIED:
         - subscription.middleware pehle run hoga
         - yaha reuse karenge (no extra DB call)
      */

      const subscription = (req as any).subscription;

      if (!subscription || !subscription.plan) {
        return res.status(403).json({
          code: "NO_SUBSCRIPTION",
          message: "No active subscription",
          upgradeRequired: true,
        });
      }

      /* 🔥 No need to re-check status/trial
         already handled by subscription.middleware
      */

      const planKey = getPlanKey(subscription.plan);

      const featureKey = mapFeature(feature);

      const allowed = hasFeature(subscription.plan, featureKey);

      if (!allowed) {
        return res.status(403).json({
          code: "FEATURE_NOT_ALLOWED",
          feature,
          plan: planKey,
          upgradeRequired: true,
        });
      }

      /* ✅ ACCESS GRANTED */
      next();

    } catch (error) {
      console.error("Feature Middleware Error:", error);

      return res.status(500).json({
        message: "Server error",
      });
    }
  };

/* ---------------------------------------------------
🔥 FEATURE MAPPING (TYPE SAFE)
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