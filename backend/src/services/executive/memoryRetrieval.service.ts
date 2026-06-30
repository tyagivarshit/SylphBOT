import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import { IExecutiveMemory, IExecutiveMemoryRepository } from "./memory.service";

// ============================================================================
// STAGE 3.3D EXECUTIVE MEMORY RETRIEVAL & CONTEXT ORCHESTRATION INTERFACES
// ============================================================================

export interface IRetrievalContext {
  situation?: string;
  businessContext?: string;
  mission?: string;
  goals?: string[];
  executiveRole?: string;
  conversation?: string;
  runtimeContext?: string;
  oigRelationshipRefs?: string[];
}

export interface ISimilarityResult {
  score: number;
  semanticSimilarity: number;
  structuralSimilarity: number;
  relationshipSimilarity: number;
  historicalSimilarity: number;
  executiveSimilarity: number;
  businessSimilarity: number;
  missionSimilarity: number;
}

export interface IRankingMetrics {
  score: number;
  businessRelevance: number;
  missionAlignment: number;
  executiveRelevance: number;
  confidence: number;
  strength: number;
  freshness: number;
  usageFrequency: number;
  historicalSuccess: number;
  patternContribution: number;
  relationshipDensity: number;
  learningImpact: number;
}

export interface IRetrievedMemoryItem {
  memoryId: string;
  category: string;
  key: string;
  value: any;
  similarity: ISimilarityResult;
  ranking: IRankingMetrics;
  traceability: {
    whyRetrieved: string;
    rankingScore: number;
    supportingEvidenceRefs: string[];
    relationshipPath: string[];
    missionRelevance: string;
    businessRelevance: string;
  };
  confidence: number;
  freshness: number;
}

export interface IExecutiveContextPackage {
  tenantId: string;
  executiveId: string;
  facts: Array<{ key: string; value: any }>;
  knowledge: string[];
  patterns: string[];
  insights: string[];
  risks: string[];
  opportunities: string[];
  conflicts: string[];
  unknowns: string[];
  supportingEvidence: string[];
  contradictions: string[];
  confidenceScore: number;
  memoryReferences: string[];
  timestamp: string;
}

export interface IUnifiedContextPackage {
  tenantId: string;
  executiveId: string;
  retrievedMemories: IRetrievedMemoryItem[];
  optimizedContextSize: number;
  priorityScore: number;
  executiveContextPackage?: IExecutiveContextPackage;
  timestamp: string;
}

export interface IExecutiveMemoryRetrievalRepository {
  saveContextPackage(tenantId: string, pkg: IUnifiedContextPackage): Promise<void>;
  findContextPackage(tenantId: string, executiveId: string): Promise<IUnifiedContextPackage | null>;
}

// ============================================================================
// RETRIEVAL REPOSITORY IMPLEMENTATION (DECOUPLED / IN-MEMORY)
// ============================================================================

export class MemoryExecutiveMemoryRetrievalRepository implements IExecutiveMemoryRetrievalRepository {
  private db = new Map<string, IUnifiedContextPackage>();

  public async saveContextPackage(tenantId: string, pkg: IUnifiedContextPackage): Promise<void> {
    this.verifyTenant(tenantId, pkg.tenantId);
    const key = `${pkg.tenantId}:${pkg.executiveId}`;
    this.db.set(key, JSON.parse(JSON.stringify(pkg)));
  }

  public async findContextPackage(tenantId: string, executiveId: string): Promise<IUnifiedContextPackage | null> {
    const key = `${tenantId}:${executiveId}`;
    const pkg = this.db.get(key);
    if (!pkg) return null;
    this.verifyTenant(tenantId, pkg.tenantId);
    return JSON.parse(JSON.stringify(pkg));
  }

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
  }
}

// ============================================================================
// RETRIEVAL SERVICE ORCHESTRATOR
// ============================================================================

export class ExecutiveMemoryRetrievalService {
  constructor(private di: DIContainer = container) {}

  /**
   * Retrieves, ranks, diversifies, and optimizes a contextual package of memories.
   */
  public async retrieveContextualMemories(
    tenantId: string,
    executiveId: string,
    retrievalContext: IRetrievalContext,
    options?: {
      maxTokens?: number;
    }
  ): Promise<IUnifiedContextPackage> {
    this.verifyTenantOwnership(tenantId);

    try {
      const execService = this.di.resolve<any>("IExecutiveIdentityService");
      await execService.getExecutive(tenantId, executiveId);
    } catch (err: any) {
      if (err.message && err.message.includes("Cross-tenant")) {
        throw new Error(`Security Violation: Cross-tenant Executive access blocked.`);
      }
      throw err;
    }

    const baseRepo = this.di.resolve<IExecutiveMemoryRepository>("IExecutiveMemoryRepository");
    const categories: Array<IExecutiveMemory["category"]> = ["TACTICAL", "STRATEGIC", "ANECDOTAL", "EPISODIC", "SEMANTIC"];
    const baseMemories: IExecutiveMemory[] = [];
    for (const cat of categories) {
      const results = await baseRepo.findByCategory(tenantId, executiveId, cat);
      baseMemories.push(...results);
    }

    const items: IRetrievedMemoryItem[] = [];

    // Process each memory through Similarity, Ranking, and Traceability engines
    for (const mem of baseMemories) {
      if (mem.lifecycleState === "DELETED" || mem.lifecycleState === "DEPRECATED") {
        continue;
      }

      // 1. Similarity Engine (Deliverable 2)
      const similarity = this.calculateSimilarity(mem, retrievalContext);

      // 2. Retrieval Ranking Engine (Deliverable 4)
      const ranking = this.rankMemory(mem, retrievalContext, similarity);

      // 3. Memory Traceability Engine (Deliverable 7)
      const traceability = {
        whyRetrieved: `Memory retrieved dynamically due to high ranking score (${ranking.score.toFixed(3)}) matching context.`,
        rankingScore: ranking.score,
        supportingEvidenceRefs: mem.metadata.evidenceRefs,
        relationshipPath: [`exec:${executiveId}`, `mem:${mem.id}`],
        missionRelevance: ranking.missionAlignment > 0.8 ? "High alignment to active strategic mission" : "Supporting alignment",
        businessRelevance: ranking.businessRelevance > 0.8 ? "High operational revenue relevance" : "Supporting relevance",
      };

      items.push({
        memoryId: mem.id,
        category: mem.category,
        key: mem.key,
        value: mem.value,
        similarity,
        ranking,
        traceability,
        confidence: mem.metadata.confidenceScore,
        freshness: mem.freshness.decayFactor,
      });
    }

    // 4. Retrieval Diversity Engine (Deliverable 5)
    const diversifiedItems = this.diversifyRetrievedMemories(items);

    // 5. Context Window Optimization Engine (Deliverable 6)
    const optimizedItems = this.optimizeContextWindow(diversifiedItems, options?.maxTokens || 4000);

    // 6. Context Conflict Resolver (Deliverable 8)
    const conflicts = this.resolveContextConflicts(optimizedItems);

    // 7. Executive Context Package (Deliverable 10)
    const executiveContextPackage = this.buildExecutiveContextPackage(tenantId, executiveId, optimizedItems, conflicts);

    const now = new Date();
    const pkg: IUnifiedContextPackage = {
      tenantId,
      executiveId,
      retrievedMemories: optimizedItems,
      optimizedContextSize: optimizedItems.reduce((acc, it) => acc + JSON.stringify(it.value).length, 0),
      priorityScore: optimizedItems.length > 0 ? optimizedItems[0].ranking.score : 0.0,
      executiveContextPackage,
      timestamp: now.toISOString(),
    };

    const retRepo = this.di.resolve<IExecutiveMemoryRetrievalRepository>("IExecutiveMemoryRetrievalRepository");
    await retRepo.saveContextPackage(tenantId, pkg);

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.context.created", "1.0.0", {
          tenantId,
          executiveId,
          optimizedContextSize: pkg.optimizedContextSize,
          timestamp: now.toISOString(),
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return pkg;
  }

  // ==========================================================================
  // METRICS & COMPUTATION ENGINES
  // ==========================================================================

  private calculateSimilarity(memory: IExecutiveMemory, context: IRetrievalContext): ISimilarityResult {
    let semanticSimilarity = 0.5;
    let structuralSimilarity = 0.6;
    let relationshipSimilarity = 0.5;
    let historicalSimilarity = 0.7;
    let executiveSimilarity = 0.8;
    let businessSimilarity = 0.6;
    let missionSimilarity = 0.5;

    if (context.situation && memory.key.includes(context.situation)) {
      semanticSimilarity = 0.95;
    }
    if (context.executiveRole && memory.executiveId.includes(context.executiveRole)) {
      executiveSimilarity = 0.98;
    }
    if (context.businessContext && memory.key.includes(context.businessContext)) {
      businessSimilarity = 0.9;
    }
    if (context.mission && memory.key.includes(context.mission)) {
      missionSimilarity = 0.95;
    }

    const score =
      (semanticSimilarity +
        structuralSimilarity +
        relationshipSimilarity +
        historicalSimilarity +
        executiveSimilarity +
        businessSimilarity +
        missionSimilarity) /
      7;

    return {
      score: parseFloat(score.toFixed(3)),
      semanticSimilarity,
      structuralSimilarity,
      relationshipSimilarity,
      historicalSimilarity,
      executiveSimilarity,
      businessSimilarity,
      missionSimilarity,
    };
  }

  private rankMemory(memory: IExecutiveMemory, context: IRetrievalContext, similarity: ISimilarityResult): IRankingMetrics {
    const businessRelevance = similarity.businessSimilarity;
    const missionAlignment = similarity.missionSimilarity;
    const executiveRelevance = similarity.executiveSimilarity;
    const confidence = memory.metadata.confidenceScore;
    const strength = memory.importance.frequencyCount * 0.05;
    const freshness = memory.freshness.decayFactor;
    const usageFrequency = Math.min(1.0, memory.importance.frequencyCount / 20);
    const historicalSuccess = 0.8;
    const patternContribution = 0.75;
    const relationshipDensity = 0.85;
    const learningImpact = 0.9;

    const score =
      businessRelevance * 0.15 +
      missionAlignment * 0.15 +
      executiveRelevance * 0.1 +
      confidence * 0.1 +
      strength * 0.05 +
      freshness * 0.1 +
      usageFrequency * 0.05 +
      historicalSuccess * 0.1 +
      patternContribution * 0.05 +
      relationshipDensity * 0.05 +
      learningImpact * 0.1;

    return {
      score: parseFloat(score.toFixed(3)),
      businessRelevance,
      missionAlignment,
      executiveRelevance,
      confidence,
      strength,
      freshness,
      usageFrequency,
      historicalSuccess,
      patternContribution,
      relationshipDensity,
      learningImpact,
    };
  }

  private diversifyRetrievedMemories(items: IRetrievedMemoryItem[]): IRetrievedMemoryItem[] {
    if (items.length <= 1) return items;

    const sorted = [...items].sort((a, b) => b.ranking.score - a.ranking.score);

    const diversified: IRetrievedMemoryItem[] = [];

    if (sorted[0]) diversified.push(sorted[0]);

    const alternative = sorted.slice(1).find(it => it.confidence < 0.6 && it.ranking.score > 0.4);
    if (alternative) {
      diversified.push(alternative);
    }

    const recent = sorted.slice(1).find(it => it.freshness > 0.9 && !diversified.includes(it));
    if (recent) {
      diversified.push(recent);
    }

    for (const it of sorted) {
      if (!diversified.includes(it)) {
        diversified.push(it);
      }
    }

    return diversified;
  }

  private optimizeContextWindow(items: IRetrievedMemoryItem[], maxTokens: number): IRetrievedMemoryItem[] {
    const optimized: IRetrievedMemoryItem[] = [];
    let currentSize = 0;

    for (const it of items) {
      const estimatedSize = JSON.stringify(it.value).length;
      if (currentSize + estimatedSize <= maxTokens) {
        optimized.push(it);
        currentSize += estimatedSize;
      }
    }

    return optimized;
  }

  /**
   * DELIVERABLE 8 — Context Conflict Resolver
   */
  private resolveContextConflicts(items: IRetrievedMemoryItem[]): string[] {
    const conflicts: string[] = [];
    const keyMap = new Map<string, any>();

    for (const item of items) {
      if (item.confidence < 0.6) {
        conflicts.push(`Low confidence memory detected: [${item.memoryId}] with key [${item.key}].`);
      }
      if (item.freshness < 0.5) {
        conflicts.push(`Outdated memory detected: [${item.memoryId}] with key [${item.key}].`);
      }

      if (keyMap.has(item.key)) {
        const prevValue = keyMap.get(item.key);
        if (JSON.stringify(prevValue) !== JSON.stringify(item.value)) {
          conflicts.push(
            `Contradicting values detected for key [${item.key}]. Memory [${item.memoryId}] has value: ${JSON.stringify(
              item.value
            )}, conflicting with previously matched context value: ${JSON.stringify(prevValue)}.`
          );
        }
      } else {
        keyMap.set(item.key, item.value);
      }
    }

    return conflicts;
  }

  /**
   * DELIVERABLE 10 — Executive Context Package
   */
  private buildExecutiveContextPackage(
    tenantId: string,
    executiveId: string,
    items: IRetrievedMemoryItem[],
    conflicts: string[]
  ): IExecutiveContextPackage {
    const facts = items.map(it => ({ key: it.key, value: it.value }));
    const knowledge = items.map(it => `Knowledge pattern found for key: ${it.key}`);
    const patterns = items.map(it => `Pattern index: ${it.key}`);
    const insights = items.map(it => `Insight context generated for key: ${it.key}`);
    const risks = conflicts.filter(c => c.includes("Low confidence") || c.includes("Outdated"));
    const opportunities = items.filter(it => it.ranking.score > 0.85).map(it => `High relevance opportunity key: ${it.key}`);
    const unknowns = items.filter(it => it.confidence < 0.5).map(it => `Unknown verification needed for: ${it.key}`);
    const supportingEvidence = items.reduce<string[]>((acc, it) => acc.concat(it.traceability.supportingEvidenceRefs), []);
    const contradictions = conflicts.filter(c => c.includes("Contradicting"));

    let sumConfidence = 0;
    for (const it of items) {
      sumConfidence += it.confidence;
    }
    const confidenceScore = items.length > 0 ? parseFloat((sumConfidence / items.length).toFixed(3)) : 1.0;

    return {
      tenantId,
      executiveId,
      facts,
      knowledge,
      patterns,
      insights,
      risks,
      opportunities,
      conflicts,
      unknowns,
      supportingEvidence,
      contradictions,
      confidenceScore,
      memoryReferences: items.map(it => it.memoryId),
      timestamp: new Date().toISOString(),
    };
  }

  private verifyTenantOwnership(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}
