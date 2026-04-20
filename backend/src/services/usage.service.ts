import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import {
  AI_USAGE_WARNING_THRESHOLD,
  getPricingLimits,
  getPricingPlanLabel,
  normalizePricingPlanKey,
  type PricingLimits,
  type PricingPlanKey,
} from "../config/pricing.config";
import { resolvePlanContext } from "./feature.service";
import {
  consumeAddonCreditsTx,
  getAddonBalance,
  type AddonType,
} from "./addon.service";
import { getTrialStatus } from "./trial.service";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";
import {
  createNotificationTx,
  emitNotification,
} from "./notification.service";

export type UsageFeature =
  | "ai_messages"
  | "automation_runs"
  | "messages_sent"
  | "contacts";

type UsageField = "aiCallsUsed" | "followupsUsed" | "messagesUsed";
type LegacyUsageField = UsageField;
type MonthlyFeature = Exclude<UsageFeature, "contacts">;
type UsageSource = "plan" | "addon" | "plan_and_addon";

type UsageFeatureConfig = {
  usageField?: UsageField;
  resolveLimit: (limits: PricingLimits) => number;
  addonType?: AddonType;
  hasDailyLimit?: boolean;
};

type MonthlyUsageRow = {
  id: string;
  businessId: string;
  month: number;
  year: number;
  aiCallsUsed: number;
  messagesUsed: number;
  followupsUsed: number;
};

type UsageComputation = {
  feature: UsageFeature;
  count: number;
  planKey: PricingPlanKey;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number | null;
  dailyUsed: number | null;
  dailyLimit: number | null;
  dailyRemaining: number | null;
  addonBalance: number;
  addonRequired: number;
  addonType?: AddonType;
  allowed: boolean;
  month: number;
  year: number;
};

const USAGE_FEATURES: Record<UsageFeature, UsageFeatureConfig> = {
  ai_messages: {
    usageField: "aiCallsUsed",
    resolveLimit: (limits) => limits.aiMonthlyLimit,
    addonType: "ai_credits",
    hasDailyLimit: true,
  },
  automation_runs: {
    usageField: "followupsUsed",
    resolveLimit: (limits) => limits.automationLimit,
  },
  messages_sent: {
    usageField: "messagesUsed",
    resolveLimit: (limits) => limits.messageLimit,
  },
  contacts: {
    resolveLimit: (limits) => limits.contactsLimit,
    addonType: "contacts",
  },
};

const LEGACY_USAGE_FIELD_MAP: Record<LegacyUsageField, MonthlyFeature> = {
  aiCallsUsed: "ai_messages",
  followupsUsed: "automation_runs",
  messagesUsed: "messages_sent",
};

const DEFAULT_INCREMENT_COUNT = 1;
const AI_DAILY_FEATURE_KEY = "ai_messages";
const AI_HOURLY_FEATURE_KEY = "ai_messages_hourly";
const AI_WARNING_MARKER_FEATURE_KEY = "ai_usage_warning_notice";
const CONTACTS_LIMIT_LOCK_FEATURE_KEY = "contacts_limit_lock";
const AI_WARNING_MESSAGE = "You have used 80% of your daily AI limit.";

const AI_HOURLY_LIMITS: Record<PricingPlanKey, number> = {
  LOCKED: 0,
  FREE_LOCKED: 0,
  BASIC: 50,
  PRO: 120,
  ELITE: 300,
};

class UsageError extends Error {
  code: string;
  upgradeRequired?: boolean;
  meta?: Record<string, unknown>;

  constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.meta = meta;
    this.upgradeRequired = true;
  }
}

export type UsageInput = {
  businessId: string;
  feature: UsageFeature;
  count?: number;
};

export type UsageSnapshot = {
  businessId: string;
  feature: UsageFeature;
  used: number;
  limit: number;
  remaining: number | null;
  isUnlimited: boolean;
  allowed: boolean;
  planKey: PricingPlanKey;
  month: number;
  year: number;
  count: number;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number | null;
  dailyUsed?: number | null;
  dailyLimit?: number | null;
  dailyRemaining?: number | null;
  addonBalance: number;
  addonRequired: number;
  usedAddon: boolean;
  usageSource: UsageSource;
  warning: boolean;
  warningMessage: string | null;
  errorCode?: string | null;
};

export type AIUsageReservation = {
  businessId: string;
  count: number;
  addonConsumed: number;
  planConsumed: number;
  month: number;
  year: number;
  dailyDateKey: string;
  hourlyDateKey: string;
  snapshot: UsageSnapshot;
};

type UsageOverview = {
  plan: PricingPlanKey;
  planLabel: string;
  trialActive: boolean;
  daysLeft: number;
  warning: boolean;
  warningMessage: string | null;
  addonCredits: number;
  ai: {
    usedToday: number;
    limit: number;
    remaining: number | null;
  };
  usage: {
    ai: {
      used: number;
      dailyLimit: number;
      monthlyUsed: number;
      monthlyLimit: number;
      dailyRemaining: number | null;
      monthlyRemaining: number | null;
      warning: boolean;
    };
    contacts: {
      used: number;
      limit: number;
      remaining: number | null;
    };
    messages: {
      used: number;
      limit: number;
      remaining: number | null;
    };
    automation: {
      used: number;
      limit: number;
      remaining: number | null;
    };
  };
  addons: {
    aiCredits: number;
    contacts: number;
  };
};

const getCurrentPeriodKey = (businessId: string) => {
  const { month, year } = getCurrentMonthYear();

  return {
    businessId,
    month,
    year,
  };
};

const getCurrentDateKey = () => new Date().toISOString().slice(0, 10);

const getCurrentHourKey = () => new Date().toISOString().slice(0, 13);

const normalizeBusinessId = (businessId: string) =>
  String(businessId || "").trim();

const normalizeCount = (count?: number) => {
  if (count === undefined) {
    return DEFAULT_INCREMENT_COUNT;
  }

  const normalizedCount = Math.floor(Number(count));

  if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
    throw new UsageError("INVALID_USAGE_COUNT", "Invalid usage count");
  }

  return normalizedCount;
};

const getFeatureConfig = (feature: UsageFeature) => USAGE_FEATURES[feature];

const getAiHourlyLimit = (planKey: PricingPlanKey) =>
  AI_HOURLY_LIMITS[planKey] ?? 0;

const isUniqueConstraintError = (error: unknown) =>
  (error as { code?: string })?.code === "P2002";

const toRemaining = (limit: number, used: number) =>
  limit === -1 ? null : Math.max(limit - used, 0);

const toPlanCapacity = (limit: number, used: number) =>
  limit === -1 ? Number.MAX_SAFE_INTEGER : Math.max(limit - used, 0);

const getUsageFieldValue = (
  usage: Pick<MonthlyUsageRow, UsageField>,
  field: UsageField
) => Number(usage[field] || 0);

const resolveUsagePlan = async (businessId: string) => {
  const context = await resolvePlanContext(businessId);
  const planKey = normalizePricingPlanKey(context.planKey);
  const limits = getPricingLimits(planKey);

  return {
    planKey,
    limits,
  };
};

const ensureUsageRecord = async (
  tx: Prisma.TransactionClient,
  businessId: string
) => {
  const key = getCurrentPeriodKey(businessId);
  let usage = await tx.usage.findUnique({
    where: {
      businessId_month_year: key,
    },
  });

  if (!usage) {
    try {
      usage = await tx.usage.create({
        data: {
          ...key,
          aiCallsUsed: 0,
          messagesUsed: 0,
          followupsUsed: 0,
        },
      });
    } catch {
      usage = await tx.usage.findUnique({
        where: {
          businessId_month_year: key,
        },
      });
    }
  }

  return {
    key,
    usage: usage as MonthlyUsageRow,
  };
};

const ensureDailyUsageRecord = async (
  tx: Prisma.TransactionClient,
  businessId: string,
  feature: string,
  dateKey = getCurrentDateKey()
) => {
  let usage = await tx.usageDaily.findUnique({
    where: {
      businessId_feature_dateKey: {
        businessId,
        feature,
        dateKey,
      },
    },
  });

  if (!usage) {
    try {
      usage = await tx.usageDaily.create({
        data: {
          businessId,
          feature,
          dateKey,
          count: 0,
        },
      });
    } catch {
      usage = await tx.usageDaily.findUnique({
        where: {
          businessId_feature_dateKey: {
            businessId,
            feature,
            dateKey,
          },
        },
      });
    }
  }

  return usage;
};

const getDailyUsageCount = async (
  businessId: string,
  feature: string,
  dateKey = getCurrentDateKey()
) => {
  const usage = await prisma.usageDaily.findUnique({
    where: {
      businessId_feature_dateKey: {
        businessId,
        feature,
        dateKey,
      },
    },
    select: {
      count: true,
    },
  });

  return usage?.count || 0;
};

const getContactsCount = async (
  businessId: string,
  tx?: Prisma.TransactionClient
) =>
  (tx || prisma).lead.count({
    where: {
      businessId,
      deletedAt: null,
    },
  });

const buildComputation = (input: {
  feature: UsageFeature;
  count: number;
  planKey: PricingPlanKey;
  limits: PricingLimits;
  monthlyUsed: number;
  dailyUsed?: number | null;
  addonBalance: number;
  month: number;
  year: number;
}) => {
  const featureConfig = getFeatureConfig(input.feature);
  const monthlyLimit = featureConfig.resolveLimit(input.limits);
  const dailyLimit = featureConfig.hasDailyLimit ? input.limits.aiDailyLimit : null;
  const normalizedDailyUsed =
    typeof input.dailyUsed === "number" ? input.dailyUsed : null;

  const monthlyRemaining = toRemaining(monthlyLimit, input.monthlyUsed);
  const dailyRemaining =
    dailyLimit === null ? null : toRemaining(dailyLimit, normalizedDailyUsed || 0);

  const monthlyPlanCapacity =
    input.feature === "ai_messages"
      ? Number.MAX_SAFE_INTEGER
      : toPlanCapacity(monthlyLimit, input.monthlyUsed);
  const dailyPlanCapacity =
    dailyLimit === null
      ? Number.MAX_SAFE_INTEGER
      : toPlanCapacity(dailyLimit, normalizedDailyUsed || 0);

  if (input.feature === "ai_messages") {
    const addonRequired = Math.min(input.count, input.addonBalance);
    const planCovered = Math.min(input.count - addonRequired, dailyPlanCapacity);

    return {
      feature: input.feature,
      count: input.count,
      planKey: input.planKey,
      monthlyUsed: input.monthlyUsed,
      monthlyLimit,
      monthlyRemaining,
      dailyUsed: normalizedDailyUsed,
      dailyLimit,
      dailyRemaining,
      addonBalance: input.addonBalance,
      addonRequired,
      addonType: featureConfig.addonType,
      allowed: addonRequired + planCovered >= input.count,
      month: input.month,
      year: input.year,
    } satisfies UsageComputation;
  }

  const planCovered = Math.min(input.count, monthlyPlanCapacity, dailyPlanCapacity);
  const addonRequired = Math.max(input.count - planCovered, 0);

  return {
    feature: input.feature,
    count: input.count,
    planKey: input.planKey,
    monthlyUsed: input.monthlyUsed,
    monthlyLimit,
    monthlyRemaining,
    dailyUsed: normalizedDailyUsed,
    dailyLimit,
    dailyRemaining,
    addonBalance: input.addonBalance,
    addonRequired,
    addonType: featureConfig.addonType,
    allowed: addonRequired <= input.addonBalance,
    month: input.month,
    year: input.year,
  } satisfies UsageComputation;
};

const getUsageWarningState = (snapshot: Pick<
  UsageSnapshot,
  "feature" | "dailyUsed" | "dailyLimit"
>) => {
  if (
    snapshot.feature !== "ai_messages" ||
    typeof snapshot.dailyLimit !== "number" ||
    snapshot.dailyLimit <= 0 ||
    typeof snapshot.dailyUsed !== "number"
  ) {
    return {
      warning: false,
      warningMessage: null,
    };
  }

  return snapshot.dailyUsed / snapshot.dailyLimit >= AI_USAGE_WARNING_THRESHOLD
    ? {
        warning: true,
        warningMessage: AI_WARNING_MESSAGE,
      }
    : {
        warning: false,
        warningMessage: null,
      };
};

const resolveUsageSource = (computation: UsageComputation): UsageSource => {
  if (computation.addonRequired <= 0) {
    return "plan";
  }

  if (computation.count === computation.addonRequired) {
    return "addon";
  }

  return "plan_and_addon";
};

const buildUsageSnapshot = (
  businessId: string,
  computation: UsageComputation,
  errorCode: string | null = null
): UsageSnapshot => {
  const used =
    computation.feature === "ai_messages"
      ? computation.dailyUsed || 0
      : computation.monthlyUsed;
  const limit =
    computation.feature === "ai_messages"
      ? computation.dailyLimit || 0
      : computation.monthlyLimit;
  const remaining =
    computation.feature === "ai_messages"
      ? computation.dailyRemaining ?? null
      : computation.monthlyRemaining;
  const warningState = getUsageWarningState({
    feature: computation.feature,
    dailyUsed: computation.dailyUsed,
    dailyLimit: computation.dailyLimit,
  });

  return {
    businessId,
    feature: computation.feature,
    used,
    limit,
    remaining,
    isUnlimited: limit === -1,
    allowed: computation.allowed,
    planKey: computation.planKey,
    month: computation.month,
    year: computation.year,
    count: computation.count,
    monthlyUsed: computation.monthlyUsed,
    monthlyLimit: computation.monthlyLimit,
    monthlyRemaining: computation.monthlyRemaining,
    dailyUsed: computation.dailyUsed,
    dailyLimit: computation.dailyLimit,
    dailyRemaining: computation.dailyRemaining,
    addonBalance: computation.addonBalance,
    addonRequired: computation.addonRequired,
    usedAddon: computation.addonRequired > 0,
    usageSource: resolveUsageSource(computation),
    warning: warningState.warning,
    warningMessage: warningState.warningMessage,
    errorCode,
  };
};

const buildFailClosedSnapshot = ({
  businessId,
  feature,
  count,
  errorCode,
}: UsageInput & {
  errorCode?: string;
}): UsageSnapshot => {
  const { month, year } = getCurrentMonthYear();
  const limits = getPricingLimits("LOCKED");
  const computation = buildComputation({
    feature,
    count: normalizeCount(count),
    planKey: "LOCKED",
    limits,
    monthlyUsed: 0,
    dailyUsed: feature === "ai_messages" ? 0 : null,
    addonBalance: 0,
    month,
    year,
  });

  return buildUsageSnapshot(
    normalizeBusinessId(businessId),
    {
      ...computation,
      allowed: false,
    },
    errorCode || "USAGE_CHECK_FAILED"
  );
};

const maybeSendAiWarningNotification = async (snapshot: UsageSnapshot) => {
  if (!snapshot.warning || snapshot.feature !== "ai_messages") {
    return;
  }

  const business = await prisma.business.findUnique({
    where: {
      id: snapshot.businessId,
    },
    select: {
      ownerId: true,
    },
  });

  if (!business?.ownerId) {
    return;
  }

  const notification = await prisma.$transaction(async (tx) => {
    try {
      await tx.usageDaily.create({
        data: {
          businessId: snapshot.businessId,
          feature: AI_WARNING_MARKER_FEATURE_KEY,
          dateKey: getCurrentDateKey(),
          count: 1,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return null;
      }

      throw error;
    }

    return createNotificationTx(tx, {
      userId: business.ownerId,
      businessId: snapshot.businessId,
      type: "SYSTEM",
      title: "AI usage warning",
      message: AI_WARNING_MESSAGE,
      link: "/billing",
    });
  });

  if (notification) {
    emitNotification(notification);
  }
};

const buildAIUsageReservation = async (
  businessId: string,
  count = DEFAULT_INCREMENT_COUNT
): Promise<AIUsageReservation> => {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  const normalizedCount = normalizeCount(count);

  if (!normalizedBusinessId) {
    throw new UsageError("INVALID_BUSINESS_ID", "Invalid business id");
  }

  const { planKey, limits } = await resolveUsagePlan(normalizedBusinessId);
  const hourlyLimit = getAiHourlyLimit(planKey);

  const updated = await prisma.$transaction(async (tx) => {
    const dailyDateKey = getCurrentDateKey();
    const hourlyDateKey = getCurrentHourKey();
    const [{ key, usage }, addonBalanceRecord, dailyUsageRecord, hourlyUsageRecord] =
      await Promise.all([
        ensureUsageRecord(tx, normalizedBusinessId),
        tx.addonBalance.findUnique({
          where: {
            businessId_type: {
              businessId: normalizedBusinessId,
              type: "ai_credits",
            },
          },
          select: {
            balance: true,
          },
        }),
        ensureDailyUsageRecord(
          tx,
          normalizedBusinessId,
          AI_DAILY_FEATURE_KEY,
          dailyDateKey
        ),
        ensureDailyUsageRecord(
          tx,
          normalizedBusinessId,
          AI_HOURLY_FEATURE_KEY,
          hourlyDateKey
        ),
      ]);

    const monthlyUsed = getUsageFieldValue(usage, "aiCallsUsed");
    const dailyUsed = dailyUsageRecord?.count || 0;
    const hourlyUsed = hourlyUsageRecord?.count || 0;

    if (hourlyUsed + normalizedCount > hourlyLimit) {
      throw new UsageError(
        "HOURLY_LIMIT_REACHED",
        "Hourly AI safety limit reached",
        {
          feature: "ai_messages",
          current: hourlyUsed,
          max: hourlyLimit,
        }
      );
    }

    const computation = buildComputation({
      feature: "ai_messages",
      count: normalizedCount,
      planKey,
      limits,
      monthlyUsed,
      dailyUsed,
      addonBalance: addonBalanceRecord?.balance || 0,
      month: key.month,
      year: key.year,
    });

    if (!computation.allowed) {
      throw new UsageError("LIMIT_REACHED", "Usage limit reached", {
        feature: "ai_messages",
        current: computation.dailyUsed,
        max: computation.dailyLimit,
      });
    }

    if (computation.addonRequired > 0) {
      await consumeAddonCreditsTx(
        tx,
        normalizedBusinessId,
        "ai_credits",
        computation.addonRequired
      );
    }

    const planConsumed = Math.max(normalizedCount - computation.addonRequired, 0);

    const [updatedUsage, updatedDaily, updatedHourly] = await Promise.all([
      tx.usage.update({
        where: { id: usage.id },
        data: {
          aiCallsUsed: {
            increment: normalizedCount,
          },
        },
      }),
      planConsumed > 0
        ? tx.usageDaily.update({
            where: {
              businessId_feature_dateKey: {
                businessId: normalizedBusinessId,
                feature: AI_DAILY_FEATURE_KEY,
                dateKey: dailyDateKey,
              },
            },
            data: {
              count: {
                increment: planConsumed,
              },
            },
          })
        : Promise.resolve(dailyUsageRecord),
      tx.usageDaily.update({
        where: {
          businessId_feature_dateKey: {
            businessId: normalizedBusinessId,
            feature: AI_HOURLY_FEATURE_KEY,
            dateKey: hourlyDateKey,
          },
        },
        data: {
          count: {
            increment: normalizedCount,
          },
        },
      }),
    ]);

    return {
      key,
      updatedUsage: updatedUsage as MonthlyUsageRow,
      updatedDaily,
      updatedHourly,
      remainingAddonBalance: Math.max(
        (addonBalanceRecord?.balance || 0) - computation.addonRequired,
        0
      ),
      addonConsumed: computation.addonRequired,
      planConsumed,
      dailyDateKey,
      hourlyDateKey,
    };
  });

  const monthlyUsed = getUsageFieldValue(updated.updatedUsage, "aiCallsUsed");
  const snapshot = buildUsageSnapshot(
    normalizedBusinessId,
    buildComputation({
      feature: "ai_messages",
      count: normalizedCount,
      planKey,
      limits,
      monthlyUsed,
      dailyUsed: updated.updatedDaily?.count || 0,
      addonBalance: updated.remainingAddonBalance,
      month: updated.key.month,
      year: updated.key.year,
    })
  );

  return {
    businessId: normalizedBusinessId,
    count: normalizedCount,
    addonConsumed: updated.addonConsumed,
    planConsumed: updated.planConsumed,
    month: updated.key.month,
    year: updated.key.year,
    dailyDateKey: updated.dailyDateKey,
    hourlyDateKey: updated.hourlyDateKey,
    snapshot,
  };
};

export const reserveAIUsageExecution = async (input: {
  businessId: string;
  count?: number;
}) => buildAIUsageReservation(input.businessId, input.count);

export const finalizeAIUsageExecution = async (
  reservation: AIUsageReservation
) => {
  if (reservation.snapshot.warning) {
    await maybeSendAiWarningNotification(reservation.snapshot).catch(
      () => undefined
    );
  }

  return reservation.snapshot;
};

export const releaseAIUsageExecution = async (
  reservation: AIUsageReservation
) => {
  await prisma.$transaction(async (tx) => {
    const usage = await tx.usage.findUnique({
      where: {
        businessId_month_year: {
          businessId: reservation.businessId,
          month: reservation.month,
          year: reservation.year,
        },
      },
    });

    if (usage) {
      await tx.usage.update({
        where: {
          businessId_month_year: {
            businessId: reservation.businessId,
            month: reservation.month,
            year: reservation.year,
          },
        },
        data: {
          aiCallsUsed: {
            decrement: Math.min(usage.aiCallsUsed || 0, reservation.count),
          },
        },
      });
    }

    if (reservation.planConsumed > 0) {
      const dailyUsage = await tx.usageDaily.findUnique({
        where: {
          businessId_feature_dateKey: {
            businessId: reservation.businessId,
            feature: AI_DAILY_FEATURE_KEY,
            dateKey: reservation.dailyDateKey,
          },
        },
        select: {
          count: true,
        },
      });

      if (dailyUsage) {
        await tx.usageDaily.update({
          where: {
            businessId_feature_dateKey: {
              businessId: reservation.businessId,
              feature: AI_DAILY_FEATURE_KEY,
              dateKey: reservation.dailyDateKey,
            },
          },
          data: {
            count: {
              decrement: Math.min(
                dailyUsage.count || 0,
                reservation.planConsumed
              ),
            },
          },
        });
      }
    }

    const hourlyUsage = await tx.usageDaily.findUnique({
      where: {
        businessId_feature_dateKey: {
          businessId: reservation.businessId,
          feature: AI_HOURLY_FEATURE_KEY,
          dateKey: reservation.hourlyDateKey,
        },
      },
      select: {
        count: true,
      },
    });

    if (hourlyUsage) {
      await tx.usageDaily.update({
        where: {
          businessId_feature_dateKey: {
            businessId: reservation.businessId,
            feature: AI_HOURLY_FEATURE_KEY,
            dateKey: reservation.hourlyDateKey,
          },
        },
        data: {
          count: {
            decrement: Math.min(hourlyUsage.count || 0, reservation.count),
          },
        },
      });
    }

    if (reservation.addonConsumed > 0) {
      await tx.addonBalance.upsert({
        where: {
          businessId_type: {
            businessId: reservation.businessId,
            type: "ai_credits",
          },
        },
        update: {
          balance: {
            increment: reservation.addonConsumed,
          },
        },
        create: {
          businessId: reservation.businessId,
          type: "ai_credits",
          balance: reservation.addonConsumed,
        },
      });
    }
  });
};

export const getUsage = async ({
  businessId,
  feature,
  count,
}: UsageInput): Promise<UsageSnapshot> => {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  const normalizedCount = normalizeCount(count);

  if (!normalizedBusinessId) {
    throw new UsageError("INVALID_BUSINESS_ID", "Invalid business id");
  }

  const { planKey, limits } = await resolveUsagePlan(normalizedBusinessId);
  const addonBalances = await getAddonBalance(normalizedBusinessId);
  const { month, year } = getCurrentMonthYear();

  if (feature === "contacts") {
    const contactsUsed = await getContactsCount(normalizedBusinessId);

    return buildUsageSnapshot(
      normalizedBusinessId,
      buildComputation({
        feature,
        count: normalizedCount,
        planKey,
        limits,
        monthlyUsed: contactsUsed,
        addonBalance: addonBalances.contacts,
        month,
        year,
      })
    );
  }

  const { usage } = await prisma.$transaction((tx) =>
    ensureUsageRecord(tx, normalizedBusinessId)
  );
  const featureConfig = getFeatureConfig(feature);
  const monthlyUsed = getUsageFieldValue(
    usage,
    featureConfig.usageField as UsageField
  );
  const dailyUsed =
    feature === "ai_messages"
      ? await getDailyUsageCount(normalizedBusinessId, AI_DAILY_FEATURE_KEY)
      : null;

  return buildUsageSnapshot(
    normalizedBusinessId,
    buildComputation({
      feature,
      count: normalizedCount,
      planKey,
      limits,
      monthlyUsed,
      dailyUsed,
      addonBalance: feature === "ai_messages" ? addonBalances.aiCredits : 0,
      month: usage.month,
      year: usage.year,
    })
  );
};

export const checkUsageLimit = async (
  input: UsageInput
): Promise<UsageSnapshot> => {
  try {
    return await getUsage(input);
  } catch (error) {
    const code =
      error instanceof UsageError
        ? error.code
        : "USAGE_CHECK_FAILED";

    return buildFailClosedSnapshot({
      ...input,
      errorCode: code,
    });
  }
};

export const incrementUsage = async ({
  businessId,
  feature,
  count,
}: UsageInput): Promise<UsageSnapshot> => {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  const normalizedCount = normalizeCount(count);

  if (!normalizedBusinessId) {
    throw new UsageError("INVALID_BUSINESS_ID", "Invalid business id");
  }

  if (feature === "ai_messages") {
    const reservation = await reserveAIUsageExecution({
      businessId: normalizedBusinessId,
      count: normalizedCount,
    });

    return finalizeAIUsageExecution(reservation);
  }

  const { planKey, limits } = await resolveUsagePlan(normalizedBusinessId);

  if (feature === "contacts") {
    const contactsUsed = await getContactsCount(normalizedBusinessId);
    const addonBalances = await getAddonBalance(normalizedBusinessId);
    const preCreateCount = Math.max(contactsUsed - normalizedCount, 0);
    const computation = buildComputation({
      feature,
      count: normalizedCount,
      planKey,
      limits,
      monthlyUsed: preCreateCount,
      addonBalance: addonBalances.contacts,
      month: getCurrentMonthYear().month,
      year: getCurrentMonthYear().year,
    });

    if (!computation.allowed) {
      throw new UsageError("LIMIT_REACHED", "Usage limit reached", {
        feature,
        current: contactsUsed,
        max: computation.monthlyLimit,
      });
    }

    if (computation.addonRequired > 0) {
      await prisma.$transaction(async (tx) => {
        await consumeAddonCreditsTx(
          tx,
          normalizedBusinessId,
          "contacts",
          computation.addonRequired
        );
      });
    }

    return buildUsageSnapshot(
      normalizedBusinessId,
      buildComputation({
        feature,
        count: normalizedCount,
        planKey,
        limits,
        monthlyUsed: contactsUsed,
        addonBalance: Math.max(
          addonBalances.contacts - computation.addonRequired,
          0
        ),
        month: getCurrentMonthYear().month,
        year: getCurrentMonthYear().year,
      })
    );
  }

  const featureConfig = getFeatureConfig(feature);

  const updated = await prisma.$transaction(async (tx) => {
    const [{ key, usage }, addonBalanceRecord, dailyUsageRecord] =
      await Promise.all([
        ensureUsageRecord(tx, normalizedBusinessId),
        featureConfig.addonType
          ? tx.addonBalance.findUnique({
              where: {
                businessId_type: {
                  businessId: normalizedBusinessId,
                  type: featureConfig.addonType,
                },
              },
              select: {
                balance: true,
              },
            })
          : Promise.resolve(null),
        Promise.resolve(null),
      ]);

    const monthlyUsed = getUsageFieldValue(
      usage,
      featureConfig.usageField as UsageField
    );
    const computation = buildComputation({
      feature,
      count: normalizedCount,
      planKey,
      limits,
      monthlyUsed,
      dailyUsed: dailyUsageRecord?.count || null,
      addonBalance: addonBalanceRecord?.balance || 0,
      month: key.month,
      year: key.year,
    });

    if (!computation.allowed) {
      throw new UsageError("LIMIT_REACHED", "Usage limit reached", {
        feature,
        current: monthlyUsed,
        max: computation.monthlyLimit,
      });
    }

    if (computation.addonRequired > 0 && computation.addonType) {
      await consumeAddonCreditsTx(
        tx,
        normalizedBusinessId,
        computation.addonType,
        computation.addonRequired
      );
    }

    const updatedUsage = await tx.usage.update({
      where: { id: usage.id },
      data: {
        [featureConfig.usageField as UsageField]: {
          increment: normalizedCount,
        },
      } as Record<string, { increment: number }>,
    });

    const updatedDaily = dailyUsageRecord;

    return {
      key,
      updatedUsage: updatedUsage as MonthlyUsageRow,
      updatedDaily,
      remainingAddonBalance: Math.max(
        (addonBalanceRecord?.balance || 0) - computation.addonRequired,
        0
      ),
    };
  });

  const monthlyUsed = getUsageFieldValue(
    updated.updatedUsage,
    featureConfig.usageField as UsageField
  );
  const snapshot = buildUsageSnapshot(
    normalizedBusinessId,
    buildComputation({
      feature,
      count: normalizedCount,
      planKey,
      limits,
      monthlyUsed,
      dailyUsed: updated.updatedDaily?.count || null,
      addonBalance: 0,
      month: updated.key.month,
      year: updated.key.year,
    })
  );

  return snapshot;
};

export const runWithContactUsageLimit = async <T>(
  businessId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  count = DEFAULT_INCREMENT_COUNT
) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  const normalizedCount = normalizeCount(count);

  if (!normalizedBusinessId) {
    throw new UsageError("INVALID_BUSINESS_ID", "Invalid business id");
  }

  const { planKey, limits } = await resolveUsagePlan(normalizedBusinessId);

  return prisma.$transaction(async (tx) => {
    const contactLock = await ensureDailyUsageRecord(
      tx,
      normalizedBusinessId,
      CONTACTS_LIMIT_LOCK_FEATURE_KEY
    );

    await tx.usageDaily.update({
      where: {
        id: contactLock.id,
      },
      data: {
        count: {
          increment: 0,
        },
      },
    });

    const currentCount = await getContactsCount(normalizedBusinessId, tx);
    const addonBalanceRecord = await tx.addonBalance.findUnique({
      where: {
        businessId_type: {
          businessId: normalizedBusinessId,
          type: "contacts",
        },
      },
      select: {
        balance: true,
      },
    });

    const computation = buildComputation({
      feature: "contacts",
      count: normalizedCount,
      planKey,
      limits,
      monthlyUsed: currentCount,
      addonBalance: addonBalanceRecord?.balance || 0,
      month: getCurrentMonthYear().month,
      year: getCurrentMonthYear().year,
    });

    if (!computation.allowed) {
      throw new UsageError("LIMIT_REACHED", "Usage limit reached", {
        feature: "contacts",
        current: currentCount,
        max: computation.monthlyLimit,
      });
    }

    if (computation.addonRequired > 0) {
      await consumeAddonCreditsTx(
        tx,
        normalizedBusinessId,
        "contacts",
        computation.addonRequired
      );
    }

    const result = await operation(tx);
    const usage = buildUsageSnapshot(
      normalizedBusinessId,
      buildComputation({
        feature: "contacts",
        count: normalizedCount,
        planKey,
        limits,
        monthlyUsed: currentCount + normalizedCount,
        addonBalance: Math.max(
          (addonBalanceRecord?.balance || 0) - computation.addonRequired,
          0
        ),
        month: getCurrentMonthYear().month,
        year: getCurrentMonthYear().year,
      })
    );

    return {
      result,
      usage,
    };
  });
};

export const getUsageOverview = async (
  businessId: string
): Promise<UsageOverview> => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new UsageError("INVALID_BUSINESS_ID", "Invalid business id");
  }

  const [{ planKey }, trial, addons, aiUsage, contactsUsage, messageUsage, automationUsage] =
    await Promise.all([
      resolveUsagePlan(normalizedBusinessId),
      getTrialStatus(normalizedBusinessId),
      getAddonBalance(normalizedBusinessId),
      getUsage({
        businessId: normalizedBusinessId,
        feature: "ai_messages",
      }),
      getUsage({
        businessId: normalizedBusinessId,
        feature: "contacts",
      }),
      getUsage({
        businessId: normalizedBusinessId,
        feature: "messages_sent",
      }),
      getUsage({
        businessId: normalizedBusinessId,
        feature: "automation_runs",
      }),
    ]);

  return {
    plan: planKey,
    planLabel: getPricingPlanLabel(planKey),
    trialActive: trial.trialActive,
    daysLeft: trial.daysLeft,
    warning: aiUsage.warning,
    warningMessage: aiUsage.warningMessage,
    addonCredits: addons.aiCredits,
    ai: {
      usedToday: aiUsage.dailyUsed || 0,
      limit: aiUsage.dailyLimit || 0,
      remaining: aiUsage.dailyRemaining ?? null,
    },
    usage: {
      ai: {
        used: aiUsage.dailyUsed || 0,
        dailyLimit: aiUsage.dailyLimit || 0,
        monthlyUsed: aiUsage.monthlyUsed,
        monthlyLimit: aiUsage.monthlyLimit,
        dailyRemaining: aiUsage.dailyRemaining ?? null,
        monthlyRemaining: aiUsage.monthlyRemaining,
        warning: aiUsage.warning,
      },
      contacts: {
        used: contactsUsage.monthlyUsed,
        limit: contactsUsage.monthlyLimit,
        remaining: contactsUsage.monthlyRemaining,
      },
      messages: {
        used: messageUsage.monthlyUsed,
        limit: messageUsage.monthlyLimit,
        remaining: messageUsage.monthlyRemaining,
      },
      automation: {
        used: automationUsage.monthlyUsed,
        limit: automationUsage.monthlyLimit,
        remaining: automationUsage.monthlyRemaining,
      },
    },
    addons: {
      aiCredits: addons.aiCredits,
      contacts: addons.contacts,
    },
  };
};

export const trackUsage = async (
  businessId: string,
  field: LegacyUsageField
) => {
  const feature = LEGACY_USAGE_FIELD_MAP[field];
  const limitSnapshot = await checkUsageLimit({
    businessId,
    feature,
  });

  if (!limitSnapshot.allowed) {
    throw new UsageError("LIMIT_REACHED", "Usage limit reached", {
      field,
      current: limitSnapshot.used,
      max: limitSnapshot.limit,
    });
  }

  const updated = await incrementUsage({
    businessId,
    feature,
  });

  return {
    success: true,
    current: updated.used,
    max: updated.limit,
    nearLimit:
      updated.limit !== -1 && updated.remaining !== null
        ? updated.remaining <= Math.max(Math.ceil(updated.limit * 0.2), 1)
        : false,
    warning: updated.warning,
  };
};

export const incrementAiUsage = async (businessId: string) =>
  trackUsage(businessId, "aiCallsUsed");

export const incrementAutomationUsage = async (businessId: string) =>
  incrementUsage({
    businessId,
    feature: "automation_runs",
  });

export const incrementMessageUsage = async (businessId: string) =>
  trackUsage(businessId, "messagesUsed");

export const incrementFollowupUsage = async (businessId: string) =>
  trackUsage(businessId, "followupsUsed");

export const reserveUsage = incrementUsage;
