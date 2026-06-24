import { MemoryRecord } from "./types";
import { DIContainer, container } from "../kernel/diContainer";
import { IEmbeddingEngine } from "../interfaces/core";

export class MemorySelectionEngine {
  private diContainer: DIContainer;
  private decayRatePerHour: number;

  constructor(diContainer: DIContainer = container, decayRatePerHour = 0.001) {
    this.diContainer = diContainer;
    this.decayRatePerHour = decayRatePerHour;
  }

  /**
   * Selects the most relevant memories for a query, staying within the token budget.
   */
  public async selectMemories(
    memories: MemoryRecord[],
    query: string,
    tokenBudget: number,
    weights = { semantic: 0.5, temporal: 0.3, priority: 0.2 }
  ): Promise<MemoryRecord[]> {
    if (memories.length === 0) return [];

    const scoredRecords = await Promise.all(
      memories.map(async record => {
        const semantic = await this.calculateSemanticRelevance(record, query);
        const temporal = this.calculateTemporalRelevance(record);
        const priority = this.calculatePriorityScore(record);

        const finalScore = 
          weights.semantic * semantic +
          weights.temporal * temporal +
          weights.priority * priority;

        return { record, score: finalScore };
      })
    );

    // Sort by score descending
    scoredRecords.sort((a, b) => b.score - a.score);

    // Context budget selector: greedily take records until budget limit
    const selected: MemoryRecord[] = [];
    let currentTokens = 0;

    for (const item of scoredRecords) {
      const estimatedTokens = Math.ceil(
        (item.record.key.length + item.record.value.length + 30) / 4
      ); // heuristic: key + value + overhead
      
      if (currentTokens + estimatedTokens <= tokenBudget) {
        selected.push(item.record);
        currentTokens += estimatedTokens;
      }
      if (currentTokens >= tokenBudget) break;
    }

    return selected;
  }

  /**
   * Computes semantic relevance using cosine similarity between embeddings.
   * Falls back to text overlap coefficient if embedding engine is unavailable.
   */
  private async calculateSemanticRelevance(record: MemoryRecord, query: string): Promise<number> {
    if (!query) return 0.5;

    try {
      if (this.diContainer.has("IEmbeddingEngine")) {
        const embeddingEngine = this.diContainer.resolve<IEmbeddingEngine>("IEmbeddingEngine");
        if (embeddingEngine) {
          const queryText = query;
          const memoryText = `${record.key}: ${record.value}`;
          
          const [queryEmb, memoryEmb] = await Promise.all([
            embeddingEngine.getEmbedding(queryText),
            embeddingEngine.getEmbedding(memoryText)
          ]);

          return this.cosineSimilarity(queryEmb.vector, memoryEmb.vector);
        }
      }
    } catch (err) {
      // Fail-silent, fallback to text overlap
    }

    // Fallback: simple text overlap relevance
    const cleanQuery = query.toLowerCase();
    const cleanKey = record.key.toLowerCase();
    const cleanVal = record.value.toLowerCase();
    
    const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return 0.5;

    let matchCount = 0;
    for (const word of queryWords) {
      if (cleanKey.includes(word) || cleanVal.includes(word)) {
        matchCount++;
      }
    }

    return matchCount / queryWords.length;
  }

  /**
   * Temporal decay calculation: older memories have lower relevance.
   * Formula: e^(-decayRate * hoursSinceObserved)
   */
  private calculateTemporalRelevance(record: MemoryRecord): number {
    const elapsedMs = Date.now() - record.lastObservedAt.getTime();
    const elapsedHours = elapsedMs / 3600000;
    return Math.exp(-this.decayRatePerHour * elapsedHours);
  }

  /**
   * Priority score based on priority metadata (range 1-10, 1 is highest priority)
   */
  private calculatePriorityScore(record: MemoryRecord): number {
    const priority = record.metadata?.priority ?? 5; // default to medium priority
    // Convert 1-10 priority scale to 0.0-1.0 relevance scale
    return Math.max(0.0, Math.min(1.0, 1.1 - priority / 10));
  }

  /**
   * Computes cosine similarity between two vectors
   */
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
