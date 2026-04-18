import prisma from "../config/prisma";
const cosineSimilarity = require("cosine-similarity");
import { buildKnowledgeScopeFilter } from "./clientScope.service";
import { createEmbedding } from "./embedding.service";

interface KnowledgeResult {
  id: string;
  content: string;
  score: number;
  clientId?: string | null;
}

const SIMILARITY_THRESHOLD = 0.25;
const MAX_RESULTS = 5;

const PRIORITY_WEIGHT: Record<string, number> = {
  HIGH: 0.3,
  MEDIUM: 0.15,
  LOW: 0,
};

const keywordScore = (query: string, content: string): number => {
  const qWords = query.toLowerCase().split(" ").filter(Boolean);
  const cText = content.toLowerCase();

  let match = 0;

  for (const word of qWords) {
    if (cText.includes(word)) {
      match++;
    }
  }

  return qWords.length ? match / qWords.length : 0;
};

const businessIntentBoost = (content: string) => {
  const text = content.toLowerCase();
  let boost = 0;

  if (
    /help|service|services|automation|reply|booking|offer|solution|support|works/i.test(
      text
    )
  ) {
    boost += 0.35;
  }

  if (/owner|multiple business/i.test(text)) {
    boost -= 0.15;
  }

  return boost;
};

export const searchKnowledge = async (
  businessId: string,
  message: string,
  options?: {
    clientId?: string | null;
    includeShared?: boolean;
  }
): Promise<KnowledgeResult[]> => {
  try {
    const messageEmbedding = await createEmbedding(message);
    const normalizedClientId = String(options?.clientId || "").trim() || null;
    const includeShared = options?.includeShared !== false;

    const knowledge = await prisma.knowledgeBase.findMany({
      where: {
        ...buildKnowledgeScopeFilter({
          businessId,
          clientId: normalizedClientId,
          includeShared,
        }),
        isActive: true,
        sourceType: {
          in: ["SYSTEM", "FAQ", "MANUAL"],
        },
      },
      select: {
        id: true,
        content: true,
        embedding: true,
        priority: true,
        clientId: true,
      },
    });

    if (!knowledge.length) {
      return [];
    }

    const scored = knowledge.map((item) => {
      let semantic = 0;
      let keyword = 0;

      if (item.embedding) {
        semantic = cosineSimilarity(
          messageEmbedding,
          item.embedding as number[]
        );
      }

      keyword = keywordScore(message, item.content);

      let boost = 0;
      const text = item.content.toLowerCase();

      if (
        text.includes("service") ||
        text.includes("business") ||
        text.includes("company") ||
        text.includes("digital")
      ) {
        boost = 0.1;
      }

      const priorityKey = item.priority || "MEDIUM";
      const priorityBoost =
        PRIORITY_WEIGHT[priorityKey as keyof typeof PRIORITY_WEIGHT] || 0;

      const scopeBoost =
        normalizedClientId && item.clientId === normalizedClientId
          ? 0.35
          : !item.clientId
          ? 0.05
          : 0;

      const finalScore =
        semantic * 0.7 +
        keyword * 0.3 +
        boost +
        priorityBoost +
        scopeBoost;

      return {
        id: item.id,
        content: item.content,
        score: finalScore,
        clientId: item.clientId || null,
      };
    });

    const lowerMsg = message.toLowerCase();

    if (
      lowerMsg.includes("business") ||
      lowerMsg.includes("service") ||
      lowerMsg.includes("kya karte") ||
      lowerMsg.includes("what do you do")
    ) {
      return scored
        .sort(
          (a, b) =>
            b.score +
            businessIntentBoost(b.content) -
            (a.score + businessIntentBoost(a.content))
        )
        .slice(0, 3);
    }

    return scored
      .filter((item) => item.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);
  } catch (error) {
    console.error("Knowledge search error:", error);
    return [];
  }
};
