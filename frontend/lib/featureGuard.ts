/* =========================================
PLAN TYPES
========================================= */

export type PlanType = "FREE_LOCKED" | "BASIC" | "PRO" | "ELITE"

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
PLAN → FEATURES MAP
========================================= */

export const PLAN_FEATURES: Record<PlanType, Feature[]> = {

  FREE_LOCKED: [],

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
FEATURE CHECK (SAFE)
========================================= */

export function hasFeature(
  plan?: PlanType,
  feature?: Feature
): boolean {

  if (!plan || !feature) return false

  return PLAN_FEATURES[plan]?.includes(feature) || false
}

/* =========================================
GET ALL FEATURES OF PLAN
========================================= */

export function getPlanFeatures(plan?: PlanType): Feature[] {

  if (!plan) return []

  return PLAN_FEATURES[plan] || []
}

/* =========================================
GET MISSING FEATURES (FOR UPGRADE UI)
========================================= */

export function getMissingFeatures(
  plan?: PlanType,
  requiredFeatures: Feature[] = []
): Feature[] {

  if (!plan) return requiredFeatures

  return requiredFeatures.filter(
    (feature) => !hasFeature(plan, feature)
  )
}

/* =========================================
PLAN ORDER (UPGRADE LOGIC)
========================================= */

const PLAN_ORDER: PlanType[] = ["FREE_LOCKED", "BASIC", "PRO", "ELITE"]

export function isHigherPlan(
  current?: PlanType,
  target?: PlanType
): boolean {

  if (!current || !target) return false

  return (
    PLAN_ORDER.indexOf(target) >
    PLAN_ORDER.indexOf(current)
  )
}

/* =========================================
GET NEXT PLAN (UPSELL)
========================================= */

export function getNextPlan(plan?: PlanType): PlanType | null {

  if (!plan) return null

  const index = PLAN_ORDER.indexOf(plan)

  if (index === -1 || index === PLAN_ORDER.length - 1) {
    return null
  }

  return PLAN_ORDER[index + 1]
}

/* =========================================
HUMAN READABLE LABELS (UI)
========================================= */

export const FEATURE_LABELS: Record<Feature, string> = {

  INSTAGRAM_DM: "Instagram DM Automation",
  INSTAGRAM_COMMENT_AUTOMATION: "Comment Automation",
  COMMENT_TO_DM: "Comment → DM",
  REEL_AUTOMATION_CONTROL: "Reel Automation Control",

  WHATSAPP_AUTOMATION: "WhatsApp Automation",
  CRM: "Leads CRM",
  FOLLOWUPS: "Automated Follow-ups",
  CUSTOM_FOLLOWUPS: "Custom Follow-ups",

  AI_BOOKING_SCHEDULING: "AI Booking & Scheduling"

}

/* =========================================
PLAN LABELS (UI)
========================================= */

export const PLAN_LABELS: Record<PlanType, string> = {
  FREE_LOCKED: "Starter",
  BASIC: "Basic",
  PRO: "Pro",
  ELITE: "Elite"
}
