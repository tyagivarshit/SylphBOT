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

const SIMILARITY_THRESHOLD = 0.5; // 🔥 lower for better recall
const MAX_RESULTS = 5;

/* ------------------------------------------ */
/* 🔥 KEYWORD SCORE */
/* ------------------------------------------ */

const keywordScore = (query: string, content: string): number => {
  const qWords = query.toLowerCase().split(" ");
  const cText = content.toLowerCase();

  let match = 0;

  for (const word of qWords) {
    if (cText.includes(word)) {
      match++;
    }
  }

  return match / qWords.length; // normalized
};

/* ------------------------------------------ */
/* SEARCH KNOWLEDGE */
/* ------------------------------------------ */

export const searchKnowledge = async (
  businessId: string,
  message: string
): Promise<KnowledgeResult[]> => {

  try {

    /* 🔥 CREATE EMBEDDING */
    const messageEmbedding = await createEmbedding(message);

    /* 🔥 GET KNOWLEDGE */
    const knowledge = await prisma.knowledgeBase.findMany({
      where: {
        businessId,
        isActive: true,
      },
      select: {
        id: true,
        content: true,
        embedding: true,
      },
    });

    if (!knowledge.length) return [];

    /* 🔥 SCORE (HYBRID) */

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

      /* 🔥 FINAL SCORE (weighted) */
      const finalScore = (semantic * 0.7) + (keyword * 0.3);

      return {
        id: item.id,
        content: item.content,
        score: finalScore,
      };

    });

    /* 🔥 FILTER */
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