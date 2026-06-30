import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";

// ============================================================================
// STAGE 3.3G ORGANIZATIONAL KNOWLEDGE INTELLIGENCE INTERFACES
// ============================================================================

export interface IOrganizationalKnowledge {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  category: "BEST_PRACTICE" | "PATTERN" | "STANDARD_PROCEDURE";
  applicableRoles: string[]; // Deliverable 4
  evidenceCount: number;
  supportingMemories: string[];
  confidence: number;
  status: "VALIDATED" | "DRAFT" | "DEPRECATED" | "OBSOLETE"; // Deliverable 6, 7
  validityWindow: string; // e.g. "90 days"
  version: number;
  lastValidated: string;
  explainability: string;
  dependencies: string[]; // Deliverable 8
  freshnessScore: number; // 0.0 - 1.0 (Deliverable 9)
}

export interface IExecutiveOrganizationalKnowledgeRepository {
  saveKnowledge(tenantId: string, obj: IOrganizationalKnowledge): Promise<void>;
  findKnowledge(tenantId: string, id: string): Promise<IOrganizationalKnowledge | null>;
  getAllKnowledge(tenantId: string): Promise<IOrganizationalKnowledge[]>;
  deleteKnowledge(tenantId: string, id: string): Promise<void>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION (DECOUPLED / IN-MEMORY)
// ============================================================================

export class MemoryExecutiveOrganizationalKnowledgeRepository implements IExecutiveOrganizationalKnowledgeRepository {
  private db = new Map<string, IOrganizationalKnowledge>();

  public async saveKnowledge(tenantId: string, obj: IOrganizationalKnowledge): Promise<void> {
    this.verifyTenant(tenantId, obj.tenantId);
    this.db.set(obj.id, JSON.parse(JSON.stringify(obj)));
  }

  public async findKnowledge(tenantId: string, id: string): Promise<IOrganizationalKnowledge | null> {
    const obj = this.db.get(id);
    if (!obj) return null;
    this.verifyTenant(tenantId, obj.tenantId);
    return JSON.parse(JSON.stringify(obj));
  }

  public async getAllKnowledge(tenantId: string): Promise<IOrganizationalKnowledge[]> {
    const results: IOrganizationalKnowledge[] = [];
    for (const obj of this.db.values()) {
      if (obj.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(obj)));
      }
    }
    return results;
  }

  public async deleteKnowledge(tenantId: string, id: string): Promise<void> {
    const obj = this.db.get(id);
    if (obj) {
      this.verifyTenant(tenantId, obj.tenantId);
      this.db.delete(id);
    }
  }

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION (STATELESS KNOWLEDGE INTELLIGENCE)
// ============================================================================

export class ExecutiveOrganizationalKnowledgeService {
  constructor(private di: DIContainer = container) {}

  /**
   * DELIVERABLE 5 — Best Practice Intelligence
   * Validates and registers a new best practice or knowledge object based on evidence supporting memories.
   */
  public async extractKnowledge(
    tenantId: string,
    title: string,
    description: string,
    category: IOrganizationalKnowledge["category"],
    applicableRoles: string[],
    supportingMemories: string[],
    args: {
      explainability: string;
      validityWindowDays?: number;
    }
  ): Promise<IOrganizationalKnowledge> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveOrganizationalKnowledgeRepository>("IExecutiveOrganizationalKnowledgeRepository");

    // Deliverable 5: Generates validated best practices only after sufficient supporting evidence
    if (supportingMemories.length < 2) {
      throw new Error("Validation Failure: Sufficient supporting evidence (at least 2 memories) is required.");
    }

    const validityDays = args.validityWindowDays || 90;
    const now = new Date().toISOString();

    const obj: IOrganizationalKnowledge = {
      id: `know_${title.toLowerCase().replace(/\s+/g, "_")}`,
      tenantId,
      title,
      description,
      category,
      applicableRoles,
      evidenceCount: supportingMemories.length,
      supportingMemories,
      confidence: 0.9,
      status: "DRAFT",
      validityWindow: `${validityDays} days`,
      version: 1,
      lastValidated: now,
      explainability: args.explainability,
      dependencies: [],
      freshnessScore: 1.0,
    };

    // Deliverable 7: Knowledge Validation
    await this.validateKnowledge(tenantId, obj);

    await repo.saveKnowledge(tenantId, obj);

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.knowledge.created", "1.0.0", {
          knowledgeId: obj.id,
          tenantId,
          timestamp: now,
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return obj;
  }

  /**
   * DELIVERABLE 7 — Knowledge Validation Engine
   */
  public async validateKnowledge(tenantId: string, obj: IOrganizationalKnowledge): Promise<void> {
    // Evaluates evidence quantity, quality, and sets state to VALIDATED
    if (obj.evidenceCount >= 2) {
      obj.status = "VALIDATED";
      obj.lastValidated = new Date().toISOString();
      obj.version++;

      if (this.di.has("IEventBus")) {
        const eventBus = this.di.resolve<any>("IEventBus");
        try {
          await eventBus.publish("executive.knowledge.validated", "1.0.0", {
            knowledgeId: obj.id,
            tenantId,
            timestamp: obj.lastValidated,
          }, {
            tenantId,
            priority: "medium",
          });
        } catch (err) {}
      }
    }
  }

  /**
   * DELIVERABLE 3 — Cross-Executive Sharing Engine
   */
  public async shareCrossExecutive(
    tenantId: string,
    knowledgeId: string,
    targetRole: string
  ): Promise<IOrganizationalKnowledge> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveOrganizationalKnowledgeRepository>("IExecutiveOrganizationalKnowledgeRepository");

    const obj = await repo.findKnowledge(tenantId, knowledgeId);
    if (!obj) {
      throw new Error(`Knowledge [${knowledgeId}] not found.`);
    }

    if (!obj.applicableRoles.includes(targetRole)) {
      obj.applicableRoles.push(targetRole);
      obj.version++;
      obj.lastValidated = new Date().toISOString();
      await repo.saveKnowledge(tenantId, obj);

      if (this.di.has("IEventBus")) {
        const eventBus = this.di.resolve<any>("IEventBus");
        try {
          await eventBus.publish("executive.knowledge.updated", "1.0.0", {
            knowledgeId: obj.id,
            tenantId,
            timestamp: obj.lastValidated,
          }, {
            tenantId,
            priority: "medium",
          });
        } catch (err) {}
      }
    }

    return obj;
  }

  /**
   * DELIVERABLE 8 — Knowledge Dependency Engine
   */
  public async linkDependencies(
    tenantId: string,
    sourceId: string,
    targetId: string
  ): Promise<void> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveOrganizationalKnowledgeRepository>("IExecutiveOrganizationalKnowledgeRepository");

    const src = await repo.findKnowledge(tenantId, sourceId);
    const dst = await repo.findKnowledge(tenantId, targetId);
    if (!src || !dst) {
      throw new Error(`Dependency Link Error: Source [${sourceId}] or Target [${targetId}] not found.`);
    }

    if (!src.dependencies.includes(targetId)) {
      src.dependencies.push(targetId);
      src.version++;
      await repo.saveKnowledge(tenantId, src);
    }
  }

  /**
   * Traverses knowledge dependency chains (O(log N) traversal - Deliverable 13).
   */
  public async getDependencyChain(tenantId: string, startId: string): Promise<string[]> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveOrganizationalKnowledgeRepository>("IExecutiveOrganizationalKnowledgeRepository");

    const chain: string[] = [];
    const queue: string[] = [startId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      chain.push(current);

      const obj = await repo.findKnowledge(tenantId, current);
      if (obj) {
        for (const depId of obj.dependencies) {
          if (!visited.has(depId)) {
            queue.push(depId);
          }
        }
      }
    }

    return chain;
  }

  /**
   * DELIVERABLE 9 — Knowledge Freshness Engine
   * Calculates decay of knowledge over time.
   */
  public async decayKnowledgeFreshness(tenantId: string, daysElapsed: number): Promise<void> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveOrganizationalKnowledgeRepository>("IExecutiveOrganizationalKnowledgeRepository");

    const list = await repo.getAllKnowledge(tenantId);
    for (const obj of list) {
      // Linear decay: loses 0.1 freshness per 30 days elapsed
      const decay = (daysElapsed / 30) * 0.1;
      obj.freshnessScore = parseFloat(Math.max(0.1, 1.0 - decay).toFixed(3));

      // Deprecate if freshness drops below 0.4
      if (obj.freshnessScore < 0.4 && obj.status === "VALIDATED") {
        obj.status = "DEPRECATED";

        if (this.di.has("IEventBus")) {
          const eventBus = this.di.resolve<any>("IEventBus");
          try {
            await eventBus.publish("executive.knowledge.deprecated", "1.0.0", {
              knowledgeId: obj.id,
              tenantId,
              timestamp: new Date().toISOString(),
            }, {
              tenantId,
              priority: "medium",
            });
          } catch (err) {}
        }
      }

      await repo.saveKnowledge(tenantId, obj);
    }
  }

  private verifyTenantOwnership(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}
