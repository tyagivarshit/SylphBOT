import prisma from "../config/prisma";

interface TriggerInput {
  businessId: string;
  message: string;
}

interface TriggerResult {
  flowId: string;
}

/* 🔥 simple in-memory cache (per process) */
const triggerCache = new Map<string, any[]>();
const CACHE_TTL = 30 * 1000; // 30 sec

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
    CACHE CHECK
    ================================================== */

    let flows = triggerCache.get(businessId);

    if (!flows) {
      flows = await prisma.automationFlow.findMany({
        where: {
          businessId,
          status: "ACTIVE",
          triggerValue: {
            not: null,
          },
        },
        select: {
          id: true,
          triggerValue: true,
        },
      });

      triggerCache.set(businessId, flows);

      /* auto clear cache */
      setTimeout(() => {
        triggerCache.delete(businessId);
      }, CACHE_TTL);
    }

    if (!flows.length) return null;

    let bestMatch: { flowId: string; score: number } | null = null;

    /* ==================================================
    LOOP FLOWS (LIGHTWEIGHT)
    ================================================== */

    for (const flow of flows) {
      const cleanTrigger = flow.triggerValue
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim();

      let score = 0;

      /* EXACT MATCH */
      if (cleanText === cleanTrigger) {
        return { flowId: flow.id };
      }

      /* FAST WORD MATCH (no regex) */
      const words = cleanText.split(" ");
      if (words.includes(cleanTrigger)) {
        score = 2;
      }

      /* PARTIAL MATCH */
      else if (
        cleanTrigger.length > 3 &&
        cleanText.includes(cleanTrigger)
      ) {
        score = 1;
      }

      /* BEST MATCH PICK */
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