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
    const cleanText = message
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();

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

    let bestMatch: { flowId: string; score: number } | null = null;

    /* ==================================================
    LOOP FLOWS
    ================================================== */

    for (const flow of flows) {
      if (!flow.triggerValue) continue;

      const cleanTrigger = flow.triggerValue
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim();

      let score = 0;

      /* EXACT MATCH (highest priority) */
      if (cleanText === cleanTrigger) {
        return { flowId: flow.id };
      }

      /* WORD BOUNDARY MATCH */
      const regex = new RegExp(`\\b${cleanTrigger}\\b`);
      if (regex.test(cleanText)) {
        score = 2;
      }

      /* PARTIAL MATCH (controlled) */
      else if (
        cleanTrigger.length > 3 &&
        cleanText.includes(cleanTrigger)
      ) {
        score = 1;
      }

      /* PICK BEST MATCH */
      if (score > 0) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            flowId: flow.id,
            score,
          };
        }
      }
    }

    return bestMatch ? { flowId: bestMatch.flowId } : null;

  } catch (error) {
    console.error("🚨 Trigger matcher error:", error);
    return null;
  }
};