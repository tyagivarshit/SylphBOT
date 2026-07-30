export class CognitiveContextMetadata {
  constructor(
    public readonly preparedAt: Date = new Date(),
    public readonly version: string = "1.0.0",
    public readonly diagnostics: Record<string, any> = {}
  ) {}
}

export class ContextPriorityResult {
  constructor(
    public readonly itemId: string,
    public readonly score: number,
    public readonly reasons: string[]
  ) {}
}

export class RuntimeCognitiveContext {
  constructor(
    public readonly identity: any,
    public readonly businessContext: any,
    public readonly topKnowledge: any[],
    public readonly topMemory: any[],
    public readonly permissions: string[],
    public readonly workspace: any,
    public readonly metadata: CognitiveContextMetadata,
    public readonly diagnostics: Record<string, any> = {}
  ) {}
}

export class RuntimeContextPrioritizer {
  public prioritize(items: any[], type: "knowledge" | "memory"): ContextPriorityResult[] {
    return items.map(item => {
      let score = 0.5;
      const reasons: string[] = ["default_base_score"];
      
      // 1. Recency
      const time = item.timestamp || item.lastValidated || item.updatedAt;
      if (time) {
        const ageDays = (Date.now() - new Date(time).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays < 7) {
          score += 0.2;
          reasons.push("recent_item_boost");
        } else if (ageDays > 30) {
          score -= 0.1;
          reasons.push("older_item_penalty");
        }
      }

      // 2. Importance
      const importance = item.importance || item.ranking?.score || item.confidence;
      if (importance !== undefined) {
        const norm = Number(importance) > 1 ? Number(importance) / 10 : Number(importance);
        score += norm * 0.3;
        reasons.push("importance_relevance_boost");
      }

      score = Math.max(0.0, Math.min(1.0, score));

      return new ContextPriorityResult(
        item.id || item.memoryId || String(item.key || ""),
        score,
        reasons
      );
    });
  }
}

export class RuntimeContextRanker {
  public rank(items: any[], priorities: ContextPriorityResult[]): any[] {
    const priorityMap = new Map(priorities.map(p => [p.itemId, p.score]));
    
    // Sort in descending order
    return [...items].sort((a, b) => {
      const idA = a.id || a.memoryId || String(a.key || "");
      const idB = b.id || b.memoryId || String(b.key || "");
      const scoreA = priorityMap.get(idA) ?? 0.5;
      const scoreB = priorityMap.get(idB) ?? 0.5;
      return scoreB - scoreA;
    });
  }
}

export class RuntimeContextCompressor {
  public compress(items: any[]): { filtered: any[]; removedIds: string[] } {
    const filtered: any[] = [];
    const removedIds: string[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      if (!item) continue;
      const id = item.id || item.memoryId || String(item.key || "");
      
      // Deduplicate
      if (seen.has(id)) {
        removedIds.push(id);
        continue;
      }
      seen.add(id);

      // Validate records (must contain at least title/value/description)
      if (!item.title && !item.value && !item.description) {
        removedIds.push(id);
        continue;
      }

      // Expiry validation (older than 90 days)
      const time = item.timestamp || item.lastValidated || item.updatedAt;
      if (time) {
        const ageDays = (Date.now() - new Date(time).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 90) {
          removedIds.push(id);
          continue;
        }
      }

      filtered.push(item);
    }

    return { filtered, removedIds };
  }
}
