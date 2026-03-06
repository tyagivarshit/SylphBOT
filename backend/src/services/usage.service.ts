import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

const getKey = (businessId: string) => {
  const { month, year } = getCurrentMonthYear();

  return {
    businessId,
    month,
    year,
  };
};

// ✅ Atomic get-or-create (race condition safe)
export const getOrCreateUsage = async (
  businessId: string
) => {
  const key = getKey(businessId);

  return prisma.usage.upsert({
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
};

// 🔥 Generic increment function
const incrementUsage = async (
  businessId: string,
  field: "aiCallsUsed" | "messagesUsed" | "followupsUsed"
) => {
  const key = getKey(businessId);

  await prisma.usage.update({
    where: {
      businessId_month_year: key,
    },
    data: {
      [field]: {
        increment: 1,
      },
    },
  });
};

// ✅ Specific helpers
export const incrementAiUsage = async (
  businessId: string
) => incrementUsage(businessId, "aiCallsUsed");

export const incrementMessageUsage = async (
  businessId: string
) => incrementUsage(businessId, "messagesUsed");

export const incrementFollowupUsage = async (
  businessId: string
) => incrementUsage(businessId, "followupsUsed");