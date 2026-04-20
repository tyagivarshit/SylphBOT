/* ======================================
TYPES
====================================== */

export type PlanType = "LOCKED" | "FREE_LOCKED" | "BASIC" | "PRO" | "ELITE";

export type PlanLimits = {
  aiCallsLimit: number; // -1 = unlimited
  messagesLimit: number;
  followupsLimit: number;
  maxTriggers: number;
  contactsLimit: number;
  aiCallsUsed?: number;
  messagesUsed?: number;
  followupsUsed?: number;
};

export type PlanFeatures = {
  whatsappEnabled: boolean;
  automationEnabled: boolean;
  bookingEnabled: boolean;
  crmEnabled: boolean;
  followupsEnabled: boolean;
  prioritySupport: boolean;
};

/* ======================================
PLAN CONFIG
====================================== */

const PLAN_CONFIG: Record<
  PlanType,
  {
    limits: PlanLimits;
    features: PlanFeatures;
  }
> = {
  LOCKED: {
    limits: {
      aiCallsLimit: 0,
      messagesLimit: 0,
      followupsLimit: 0,
      maxTriggers: 0,
      contactsLimit: 0,
    },
    features: {
      whatsappEnabled: false,
      automationEnabled: false,
      bookingEnabled: false,
      crmEnabled: false,
      followupsEnabled: false,
      prioritySupport: false,
    },
  },

  FREE_LOCKED: {
    limits: {
      aiCallsLimit: 0,
      messagesLimit: 0,
      followupsLimit: 0,
      maxTriggers: 0,
      contactsLimit: 0,
    },
    features: {
      whatsappEnabled: false,
      automationEnabled: false,
      bookingEnabled: false,
      crmEnabled: false,
      followupsEnabled: false,
      prioritySupport: false,
    },
  },

  BASIC: {
    limits: {
      aiCallsLimit: 4500,
      messagesLimit: 5000,
      followupsLimit: 300,
      maxTriggers: 5,
      contactsLimit: 1000,
    },
    features: {
      whatsappEnabled: false,
      automationEnabled: true,
      bookingEnabled: false,
      crmEnabled: false,
      followupsEnabled: false,
      prioritySupport: false,
    },
  },

  PRO: {
    limits: {
      aiCallsLimit: 9000,
      messagesLimit: 20000,
      followupsLimit: 3000,
      maxTriggers: -1,
      contactsLimit: 5000,
    },
    features: {
      whatsappEnabled: true,
      automationEnabled: true,
      bookingEnabled: false,
      crmEnabled: true,
      followupsEnabled: true,
      prioritySupport: true,
    },
  },

  ELITE: {
    limits: {
      aiCallsLimit: 24000,
      messagesLimit: -1,
      followupsLimit: 10000,
      maxTriggers: -1,
      contactsLimit: 20000,
    },
    features: {
      whatsappEnabled: true,
      automationEnabled: true,
      bookingEnabled: true,
      crmEnabled: true,
      followupsEnabled: true,
      prioritySupport: true,
    },
  },
};

/* ======================================
DB PLAN TYPE
====================================== */

type DBPlan = {
  name?: string | null;
  type?: string | null;
};

const normalizePlanValue = (
  value?: string | null
): PlanType | null => {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "LOCKED") {
    return "LOCKED";
  }

  if (
    normalized === "FREE" ||
    normalized === "FREE_LOCKED" ||
    normalized === "FREE_TRIAL" ||
    normalized === "STARTER"
  ) {
    return "FREE_LOCKED";
  }

  if (normalized.includes("ELITE")) return "ELITE";
  if (normalized.includes("PRO")) return "PRO";
  if (normalized.includes("BASIC")) return "BASIC";

  return null;
};

/* ======================================
GET PLAN KEY
====================================== */

export const getPlanKey = (plan: DBPlan | null): PlanType => {
  return (
    normalizePlanValue(plan?.type) ||
    normalizePlanValue(plan?.name) ||
    "LOCKED"
  );
};

/* ======================================
GET LIMITS
====================================== */

export const getPlanLimits = (plan: DBPlan | null): PlanLimits => {
  return PLAN_CONFIG[getPlanKey(plan)].limits;
};

/* ======================================
GET FEATURES
====================================== */

export const getPlanFeatures = (plan: DBPlan | null): PlanFeatures => {
  return PLAN_CONFIG[getPlanKey(plan)].features;
};

/* ======================================
FEATURE CHECK
====================================== */

export const hasFeature = (
  plan: DBPlan | null,
  feature: keyof PlanFeatures
): boolean => {
  if (getPlanKey(plan) === "LOCKED") {
    return false;
  }

  return getPlanFeatures(plan)[feature] === true;
};

/* ======================================
LIMIT HELPERS
====================================== */

export const canCreateTrigger = (
  plan: DBPlan | null,
  currentCount: number
): boolean => {
  const { maxTriggers } = getPlanLimits(plan);

  if (maxTriggers === -1) return true;

  return currentCount < maxTriggers;
};

export const canSendFollowup = (
  plan: DBPlan | null,
  used: number
): boolean => {
  const { followupsLimit } = getPlanLimits(plan);

  if (followupsLimit === -1) return true;

  return used < followupsLimit;
};

/* ======================================
UPSELL ENGINE
====================================== */

export const isNearLimit = (
  current: number,
  max: number
): boolean => {
  if (max === -1) return false;
  return current / max >= 0.8;
};

export const getUpgradePlan = (current: PlanType): PlanType => {
  const order: PlanType[] = ["LOCKED", "FREE_LOCKED", "BASIC", "PRO", "ELITE"];

  const index = order.indexOf(current);

  return order[index + 1] || current;
};
