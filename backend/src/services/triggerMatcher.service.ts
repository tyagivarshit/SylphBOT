import prisma from "../config/prisma";

interface TriggerInput {
  businessId: string;
  message: string;
}

interface TriggerResult {
  flowId: string;
}

export const matchAutomationTrigger = async ({
  businessId,
  message,
}: TriggerInput): Promise<TriggerResult | null> => {

  try {

    const text = message.toLowerCase().trim();

    /* ==================================================
    FETCH ACTIVE FLOWS
    ================================================== */

    const flows = await prisma.automationFlow.findMany({
      where: {
        businessId,
        status: "ACTIVE",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!flows.length) return null;

    /* ==================================================
    LOOP FLOWS
    ================================================== */

    for (const flow of flows) {

      if (!flow.triggerValue) continue;

      const triggerValue = flow.triggerValue
        .toLowerCase()
        .trim();

      /* EXACT MATCH */

      if (text === triggerValue) {

        return {
          flowId: flow.id,
        };

      }

      /* WORD MATCH */

      const words = text.split(" ");

      if (words.includes(triggerValue)) {

        return {
          flowId: flow.id,
        };

      }

      /* PARTIAL MATCH (SAFE) */

      if (
        text.length > triggerValue.length + 2 &&
        text.includes(triggerValue)
      ) {

        return {
          flowId: flow.id,
        };

      }

    }

    return null;

  } catch (error) {

    console.error("🚨 Trigger matcher error:", error);

    return null;

  }

};