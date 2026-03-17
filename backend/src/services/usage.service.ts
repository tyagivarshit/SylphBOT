import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

/* ======================================
KEY GENERATOR
====================================== */

const getKey = (businessId: string) => {

  const { month, year } = getCurrentMonthYear();

  return {
    businessId,
    month,
    year,
  };

};

/* ======================================
GET OR CREATE USAGE (RACE SAFE)
====================================== */

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

/* ======================================
GENERIC INCREMENT
====================================== */

const incrementUsage = async (
  businessId: string,
  field: "aiCallsUsed" | "messagesUsed" | "followupsUsed"
) => {

  const usage = await getOrCreateUsage(businessId);

  await prisma.usage.update({
    where: {
      id: usage.id,
    },
    data: {
      [field]: {
        increment: 1,
      },
    },
  });

};

/* ======================================
SPECIFIC HELPERS
====================================== */

export const incrementAiUsage = async (
  businessId: string
) => {

  await incrementUsage(businessId, "aiCallsUsed");

};

export const incrementMessageUsage = async (
  businessId: string
) => {

  await incrementUsage(businessId, "messagesUsed");

};

export const incrementFollowupUsage = async (
  businessId: string
) => {

  await incrementUsage(businessId, "followupsUsed");

};