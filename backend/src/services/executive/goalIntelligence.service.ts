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
  executiveId?: string;
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

  // Stage 3.4A+ Extensions
  tradeoffProfile?: IGoalTradeoffProfile;
  successProbability?: IGoalSuccessProbability;
  assumptionReport?: IGoalAssumptionReport;
  outcomeProjection?: IGoalOutcomeProjection;
}

export type TradeoffDimension =
  | "REVENUE_VS_PROFIT"
  | "GROWTH_VS_COST"
  | "SPEED_VS_QUALITY"
  | "INNOVATION_VS_STABILITY"
  | "RISK_VS_OPPORTUNITY"
  | "AUTOMATION_VS_HUMAN_EFFORT"
  | "CUSTOMER_SATISFACTION_VS_MARGIN"
  | "SHORT_TERM_VS_LONG_TERM";

export interface IGoalTradeoff {
  dimension: TradeoffDimension;
  weight: number; // 0.0 - 1.0
  primaryImpactDirection: "POSITIVE" | "NEGATIVE";
  reason: string;
  impactedGoalIds: string[];
}

export interface IGoalTradeoffProfile {
  goalId: string;
  tenantId: string;
  tradeoffs: IGoalTradeoff[];
  metadata: Record<string, any>;
  explanation: string;
}

export interface IGoalSuccessProbability {
  goalId: string;
  tenantId: string;
  probabilityScore: number; // 0.0 - 1.0
  confidenceBand: {
    lower: number;
    upper: number;
  };
  reasonCodes: string[];
  blockingFactors: string[];
  successDrivers: string[];
  calculatedAt: string;
  explanation: string;
}

export type AssumptionStatus = "VALIDATED" | "INVALIDATED" | "UNKNOWN";
export type AssumptionImpact = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface IGoalAssumption {
  id: string;
  tenantId: string;
  goalIds: string[];
  description: string;
  confidence: number;
  evidence: string[];
  owner: string;
  status: AssumptionStatus;
  dependencies: string[];
  impactIfBroken: AssumptionImpact;
  createdAt: string;
  updatedAt: string;
}

export interface IGoalAssumptionReport {
  tenantId: string;
  goalId: string;
  assumptions: IGoalAssumption[];
  stabilityScore: number; // 0.0 - 1.0
  invalidatedCount: number;
  criticalInvalidatedCount: number;
  explanation: string;
}

export interface IGoalOutcomeMetric {
  category: "REVENUE" | "CUSTOMER" | "OPERATIONAL" | "FINANCIAL" | "STRATEGIC" | "COMPLIANCE" | "BRAND" | "EMPLOYEE" | "INNOVATION";
  positiveDirection: string;
  negativeDirection: string;
  confidence: number;
  evidenceReferences: string[];
  dependencies: string[];
}

export interface IGoalOutcomeProjection {
  goalId: string;
  tenantId: string;
  projectedOutcomes: IGoalOutcomeMetric[];
  generatedAt: string;
  explanation: string;
}

export interface IGoalAssumptionRepository {
  save(tenantId: string, assumption: IGoalAssumption): Promise<void>;
  findById(tenantId: string, id: string): Promise<IGoalAssumption | null>;
  getByGoalId(tenantId: string, goalId: string): Promise<IGoalAssumption[]>;
  getAll(tenantId: string): Promise<IGoalAssumption[]>;
  delete(tenantId: string, id: string): Promise<void>;
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
  
  // Stage 3.4A+ Methods
  getGoalTradeoffProfile(tenantId: string, goalId: string): Promise<IGoalTradeoffProfile>;
  getGoalSuccessProbability(tenantId: string, goalId: string): Promise<IGoalSuccessProbability>;
  getGoalAssumptionReport(tenantId: string, goalId: string): Promise<IGoalAssumptionReport>;
  getGoalOutcomeProjection(tenantId: string, goalId: string): Promise<IGoalOutcomeProjection>;
  createAssumption(tenantId: string, assumptionData: Partial<IGoalAssumption>): Promise<IGoalAssumption>;
  updateAssumption(tenantId: string, assumptionId: string, updates: Partial<IGoalAssumption>, author: string, reason: string): Promise<IGoalAssumption>;
  getAssumptionsByGoal(tenantId: string, goalId: string): Promise<IGoalAssumption[]>;
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

export class MemoryGoalAssumptionRepository implements IGoalAssumptionRepository {
  private db = new Map<string, IGoalAssumption>();

  public async save(tenantId: string, assumption: IGoalAssumption): Promise<void> {
    this.verifyTenant(tenantId, assumption.tenantId);
    this.db.set(assumption.id, JSON.parse(JSON.stringify(assumption)));
  }

  public async findById(tenantId: string, id: string): Promise<IGoalAssumption | null> {
    const assumption = this.db.get(id);
    if (!assumption) return null;
    this.verifyTenant(tenantId, assumption.tenantId);
    return JSON.parse(JSON.stringify(assumption));
  }

  public async getByGoalId(tenantId: string, goalId: string): Promise<IGoalAssumption[]> {
    const results: IGoalAssumption[] = [];
    for (const assumption of this.db.values()) {
      if (assumption.tenantId === tenantId && assumption.goalIds.includes(goalId)) {
        results.push(JSON.parse(JSON.stringify(assumption)));
      }
    }
    return results;
  }

  public async getAll(tenantId: string): Promise<IGoalAssumption[]> {
    const results: IGoalAssumption[] = [];
    for (const assumption of this.db.values()) {
      if (assumption.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(assumption)));
      }
    }
    return results;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const assumption = this.db.get(id);
    if (assumption) {
      this.verifyTenant(tenantId, assumption.tenantId);
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
      executiveId: goalData.executiveId || "SYSTEM",
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

  /**
   * Stage 3.4A+ Goal Trade-off Intelligence Engine
   */
  public async getGoalTradeoffProfile(tenantId: string, goalId: string): Promise<IGoalTradeoffProfile> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");
    const goal = await repo.findById(tenantId, goalId);
    if (!goal) {
      throw new Error(`Goal [${goalId}] not found for tradeoff analysis.`);
    }

    const tradeoffs: IGoalTradeoff[] = [];
    const allGoals = await repo.getAllGoals(tenantId);

    // Dynamic trade-off detection based on dimensions.
    for (const otherGoal of allGoals) {
      if (otherGoal.id === goalId) continue;

      const t1 = goal.title.toLowerCase() + " " + goal.description.toLowerCase();
      const t2 = otherGoal.title.toLowerCase() + " " + otherGoal.description.toLowerCase();

      // Revenue vs Profit
      if (
        (t1.includes("revenue") || t1.includes("arr") || t1.includes("sales") || t1.includes("top-line") || t1.includes("top line")) &&
        (t2.includes("profit") || t2.includes("margin") || t2.includes("ebitda") || t2.includes("bottom-line") || t2.includes("bottom line"))
      ) {
        tradeoffs.push({
          dimension: "REVENUE_VS_PROFIT",
          weight: 0.7,
          primaryImpactDirection: "POSITIVE",
          reason: `Goal [${goal.title}] focuses on revenue expansion, which might increase customer acquisition cost, affecting the profitability focus of [${otherGoal.title}].`,
          impactedGoalIds: [otherGoal.id]
        });
      }

      // Growth vs Cost
      if (
        (t1.includes("growth") || t1.includes("expand") || t1.includes("acquisition") || t1.includes("scale")) &&
        (t2.includes("cost") || t2.includes("burn") || t2.includes("expense") || t2.includes("budget") || t2.includes("cut"))
      ) {
        tradeoffs.push({
          dimension: "GROWTH_VS_COST",
          weight: 0.8,
          primaryImpactDirection: "NEGATIVE",
          reason: `High growth drive in [${goal.title}] typically requires higher burn rate, trading off against cost-reduction goal [${otherGoal.title}].`,
          impactedGoalIds: [otherGoal.id]
        });
      }

      // Speed vs Quality
      if (
        (t1.includes("speed") || t1.includes("fast") || t1.includes("velocity") || t1.includes("delivery") || t1.includes("timeline")) &&
        (t2.includes("quality") || t2.includes("defect") || t2.includes("bug") || t2.includes("robust") || t2.includes("standards"))
      ) {
        tradeoffs.push({
          dimension: "SPEED_VS_QUALITY",
          weight: 0.65,
          primaryImpactDirection: "NEGATIVE",
          reason: `Accelerating velocity or delivery timeline in [${goal.title}] can pressure testing and quality assurance targets in [${otherGoal.title}].`,
          impactedGoalIds: [otherGoal.id]
        });
      }

      // Innovation vs Stability
      if (
        (t1.includes("innovation") || t1.includes("new") || t1.includes("experiment") || t1.includes("disrupt")) &&
        (t2.includes("stability") || t2.includes("uptime") || t2.includes("sla") || t2.includes("reliability") || t2.includes("maintenance"))
      ) {
        tradeoffs.push({
          dimension: "INNOVATION_VS_STABILITY",
          weight: 0.75,
          primaryImpactDirection: "NEGATIVE",
          reason: `Introducing highly innovative changes in [${goal.title}] can temporarily disrupt system stability or operational SLA targets in [${otherGoal.title}].`,
          impactedGoalIds: [otherGoal.id]
        });
      }

      // Risk vs Opportunity
      if (
        (t1.includes("risk") || t1.includes("mitigate") || t1.includes("security") || t1.includes("compliance")) &&
        (t2.includes("opportunity") || t2.includes("venture") || t2.includes("market") || t2.includes("beta"))
      ) {
        tradeoffs.push({
          dimension: "RISK_VS_OPPORTUNITY",
          weight: 0.6,
          primaryImpactDirection: "POSITIVE",
          reason: `Risk mitigation or compliance tightening in [${goal.title}] might throttle execution speed of new market opportunity in [${otherGoal.title}].`,
          impactedGoalIds: [otherGoal.id]
        });
      }

      // Automation vs Human Effort
      if (
        (t1.includes("automation") || t1.includes("ai") || t1.includes("self-service") || t1.includes("bot")) &&
        (t2.includes("human") || t2.includes("agent") || t2.includes("support") || t2.includes("staff") || t2.includes("effort"))
      ) {
        tradeoffs.push({
          dimension: "AUTOMATION_VS_HUMAN_EFFORT",
          weight: 0.55,
          primaryImpactDirection: "POSITIVE",
          reason: `Goal [${goal.title}] drives automation, shifting support roles or workload compared to human operations goal [${otherGoal.title}].`,
          impactedGoalIds: [otherGoal.id]
        });
      }

      // Customer Satisfaction vs Margin
      if (
        (t1.includes("satisfaction") || t1.includes("nps") || t1.includes("retention") || t1.includes("experience") || t1.includes("support")) &&
        (t2.includes("margin") || t2.includes("pricing") || t2.includes("cost") || t2.includes("profit"))
      ) {
        tradeoffs.push({
          dimension: "CUSTOMER_SATISFACTION_VS_MARGIN",
          weight: 0.7,
          primaryImpactDirection: "NEGATIVE",
          reason: `Enhancing customer experience or SLA standards in [${goal.title}] increases operational costs, which may reduce margins targeted by [${otherGoal.title}].`,
          impactedGoalIds: [otherGoal.id]
        });
      }

      // Short-Term vs Long-Term
      if (
        (t1.includes("short-term") || t1.includes("quarter") || t1.includes("immediate") || t1.includes("this month")) &&
        (t2.includes("long-term") || t2.includes("year") || t2.includes("future") || t2.includes("strategic"))
      ) {
        tradeoffs.push({
          dimension: "SHORT_TERM_VS_LONG_TERM",
          weight: 0.8,
          primaryImpactDirection: "NEGATIVE",
          reason: `Prioritizing immediate short-term metrics in [${goal.title}] can redirect resources away from long-term strategic growth in [${otherGoal.title}].`,
          impactedGoalIds: [otherGoal.id]
        });
      }
    }

    if (tradeoffs.length === 0 && goal.priorityMetrics.risk > 0.6) {
      tradeoffs.push({
        dimension: "RISK_VS_OPPORTUNITY",
        weight: goal.priorityMetrics.risk,
        primaryImpactDirection: "NEGATIVE",
        reason: `High risk profile (${goal.priorityMetrics.risk}) automatically introduces a trade-off with opportunity exploration.`,
        impactedGoalIds: []
      });
    }

    const explanation = `Analyzed goal [${goal.title}] against ${allGoals.length - 1} other goals. Detected ${tradeoffs.length} relevant business tradeoff profiles.`;

    const profile: IGoalTradeoffProfile = {
      goalId,
      tenantId,
      tradeoffs,
      metadata: {
        analyzedGoalsCount: allGoals.length,
        highestTradeoffWeight: tradeoffs.length > 0 ? Math.max(...tradeoffs.map(t => t.weight)) : 0
      },
      explanation
    };

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.goal.tradeoff.created", "1.0.0", {
          goalId,
          tenantId,
          tradeoffs,
          timestamp: new Date().toISOString()
        }, { tenantId, priority: "low" });
      } catch (e) {}
    }

    return profile;
  }

  /**
   * Stage 3.4A+ Goal Success Probability Engine
   */
  public async getGoalSuccessProbability(tenantId: string, goalId: string): Promise<IGoalSuccessProbability> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");
    const goal = await repo.findById(tenantId, goalId);
    if (!goal) {
      throw new Error(`Goal [${goalId}] not found for success probability calculation.`);
    }

    const progress = goal.health.progress;
    const confidence = goal.priorityMetrics.confidence;
    const risk = goal.priorityMetrics.risk;

    let dependencyWeight = 1.0;
    const blockingFactors: string[] = [];
    const successDrivers: string[] = [];

    const relations = goal.relations || [];
    for (const rel of relations) {
      if (rel.type === "dependsOn") {
        const depGoal = await repo.findById(tenantId, rel.targetGoalId);
        if (depGoal) {
          if (depGoal.status === "COMPLETED") {
            // Completed dependency is a strong positive driver
          } else if (depGoal.status === "FAILED" || depGoal.status === "CANCELLED" || depGoal.status === "BLOCKED") {
            dependencyWeight -= 0.25;
            blockingFactors.push(`Dependency Goal [${depGoal.title}] is in state ${depGoal.status}.`);
          } else {
            dependencyWeight -= 0.05;
          }
        } else {
          dependencyWeight -= 0.1;
          blockingFactors.push(`Dependency Goal [${rel.targetGoalId}] not found.`);
        }
      }
    }
    dependencyWeight = Math.max(0.2, dependencyWeight);

    let constraintPressure = 0.0;
    const constraints = goal.constraints || {};
    let constraintCount = 0;
    if (constraints.budgetLimit) constraintCount++;
    if (constraints.policiesRequired && constraints.policiesRequired.length > 0) {
      constraintCount += constraints.policiesRequired.length;
    }
    if (constraints.complianceRequirements && constraints.complianceRequirements.length > 0) {
      constraintCount += constraints.complianceRequirements.length;
    }
    constraintPressure = Math.min(0.3, constraintCount * 0.05);
    if (constraintPressure > 0.15) {
      blockingFactors.push(`High constraint pressure (${constraintCount} active constraints).`);
    }

    let timelineFactor = 1.0;
    if (constraints.timeDeadline) {
      const deadline = new Date(constraints.timeDeadline).getTime();
      const now = Date.now();
      const remainingMs = deadline - now;
      if (remainingMs <= 0) {
        timelineFactor = 0.1;
        blockingFactors.push("Goal deadline has passed or is today.");
      } else {
        const remainingDays = remainingMs / (1000 * 60 * 60 * 24);
        if (remainingDays < 7) {
          timelineFactor = 0.5;
          blockingFactors.push(`Urgent deadline: only ${Math.round(remainingDays)} days remaining.`);
        } else if (remainingDays < 30) {
          timelineFactor = 0.8;
        } else {
          successDrivers.push(`Adequate timeline remaining (${Math.round(remainingDays)} days).`);
        }
      }
    } else {
      successDrivers.push("No explicit deadline constraint, allowing flexible execution.");
    }

    let resourceFactor = 0.8;
    if (constraints.resourceAllocation && constraints.resourceAllocation.length > 0) {
      resourceFactor = 1.0;
      successDrivers.push(`Resources explicitly allocated: ${constraints.resourceAllocation.join(", ")}.`);
    } else {
      blockingFactors.push("No explicit resources allocated to the goal.");
    }

    const complexityScore = Math.min(1.0, (goal.kpis.length * 0.2 + constraintCount * 0.1 + relations.length * 0.1));
    const complexityImpact = 1.0 - (complexityScore * 0.15);
    if (complexityScore > 0.6) {
      blockingFactors.push(`High goal complexity score (${complexityScore.toFixed(2)}).`);
    } else {
      successDrivers.push(`Manageable goal complexity (${complexityScore.toFixed(2)}).`);
    }

    if (risk > 0.5) {
      blockingFactors.push(`High risk exposure score: ${risk.toFixed(2)}.`);
    } else {
      successDrivers.push(`Low risk exposure: ${risk.toFixed(2)}.`);
    }

    if (progress > 0.4) {
      successDrivers.push(`Solid progress established: ${(progress * 100).toFixed(1)}%.`);
    }

    let baseScore = (progress * 0.4) + (confidence * 0.2) + ((1 - risk) * 0.2) + (dependencyWeight * 0.1) + (resourceFactor * 0.1);
    let probabilityScore = baseScore * timelineFactor * complexityImpact;
    probabilityScore = parseFloat(Math.max(0.05, Math.min(0.99, probabilityScore)).toFixed(3));

    const bandHalfWidth = parseFloat((0.25 * (1.0 - (confidence * 0.5 + progress * 0.5))).toFixed(3));
    const confidenceBand = {
      lower: parseFloat(Math.max(0.0, probabilityScore - bandHalfWidth).toFixed(3)),
      upper: parseFloat(Math.min(1.0, probabilityScore + bandHalfWidth).toFixed(3))
    };

    const reasonCodes: string[] = [];
    if (probabilityScore > 0.8) {
      reasonCodes.push("HIGH_KPI_PROGRESS_OR_CONFIDENCE");
    } else if (probabilityScore < 0.4) {
      reasonCodes.push("HIGH_RISK_OR_PENDING_DEPENDENCIES");
    } else {
      reasonCodes.push("MODERATE_PROGRESS_AND_RISK");
    }

    const explanation = `Calculated success probability of ${(probabilityScore * 100).toFixed(1)}% for goal [${goal.title}] using weighted deterministic logic across KPI progress, dependencies, risk, and resource factors.`;

    const successProbability: IGoalSuccessProbability = {
      goalId,
      tenantId,
      probabilityScore,
      confidenceBand,
      reasonCodes,
      blockingFactors,
      successDrivers,
      calculatedAt: new Date().toISOString(),
      explanation
    };

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.goal.success.updated", "1.0.0", {
          goalId,
          tenantId,
          probabilityScore,
          timestamp: new Date().toISOString()
        }, { tenantId, priority: "low" });
      } catch (e) {}
    }

    return successProbability;
  }

  /**
   * Stage 3.4A+ Goal Assumption Intelligence Engine
   */
  public async createAssumption(tenantId: string, assumptionData: Partial<IGoalAssumption>): Promise<IGoalAssumption> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IGoalAssumptionRepository>("IGoalAssumptionRepository");

    const id = assumptionData.id || `assumption_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();

    const assumption: IGoalAssumption = {
      id,
      tenantId,
      goalIds: assumptionData.goalIds || [],
      description: assumptionData.description || "Unspecified assumption",
      confidence: assumptionData.confidence !== undefined ? assumptionData.confidence : 0.8,
      evidence: assumptionData.evidence || [],
      owner: assumptionData.owner || "PLANNER",
      status: assumptionData.status || "UNKNOWN",
      dependencies: assumptionData.dependencies || [],
      impactIfBroken: assumptionData.impactIfBroken || "MEDIUM",
      createdAt: now,
      updatedAt: now
    };

    await repo.save(tenantId, assumption);

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.goal.assumption.updated", "1.0.0", {
          assumptionId: id,
          tenantId,
          status: assumption.status,
          timestamp: now
        }, { tenantId, priority: "low" });
      } catch (e) {}
    }

    return assumption;
  }

  public async updateAssumption(
    tenantId: string,
    assumptionId: string,
    updates: Partial<IGoalAssumption>,
    author: string,
    reason: string
  ): Promise<IGoalAssumption> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IGoalAssumptionRepository>("IGoalAssumptionRepository");
    
    const assumption = await repo.findById(tenantId, assumptionId);
    if (!assumption) {
      throw new Error(`Assumption [${assumptionId}] not found for updates.`);
    }

    for (const key of Object.keys(updates) as Array<keyof IGoalAssumption>) {
      (assumption as any)[key] = updates[key];
    }
    assumption.updatedAt = new Date().toISOString();

    await repo.save(tenantId, assumption);

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.goal.assumption.updated", "1.0.0", {
          assumptionId,
          tenantId,
          status: assumption.status,
          timestamp: assumption.updatedAt
        }, { tenantId, priority: "low" });
      } catch (e) {}
    }

    return assumption;
  }

  public async getAssumptionsByGoal(tenantId: string, goalId: string): Promise<IGoalAssumption[]> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IGoalAssumptionRepository>("IGoalAssumptionRepository");
    return repo.getByGoalId(tenantId, goalId);
  }

  public async getGoalAssumptionReport(tenantId: string, goalId: string): Promise<IGoalAssumptionReport> {
    this.verifyTenantOwnership(tenantId);
    const goalRepo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");
    const goal = await goalRepo.findById(tenantId, goalId);
    if (!goal) {
      throw new Error(`Goal [${goalId}] not found for assumption report.`);
    }

    const assumptionRepo = this.di.resolve<IGoalAssumptionRepository>("IGoalAssumptionRepository");
    const assumptions = await assumptionRepo.getByGoalId(tenantId, goalId);

    let stabilityScore = 1.0;
    let invalidatedCount = 0;
    let criticalInvalidatedCount = 0;

    for (const assumption of assumptions) {
      if (assumption.status === "INVALIDATED") {
        invalidatedCount++;
        if (assumption.impactIfBroken === "CRITICAL") {
          stabilityScore -= 0.35;
          criticalInvalidatedCount++;
        } else if (assumption.impactIfBroken === "HIGH") {
          stabilityScore -= 0.25;
        } else if (assumption.impactIfBroken === "MEDIUM") {
          stabilityScore -= 0.15;
        } else {
          stabilityScore -= 0.05;
        }
      }
    }

    stabilityScore = parseFloat(Math.max(0.0, stabilityScore).toFixed(3));

    const explanation = `Goal [${goal.title}] analyzed with ${assumptions.length} linked planning assumptions. Calculated structural stability of ${(stabilityScore * 100).toFixed(1)}% due to ${invalidatedCount} invalidated assumptions (${criticalInvalidatedCount} critical).`;

    return {
      tenantId,
      goalId,
      assumptions,
      stabilityScore,
      invalidatedCount,
      criticalInvalidatedCount,
      explanation
    };
  }

  /**
   * Stage 3.4A+ Goal Outcome Simulation Metadata
   */
  public async getGoalOutcomeProjection(tenantId: string, goalId: string): Promise<IGoalOutcomeProjection> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");
    const goal = await repo.findById(tenantId, goalId);
    if (!goal) {
      throw new Error(`Goal [${goalId}] not found for outcome projection.`);
    }

    const projectedOutcomes: IGoalOutcomeMetric[] = [];

    if (goal.priorityMetrics.financialImpact > 0.0) {
      projectedOutcomes.push({
        category: "REVENUE",
        positiveDirection: `Upside expansion of top-line ARR and margin improvement. Weighted value: ${(goal.priorityMetrics.financialImpact * 100).toFixed(0)}%.`,
        negativeDirection: "Potential increase in customer acquisition cost or discount pressure.",
        confidence: goal.priorityMetrics.confidence,
        evidenceReferences: goal.evidenceRefs || [],
        dependencies: goal.relations.filter(r => r.type === "dependsOn").map(r => r.targetGoalId)
      });

      projectedOutcomes.push({
        category: "FINANCIAL",
        positiveDirection: `Positive EBITDA impact from budget containment (limit of $${goal.constraints.budgetLimit || "unspecified"}).`,
        negativeDirection: "Unplanned operational expenses due to delayed dependency fulfillment.",
        confidence: parseFloat((goal.priorityMetrics.confidence * 0.9).toFixed(2)),
        evidenceReferences: [],
        dependencies: []
      });
    }

    if (goal.priorityMetrics.customerImpact > 0.0) {
      projectedOutcomes.push({
        category: "CUSTOMER",
        positiveDirection: "Higher NPS and logo retention due to service quality optimization.",
        negativeDirection: "Temporary support overload during transition/release phases.",
        confidence: goal.priorityMetrics.confidence,
        evidenceReferences: goal.associatedMemories || [],
        dependencies: []
      });
    }

    projectedOutcomes.push({
      category: "OPERATIONAL",
      positiveDirection: `Optimized workflow efficiency through structured goal deliverables under ${goal.ownerRole}.`,
      negativeDirection: `Resourcing friction from executing competing initiatives.`,
      confidence: 0.8,
      evidenceReferences: [],
      dependencies: []
    });

    projectedOutcomes.push({
      category: "STRATEGIC",
      positiveDirection: `Direct execution of mission ${goal.missionId} directive policies.`,
      negativeDirection: `Dilution of primary organization node focus if priorities shift.`,
      confidence: goal.priorityMetrics.missionAlignment,
      evidenceReferences: [],
      dependencies: []
    });

    if (goal.priorityMetrics.urgency > 0.7) {
      projectedOutcomes.push({
        category: "EMPLOYEE",
        positiveDirection: "Enhanced organizational alignment on urgent priorities.",
        negativeDirection: "Possible team burn-out and fatigue due to accelerated deadlines.",
        confidence: 0.7,
        evidenceReferences: [],
        dependencies: []
      });
    }

    if (goal.constraints.complianceRequirements && goal.constraints.complianceRequirements.length > 0) {
      projectedOutcomes.push({
        category: "COMPLIANCE",
        positiveDirection: `Systemic mitigation of compliance audits and strict adherence to regulatory standards: ${goal.constraints.complianceRequirements.join(", ")}.`,
        negativeDirection: "Delays in feature deployment due to extra gating review processes.",
        confidence: 0.95,
        evidenceReferences: [],
        dependencies: []
      });
    }

    if (goal.priorityMetrics.opportunity > 0.6) {
      projectedOutcomes.push({
        category: "INNOVATION",
        positiveDirection: "Discovery of new market capabilities and IP assets.",
        negativeDirection: "Investment loss if experimental features fail to achieve product-market fit.",
        confidence: goal.priorityMetrics.confidence,
        evidenceReferences: [],
        dependencies: []
      });
    }

    const explanation = `Generated ${projectedOutcomes.length} dimensions of business outcome projections for goal [${goal.title}] based on customer impact, financial metrics, and strategic alignment parameters.`;

    const projection: IGoalOutcomeProjection = {
      goalId,
      tenantId,
      projectedOutcomes,
      generatedAt: new Date().toISOString(),
      explanation
    };

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.goal.outcome.projected", "1.0.0", {
          goalId,
          tenantId,
          timestamp: new Date().toISOString()
        }, { tenantId, priority: "low" });
      } catch (e) {}
    }

    return projection;
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
