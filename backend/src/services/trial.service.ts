import prisma from "../config/prisma";

/* ======================================
START TRIAL (SAFE)
====================================== */

export const startTrial = async (businessId: string) => {

  return prisma.$transaction(async (tx) => {

    const existing = await tx.subscription.findUnique({
      where: { businessId },
    });

    /* 🔥 PREVENT TRIAL ABUSE */
    if (existing?.trialUsed) {
      throw new Error("Trial already used");
    }

    /* ======================================
    ✅ FIX: USE BASIC PLAN (NO FREE PLAN)
    ====================================== */

    const selectedPlan = await tx.plan.findFirst({
      where: {
        OR: [{ name: "BASIC" }, { type: "BASIC" }],
      },
    });

    if (!selectedPlan) {
      throw new Error("Default trial plan not found");
    }

    const trialDays = 7;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + trialDays);

    await tx.subscription.upsert({
      where: { businessId },

      update: {
        status: "ACTIVE",
        isTrial: true,
        trialUsed: true,
        currentPeriodEnd: endDate,
        planId: selectedPlan.id, // ✅ FIX
      },

      create: {
        businessId,
        planId: selectedPlan.id, // ✅ FIX
        status: "ACTIVE",
        isTrial: true,
        trialUsed: true,
        currentPeriodEnd: endDate,
      },
    });

  });

};

/* ======================================
EXPIRE TRIAL (BULK + FAST)
====================================== */

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
    },
  });

};