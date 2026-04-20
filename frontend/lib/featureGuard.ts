/* =========================================
PLAN TYPES
========================================= */

export type PlanType = "LOCKED" | "FREE_LOCKED" | "BASIC" | "PRO" | "ELITE"

const PLAN_ORDER: PlanType[] = ["LOCKED", "FREE_LOCKED", "BASIC", "PRO", "ELITE"]

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

  LOCKED: [],

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

export function normalizePlan(plan?: string | null): PlanType {

  if (!plan) return "FREE_LOCKED"

  const normalized = plan
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")

  if (
    normalized === "LOCKED" ||
    normalized === "FREE" ||
    normalized === "FREE_LOCKED" ||
    normalized === "FREE_TRIAL" ||
    normalized === "STARTER"
  ) {
    return normalized === "LOCKED" ? "LOCKED" : "FREE_LOCKED"
  }

  if (normalized.includes("ELITE")) return "ELITE"
  if (normalized.includes("PRO")) return "PRO"
  if (normalized.includes("BASIC")) return "BASIC"

  return "FREE_LOCKED"
}

/* =========================================
FEATURE CHECK (SAFE)
========================================= */

export function hasFeature(
  plan?: string | null,
  feature?: Feature
): boolean {

  if (!feature) return false

  const planKey = normalizePlan(plan)

  return PLAN_FEATURES[planKey]?.includes(feature) || false
}

/* =========================================
GET ALL FEATURES OF PLAN
========================================= */

export function getPlanFeatures(plan?: string | null): Feature[] {

  if (!plan) return []

  const planKey = normalizePlan(plan)

  return PLAN_FEATURES[planKey] || []
}

/* =========================================
GET MISSING FEATURES (FOR UPGRADE UI)
========================================= */

export function getMissingFeatures(
  plan?: string | null,
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

export function isHigherPlan(
  current?: string | null,
  target?: string | null
): boolean {

  if (!current || !target) return false

  const currentPlan = normalizePlan(current)
  const targetPlan = normalizePlan(target)

  return (
    PLAN_ORDER.indexOf(targetPlan) >
    PLAN_ORDER.indexOf(currentPlan)
  )
}

/* =========================================
GET NEXT PLAN (UPSELL)
========================================= */

export function getNextPlan(plan?: string | null): PlanType | null {

  if (!plan) return null

  const index = PLAN_ORDER.indexOf(normalizePlan(plan))

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
  LOCKED: "Locked",
  FREE_LOCKED: "Locked",
  BASIC: "Starter",
  PRO: "Growth",
  ELITE: "Elite"
}
