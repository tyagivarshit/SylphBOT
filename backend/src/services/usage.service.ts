import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";
import {
  getPlanLimits,
  isNearLimit,
} from "../config/plan.config";

/* ======================================
KEY
====================================== */

const getKey = (businessId: string) => {
  const { month, year } = getCurrentMonthYear();
  return { businessId, month, year };
};

/* ======================================
CUSTOM ERROR
====================================== */

class UsageError extends Error {
  code: string;
  upgradeRequired?: boolean;
  meta?: any;

  constructor(code: string, message: string, meta?: any) {
    super(message);
    this.code = code;
    this.meta = meta;
    this.upgradeRequired = true;
  }
}

/* ======================================
🔥 ATOMIC CHECK + INCREMENT
====================================== */

export const trackUsage = async (
  businessId: string,
  field: "aiCallsUsed" | "messagesUsed" | "followupsUsed"
) => {

  return prisma.$transaction(async (tx) => {

    const subscription = await tx.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });

    /* ======================================
    VALID STATUS (FIXED)
    ====================================== */

    const validStatuses = ["ACTIVE"]; // ✅ FIXED

    if (
      !subscription ||
      !validStatuses.includes(subscription.status)
    ) {
      throw new UsageError(
        "NO_ACTIVE_SUBSCRIPTION",
        "No active subscription"
      );
    }

    const limits = getPlanLimits(subscription.plan);

    const key = getKey(businessId);

    const usage = await tx.usage.upsert({
      where: {
        businessId_month_year: key,
      },
      update: {},
      create: {
        ...key,
        aiCallsUsed: 0,
        messagesUsed: 0,
        followupsUsed: 0,
      },
    });

    const current = usage[field];
    const max = limits[field];

    /* ======================================
    HARD LIMIT
    ====================================== */

    if (max !== -1 && current >= max) {
      throw new UsageError(
        "LIMIT_REACHED",
        "Usage limit reached",
        { field, current, max }
      );
    }

    /* ======================================
    🔥 SAFE INCREMENT
    ====================================== */

    const updated = await tx.usage.update({
      where: { id: usage.id },
      data: {
        [field]: {
          increment: 1,
        },
      },
    });

    /* ======================================
    SOFT LIMIT (UPSELL ENGINE)
    ====================================== */

    const nearLimit =
      max !== -1 && isNearLimit(updated[field], max);

    return {
      success: true,
      current: updated[field],
      max,
      nearLimit,
    };
  });
};

/* ======================================
HELPERS
====================================== */

export const incrementAiUsage = async (businessId: string) => {
  return trackUsage(businessId, "aiCallsUsed");
};

export const incrementMessageUsage = async (businessId: string) => {
  return trackUsage(businessId, "messagesUsed");
};

export const incrementFollowupUsage = async (businessId: string) => {
  return trackUsage(businessId, "followupsUsed");
};