import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";

// ============================================================================
// STAGE 3.4A EXECUTIVE GOAL INTELLIGENCE INTERFACES
// ============================================================================

export interface IGoalConstraint {
  budgetLimit?: number;
  policiesRequired?: string[];
  complianceRequirements?: string[];
  resourceAllocation?: string[];
  timeDeadline?: string;
  capabilitiesRequired?: string[];
}

export interface IGoalKPI {
  kpiId: string;
  name: string;
  targetValue: number;
  currentValue: number;
  thresholds: {
    critical?: number;
    acceptable?: number;
  };
  successCondition: string;
  failureCondition: string;
  tolerance: number;
  measurementFrequency: "daily" | "weekly" | "monthly";
}

export interface IGoalRelation {
  targetGoalId: string;
  type: "dependsOn" | "blocks" | "supports" | "conflictsWith" | "strengthens" | "weakens";
}

export interface IGoalVersionHistory {
  version: number;
  author: string;
  reason: string;
  timestamp: string;
  changes: Record<string, any>;
  rollbackMetadata?: Record<string, any>;
}

export interface IExecutiveGoal {
  id: string;
  tenantId: string;
  parentId?: string; // Goal Hierarchy: Team Goal -> Individual Goal
  title: string;
  description: string;
  ownerRole: string;
  requestedBy: string;
  missionId: string;
  status: "DRAFT" | "PROPOSED" | "APPROVED" | "ACTIVE" | "BLOCKED" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED" | "ARCHIVED";
  version: number;
  history: IGoalVersionHistory[];
  
  // Deliverable 4: Goal Priority Engine
  priorityMetrics: {
    businessImpact: number; // 0.0 - 1.0
    urgency: number; // 0.0 - 1.0
    executiveImportance: number; // 0.0 - 1.0
    missionAlignment: number; // 0.0 - 1.0
    risk: number; // 0.0 - 1.0
    opportunity: number; // 0.0 - 1.0
    confidence: number; // 0.0 - 1.0
    customerImpact: number; // 0.0 - 1.0
    financialImpact: number; // 0.0 - 1.0
  };
  priorityScore: number; // Calculated dynamic priority
  
  // Deliverable 5: Goal KPI Engine
  kpis: IGoalKPI[];
  
  // Deliverable 6: Goal Constraint Engine
  constraints: IGoalConstraint;
  
  // Deliverable 3: Goal Dependency Engine
  relations: IGoalRelation[];
  
  // Deliverable 7: Goal Explainability Engine
  associatedMemories: string[];
  evidenceRefs: string[];
  whyExistsReason: string;
  
  // Deliverable 10: Goal Health Engine
  health: {
    progress: number; // 0.0 - 1.0
    confidence: number; // 0.0 - 1.0
    risk: number; // 0.0 - 1.0
    alignment: number; // 0.0 - 1.0
    stability: number; // 0.0 - 1.0
    completionPrediction: string;
  };
}

export interface IExecutiveGoalRepository {
  save(tenantId: string, goal: IExecutiveGoal): Promise<void>;
  findById(tenantId: string, id: string): Promise<IExecutiveGoal | null>;
  getAllGoals(tenantId: string): Promise<IExecutiveGoal[]>;
  delete(tenantId: string, id: string): Promise<void>;
}

export interface IExecutiveGoalIntelligenceService {
  createGoal(tenantId: string, goalData: Partial<IExecutiveGoal>): Promise<IExecutiveGoal>;
  updateGoal(tenantId: string, goalId: string, updates: Partial<IExecutiveGoal>, author: string, reason: string): Promise<IExecutiveGoal>;
  evaluateGoalHealth(tenantId: string, goalId: string): Promise<IExecutiveGoal["health"]>;
  getGoalDependencyGraph(tenantId: string, startGoalId: string): Promise<{ nodes: string[]; edges: Array<{ from: string; to: string; type: string }> }>;
  generatePriorityReport(tenantId: string): Promise<Array<{ goalId: string; title: string; score: number }>>;
  detectConflicts(tenantId: string, goalId: string): Promise<string[]>;
  generateGoalPackage(tenantId: string, executiveId: string): Promise<any>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION (DECOUPLED / IN-MEMORY)
// ============================================================================

export class MemoryExecutiveGoalRepository implements IExecutiveGoalRepository {
  private db = new Map<string, IExecutiveGoal>();

  public async save(tenantId: string, goal: IExecutiveGoal): Promise<void> {
    this.verifyTenant(tenantId, goal.tenantId);
    this.db.set(goal.id, JSON.parse(JSON.stringify(goal)));
  }

  public async findById(tenantId: string, id: string): Promise<IExecutiveGoal | null> {
    const goal = this.db.get(id);
    if (!goal) return null;
    this.verifyTenant(tenantId, goal.tenantId);
    return JSON.parse(JSON.stringify(goal));
  }

  public async getAllGoals(tenantId: string): Promise<IExecutiveGoal[]> {
    const results: IExecutiveGoal[] = [];
    for (const goal of this.db.values()) {
      if (goal.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(goal)));
      }
    }
    return results;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const goal = this.db.get(id);
    if (goal) {
      this.verifyTenant(tenantId, goal.tenantId);
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
// SERVICE IMPLEMENTATION (STATELESS GOAL INTELLIGENCE)
// ============================================================================

export class ExecutiveGoalIntelligenceService implements IExecutiveGoalIntelligenceService {
  constructor(private di: DIContainer = container) {}

  /**
   * DELIVERABLE 1 & 8 — Create Goal (Draft/Proposed/etc.)
   */
  public async createGoal(tenantId: string, goalData: Partial<IExecutiveGoal>): Promise<IExecutiveGoal> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");

    const id = goalData.id || `goal_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();

    const priorityMetrics = goalData.priorityMetrics || {
      businessImpact: 0.5,
      urgency: 0.5,
      executiveImportance: 0.5,
      missionAlignment: 0.5,
      risk: 0.5,
      opportunity: 0.5,
      confidence: 0.5,
      customerImpact: 0.5,
      financialImpact: 0.5,
    };

    const priorityScore = this.calculatePriority(priorityMetrics);

    const goal: IExecutiveGoal = {
      id,
      tenantId,
      parentId: goalData.parentId,
      title: goalData.title || "Untitled Goal",
      description: goalData.description || "",
      ownerRole: goalData.ownerRole || "CEO",
      requestedBy: goalData.requestedBy || "CEO",
      missionId: goalData.missionId || "mission_default",
      status: goalData.status || "DRAFT",
      version: 1,
      history: [{
        version: 1,
        author: goalData.requestedBy || "CEO",
        reason: "Initial goal creation",
        timestamp: now,
        changes: JSON.parse(JSON.stringify(goalData)),
      }],
      priorityMetrics,
      priorityScore,
      kpis: goalData.kpis || [],
      constraints: goalData.constraints || {},
      relations: goalData.relations || [],
      associatedMemories: goalData.associatedMemories || [],
      evidenceRefs: goalData.evidenceRefs || [],
      whyExistsReason: goalData.whyExistsReason || "Direct strategic alignment trigger",
      health: {
        progress: 0.0,
        confidence: priorityMetrics.confidence,
        risk: priorityMetrics.risk,
        alignment: priorityMetrics.missionAlignment,
        stability: 1.0,
        completionPrediction: "ON_TRACK",
      },
    };

    await repo.save(tenantId, goal);

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.goal.created", "1.0.0", {
          goalId: id,
          tenantId,
          title: goal.title,
          timestamp: now,
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return goal;
  }

  /**
   * DELIVERABLE 9 — Update & Rollback Engine
   */
  public async updateGoal(
    tenantId: string,
    goalId: string,
    updates: Partial<IExecutiveGoal>,
    author: string,
    reason: string
  ): Promise<IExecutiveGoal> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");

    const goal = await repo.findById(tenantId, goalId);
    if (!goal) {
      throw new Error(`Goal [${goalId}] not found for updates.`);
    }

    const now = new Date().toISOString();
    const nextVersion = goal.version + 1;

    // Track old fields for history diffs
    const diffs: Record<string, any> = {};
    for (const key of Object.keys(updates) as Array<keyof IExecutiveGoal>) {
      diffs[key] = { old: goal[key], new: updates[key] };
      (goal as any)[key] = updates[key];
    }

    goal.version = nextVersion;
    goal.history.push({
      version: nextVersion,
      author,
      reason,
      timestamp: now,
      changes: diffs,
    });

    // Recompute priority if metrics changed
    if (updates.priorityMetrics) {
      goal.priorityScore = this.calculatePriority(goal.priorityMetrics);
    }

    await repo.save(tenantId, goal);

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.goal.updated", "1.0.0", {
          goalId,
          tenantId,
          version: nextVersion,
          timestamp: now,
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return goal;
  }

  /**
   * DELIVERABLE 10 — Goal Health Engine
   */
  public async evaluateGoalHealth(tenantId: string, goalId: string): Promise<IExecutiveGoal["health"]> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");

    const goal = await repo.findById(tenantId, goalId);
    if (!goal) {
      throw new Error(`Goal [${goalId}] not found for health evaluation.`);
    }

    // Evaluate progress based on KPIs
    let progressSum = 0;
    if (goal.kpis.length > 0) {
      for (const kpi of goal.kpis) {
        const ratio = kpi.targetValue !== 0 ? Math.min(1.0, kpi.currentValue / kpi.targetValue) : 1.0;
        progressSum += ratio;
      }
      goal.health.progress = parseFloat((progressSum / goal.kpis.length).toFixed(3));
    }

    // Determine completion prediction
    if (goal.health.progress >= 1.0) {
      goal.health.completionPrediction = "COMPLETED";
    } else if (goal.health.risk > 0.7) {
      goal.health.completionPrediction = "AT_RISK";
    } else {
      goal.health.completionPrediction = "ON_TRACK";
    }

    await repo.save(tenantId, goal);

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.goal.health.updated", "1.0.0", {
          goalId,
          tenantId,
          progress: goal.health.progress,
          completionPrediction: goal.health.completionPrediction,
          timestamp: new Date().toISOString(),
        }, {
          tenantId,
          priority: "low",
        });
      } catch (err) {}
    }

    return goal.health;
  }

  /**
   * DELIVERABLE 3 — Goal Dependency Engine
   */
  public async getGoalDependencyGraph(
    tenantId: string,
    startGoalId: string
  ): Promise<{ nodes: string[]; edges: Array<{ from: string; to: string; type: string }> }> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");

    const visited = new Set<string>();
    const edges: Array<{ from: string; to: string; type: string }> = [];

    const traverse = async (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const goal = await repo.findById(tenantId, id);
      if (!goal) return;

      for (const rel of goal.relations) {
        edges.push({ from: id, to: rel.targetGoalId, type: rel.type });
        await traverse(rel.targetGoalId);
      }
    };

    await traverse(startGoalId);

    return {
      nodes: Array.from(visited),
      edges,
    };
  }

  /**
   * DELIVERABLE 4 — Dynamic Priority Sorting
   */
  public async generatePriorityReport(tenantId: string): Promise<Array<{ goalId: string; title: string; score: number }>> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");

    const goals = await repo.getAllGoals(tenantId);
    const report = goals.map(g => ({
      goalId: g.id,
      title: g.title,
      score: g.priorityScore,
    }));

    return report.sort((a, b) => b.score - a.score);
  }

  /**
   * DELIVERABLE 11 — Goal Conflict Engine
   */
  public async detectConflicts(tenantId: string, goalId: string): Promise<string[]> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");

    const target = await repo.findById(tenantId, goalId);
    if (!target) return [];

    const conflicts: string[] = [];
    const goals = await repo.getAllGoals(tenantId);

    for (const g of goals) {
      if (g.id === goalId) continue;

      // 1. Detect duplicates (same title/KPI targets)
      if (g.title.toLowerCase() === target.title.toLowerCase()) {
        conflicts.push(`Duplicate Goal: [${g.id}] has the exact same title.`);
      }

      // 2. Mutually exclusive target values
      for (const kpiA of target.kpis) {
        for (const kpiB of g.kpis) {
          if (kpiA.kpiId === kpiB.kpiId && kpiA.targetValue !== kpiB.targetValue && target.parentId === g.parentId) {
            conflicts.push(`KPI Contradiction: Goal [${g.id}] target value [${kpiB.targetValue}] contradicts [${kpiA.targetValue}] on KPI [${kpiA.kpiId}].`);
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * DELIVERABLE 12 — Executive Goal Package (Input for Stage 3.4B Planning Execution)
   */
  public async generateGoalPackage(tenantId: string, executiveId: string): Promise<any> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");

    const goals = await repo.getAllGoals(tenantId);

    return {
      executiveId,
      tenantId,
      packageGeneratedTime: new Date().toISOString(),
      goals: goals.map(g => ({
        id: g.id,
        parentId: g.parentId,
        title: g.title,
        status: g.status,
        priorityScore: g.priorityScore,
        kpis: g.kpis,
        constraints: g.constraints,
        relations: g.relations,
        whyExistsReason: g.whyExistsReason,
        health: g.health,
      })),
    };
  }

  private calculatePriority(metrics: IExecutiveGoal["priorityMetrics"]): number {
    const raw = (
      metrics.businessImpact * 0.2 +
      metrics.urgency * 0.15 +
      metrics.executiveImportance * 0.1 +
      metrics.missionAlignment * 0.2 +
      metrics.risk * 0.05 +
      metrics.opportunity * 0.1 +
      metrics.customerImpact * 0.1 +
      metrics.financialImpact * 0.1
    );
    return parseFloat(Math.min(1.0, raw).toFixed(3));
  }

  private verifyTenantOwnership(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}
