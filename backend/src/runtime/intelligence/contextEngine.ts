import { ContextItem, ContextBudget } from "./types";

export class ContextBudgetManager {
  private defaultBudget: ContextBudget;

  constructor(maxTokens = 4096) {
    // Allocate token space based on standard ratios
    this.defaultBudget = {
      maxTokens,
      allocations: {
        constitution: Math.floor(maxTokens * 0.15), // 15% for safety & guidelines
        memory: Math.floor(maxTokens * 0.25),       // 25% for memory recall
        knowledge: Math.floor(maxTokens * 0.25),    // 25% for reference material
        learning: Math.floor(maxTokens * 0.10),     // 10% for approved learnings & few-shots
        tools: Math.floor(maxTokens * 0.10),        // 10% for schemas & declarations
        history: Math.floor(maxTokens * 0.15),      // 15% for conversational flow
      },
    };
  }

  public getBudget(customMaxTokens?: number): ContextBudget {
    if (!customMaxTokens || customMaxTokens === this.defaultBudget.maxTokens) {
      return this.defaultBudget;
    }
    // Dynamic reallocation
    return {
      maxTokens: customMaxTokens,
      allocations: {
        constitution: Math.floor(customMaxTokens * 0.15),
        memory: Math.floor(customMaxTokens * 0.25),
        knowledge: Math.floor(customMaxTokens * 0.25),
        learning: Math.floor(customMaxTokens * 0.10),
        tools: Math.floor(customMaxTokens * 0.10),
        history: Math.floor(customMaxTokens * 0.15),
      },
    };
  }

  /**
   * Helper to estimate tokens in a string (business-agnostic heuristic)
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    // Standard heuristic: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Protect against overflow by scaling down allocations if needed
   */
  public resolveOverflow(allocations: Record<string, number>, maxLimit: number): Record<string, number> {
    const total = Object.values(allocations).reduce((sum, val) => sum + val, 0);
    if (total <= maxLimit) return allocations;

    const scaleFactor = maxLimit / total;
    const scaled: Record<string, number> = {};
    for (const [key, value] of Object.entries(allocations)) {
      scaled[key] = Math.floor(value * scaleFactor);
    }
    return scaled;
  }
}

export class ContextIntelligenceEngine {
  private budgetManager: ContextBudgetManager;

  constructor(budgetManager: ContextBudgetManager = new ContextBudgetManager()) {
    this.budgetManager = budgetManager;
  }

  /**
   * Scores context item relevance using basic text search overlap as fallback
   */
  public scoreRelevance(itemContent: string, query: string): number {
    if (!query || !itemContent) return 0.5;
    
    const cleanQuery = query.toLowerCase().replace(/[^\w\s]/g, "");
    const cleanContent = itemContent.toLowerCase().replace(/[^\w\s]/g, "");
    
    const queryWords = cleanQuery.split(/\s+/).filter(Boolean);
    if (queryWords.length === 0) return 0.5;

    let matches = 0;
    for (const word of queryWords) {
      if (cleanContent.includes(word)) {
        matches++;
      }
    }
    
    return matches / queryWords.length;
  }

  /**
   * Ranks items by combining priority (lower value is higher priority) and relevance score
   */
  public rankContext(items: ContextItem[]): ContextItem[] {
    return [...items].sort((a, b) => {
      // Primary key: relevance score (descending)
      // Secondary key: priority (ascending - 1 is highest priority)
      const scoreA = a.relevanceScore * (1.1 - a.priority / 10);
      const scoreB = b.relevanceScore * (1.1 - b.priority / 10);
      return scoreB - scoreA;
    });
  }

  /**
   * Compress text by filtering out filler lines or excessive whitespaces.
   * If a high compression ratio is needed, truncates or takes key sentences.
   */
  public compressContext(content: string, targetTokens: number): string {
    const currentTokens = this.budgetManager.estimateTokens(content);
    if (currentTokens <= targetTokens) return content;

    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      // Just truncate characters
      return content.slice(0, targetTokens * 4) + "... [Compressed]";
    }

    // Keep highest density lines
    const sortedLines = lines.map(line => ({
      line,
      weight: line.length > 20 ? 1 : 0.5 // weight longer lines higher
    }));

    let result = "";
    let accumulatedTokens = 0;
    let didCompress = false;

    for (const item of sortedLines) {
      const lineTokens = this.budgetManager.estimateTokens(item.line + "\n");
      if (accumulatedTokens + lineTokens > targetTokens) {
        didCompress = true;
        if (accumulatedTokens === 0) {
          result = item.line.slice(0, targetTokens * 4) + "... [Compressed]";
        }
        break;
      }
      result += item.line + "\n";
      accumulatedTokens += lineTokens;
    }

    if (didCompress && accumulatedTokens > 0) {
      result += "... [Compressed]";
    }

    return result || "[Compressed content]";
  }


  /**
   * Assemble the final list of context items that fit within the token budget.
   * Ensures that we select and prioritize key items without exceeding limit.
   */
  public assembleContext(items: ContextItem[], budgetLimit: number): ContextItem[] {
    const sorted = this.rankContext(items);
    const selected: ContextItem[] = [];
    let currentTokens = 0;

    for (const item of sorted) {
      if (currentTokens + item.tokenLength <= budgetLimit) {
        selected.push(item);
        currentTokens += item.tokenLength;
      } else {
        // Can we compress it to fit the remaining budget?
        const remainingBudget = budgetLimit - currentTokens;
        const minimumEffectiveTokens = 20; // do not compress below 20 tokens
        
        if (remainingBudget >= minimumEffectiveTokens) {
          const compressedContent = this.compressContext(item.content, remainingBudget);
          const compressedTokens = this.budgetManager.estimateTokens(compressedContent);
          
          selected.push({
            ...item,
            content: compressedContent,
            tokenLength: compressedTokens,
            metadata: {
              ...item.metadata,
              compressed: true,
              originalLength: item.tokenLength
            }
          });
          currentTokens += compressedTokens;
        }
      }
      if (currentTokens >= budgetLimit) break;
    }

    return selected;
  }
}
