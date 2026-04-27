import type { SalesAgentContext } from "../salesAgent/types";
import { searchKnowledge } from "../knowledgeSearch.service";
import { getSalesOptimizationInsights } from "../salesAgent/optimizer.service";
import type { RevenueBrainSemanticMemorySnapshot } from "./types";

export const getSemanticMemorySnapshot = async ({
  businessId,
  message,
  salesContext,
}: {
  businessId: string;
  message: string;
  salesContext?: SalesAgentContext | null;
}): Promise<RevenueBrainSemanticMemorySnapshot> => {
  if (salesContext) {
    return {
      clientId: salesContext.client.id || null,
      knowledgeHits: salesContext.knowledge || [],
      hits: salesContext.knowledgeHits || [],
      optimizationGuidance:
        salesContext.optimization.guidance ||
        "Keep replies short, direct, and tied to one CTA.",
      recommendedAngle: salesContext.optimization.recommendedAngle || null,
      recommendedCTA: salesContext.optimization.recommendedCTA || null,
      recommendedTone: salesContext.optimization.recommendedTone || null,
      recommendedMessageLength:
        salesContext.optimization.recommendedMessageLength || null,
    };
  }

  const optimization = await getSalesOptimizationInsights(businessId);
  const knowledgeHits = await searchKnowledge(businessId, message);

  return {
    clientId: null,
    knowledgeHits: knowledgeHits.map((item) => item.content),
    hits: knowledgeHits,
    optimizationGuidance: optimization.guidance,
    recommendedAngle: optimization.recommendedAngle || null,
    recommendedCTA: optimization.recommendedCTA || null,
    recommendedTone: optimization.recommendedTone || null,
    recommendedMessageLength: optimization.recommendedMessageLength || null,
  };
};
