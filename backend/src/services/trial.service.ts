import prisma from "../config/prisma";

export const startTrial = async (businessId: string) => {

  const trialDays = 7;

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + trialDays);

  await prisma.subscription.upsert({
    where: { businessId },
    update: {
      status: "TRIAL",
      isTrial: true,
      currentPeriodEnd: endDate,
    },
    create: {
      businessId,
      planId: "" as any,
      status: "TRIAL",
      isTrial: true,
      trialUsed: true,
      currentPeriodEnd: endDate,
    },
  });

};

export const checkTrialExpired = async () => {

  const now = new Date();

  const expired = await prisma.subscription.findMany({
    where: {
      isTrial: true,
      currentPeriodEnd: { lt: now },
    },
  });

  for (const sub of expired) {
    await prisma.subscription.update({
      where: { businessId: sub.businessId },
      data: {
        status: "INACTIVE",
        isTrial: false,
      },
    });
  }

};