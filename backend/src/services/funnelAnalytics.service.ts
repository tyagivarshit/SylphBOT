import prisma from "../config/prisma";

export const trackStepView = async (
  flowId: string,
  stepKey: string
) => {
  try {
    await prisma.$runCommandRaw({
      insert: "FunnelAnalytics",
      documents: [
        {
          flowId,
          stepKey,
          type: "STEP_VIEW",
          createdAt: new Date(),
        },
      ],
    });
  } catch {}
};

export const trackStepConversion = async (
  flowId: string,
  stepKey: string
) => {
  try {
    await prisma.$runCommandRaw({
      insert: "FunnelAnalytics",
      documents: [
        {
          flowId,
          stepKey,
          type: "STEP_CONVERSION",
          createdAt: new Date(),
        },
      ],
    });
  } catch {}
};