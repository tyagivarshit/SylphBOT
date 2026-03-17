/* =========================================
PLAN TYPES
========================================= */

export type PlanType = "BASIC" | "PRO" | "ELITE"

/* =========================================
FEATURE TYPES (SYNCED WITH BACKEND)
========================================= */

export type Feature =
  | "INSTAGRAM_DM"
  | "INSTAGRAM_COMMENT_AUTOMATION"
  | "COMMENT_TO_DM"
  | "REEL_AUTOMATION_CONTROL"
  | "WHATSAPP_AUTOMATION"
  | "CRM"
  | "FOLLOWUPS"
  | "CUSTOM_FOLLOWUPS"
  | "AI_BOOKING_SCHEDULING"

/* =========================================
PLAN → FEATURES MAP (EXACT BACKEND COPY)
========================================= */

export const PLAN_FEATURES: Record<PlanType, Feature[]> = {

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

}

/* =========================================
CHECK FUNCTION
========================================= */

export function hasFeature(
  plan: PlanType,
  feature: Feature
){
  return PLAN_FEATURES[plan]?.includes(feature)
}