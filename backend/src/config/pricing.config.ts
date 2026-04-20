export type PricingPlanKey =
  | "LOCKED"
  | "FREE_LOCKED"
  | "BASIC"
  | "PRO"
  | "ELITE";

export type PricingCurrencyMap = {
  INR: number;
  USD: number;
};

export type PricingLimits = {
  contactsLimit: number;
  aiDailyLimit: number;
  aiMonthlyLimit: number;
  messageLimit: number;
  automationLimit: number;
};

export type PricingPlanConfig = {
  key: PricingPlanKey;
  label: string;
  description: string;
  popular?: boolean;
  monthlyPrice: PricingCurrencyMap;
  yearlyPrice: PricingCurrencyMap;
  limits: PricingLimits;
  features: string[];
};

const buildYearlyPrice = (
  monthlyPrice: PricingCurrencyMap
): PricingCurrencyMap => ({
  INR: monthlyPrice.INR * 10,
  USD: monthlyPrice.USD * 10,
});

const LOCKED_LIMITS: PricingLimits = {
  contactsLimit: 0,
  aiDailyLimit: 0,
  aiMonthlyLimit: 0,
  messageLimit: 0,
  automationLimit: 0,
};

export const TRIAL_DAYS = 7;
export const TRIAL_PLAN_KEY: Extract<PricingPlanKey, "PRO"> = "PRO";
export const AI_USAGE_WARNING_THRESHOLD = 0.8;

export const PRICING_CONFIG: Record<PricingPlanKey, PricingPlanConfig> = {
  LOCKED: {
    key: "LOCKED",
    label: "Locked",
    description: "Upgrade to reactivate AI, automation, and messaging.",
    monthlyPrice: { INR: 0, USD: 0 },
    yearlyPrice: { INR: 0, USD: 0 },
    limits: LOCKED_LIMITS,
    features: [],
  },
  FREE_LOCKED: {
    key: "FREE_LOCKED",
    label: "Locked",
    description: "Upgrade to reactivate AI, automation, and messaging.",
    monthlyPrice: { INR: 0, USD: 0 },
    yearlyPrice: { INR: 0, USD: 0 },
    limits: LOCKED_LIMITS,
    features: [],
  },
  BASIC: {
    key: "BASIC",
    label: "Starter",
    description: "Daily AI coverage for new teams getting their first wins.",
    monthlyPrice: { INR: 999, USD: 15 },
    yearlyPrice: buildYearlyPrice({ INR: 999, USD: 15 }),
    limits: {
      contactsLimit: 1000,
      aiDailyLimit: 150,
      aiMonthlyLimit: 4500,
      messageLimit: 5000,
      automationLimit: 300,
    },
    features: [
      "1,000 active contacts included",
      "150 AI calls every day",
      "5,000 messages each month",
      "300 automation runs each month",
      "Buy extra AI calls anytime",
    ],
  },
  PRO: {
    key: "PRO",
    label: "Growth",
    description: "Higher daily AI headroom for teams scaling conversations.",
    popular: true,
    monthlyPrice: { INR: 2999, USD: 39 },
    yearlyPrice: buildYearlyPrice({ INR: 2999, USD: 39 }),
    limits: {
      contactsLimit: 5000,
      aiDailyLimit: 300,
      aiMonthlyLimit: 9000,
      messageLimit: 20000,
      automationLimit: 3000,
    },
    features: [
      "5,000 active contacts included",
      "300 AI calls every day",
      "20,000 messages each month",
      "3,000 automation runs each month",
      "Buy extra AI calls anytime",
    ],
  },
  ELITE: {
    key: "ELITE",
    label: "Elite",
    description: "Generous daily AI throughput with controlled high-volume automation.",
    monthlyPrice: { INR: 7999, USD: 99 },
    yearlyPrice: buildYearlyPrice({ INR: 7999, USD: 99 }),
    limits: {
      contactsLimit: 20000,
      aiDailyLimit: 800,
      aiMonthlyLimit: 24000,
      messageLimit: -1,
      automationLimit: 10000,
    },
    features: [
      "20,000 active contacts included",
      "800 AI calls every day",
      "Unlimited monthly messages",
      "10,000 automation runs each month",
      "Priority support",
    ],
  },
};

export const PUBLIC_PRICING_PLAN_KEYS: Array<
  Extract<PricingPlanKey, "BASIC" | "PRO" | "ELITE">
> = ["BASIC", "PRO", "ELITE"];

export const normalizePricingPlanKey = (
  value?: string | null
): PricingPlanKey => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized === "LOCKED" ||
    normalized === "FREE_LOCKED" ||
    normalized === "FREE"
  ) {
    return "LOCKED";
  }

  if (normalized.includes("STARTER") || normalized.includes("BASIC")) {
    return "BASIC";
  }

  if (normalized.includes("GROWTH") || normalized.includes("PRO")) {
    return "PRO";
  }

  if (normalized.includes("ELITE")) {
    return "ELITE";
  }

  return "LOCKED";
};

export const getPricingPlanConfig = (
  value?: string | { name?: string | null; type?: string | null } | null
): PricingPlanConfig => {
  if (value && typeof value === "object") {
    return PRICING_CONFIG[
      normalizePricingPlanKey(value.type || value.name || null)
    ];
  }

  return PRICING_CONFIG[
    normalizePricingPlanKey(typeof value === "string" ? value : null)
  ];
};

export const getPricingLimits = (
  value?: string | { name?: string | null; type?: string | null } | null
): PricingLimits => getPricingPlanConfig(value).limits;

export const getPricingPlanLabel = (
  value?: string | { name?: string | null; type?: string | null } | null
) => getPricingPlanConfig(value).label;

export const getPublicPricingPlans = () =>
  PUBLIC_PRICING_PLAN_KEYS.map((planKey) => PRICING_CONFIG[planKey]);

export const getAddonCatalog = () => [
  {
    type: "ai_credits",
    label: "Buy Extra AI Calls",
    description: "Daily limit reached? Extra AI calls are consumed immediately.",
  },
  {
    type: "contacts",
    label: "Contacts add-on",
    description: "Expand lead capacity without changing your core plan.",
  },
];
