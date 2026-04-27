import prisma from "../config/prisma";
import { buildKnowledgeScopeFilter } from "./clientScope.service";
import { createEmbedding } from "./embedding.service";

const cosineSimilarity = require("cosine-similarity");

export type KnowledgeResult = {
  id: string;
  content: string;
  score: number;
  semanticScore: number;
  keywordScore: number;
  sourceType: string;
  priority: string;
  clientId?: string | null;
  reinforcementScore: number;
  retrievalCount: number;
  successCount: number;
  lastRetrievedAt?: Date | null;
  lastReinforcedAt?: Date | null;
  createdAt?: Date | null;
};

const SIMILARITY_THRESHOLD = 0.22;
const MAX_RESULTS = 6;

const PRIORITY_WEIGHT: Record<string, number> = {
  HIGH: 0.16,
  MEDIUM: 0.08,
  LOW: 0.02,
};

const SOURCE_WEIGHT: Record<string, number> = {
  SYSTEM: 0.16,
  FAQ: 0.12,
  MANUAL: 0.1,
  AUTO_LEARN: 0.08,
};

const normalizeText = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase();

const keywordScore = (query: string, content: string): number => {
  const queryTokens = normalizeText(query).split(/\s+/).filter(Boolean);
  const contentText = normalizeText(content);

  if (!queryTokens.length || !contentText) {
    return 0;
  }

  const hits = queryTokens.filter((token) => contentText.includes(token)).length;
  return hits / queryTokens.length;
};

const businessIntentBoost = (query: string, content: string) => {
  const message = normalizeText(query);
  const text = normalizeText(content);
  let boost = 0;

  if (
    /\b(help|service|services|automation|reply|booking|offer|solution|support)\b/i.test(
      message
    ) &&
    /\b(help|service|services|automation|reply|booking|offer|solution|support)\b/i.test(
      text
    )
  ) {
    boost += 0.08;
  }

  if (
    /\b(price|pricing|cost|budget|package|plan)\b/i.test(message) &&
    /\b(price|pricing|cost|budget|package|plan)\b/i.test(text)
  ) {
    boost += 0.06;
  }

  return boost;
};

const scoreRecency = (value?: Date | null) => {
  if (!value) {
    return 0;
  }

  const ageMs = Math.max(0, Date.now() - value.getTime());
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return Math.max(0, 0.08 - ageDays * 0.0015);
};

const scoreReinforcement = ({
  reinforcementScore,
  retrievalCount,
  successCount,
}: {
  reinforcementScore?: number | null;
  retrievalCount?: number | null;
  successCount?: number | null;
}) =>
  Math.min(
    0.25,
    Math.max(0, Number(reinforcementScore || 0)) * 0.08 +
      Math.max(0, Number(retrievalCount || 0)) * 0.004 +
      Math.max(0, Number(successCount || 0)) * 0.02
  );

const scoreScope = ({
  itemClientId,
  normalizedClientId,
}: {
  itemClientId?: string | null;
  normalizedClientId?: string | null;
}) => {
  if (normalizedClientId && itemClientId === normalizedClientId) {
    return 0.18;
  }

  if (!itemClientId) {
    return 0.03;
  }

  return 0;
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
    const normalizedClientId = String(options?.clientId || "").trim() || null;
    const includeShared = options?.includeShared !== false;
    const messageEmbedding = await createEmbedding(message);

    const knowledge = await prisma.knowledgeBase.findMany({
      where: {
        ...buildKnowledgeScopeFilter({
          businessId,
          clientId: normalizedClientId,
          includeShared,
        }),
        isActive: true,
        sourceType: {
          in: ["SYSTEM", "FAQ", "MANUAL", "AUTO_LEARN"],
        },
      },
      select: {
        id: true,
        content: true,
        embedding: true,
        priority: true,
        sourceType: true,
        clientId: true,
        reinforcementScore: true,
        retrievalCount: true,
        successCount: true,
        lastRetrievedAt: true,
        lastReinforcedAt: true,
        createdAt: true,
      },
    });

    if (!knowledge.length) {
      return [];
    }

    const scored = knowledge.map((item) => {
      const semanticScore = item.embedding
        ? cosineSimilarity(messageEmbedding, item.embedding as number[])
        : 0;
      const keyword = keywordScore(message, item.content);
      const priorityBoost =
        PRIORITY_WEIGHT[String(item.priority || "MEDIUM").toUpperCase()] || 0;
      const sourceBoost =
        SOURCE_WEIGHT[String(item.sourceType || "MANUAL").toUpperCase()] || 0;
      const scopeBoost = scoreScope({
        itemClientId: item.clientId || null,
        normalizedClientId,
      });
      const reinforcementBoost = scoreReinforcement({
        reinforcementScore: item.reinforcementScore,
        retrievalCount: item.retrievalCount,
        successCount: item.successCount,
      });
      const recencyBoost = scoreRecency(
        item.lastReinforcedAt || item.lastRetrievedAt || item.createdAt
      );
      const intentBoost = businessIntentBoost(message, item.content);

      const score =
        semanticScore * 0.55 +
        keyword * 0.2 +
        priorityBoost +
        sourceBoost +
        scopeBoost +
        reinforcementBoost +
        recencyBoost +
        intentBoost;

      return {
        id: item.id,
        content: item.content,
        score,
        semanticScore,
        keywordScore: keyword,
        sourceType: item.sourceType || "MANUAL",
        priority: item.priority || "MEDIUM",
        clientId: item.clientId || null,
        reinforcementScore: Number(item.reinforcementScore || 0),
        retrievalCount: Number(item.retrievalCount || 0),
        successCount: Number(item.successCount || 0),
        lastRetrievedAt: item.lastRetrievedAt || null,
        lastReinforcedAt: item.lastReinforcedAt || null,
        createdAt: item.createdAt || null,
      };
    });

    return scored
      .filter((item) => item.score >= SIMILARITY_THRESHOLD)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (right.reinforcementScore !== left.reinforcementScore) {
          return right.reinforcementScore - left.reinforcementScore;
        }

        return right.semanticScore - left.semanticScore;
      })
      .slice(0, MAX_RESULTS);
  } catch (error) {
    console.error("Knowledge search error:", error);
    return [];
  }
};
