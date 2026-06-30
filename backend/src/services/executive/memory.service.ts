import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";

// ============================================================================
// STAGE 3.3A EXECUTIVE MEMORY FOUNDATION INTERFACES
// ============================================================================

export interface IMemoryMetadata {
  createdTime: string;
  updatedTime: string;
  source: string;
  confidenceScore: number; // 0.0 - 1.0
  evidenceRefs: string[];
  references: string[];
  version: number;
}

export interface IMemoryImportance {
  businessImpact: number; // 0.0 - 1.0
  executiveRelevance: number; // 0.0 - 1.0
  frequencyCount: number;
  strategicValue: number; // 0.0 - 1.0
  operationalValue: number; // 0.0 - 1.0
  overallImportance: number; // 0.0 - 1.0
}

export interface IMemoryFreshness {
  ageSeconds: number;
  decayFactor: number; // 0.0 - 1.0
  isStale: boolean;
  refreshRecommendation: string;
}

export interface IMemoryExplainability {
  whyItExists: string;
  origin: string;
  supportingEvidenceSummary: string;
  confidenceJustification: string;
  businessRelevanceSummary: string;
}

export interface IExecutiveMemory {
  id: string;
  tenantId: string;
  executiveId: string;
  category: "TACTICAL" | "STRATEGIC" | "ANECDOTAL" | "EPISODIC" | "SEMANTIC";
  key: string;
  value: any;
  lifecycleState: "DRAFT" | "ACTIVE" | "STRENGTHENED" | "ARCHIVED" | "DEPRECATED" | "DELETED";
  metadata: IMemoryMetadata;
  importance: IMemoryImportance;
  freshness: IMemoryFreshness;
  explainability: IMemoryExplainability;
}

// Repository Abstraction
export interface IExecutiveMemoryRepository {
  save(tenantId: string, memory: IExecutiveMemory): Promise<void>;
  findById(tenantId: string, id: string): Promise<IExecutiveMemory | null>;
  findByKey(tenantId: string, executiveId: string, key: string): Promise<IExecutiveMemory[]>;
  findByCategory(tenantId: string, executiveId: string, category: string): Promise<IExecutiveMemory[]>;
  delete(tenantId: string, id: string): Promise<void>;
}

// ============================================================================
// MEMORY REPOSITORY IN-MEMORY IMPLEMENTATION (DECOUPLED)
// ============================================================================

export class MemoryExecutiveMemoryRepository implements IExecutiveMemoryRepository {
  private db = new Map<string, IExecutiveMemory>(); // memoryId -> memory

  constructor(private di: DIContainer = container) {}

  public async save(tenantId: string, memory: IExecutiveMemory): Promise<void> {
    this.verifyTenant(tenantId, memory.tenantId);
    this.db.set(memory.id, JSON.parse(JSON.stringify(memory))); // Deep copy
  }

  public async findById(tenantId: string, id: string): Promise<IExecutiveMemory | null> {
    const memory = this.db.get(id);
    if (!memory) return null;
    this.verifyTenant(tenantId, memory.tenantId);
    return JSON.parse(JSON.stringify(memory));
  }

  public async findByKey(tenantId: string, executiveId: string, key: string): Promise<IExecutiveMemory[]> {
    const results: IExecutiveMemory[] = [];
    for (const memory of this.db.values()) {
      if (memory.tenantId === tenantId && memory.executiveId === executiveId && memory.key === key) {
        results.push(JSON.parse(JSON.stringify(memory)));
      }
    }
    return results;
  }

  public async findByCategory(tenantId: string, executiveId: string, category: string): Promise<IExecutiveMemory[]> {
    const results: IExecutiveMemory[] = [];
    for (const memory of this.db.values()) {
      if (memory.tenantId === tenantId && memory.executiveId === executiveId && memory.category === category) {
        results.push(JSON.parse(JSON.stringify(memory)));
      }
    }
    return results;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const memory = this.db.get(id);
    if (memory) {
      this.verifyTenant(tenantId, memory.tenantId);
      // Soft / Logical delete
      memory.lifecycleState = "DELETED";
      memory.metadata.updatedTime = new Date().toISOString();
      this.db.set(id, memory);
    }
  }

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
  }
}

// ============================================================================
// SERVICE ORCHESTRATION IMPLEMENTATION
// ============================================================================

export class ExecutiveMemoryService {
  private auditLogs: Array<{ timestamp: string; action: string; tenantId: string; memoryId: string }> = [];

  constructor(private di: DIContainer = container) {}

  /**
   * Registers/Creates a new memory for an Executive.
   */
  public async registerMemory(
    tenantId: string,
    executiveId: string,
    args: {
      category: IExecutiveMemory["category"];
      key: string;
      value: any;
      source: string;
      evidenceRefs?: string[];
      references?: string[];
      importanceWeights?: {
        businessImpact?: number;
        executiveRelevance?: number;
        strategicValue?: number;
        operationalValue?: number;
      };
    }
  ): Promise<IExecutiveMemory> {
    this.verifyTenantOwnership(tenantId);

    const now = new Date();
    const memoryId = `mem_${args.category.toLowerCase()}_${Math.random().toString(36).substr(2, 9)}`;

    // Resolve calculations
    const importance = this.calculateImportance(args.importanceWeights || {}, 1);
    const confidence = this.calculateConfidence(args.evidenceRefs || [], args.source);
    const freshness = this.calculateFreshness(now, now);
    const explainability = this.generateExplainability(args.key, args.source, confidence, importance);

    const memory: IExecutiveMemory = {
      id: memoryId,
      tenantId,
      executiveId,
      category: args.category,
      key: args.key,
      value: args.value,
      lifecycleState: "ACTIVE",
      metadata: {
        createdTime: now.toISOString(),
        updatedTime: now.toISOString(),
        source: args.source,
        confidenceScore: confidence,
        evidenceRefs: args.evidenceRefs || [],
        references: args.references || [],
        version: 1,
      },
      importance,
      freshness,
      explainability,
    };

    const repo = this.di.resolve<IExecutiveMemoryRepository>("IExecutiveMemoryRepository");
    await repo.save(tenantId, memory);

    this.logAudit("CREATE", tenantId, memoryId);

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.memory.registered", "1.0.0", {
          memoryId,
          executiveId,
          tenantId,
          category: args.category,
          timestamp: now.toISOString(),
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return memory;
  }

  /**
   * Retrieves a specific memory by ID.
   */
  public async getMemory(tenantId: string, id: string): Promise<IExecutiveMemory | null> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryRepository>("IExecutiveMemoryRepository");
    const memory = await repo.findById(tenantId, id);
    if (!memory || memory.lifecycleState === "DELETED") return null;

    // Recalculate freshness decay
    const now = new Date();
    memory.freshness = this.calculateFreshness(new Date(memory.metadata.createdTime), now);
    await repo.save(tenantId, memory);

    this.logAudit("READ", tenantId, id);
    return memory;
  }

  /**
   * Strengthens a memory (re-validates, increases version, updates confidence).
   */
  public async strengthenMemory(
    tenantId: string,
    id: string,
    args: {
      addedEvidenceRefs?: string[];
      additionalReferences?: string[];
      newConfidenceScore?: number;
    } = {}
  ): Promise<IExecutiveMemory> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryRepository>("IExecutiveMemoryRepository");
    const memory = await repo.findById(tenantId, id);
    if (!memory || memory.lifecycleState === "DELETED") {
      throw new Error(`Memory [${id}] not found or deleted.`);
    }

    const now = new Date();
    memory.lifecycleState = "STRENGTHENED";
    memory.metadata.version += 1;
    memory.metadata.updatedTime = now.toISOString();

    if (args.addedEvidenceRefs) {
      memory.metadata.evidenceRefs = [...new Set([...memory.metadata.evidenceRefs, ...args.addedEvidenceRefs])];
    }
    if (args.additionalReferences) {
      memory.metadata.references = [...new Set([...memory.metadata.references, ...args.additionalReferences])];
    }

    // Dynamic confidence update based on verification history
    const baseConfidence = args.newConfidenceScore || memory.metadata.confidenceScore;
    memory.metadata.confidenceScore = Math.min(0.99, baseConfidence + 0.05);

    // Update importance frequency count
    memory.importance = this.calculateImportance(
      memory.importance,
      memory.importance.frequencyCount + 1
    );

    memory.freshness = this.calculateFreshness(new Date(memory.metadata.createdTime), now);
    memory.explainability = this.generateExplainability(
      memory.key,
      memory.metadata.source,
      memory.metadata.confidenceScore,
      memory.importance
    );

    await repo.save(tenantId, memory);
    this.logAudit("UPDATE_STRENGTHEN", tenantId, id);

    return memory;
  }

  /**
   * Retrieves memories matching filter options.
   */
  public async queryMemories(
    tenantId: string,
    executiveId: string,
    filters: {
      category?: IExecutiveMemory["category"];
      key?: string;
    }
  ): Promise<IExecutiveMemory[]> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryRepository>("IExecutiveMemoryRepository");
    let results: IExecutiveMemory[] = [];

    if (filters.key) {
      results = await repo.findByKey(tenantId, executiveId, filters.key);
    } else if (filters.category) {
      results = await repo.findByCategory(tenantId, executiveId, filters.category);
    }

    // Filter out logically deleted records and calculate freshness
    const now = new Date();
    results = results.filter(m => m.lifecycleState !== "DELETED");
    for (const m of results) {
      m.freshness = this.calculateFreshness(new Date(m.metadata.createdTime), now);
    }

    return results;
  }

  /**
   * Logically deletes a memory.
   */
  public async deleteMemory(tenantId: string, id: string): Promise<void> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryRepository>("IExecutiveMemoryRepository");
    await repo.delete(tenantId, id);
    this.logAudit("DELETE", tenantId, id);
  }

  // ==========================================================================
  // METRIC ENGINES
  // ==========================================================================

  private calculateImportance(
    weights: {
      businessImpact?: number;
      executiveRelevance?: number;
      strategicValue?: number;
      operationalValue?: number;
    },
    frequencyCount: number
  ): IMemoryImportance {
    const businessImpact = weights.businessImpact || 0.5;
    const executiveRelevance = weights.executiveRelevance || 0.5;
    const strategicValue = weights.strategicValue || 0.5;
    const operationalValue = weights.operationalValue || 0.5;

    // Overall importance scales up slightly with retrieval frequency
    const freqBonus = Math.min(0.2, frequencyCount * 0.02);
    const overallImportance = Math.min(
      0.99,
      (businessImpact + executiveRelevance + strategicValue + operationalValue) / 4 + freqBonus
    );

    return {
      businessImpact,
      executiveRelevance,
      frequencyCount,
      strategicValue,
      operationalValue,
      overallImportance,
    };
  }

  private calculateConfidence(evidenceRefs: string[], source: string): number {
    const baseSourceConfidence = source === "perception" ? 0.9 : 0.85;
    const evidenceBonus = Math.min(0.1, evidenceRefs.length * 0.02);
    return Math.min(0.99, baseSourceConfidence + evidenceBonus);
  }

  private calculateFreshness(created: Date, now: Date): IMemoryFreshness {
    const ageMs = now.getTime() - created.getTime();
    const ageSeconds = Math.max(0, Math.floor(ageMs / 1000));

    // Exponential memory decay half-life model (half-life of 24 hours = 86400 seconds)
    const halfLifeSec = 86400;
    const decayFactor = parseFloat(Math.exp(-ageSeconds / halfLifeSec).toFixed(4));

    const isStale = decayFactor < 0.5; // Stale after 1 half-life
    const refreshRecommendation = isStale
      ? "Re-verify memory context inputs"
      : "Memory freshness within optimal boundaries";

    return {
      ageSeconds,
      decayFactor,
      isStale,
      refreshRecommendation,
    };
  }

  private generateExplainability(
    key: string,
    source: string,
    confidence: number,
    importance: IMemoryImportance
  ): IMemoryExplainability {
    return {
      whyItExists: `Memory registered for key [${key}] to preserve state metrics context.`,
      origin: `Registered by source [${source}].`,
      supportingEvidenceSummary: "Direct metrics/event log telemetry inputs captured.",
      confidenceJustification: `Calculated confidence score: ${confidence} based on evidence verification paths.`,
      businessRelevanceSummary: `Relevance index: ${importance.overallImportance} mapped across strategic and operational outcomes.`,
    };
  }

  private logAudit(action: string, tenantId: string, memoryId: string): void {
    this.auditLogs.push({
      timestamp: new Date().toISOString(),
      action,
      tenantId,
      memoryId,
    });
  }

  private verifyTenantOwnership(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}
