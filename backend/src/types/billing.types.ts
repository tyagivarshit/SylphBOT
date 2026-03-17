/* ======================================
PLAN LIST
====================================== */

export const PLANS = ["BASIC", "PRO", "ELITE"] as const;

export type PlanType = typeof PLANS[number];

/* ======================================
FEATURE TYPES
====================================== */

export type PlanFeature =
  | "INSTAGRAM_DM"
  | "INSTAGRAM_COMMENT_AUTOMATION"
  | "COMMENT_TO_DM"
  | "REEL_AUTOMATION_CONTROL"
  | "WHATSAPP_AUTOMATION"
  | "CRM"
  | "FOLLOWUPS"
  | "CUSTOM_FOLLOWUPS"
  | "AI_BOOKING_SCHEDULING";

/* ======================================
PLAN CONFIG
====================================== */

export interface PlanConfig {
  name: PlanType;
  features: PlanFeature[];
  maxMessages: number | null;
  maxFollowups: number | null;
  aiUnlimited: boolean;
}

/* ======================================
PLAN CONFIG MAP
====================================== */

export const PLAN_CONFIG: Record<PlanType, PlanConfig> = {

  BASIC: {
    name: "BASIC",
    features: [
      "INSTAGRAM_DM",
      "INSTAGRAM_COMMENT_AUTOMATION",
      "COMMENT_TO_DM",
      "REEL_AUTOMATION_CONTROL"
    ],
    maxMessages: 200,
    maxFollowups: 50,
    aiUnlimited: true
  },

  PRO: {
    name: "PRO",
    features: [
      "INSTAGRAM_DM",
      "INSTAGRAM_COMMENT_AUTOMATION",
      "COMMENT_TO_DM",
      "REEL_AUTOMATION_CONTROL",
      "WHATSAPP_AUTOMATION",
      "CRM",
      "FOLLOWUPS",
      "CUSTOM_FOLLOWUPS"
    ],
    maxMessages: 2000,
    maxFollowups: 500,
    aiUnlimited: true
  },

  ELITE: {
    name: "ELITE",
    features: [
      "INSTAGRAM_DM",
      "INSTAGRAM_COMMENT_AUTOMATION",
      "COMMENT_TO_DM",
      "REEL_AUTOMATION_CONTROL",
      "WHATSAPP_AUTOMATION",
      "CRM",
      "FOLLOWUPS",
      "CUSTOM_FOLLOWUPS",
      "AI_BOOKING_SCHEDULING"
    ],
    maxMessages: null,
    maxFollowups: null,
    aiUnlimited: true
  }

};