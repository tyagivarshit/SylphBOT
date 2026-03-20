/* ======================================
TYPES
====================================== */

export type PlanType = "FREE" | "BASIC" | "PRO" | "ELITE";

export type PlanLimits = {
  aiCallsUsed: number; // -1 = unlimited
  messagesUsed: number;
  followupsUsed: number;
};

export type PlanFeatures = {
  whatsappEnabled: boolean;
  automationEnabled: boolean;
  bookingEnabled: boolean;
  crmEnabled: boolean;
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
  FREE: {
    limits: {
      aiCallsUsed: 50,
      messagesUsed: 200,
      followupsUsed: 20,
    },
    features: {
      whatsappEnabled: false,
      automationEnabled: false,
      bookingEnabled: false,
      crmEnabled: true,
      prioritySupport: false,
    },
  },

  BASIC: {
    limits: {
      aiCallsUsed: 500,
      messagesUsed: 2000,
      followupsUsed: 200,
    },
    features: {
      whatsappEnabled: true,
      automationEnabled: true,
      bookingEnabled: false,
      crmEnabled: true,
      prioritySupport: false,
    },
  },

  PRO: {
    limits: {
      aiCallsUsed: 5000,
      messagesUsed: 15000,
      followupsUsed: 2000,
    },
    features: {
      whatsappEnabled: true,
      automationEnabled: true,
      bookingEnabled: true,
      crmEnabled: true,
      prioritySupport: true,
    },
  },

  ELITE: {
    limits: {
      aiCallsUsed: -1,
      messagesUsed: -1,
      followupsUsed: -1,
    },
    features: {
      whatsappEnabled: true,
      automationEnabled: true,
      bookingEnabled: true,
      crmEnabled: true,
      prioritySupport: true,
    },
  },
};

/* ======================================
🔥 DB PLAN TYPE
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
    return "FREE";
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
🔥 SOFT LIMIT CHECK (UPSELL ENGINE)
====================================== */

export const isNearLimit = (
  current: number,
  max: number
): boolean => {
  if (max === -1) return false;
  return current / max >= 0.8; // 80%
};

/* ======================================
🔥 RECOMMENDED UPGRADE PLAN
====================================== */

export const getUpgradePlan = (current: PlanType): PlanType => {
  const order: PlanType[] = ["FREE", "BASIC", "PRO", "ELITE"];

  const index = order.indexOf(current);

  return order[index + 1] || current;
};