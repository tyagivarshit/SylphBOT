/* ======================================
TYPES
====================================== */

export type PlanType = "FREE_LOCKED" | "BASIC" | "PRO" | "ELITE";

export type PlanLimits = {
  aiCallsLimit: number; // -1 = unlimited
  messagesLimit: number;
  followupsLimit: number;
  maxTriggers: number;
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
  FREE_LOCKED: {
    limits: {
      aiCallsLimit: 0,
      messagesLimit: 0,
      followupsLimit: 0,
      maxTriggers: 0,
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
      aiCallsLimit: 500,
      messagesLimit: 2000,
      followupsLimit: 0,
      maxTriggers: 5,
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
      aiCallsLimit: 5000,
      messagesLimit: 15000,
      followupsLimit: 2000,
      maxTriggers: -1,
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
      aiCallsLimit: -1,
      messagesLimit: -1,
      followupsLimit: -1,
      maxTriggers: -1,
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

/* ======================================
GET PLAN KEY
====================================== */

export const getPlanKey = (plan: DBPlan | null): PlanType => {
  const name = plan?.name?.toUpperCase();
  const type = plan?.type?.toUpperCase();

  const key = (name || type) as PlanType;

  if (!key || !PLAN_CONFIG[key]) {
    return "FREE_LOCKED";
  }

  return key;
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
  const order: PlanType[] = ["FREE_LOCKED", "BASIC", "PRO", "ELITE"];

  const index = order.indexOf(current);

  return order[index + 1] || current;
};