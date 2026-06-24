import { KnowledgeItem } from "./types";
import { DIContainer, container } from "../kernel/diContainer";
import { IEmbeddingEngine } from "../interfaces/core";

export class KnowledgeSelectionEngine {
  private diContainer: DIContainer;

  constructor(diContainer: DIContainer = container) {
    this.diContainer = diContainer;
  }

  /**
   * Filter, rank and budget knowledge items for a query.
   */
  public async selectKnowledge(
    items: KnowledgeItem[],
    query: string,
    tokenBudget: number,
    options: {
      minConfidence?: number;
      category?: string;
      tags?: string[];
    } = {}
  ): Promise<KnowledgeItem[]> {
    // 1. Filter by confidence, category, and tags
    let filtered = items.filter(item => {
      if (options.minConfidence !== undefined && item.confidence < options.minConfidence) {
        return false;
      }
      if (options.category && item.category !== options.category) {
        return false;
      }
      if (options.tags && options.tags.length > 0) {
        const hasTag = options.tags.some(tag => item.tags.includes(tag));
        if (!hasTag) return false;
      }
      return true;
    });

    if (filtered.length === 0) return [];

    // 2. Score relevance
    const scored = await Promise.all(
      filtered.map(async item => {
        const relevance = await this.calculateRelevance(item.content, query);
        // Combined score: 70% relevance, 30% confidence
        const score = relevance * 0.7 + item.confidence * 0.3;
        return { item, score };
      })
    );

    // 3. Rank
    scored.sort((a, b) => b.score - a.score);

    // 4. Budgeting
    const selected: KnowledgeItem[] = [];
    let currentTokens = 0;

    for (const entry of scored) {
      const estimatedTokens = Math.ceil(entry.item.content.length / 4);
      if (currentTokens + estimatedTokens <= tokenBudget) {
        selected.push(entry.item);
        currentTokens += estimatedTokens;
      } else {
        // Truncate to fit the remaining budget if there's enough space
        const remainingBudget = tokenBudget - currentTokens;
        if (remainingBudget >= 30) {
          const truncatedContent = entry.item.content.slice(0, remainingBudget * 4) + "... [Truncated]";
          selected.push({
            ...entry.item,
            content: truncatedContent
          });
          currentTokens += remainingBudget;
        }
        break;
      }
      if (currentTokens >= tokenBudget) break;
    }

    return selected;
  }

  /**
   * Helper to compute similarity using embedding engine or text match fallback
   */
  private async calculateRelevance(content: string, query: string): Promise<number> {
    if (!query || !content) return 0.5;

    try {
      if (this.diContainer.has("IEmbeddingEngine")) {
        const embeddingEngine = this.diContainer.resolve<IEmbeddingEngine>("IEmbeddingEngine");
        if (embeddingEngine) {
          const [queryEmb, contentEmb] = await Promise.all([
            embeddingEngine.getEmbedding(query),
            embeddingEngine.getEmbedding(content)
          ]);
          return this.cosineSimilarity(queryEmb.vector, contentEmb.vector);
        }
      }
    } catch (err) {
      // Fallback
    }

    // Text overlap coefficient
    const cleanQuery = query.toLowerCase();
    const cleanContent = content.toLowerCase();
    const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return 0.5;

    let matches = 0;
    for (const word of queryWords) {
      if (cleanContent.includes(word)) {
        matches++;
      }
    }

    return matches / queryWords.length;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
