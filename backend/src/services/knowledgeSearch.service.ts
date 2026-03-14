import prisma from "../config/prisma";
import cosineSimilarity from "cosine-similarity";
import { createEmbedding } from "./embedding.service";

export const searchKnowledge = async (
  businessId: string,
  message: string
) => {

  const messageEmbedding = await createEmbedding(message);

  const knowledge = await prisma.knowledgeBase.findMany({
    where: {
      businessId,
      isActive: true
    }
  });

  if (!knowledge.length) return [];

  const scored = knowledge.map((item) => {

    if (!item.embedding) return { ...item, score: 0 };

    const score = cosineSimilarity(
      messageEmbedding,
      item.embedding as number[]
    );

    return { ...item, score };

  });

  const sorted = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return sorted;

};