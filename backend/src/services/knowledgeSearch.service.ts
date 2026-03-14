import prisma from "../config/prisma";
const cosineSimilarity = require("cosine-similarity");
import { createEmbedding } from "./embedding.service";

interface KnowledgeResult {
  id: string;
  content: string;
  score: number;
}

/* ------------------------------------------
CONFIG
------------------------------------------ */

const SIMILARITY_THRESHOLD = 0.65;
const MAX_RESULTS = 5;

/* ------------------------------------------
SEARCH KNOWLEDGE
------------------------------------------ */

export const searchKnowledge = async (
  businessId: string,
  message: string
): Promise<KnowledgeResult[]> => {

  try {

    /* CREATE EMBEDDING */

    const messageEmbedding = await createEmbedding(message);

    /* GET KNOWLEDGE BASE */

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

    /* SCORE KNOWLEDGE */

    const scored = knowledge
      .map((item) => {

        if (!item.embedding) {
          return { ...item, score: 0 };
        }

        const score = cosineSimilarity(
          messageEmbedding,
          item.embedding as number[]
        );

        return {
          ...item,
          score,
        };

      })

      /* FILTER LOW SCORES */

      .filter((item) => item.score >= SIMILARITY_THRESHOLD)

      /* SORT BEST MATCH */

      .sort((a, b) => b.score - a.score)

      /* LIMIT RESULTS */

      .slice(0, MAX_RESULTS);

    return scored;

  } catch (error) {

    console.error("Knowledge search error:", error);
    return [];

  }

};