import prisma from "../config/prisma";
import { TRIAL_DAYS, TRIAL_PLAN_KEY } from "../config/pricing.config";

type TrialStatus = {
  trialActive: boolean;
  daysLeft: number;
  currentPeriodEnd: Date | null;
};

const normalizeBusinessId = (businessId: string) =>
  String(businessId || "").trim();

const getTrialPlan = async () =>
  prisma.plan.findFirst({
    where: {
      OR: [{ name: TRIAL_PLAN_KEY }, { type: TRIAL_PLAN_KEY }],
    },
  });

export const getTrialStatus = async (
  businessId: string
): Promise<TrialStatus> => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: normalizedBusinessId },
    select: {
      isTrial: true,
      currentPeriodEnd: true,
    },
  });

  if (!subscription?.isTrial || !subscription.currentPeriodEnd) {
    return {
      trialActive: false,
      daysLeft: 0,
      currentPeriodEnd: null,
    };
  }

  const now = Date.now();
  const expiresAt = subscription.currentPeriodEnd.getTime();
  const active = expiresAt >= now;

  return {
    trialActive: active,
    daysLeft: active
      ? Math.max(Math.ceil((expiresAt - now) / 86400000), 0)
      : 0,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
};

export const startTrial = async (businessId: string) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({
      where: { businessId: normalizedBusinessId },
    });

    if (existing?.trialUsed) {
      throw new Error("Trial already used");
    }

    const selectedPlan = await tx.plan.findFirst({
      where: {
        OR: [{ name: TRIAL_PLAN_KEY }, { type: TRIAL_PLAN_KEY }],
      },
    });

    if (!selectedPlan) {
      throw new Error("Default trial plan not found");
    }

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + TRIAL_DAYS);

    await tx.subscription.upsert({
      where: { businessId: normalizedBusinessId },
      update: {
        planId: selectedPlan.id,
        status: "ACTIVE",
        isTrial: true,
        trialUsed: true,
        currentPeriodEnd,
        graceUntil: null,
      },
      create: {
        businessId: normalizedBusinessId,
        planId: selectedPlan.id,
        status: "ACTIVE",
        isTrial: true,
        trialUsed: true,
        currentPeriodEnd,
      },
    });
  });
};

export const ensureTrialPlanExists = async () => {
  const plan = await getTrialPlan();

  if (!plan) {
    throw new Error("Default trial plan not found");
  }

  return plan;
};

export const expireTrials = async () => {
  const now = new Date();

  await prisma.subscription.updateMany({
    where: {
      isTrial: true,
      currentPeriodEnd: { lt: now },
    },
    data: {
      status: "INACTIVE",
      isTrial: false,
      graceUntil: null,
    },
  });
};
