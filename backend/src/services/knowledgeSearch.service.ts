import prisma from "../config/prisma";
const cosineSimilarity = require("cosine-similarity");
import { createEmbedding } from "./embedding.service";

interface KnowledgeResult {
  id: string;
  content: string;
  score: number;
}

/* ------------------------------------------ */
/* CONFIG */
/* ------------------------------------------ */

const SIMILARITY_THRESHOLD = 0.25;
const MAX_RESULTS = 5;

/* 🔥 PRIORITY WEIGHTS (TUNED) */
const PRIORITY_WEIGHT: Record<string, number> = {
  HIGH: 0.3,
  MEDIUM: 0.15,
  LOW: 0,
};

/* ------------------------------------------ */
/* 🔥 KEYWORD SCORE */
/* ------------------------------------------ */

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

/* ------------------------------------------ */
/* 🔥 SEARCH KNOWLEDGE (FINAL CLEAN)
------------------------------------------- */

export const searchKnowledge = async (
  businessId: string,
  message: string
): Promise<KnowledgeResult[]> => {
  try {
    /* 🔥 CREATE EMBEDDING */
    const messageEmbedding = await createEmbedding(message);

    /* =================================================
    🔥 CRITICAL FIX: ONLY TRAINED + TRUSTED DATA
    ================================================= */

    const knowledge = await prisma.knowledgeBase.findMany({
      where: {
        businessId,
        isActive: true,
        sourceType: {
          in: ["SYSTEM", "FAQ", "MANUAL"], // ✅ NO AUTO_LEARN
        },
      },
      select: {
        id: true,
        content: true,
        embedding: true,
        priority: true,
      },
    });

    if (!knowledge.length) return [];

    /* =================================================
    🔥 SCORING ENGINE (ELITE LEVEL)
    ================================================= */

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

      /* 🔥 GENERIC BOOST */
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

      /* 🔥 PRIORITY BOOST (SAFE) */
      const priorityKey = item.priority || "MEDIUM";
      const priorityBoost =
        PRIORITY_WEIGHT[priorityKey as keyof typeof PRIORITY_WEIGHT] || 0;

      /* 🔥 FINAL SCORE */
      const finalScore =
        semantic * 0.7 +
        keyword * 0.3 +
        boost +
        priorityBoost;

      return {
        id: item.id,
        content: item.content,
        score: finalScore,
      };
    });

    /* =================================================
    🔥 FORCE MATCH (SMART UX FIX)
    ================================================= */

    const lowerMsg = message.toLowerCase();

    if (
      lowerMsg.includes("business") ||
      lowerMsg.includes("service") ||
      lowerMsg.includes("kya karte") ||
      lowerMsg.includes("what do you do")
    ) {
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }

    /* =================================================
    🔥 NORMAL FILTER
    ================================================= */

    const filtered = scored
      .filter((item) => item.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    return filtered;
  } catch (error) {
    console.error("Knowledge search error:", error);
    return [];
  }
};