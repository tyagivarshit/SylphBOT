import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";
import { getPlanLimits } from "../config/plan.config";

/* ======================================
KEY
====================================== */

const getKey = (businessId: string) => {
  const { month, year } = getCurrentMonthYear();
  return { businessId, month, year };
};

/* ======================================
🔥 ATOMIC CHECK + INCREMENT (CORE FIX)
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

    if (!subscription || subscription.status !== "ACTIVE") {
      throw {
        code: "NO_ACTIVE_SUBSCRIPTION",
        message: "No active subscription",
        upgradeRequired: true,
      };
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

    if (max !== -1 && current >= max) {
      throw {
        code: "LIMIT_REACHED",
        feature: field,
        current,
        max,
        upgradeRequired: true,
      };
    }

    /* 🔥 SAFE INCREMENT INSIDE TX */
    await tx.usage.update({
      where: { id: usage.id },
      data: {
        [field]: {
          increment: 1,
        },
      },
    });

    return true;
  });
};

/* ======================================
HELPERS
====================================== */

export const incrementAiUsage = async (businessId: string) => {
  await trackUsage(businessId, "aiCallsUsed");
};

export const incrementMessageUsage = async (businessId: string) => {
  await trackUsage(businessId, "messagesUsed");
};

export const incrementFollowupUsage = async (businessId: string) => {
  await trackUsage(businessId, "followupsUsed");
};