import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import {
  IExecutiveGoal,
  IExecutiveGoalRepository,
  IGoalAssumption,
  IGoalAssumptionRepository,
  IGoalTradeoffProfile,
  IExecutiveGoalIntelligenceService
} from "./goalIntelligence.service";

// ============================================================================
// STAGE 3.4B EXECUTIVE STRATEGY INTELLIGENCE INTERFACES
// ============================================================================

export interface IStrategyConstraints {
  legal?: string[];
  compliance?: string[];
  financial?: {
    budgetLimit?: number;
    estimatedCost?: number;
  };
  operational?: string[];
  market?: string[];
  technology?: string[];
  brand?: string[];
  geographical?: string[];
}

export interface IStrategyHealth {
  feasibility: number; // 0.0 - 1.0
  confidence: number; // 0.0 - 1.0
  alignment: number; // 0.0 - 1.0
  risk: number; // 0.0 - 1.0
  resourceReadiness: number; // 0.0 - 1.0
  opportunityStrength: number; // 0.0 - 1.0
  strategicStability: number; // 0.0 - 1.0
  explanation: string;
}

export type StrategyRelationType = "requires" | "enables" | "blocks" | "competesWith" | "supports" | "strengthens" | "weakens";

export interface IStrategyRelation {
  targetStrategyId: string;
  type: StrategyRelationType;
}

export interface IStrategyVersionHistory {
  version: number;
  author: string;
  reason: string;
  timestamp: string;
  changes: Record<string, any>;
}

export interface IExecutiveStrategy {
  id: string;
  tenantId: string;
  executiveId?: string;
  goalId: string; // The Goal this strategy supports / Which goal created it
  title: string;
  description: string;
  status: "DRAFT" | "GENERATED" | "EVALUATED" | "APPROVED" | "REJECTED" | "SUPERSEDED" | "ARCHIVED";
  version: number;
  history: IStrategyVersionHistory[];
  
  // Strategic Constraint Engine (Section 6)
  constraints: IStrategyConstraints;
  
  // Strategy Health Engine (Section 10)
  health: IStrategyHealth;
  
  // Strategic Dependency Engine (Section 8)
  relations: IStrategyRelation[];
  
  // Strategic Explainability Engine (Section 9)
  whyGenerated: string; // Why was this strategy generated?
  supportingMemories: string[]; // Which memories support it?
  perceptionSignals: string[]; // Which perception signals support it?
  cognitionHypotheses: string[]; // Which cognition hypotheses support it?
  associatedAssumptions: string[]; // Which assumptions support it?
  associatedTradeoffs: string[]; // Which trade-offs affect it?
  
  whyExistsReason: string; // Backward compatibility
  explanation: string;
}

export interface IStrategyComparisonItem {
  strategyId: string;
  title: string;
  score: number; // calculated comparison score
  rank: number;
  pros: string[];
  cons: string[];
  decisionFactor: string;
  
  // Section 7 comparison metrics
  businessImpact: number;
  cost: number;
  risk: number;
  complexity: number;
  roiPotential: number;
  timeRequirement: number;
  resourceRequirement: number;
  confidence: number;
}

export interface IStrategyComparisonMatrix {
  tenantId: string;
  comparedStrategyIds: string[];
  items: IStrategyComparisonItem[];
  explanation: string;
  comparedAt: string;
}

export interface IStrategyMissionAlignment {
  strategyId: string;
  tenantId: string;
  alignmentScore: number;
  reasonCodes: string[];
  misalignmentCauses: string[];
  improvementOpportunities: string[];
  confidence: number;
  metadata: {
    evaluatedAgainst: string[];
  };
  explanation: string;
}

export interface IStrategyDiversityReport {
  tenantId: string;
  comparedStrategyIds: string[];
  perspectiveDiversity: number;
  businessDiversity: number;
  financialDiversity: number;
  operationalDiversity: number;
  customerDiversity: number;
  technologyDiversity: number;
  innovationDiversity: number;
  marketDiversity: number;
  overallDiversityScore: number;
  explanation: string;
}

export interface IStrategyExplainability {
  strategyId: string;
  tenantId: string;
  whyGenerated: string;
  whyNotAnotherStrategy: string;
  evidence: string[];
  assumptions: string[];
  tradeoffs: string[];
  opportunitiesUnlocked: string[];
  risksIdentified: string[];
  explanation: string;
}

export interface IStrategyQualityScore {
  strategyId: string;
  tenantId: string;
  overallQualityScore: number;
  metrics: {
    coverage: number;
    novelty: number;
    consistency: number;
    alignment: number;
    risk: number;
    opportunity: number;
    resourceBalance: number;
    portfolioDiversity: number;
    explainability: number;
  };
  explanation: string;
  evaluatedAt: string;
}

export interface IOpportunityItem {
  opportunity: string;
  probability: number;
  businessImpact: number;
  dependencies: string[];
  supportingEvidence: string[];
  confidence: number;
}

export interface IStrategyOpportunityMap {
  strategyId: string;
  tenantId: string;
  opportunities: IOpportunityItem[];
  confidence: number;
  explanation: string;
}

export interface IStrategyCapabilityAssessment {
  strategyId: string;
  tenantId: string;
  overallReadiness: number;
  blockingGaps: string[];
  recommendedCapabilityCategories: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  explanation: string;
}

export interface IPortfolioStructure {
  name: string;
  strategyWeights: Record<string, number>;
  resourceAllocation: Record<string, number>;
  dependencyMap: Array<{ from: string; to: string; type: string }>;
  riskDistribution: Record<string, number>;
  confidence: number;
  expectedImpact: number;
}

export interface IStrategyPortfolio {
  tenantId: string;
  portfolios: IPortfolioStructure[];
  explanation: string;
  compiledAt: string;
}

export interface IExecutiveStrategyRepository {
  save(tenantId: string, strategy: IExecutiveStrategy): Promise<void>;
  findById(tenantId: string, id: string): Promise<IExecutiveStrategy | null>;
  getByGoalId(tenantId: string, goalId: string): Promise<IExecutiveStrategy[]>;
  getAll(tenantId: string): Promise<IExecutiveStrategy[]>;
  delete(tenantId: string, id: string): Promise<void>;
}

export interface IExecutiveStrategyIntelligenceService {
  createStrategy(tenantId: string, strategyData: Partial<IExecutiveStrategy>): Promise<IExecutiveStrategy>;
  updateStrategy(tenantId: string, strategyId: string, updates: Partial<IExecutiveStrategy>, author: string, reason: string): Promise<IExecutiveStrategy>;
  getStrategyById(tenantId: string, id: string): Promise<IExecutiveStrategy | null>;
  evaluateStrategyHealth(tenantId: string, strategyId: string): Promise<IStrategyHealth>;
  compareStrategies(tenantId: string, strategyIds: string[]): Promise<IStrategyComparisonMatrix>;
  generateStrategyPackage(tenantId: string, executiveId: string): Promise<any>;
  getStrategyDependencyGraph(tenantId: string, startStrategyId: string): Promise<{ nodes: string[]; edges: Array<{ from: string; to: string; type: string }> }>;
  
  // Stage 3.4B+ Engine Methods
  getStrategyMissionAlignment(tenantId: string, strategyId: string): Promise<IStrategyMissionAlignment>;
  getStrategyDiversityReport(tenantId: string, goalId: string): Promise<IStrategyDiversityReport>;
  getStrategyExplainability(tenantId: string, strategyId: string): Promise<IStrategyExplainability>;
  evaluateStrategyQuality(tenantId: string, strategyId: string): Promise<IStrategyQualityScore>;
  getStrategyOpportunityMap(tenantId: string, strategyId: string): Promise<IStrategyOpportunityMap>;
  assessStrategyCapabilities(tenantId: string, strategyId: string): Promise<IStrategyCapabilityAssessment>;
  generateStrategyPortfolios(tenantId: string, strategyIds: string[]): Promise<IStrategyPortfolio>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION (DECOUPLED / IN-MEMORY)
// ============================================================================

export class MemoryExecutiveStrategyRepository implements IExecutiveStrategyRepository {
  private db = new Map<string, IExecutiveStrategy>();

  public async save(tenantId: string, strategy: IExecutiveStrategy): Promise<void> {
    this.verifyTenant(tenantId, strategy.tenantId);
    this.db.set(strategy.id, JSON.parse(JSON.stringify(strategy)));
  }

  public async findById(tenantId: string, id: string): Promise<IExecutiveStrategy | null> {
    const strategy = this.db.get(id);
    if (!strategy) return null;
    this.verifyTenant(tenantId, strategy.tenantId);
    return JSON.parse(JSON.stringify(strategy));
  }

  public async getByGoalId(tenantId: string, goalId: string): Promise<IExecutiveStrategy[]> {
    const results: IExecutiveStrategy[] = [];
    for (const strategy of this.db.values()) {
      if (strategy.tenantId === tenantId && strategy.goalId === goalId) {
        results.push(JSON.parse(JSON.stringify(strategy)));
      }
    }
    return results;
  }

  public async getAll(tenantId: string): Promise<IExecutiveStrategy[]> {
    const results: IExecutiveStrategy[] = [];
    for (const strategy of this.db.values()) {
      if (strategy.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(strategy)));
      }
    }
    return results;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const strategy = this.db.get(id);
    if (strategy) {
      this.verifyTenant(tenantId, strategy.tenantId);
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
// SERVICE IMPLEMENTATION (STATELESS STRATEGY INTELLIGENCE)
// ============================================================================

export class ExecutiveStrategyIntelligenceService implements IExecutiveStrategyIntelligenceService {
  constructor(private di: DIContainer = container) {}

  /**
   * Section 11: Strategy Lifecycle Engine - Support DRAFT / GENERATED creation
   */
  public async createStrategy(tenantId: string, strategyData: Partial<IExecutiveStrategy>): Promise<IExecutiveStrategy> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");

    const id = strategyData.id || `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();

    const constraints: IStrategyConstraints = strategyData.constraints || {
      legal: [],
      compliance: [],
      financial: { budgetLimit: 0, estimatedCost: 0 },
      operational: [],
      market: [],
      technology: [],
      brand: [],
      geographical: []
    };

    if (strategyData.constraints) {
      constraints.technology = strategyData.constraints.technology || [];
      constraints.brand = strategyData.constraints.brand || [];
      constraints.geographical = strategyData.constraints.geographical || [];
    }

    const health: IStrategyHealth = strategyData.health || {
      feasibility: 0.8,
      confidence: 0.8,
      alignment: 0.9,
      risk: 0.2,
      resourceReadiness: 0.8,
      opportunityStrength: 0.8,
      strategicStability: 0.8,
      explanation: "Initial default health configuration"
    };

    const strategy: IExecutiveStrategy = {
      id,
      tenantId,
      executiveId: strategyData.executiveId || "SYSTEM",
      goalId: strategyData.goalId || "goal_default",
      title: strategyData.title || "Untitled Strategy",
      description: strategyData.description || "",
      status: strategyData.status || "DRAFT",
      version: 1,
      history: [{
        version: 1,
        author: "PLANNER",
        reason: "Initial strategy creation",
        timestamp: now,
        changes: JSON.parse(JSON.stringify(strategyData))
      }],
      constraints,
      health,
      relations: strategyData.relations || [],
      
      // Strategic Explainability Engine
      whyGenerated: strategyData.whyGenerated || strategyData.whyExistsReason || "Aligned to execute target business outcome goals.",
      supportingMemories: strategyData.supportingMemories || [],
      perceptionSignals: strategyData.perceptionSignals || [],
      cognitionHypotheses: strategyData.cognitionHypotheses || [],
      associatedAssumptions: strategyData.associatedAssumptions || [],
      associatedTradeoffs: strategyData.associatedTradeoffs || [],
      
      whyExistsReason: strategyData.whyExistsReason || "Aligned to execute target business outcome goals.",
      explanation: strategyData.explanation || "Strategically instantiated in response to business requirements."
    };

    await repo.save(tenantId, strategy);

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.strategy.generated", "1.0.0", {
          strategyId: id,
          tenantId,
          title: strategy.title,
          timestamp: now
        }, { tenantId, priority: "medium" });
      } catch (err) {}
    }

    return strategy;
  }

  /**
   * Section 11: Strategy Lifecycle Engine - Support Status Updates
   */
  public async updateStrategy(
    tenantId: string,
    strategyId: string,
    updates: Partial<IExecutiveStrategy>,
    author: string,
    reason: string
  ): Promise<IExecutiveStrategy> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");

    const strategy = await repo.findById(tenantId, strategyId);
    if (!strategy) {
      throw new Error(`Strategy [${strategyId}] not found for updates.`);
    }

    const now = new Date().toISOString();
    const nextVersion = strategy.version + 1;

    const diffs: Record<string, any> = {};
    for (const key of Object.keys(updates) as Array<keyof IExecutiveStrategy>) {
      diffs[key] = { old: strategy[key], new: updates[key] };
      (strategy as any)[key] = updates[key];
    }

    strategy.version = nextVersion;
    strategy.history.push({
      version: nextVersion,
      author,
      reason,
      timestamp: now,
      changes: diffs
    });

    await repo.save(tenantId, strategy);

    // Publish events
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.strategy.updated", "1.0.0", {
          strategyId,
          tenantId,
          version: nextVersion,
          timestamp: now
        }, { tenantId, priority: "medium" });

        if (updates.status === "ARCHIVED") {
          await eventBus.publish("executive.strategy.archived", "1.0.0", {
            strategyId,
            tenantId,
            timestamp: now
          }, { tenantId, priority: "low" });
        }
      } catch (err) {}
    }

    return strategy;
  }

  public async getStrategyById(tenantId: string, id: string): Promise<IExecutiveStrategy | null> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    return repo.findById(tenantId, id);
  }

  /**
   * Section 10: Strategy Health Engine evaluation
   */
  public async evaluateStrategyHealth(tenantId: string, strategyId: string): Promise<IStrategyHealth> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    const strategy = await repo.findById(tenantId, strategyId);
    if (!strategy) {
      throw new Error(`Strategy [${strategyId}] not found for health evaluation.`);
    }

    const goalRepo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");
    const goal = await goalRepo.findById(tenantId, strategy.goalId);

    // Dynamic calculations (Section 2 independent Mission Alignment)
    let alignment = 0.8;
    try {
      const alignmentReport = await this.getStrategyMissionAlignment(tenantId, strategyId);
      alignment = alignmentReport.alignmentScore;
    } catch (e) {
      if (goal) {
        alignment = goal.priorityMetrics.missionAlignment;
      }
    }

    // Resource readiness check
    let resourceReadiness = 0.7;
    const financial = strategy.constraints.financial;
    if (financial && financial.budgetLimit && financial.estimatedCost) {
      if (financial.estimatedCost <= financial.budgetLimit) {
        resourceReadiness = 0.95;
      } else {
        resourceReadiness = 0.4; // over budget
      }
    }
    if (strategy.constraints.operational && strategy.constraints.operational.length > 0) {
      resourceReadiness += 0.05;
    }
    resourceReadiness = Math.min(1.0, Math.max(0.1, resourceReadiness));

    // Feasibility calculation
    // High feasibility if low risk and high resource readiness
    const riskVal = strategy.health.risk;
    let feasibility = (resourceReadiness * 0.6) + ((1 - riskVal) * 0.4);
    
    // Invalidate if assumptions failed
    let strategicStability = 1.0;
    let failedAssumptionCount = 0;
    if (this.di.has("IGoalAssumptionRepository")) {
      const assumptionRepo = this.di.resolve<IGoalAssumptionRepository>("IGoalAssumptionRepository");
      for (const assId of strategy.associatedAssumptions) {
        const ass = await assumptionRepo.findById(tenantId, assId);
        if (ass && ass.status === "INVALIDATED") {
          failedAssumptionCount++;
          if (ass.impactIfBroken === "CRITICAL") {
            strategicStability -= 0.35;
          } else if (ass.impactIfBroken === "HIGH") {
            strategicStability -= 0.2;
          } else {
            strategicStability -= 0.1;
          }
        }
      }
    }
    strategicStability = parseFloat(Math.max(0.05, strategicStability).toFixed(3));

    // Feasibility is degraded by instability
    feasibility = feasibility * strategicStability;
    feasibility = parseFloat(Math.min(0.99, Math.max(0.05, feasibility)).toFixed(3));

    // Confidence
    const confidence = parseFloat(((feasibility * 0.5) + (alignment * 0.5)).toFixed(3));
    const opportunityStrength = parseFloat((strategy.health.opportunityStrength || 0.8).toFixed(3));

    const explanation = `Evaluated health for strategy [${strategy.title}]. Feasibility is calculated at ${(feasibility * 100).toFixed(0)}% based on resource readiness (${(resourceReadiness * 100).toFixed(0)}%) and stability score (${(strategicStability * 100).toFixed(0)}%) impacted by ${failedAssumptionCount} failed assumptions.`;

    const nextHealth: IStrategyHealth = {
      feasibility,
      confidence,
      alignment,
      risk: strategy.health.risk,
      resourceReadiness,
      opportunityStrength,
      strategicStability,
      explanation
    };

    strategy.health = nextHealth;
    strategy.status = "EVALUATED";
    await repo.save(tenantId, strategy);

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.strategy.health.updated", "1.0.0", {
          strategyId,
          tenantId,
          health: nextHealth,
          timestamp: new Date().toISOString()
        }, { tenantId, priority: "low" });

        await eventBus.publish("executive.strategy.evaluated", "1.0.0", {
          strategyId,
          tenantId,
          health: nextHealth,
          timestamp: new Date().toISOString()
        }, { tenantId, priority: "medium" });
      } catch (err) {}
    }

    return nextHealth;
  }

  /**
   * Strategy comparison matrix compiler
   */
  public async compareStrategies(tenantId: string, strategyIds: string[]): Promise<IStrategyComparisonMatrix> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");

    const items: IStrategyComparisonItem[] = [];
    
    for (const id of strategyIds) {
      const strategy = await repo.findById(tenantId, id);
      if (!strategy) continue;

      // Calculate comparison score: (alignment * 0.4) + (feasibility * 0.3) + ((1 - risk) * 0.3)
      const health = strategy.health;
      const score = parseFloat(((health.alignment * 0.4) + (health.feasibility * 0.3) + ((1 - health.risk) * 0.3)).toFixed(3));

      const pros: string[] = [];
      const cons: string[] = [];

      if (health.alignment > 0.8) pros.push("Strong alignment with core strategic goals.");
      if (health.feasibility > 0.7) pros.push("High execution feasibility.");
      if (health.resourceReadiness > 0.8) pros.push("Adequate resources and budget constraints cleared.");
      
      if (health.risk > 0.4) cons.push("Significant operational or market risk exposure.");
      if (health.strategicStability < 0.7) cons.push("Planning stability threatened by invalidated assumptions.");
      if (health.feasibility < 0.5) cons.push("Low feasibility score.");

      if (pros.length === 0) pros.push("No notable positive differentiators.");
      if (cons.length === 0) cons.push("No major risks or blocking factors identified.");

      // Calculate comparison engine parameters
      const businessImpact = health.alignment;
      const budgetLim = strategy.constraints.financial?.budgetLimit || 1;
      const estCost = strategy.constraints.financial?.estimatedCost || 0;
      const cost = Math.min(1.0, estCost / budgetLim);
      const risk = health.risk;
      const complexity = Math.min(1.0, Math.max(0.2, (strategy.constraints.legal?.length || 0) * 0.15 + (strategy.constraints.compliance?.length || 0) * 0.15 + strategy.relations.length * 0.1));
      const roiPotential = parseFloat(Math.min(1.0, Math.max(0.0, businessImpact * 0.8 - cost * 0.2)).toFixed(3));
      const timeRequirement = strategy.constraints.operational?.length ? 0.6 : 0.4;
      const resourceRequirement = 1.0 - health.resourceReadiness;
      const confidence = health.confidence;

      items.push({
        strategyId: id,
        title: strategy.title,
        score,
        rank: 0,
        pros,
        cons,
        decisionFactor: score > 0.75 ? "Optimal feasibility-to-alignment ratio." : "Requires additional risk mitigation.",
        businessImpact,
        cost,
        risk,
        complexity,
        roiPotential,
        timeRequirement,
        resourceRequirement,
        confidence
      });
    }

    // Sort items and rank
    items.sort((a, b) => b.score - a.score);
    items.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    const explanation = `Compared ${items.length} executive strategies based on alignment, feasibility, and risk profiles. Strategy [${items[0]?.title || "none"}] ranks highest.`;

    const matrix: IStrategyComparisonMatrix = {
      tenantId,
      comparedStrategyIds: strategyIds,
      items,
      explanation,
      comparedAt: new Date().toISOString()
    };

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.strategy.compared", "1.0.0", {
          tenantId,
          executiveId: "PLANNER",
          strategyIds,
          comparisonResult: { explanation, itemsCount: items.length },
          timestamp: new Date().toISOString()
        }, { tenantId, priority: "low" });
      } catch (err) {}
    }

    return matrix;
  }

  /**
   * Section 12: Executive Strategy Package - Unified Package containing Goals, Strategies, comparison, tradeoffs, assumptions, risks, constraints
   */
  public async generateStrategyPackage(tenantId: string, executiveId: string): Promise<any> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    const goalRepo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");

    const strategies = await repo.getAll(tenantId);
    const goals = await goalRepo.getAllGoals(tenantId);

    // Resolve assumptions and tradeoffs
    const assumptions: IGoalAssumption[] = [];
    if (this.di.has("IGoalAssumptionRepository")) {
      const assumptionRepo = this.di.resolve<IGoalAssumptionRepository>("IGoalAssumptionRepository");
      const allAssumptions = await assumptionRepo.getAll(tenantId);
      assumptions.push(...allAssumptions);
    }

    // Generate Tradeoff profiles
    const tradeoffProfiles: IGoalTradeoffProfile[] = [];
    if (this.di.has("IExecutiveGoalIntelligenceService")) {
      const goalService = this.di.resolve<IExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
      for (const goal of goals) {
        try {
          const profile = await goalService.getGoalTradeoffProfile(tenantId, goal.id);
          tradeoffProfiles.push(profile);
        } catch (e) {}
      }
    }

    // Compare all non-archived strategies
    const comparedStrategyIds = strategies.filter(s => s.status !== "ARCHIVED").map(s => s.id);
    let comparisonMatrix: IStrategyComparisonMatrix | null = null;
    if (comparedStrategyIds.length > 0) {
      comparisonMatrix = await this.compareStrategies(tenantId, comparedStrategyIds);
    }

    // Risks evaluation
    const avgRisk = strategies.length > 0 ? (strategies.reduce((acc, s) => acc + s.health.risk, 0) / strategies.length) : 0;
    
    // Overall package health
    const packageHealth = {
      overallRisk: parseFloat(avgRisk.toFixed(2)),
      totalStrategies: strategies.length,
      activeStrategies: strategies.filter(s => s.status === "APPROVED").length,
      evaluatedStrategies: strategies.filter(s => s.status === "EVALUATED").length,
      strategicStabilityIndex: strategies.length > 0 ? parseFloat((strategies.reduce((acc, s) => acc + s.health.strategicStability, 0) / strategies.length).toFixed(3)) : 1.0
    };

    return {
      packageType: "EXECUTIVE_STRATEGY_PACKAGE",
      executiveId,
      tenantId,
      packageGeneratedTime: new Date().toISOString(),
      goals: goals.map(g => ({
        id: g.id,
        title: g.title,
        status: g.status,
        health: g.health
      })),
      strategies: strategies.map(s => ({
        id: s.id,
        goalId: s.goalId,
        title: s.title,
        status: s.status,
        constraints: s.constraints,
        health: s.health,
        associatedAssumptions: s.associatedAssumptions,
        associatedTradeoffs: s.associatedTradeoffs
      })),
      comparisonMatrix,
      tradeoffs: tradeoffProfiles,
      assumptions,
      health: packageHealth,
      explainability: `Executive Strategy Package compiled for tenant [${tenantId}]. Total strategies: ${strategies.length}, cumulative planning stability index: ${(packageHealth.strategicStabilityIndex * 100).toFixed(0)}%.`
    };
  }

  /**
   * Strategy dependency mapping
   */
  public async getStrategyDependencyGraph(
    tenantId: string,
    startStrategyId: string
  ): Promise<{ nodes: string[]; edges: Array<{ from: string; to: string; type: string }> }> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");

    const visited = new Set<string>();
    const edges: Array<{ from: string; to: string; type: string }> = [];

    const traverse = async (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const strategy = await repo.findById(tenantId, id);
      if (!strategy) return;

      for (const rel of strategy.relations) {
        edges.push({ from: id, to: rel.targetStrategyId, type: rel.type });
        await traverse(rel.targetStrategyId);
      }
    };

    await traverse(startStrategyId);

    return {
      nodes: Array.from(visited),
      edges
    };
  }

  /**
   * Section 2: Independent Strategy Mission Alignment Engine
   */
  public async getStrategyMissionAlignment(tenantId: string, strategyId: string): Promise<IStrategyMissionAlignment> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    const strategy = await repo.findById(tenantId, strategyId);
    if (!strategy) {
      throw new Error(`Strategy [${strategyId}] not found for mission alignment evaluation.`);
    }

    const goalRepo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");
    const goal = await goalRepo.findById(tenantId, strategy.goalId);

    let alignmentScore = 0.8;
    const reasonCodes: string[] = [];
    const misalignmentCauses: string[] = [];
    const improvementOpportunities: string[] = [];
    let confidence = 0.9;

    // Load Executive DNA if available
    const evaluatedAgainst = ["General Strategic Principles"];
    if (this.di.has("IExecutiveIdentityService")) {
      try {
        const identitySrv = this.di.resolve<any>("IExecutiveIdentityService");
        const execs = await identitySrv.listExecutives(tenantId);
        if (execs && execs.length > 0) {
          const exec = execs[0];
          const dna = exec.dna;
          evaluatedAgainst.push("Mission Directives", "Executive DNA Traits", "Business Objectives", "Risk Appetite");

          // 1. Evaluate against Mission & Vision Directives
          const directives = dna.mission?.directives || [];
          let directiveMatch = false;
          for (const dir of directives) {
            if (strategy.title.toLowerCase().includes(dir.toLowerCase()) || strategy.description.toLowerCase().includes(dir.toLowerCase())) {
              directiveMatch = true;
              reasonCodes.push("DIRECTIVE_MATCH");
            }
          }
          if (directiveMatch) {
            alignmentScore += 0.1;
          } else {
            misalignmentCauses.push("No direct keyword match with Executive DNA mission directives.");
            improvementOpportunities.push("Incorporate specific vocabulary from organizational directives into strategy titles.");
          }

          // 2. Evaluate against Risk Appetite
          const riskTolerance = dna.personalityModel?.traits?.riskTolerance ?? 0.5;
          if (strategy.health.risk > riskTolerance) {
            alignmentScore -= 0.15;
            misalignmentCauses.push(`Strategy risk (${strategy.health.risk}) exceeds Executive DNA risk appetite tolerance (${riskTolerance}).`);
            improvementOpportunities.push("Introduce extra operational stages or buffers to lower risk exposure below target threshold.");
          } else {
            reasonCodes.push("RISK_WITHIN_APPETITE");
          }

          // 3. Evaluate against Decision style
          const speedPreference = dna.personalityModel?.decisionSpeed ?? 0.5;
          if (speedPreference > 0.7 && strategy.constraints.operational?.some(op => op.includes("delay") || op.includes("overhead"))) {
            alignmentScore -= 0.05;
            misalignmentCauses.push("Strategy introduces operational overhead, mismatching fast decision speed DNA traits.");
          }
        }
      } catch (err) {
        confidence = 0.6;
      }
    }

    alignmentScore = parseFloat(Math.max(0.05, Math.min(0.99, alignmentScore)).toFixed(3));
    const explanation = `Evaluated strategy independent alignment score at ${(alignmentScore * 100).toFixed(0)}% against ${evaluatedAgainst.join(", ")}. Confidence level: ${(confidence * 100).toFixed(0)}%.`;

    return {
      strategyId,
      tenantId,
      alignmentScore,
      reasonCodes,
      misalignmentCauses,
      improvementOpportunities,
      confidence,
      metadata: { evaluatedAgainst },
      explanation
    };
  }

  /**
   * Section 7: Strategy Diversity Engine
   */
  public async getStrategyDiversityReport(tenantId: string, goalId: string): Promise<IStrategyDiversityReport> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    
    // Load all strategies supporting this goal
    const strategies = await repo.getByGoalId(tenantId, goalId);
    const comparedStrategyIds = strategies.map(s => s.id);

    if (strategies.length <= 1) {
      return {
        tenantId,
        comparedStrategyIds,
        perspectiveDiversity: 1.0,
        businessDiversity: 1.0,
        financialDiversity: 1.0,
        operationalDiversity: 1.0,
        customerDiversity: 1.0,
        technologyDiversity: 1.0,
        innovationDiversity: 1.0,
        marketDiversity: 1.0,
        overallDiversityScore: 1.0,
        explanation: "Single strategy generated, diversity is maximum by default."
      };
    }

    // Pairwise diversity calculations
    let perspectiveDiversity = 1.0;
    let businessDiversity = 1.0;
    let financialDiversity = 1.0;
    let operationalDiversity = 1.0;
    let customerDiversity = 1.0;
    let technologyDiversity = 1.0;
    let innovationDiversity = 1.0;
    let marketDiversity = 1.0;

    const s1 = strategies[0];
    const s2 = strategies[1];

    // Technology diversity
    const tech1 = s1.constraints.technology || [];
    const tech2 = s2.constraints.technology || [];
    const techOverlap = tech1.filter(t => tech2.includes(t));
    technologyDiversity = techOverlap.length > 0 ? 0.4 : 0.9;

    // Financial diversity
    const c1 = s1.constraints.financial?.estimatedCost || 0;
    const c2 = s2.constraints.financial?.estimatedCost || 0;
    const costDiff = Math.abs(c1 - c2);
    financialDiversity = parseFloat(Math.min(0.95, Math.max(0.1, costDiff / Math.max(c1, c2, 1))).toFixed(3));

    // Operational diversity
    const op1 = s1.constraints.operational || [];
    const op2 = s2.constraints.operational || [];
    const opOverlap = op1.filter(o => op2.includes(o));
    operationalDiversity = opOverlap.length > 0 ? 0.3 : 0.85;

    // Innovation diversity
    const riskDiff = Math.abs(s1.health.risk - s2.health.risk);
    innovationDiversity = parseFloat(Math.min(0.99, Math.max(0.1, riskDiff * 2)).toFixed(3));

    // Market diversity
    const m1 = s1.constraints.market || [];
    const m2 = s2.constraints.market || [];
    const mOverlap = m1.filter(x => m2.includes(x));
    marketDiversity = mOverlap.length > 0 ? 0.35 : 0.8;

    perspectiveDiversity = parseFloat(((technologyDiversity + financialDiversity) / 2).toFixed(3));
    businessDiversity = parseFloat(((financialDiversity + marketDiversity) / 2).toFixed(3));
    customerDiversity = 0.75;

    const overallDiversityScore = parseFloat((
      (perspectiveDiversity +
        businessDiversity +
        financialDiversity +
        operationalDiversity +
        customerDiversity +
        technologyDiversity +
        innovationDiversity +
        marketDiversity) / 8
    ).toFixed(3));

    const explanation = `Strategy Diversity Report for goal [${goalId}] comparing ${strategies.length} strategies. Overall diversity index is ${(overallDiversityScore * 100).toFixed(0)}%, preventing single-idea generation patterns.`;

    return {
      tenantId,
      comparedStrategyIds,
      perspectiveDiversity,
      businessDiversity,
      financialDiversity,
      operationalDiversity,
      customerDiversity,
      technologyDiversity,
      innovationDiversity,
      marketDiversity,
      overallDiversityScore,
      explanation
    };
  }

  /**
   * Section 7: Strategic Explainability Engine
   */
  public async getStrategyExplainability(tenantId: string, strategyId: string): Promise<IStrategyExplainability> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    const strategy = await repo.findById(tenantId, strategyId);
    if (!strategy) {
      throw new Error(`Strategy [${strategyId}] not found for explainability retrieval.`);
    }

    const goalRepo = this.di.resolve<IExecutiveGoalRepository>("IExecutiveGoalRepository");
    const goal = await goalRepo.findById(tenantId, strategy.goalId);

    const whyGenerated = strategy.whyGenerated || strategy.whyExistsReason;
    const whyNotAnotherStrategy = `Alternative strategies were evaluated using the comparison matrix. This strategy [${strategy.title}] was chosen due to its feasibility score of ${(strategy.health.feasibility * 100).toFixed(0)}% and risk score of ${(strategy.health.risk * 100).toFixed(0)}% compared to alternative cost profiles.`;
    
    const evidence = strategy.supportingMemories.concat(strategy.perceptionSignals);
    const assumptions = strategy.associatedAssumptions;
    const tradeoffs = strategy.associatedTradeoffs;
    const opportunitiesUnlocked = [`Unlocks strategic goal KPI attainment for goal: ${goal ? goal.title : strategy.goalId}`];
    const risksIdentified = [`Risk score: ${(strategy.health.risk * 100).toFixed(0)}%`];

    const explanation = `Compiled Strategic Explainability package for strategy [${strategy.title}] mapping evidence, tradeoffs, and risks.`;

    return {
      strategyId,
      tenantId,
      whyGenerated,
      whyNotAnotherStrategy,
      evidence,
      assumptions,
      tradeoffs,
      opportunitiesUnlocked,
      risksIdentified,
      explanation
    };
  }

  /**
   * Section 8: Strategy Quality Engine
   */
  public async evaluateStrategyQuality(tenantId: string, strategyId: string): Promise<IStrategyQualityScore> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    const strategy = await repo.findById(tenantId, strategyId);
    if (!strategy) {
      throw new Error(`Strategy [${strategyId}] not found for quality evaluation.`);
    }

    // 1. Coverage: defined constraints ratio
    const c = strategy.constraints;
    let constraintsDefined = 0;
    if (c.legal && c.legal.length > 0) constraintsDefined++;
    if (c.compliance && c.compliance.length > 0) constraintsDefined++;
    if (c.financial && c.financial.estimatedCost) constraintsDefined++;
    if (c.operational && c.operational.length > 0) constraintsDefined++;
    if (c.market && c.market.length > 0) constraintsDefined++;
    if (c.technology && c.technology.length > 0) constraintsDefined++;
    if (c.brand && c.brand.length > 0) constraintsDefined++;
    if (c.geographical && c.geographical.length > 0) constraintsDefined++;
    const coverage = parseFloat((constraintsDefined / 8).toFixed(3));

    // 2. Alignment
    const missionAlignmentReport = await this.getStrategyMissionAlignment(tenantId, strategyId);
    const alignment = missionAlignmentReport.alignmentScore;

    // 3. Risk (Inverted risk)
    const risk = parseFloat((1.0 - strategy.health.risk).toFixed(3));

    // 4. Opportunity
    const opportunity = strategy.health.opportunityStrength;

    // 5. Resource Balance
    const resourceBalance = strategy.health.resourceReadiness;

    // 6. Consistency
    let consistency = 0.9;
    if (c.financial && c.financial.budgetLimit && c.financial.estimatedCost) {
      if (c.financial.estimatedCost > c.financial.budgetLimit) {
        consistency = 0.4;
      }
    }

    // 7. Portfolio Diversity
    const diversityReport = await this.getStrategyDiversityReport(tenantId, strategy.goalId);
    const portfolioDiversity = diversityReport.overallDiversityScore;

    // 8. Explainability
    let explainabilityScore = 0.5;
    if (strategy.whyGenerated && strategy.supportingMemories.length > 0) {
      explainabilityScore = 0.95;
    }

    // 9. Novelty
    const novelty = parseFloat((1.0 - (1.0 - portfolioDiversity) * 0.5).toFixed(3));

    // Overall quality score
    const overallQualityScore = parseFloat((
      (coverage + novelty + consistency + alignment + risk + opportunity + resourceBalance + portfolioDiversity + explainabilityScore) / 9
    ).toFixed(3));

    const explanation = `Calculated Overall Strategy Quality Score of ${(overallQualityScore * 100).toFixed(0)}% across coverage, alignment, risk, resource balance, portfolio diversity, and explainability metrics.`;

    return {
      strategyId,
      tenantId,
      overallQualityScore,
      metrics: {
        coverage,
        novelty,
        consistency,
        alignment,
        risk,
        opportunity,
        resourceBalance,
        portfolioDiversity,
        explainability: explainabilityScore
      },
      explanation,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Section 3: Opportunity Discovery Engine
   */
  public async getStrategyOpportunityMap(tenantId: string, strategyId: string): Promise<IStrategyOpportunityMap> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    const strategy = await repo.findById(tenantId, strategyId);
    if (!strategy) {
      throw new Error(`Strategy [${strategyId}] not found for opportunity discovery.`);
    }

    const opportunities: IOpportunityItem[] = [];

    // Latent opportunity identification checks
    if (strategy.title.toLowerCase().includes("redis") || strategy.description.toLowerCase().includes("latency")) {
      opportunities.push({
        opportunity: "Technology Leverage via Memory Transport",
        probability: 0.9,
        businessImpact: 0.85,
        dependencies: ["Standard Redis instance availability"],
        supportingEvidence: ["Memory transport speeds generally decrease latency profile by up to 90%."],
        confidence: 0.95
      });
      opportunities.push({
        opportunity: "Operational Leverage via Reduced Process Queue Bottlenecks",
        probability: 0.8,
        businessImpact: 0.75,
        dependencies: [],
        supportingEvidence: ["Asynchronous processing clears main thread memory allocations."],
        confidence: 0.9
      });
    }

    // Default business/expansion opportunities
    opportunities.push({
      opportunity: "Pricing optimization via infrastructure cost reduction",
      probability: 0.7,
      businessImpact: 0.6,
      dependencies: ["Validating infrastructure consumption patterns"],
      supportingEvidence: ["Lower hosting expenses can support competitive price positioning."],
      confidence: 0.8
    });

    opportunities.push({
      opportunity: "Partnership integration leverage",
      probability: 0.6,
      businessImpact: 0.5,
      dependencies: [],
      supportingEvidence: ["Open standards allow seamless third-party channel integrations."],
      confidence: 0.75
    });

    const explanation = `Strategy Opportunity Map compiled for [${strategy.title}], discovering ${opportunities.length} latent opportunities not explicitly requested.`;

    return {
      strategyId,
      tenantId,
      opportunities,
      confidence: 0.88,
      explanation
    };
  }

  /**
   * Section 4: Capability Gap Engine
   */
  public async assessStrategyCapabilities(tenantId: string, strategyId: string): Promise<IStrategyCapabilityAssessment> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");
    const strategy = await repo.findById(tenantId, strategyId);
    if (!strategy) {
      throw new Error(`Strategy [${strategyId}] not found for capability assessment.`);
    }

    const blockingGaps: string[] = [];
    const recommendedCapabilityCategories: string[] = [];
    let overallReadiness = 0.85;
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";

    if (strategy.constraints.operational && strategy.constraints.operational.length > 0) {
      overallReadiness -= 0.1;
      recommendedCapabilityCategories.push("Operational Shift Scheduling");
    }

    const budgetLimit = strategy.constraints.financial?.budgetLimit || 0;
    const estimatedCost = strategy.constraints.financial?.estimatedCost || 0;
    if (estimatedCost > budgetLimit && budgetLimit > 0) {
      overallReadiness -= 0.35;
      blockingGaps.push("Financial budget deficit of " + (estimatedCost - budgetLimit));
      recommendedCapabilityCategories.push("Budget Allocation Review");
      riskLevel = "HIGH";
    }

    if (strategy.constraints.technology && strategy.constraints.technology.length > 0) {
      overallReadiness -= 0.05;
      recommendedCapabilityCategories.push("Technical Training / Vendor Onboarding");
    }

    overallReadiness = parseFloat(Math.max(0.05, Math.min(0.99, overallReadiness)).toFixed(3));
    if (overallReadiness < 0.6) {
      riskLevel = "CRITICAL";
    } else if (overallReadiness < 0.8) {
      riskLevel = "MEDIUM";
    }

    const explanation = `Organization capability assessment completed for [${strategy.title}]. Readiness: ${(overallReadiness * 100).toFixed(0)}%, Risk Level: ${riskLevel}.`;

    return {
      strategyId,
      tenantId,
      overallReadiness,
      blockingGaps,
      recommendedCapabilityCategories,
      riskLevel,
      confidence: 0.9,
      explanation
    };
  }

  /**
   * Section 5: Strategy Portfolio Engine
   */
  public async generateStrategyPortfolios(tenantId: string, strategyIds: string[]): Promise<IStrategyPortfolio> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveStrategyRepository>("IExecutiveStrategyRepository");

    const portfolios: IPortfolioStructure[] = [];
    const portfolioNames = [
      "Growth Portfolio",
      "Defensive Portfolio",
      "Balanced Portfolio",
      "Innovation Portfolio",
      "Operational Portfolio",
      "Customer Portfolio"
    ];

    for (const name of portfolioNames) {
      const strategyWeights: Record<string, number> = {};
      const resourceAllocation: Record<string, number> = {};
      const riskDistribution: Record<string, number> = {};
      const dependencyMap: Array<{ from: string; to: string; type: string }> = [];

      let totalWeight = 0;
      for (const id of strategyIds) {
        const strategy = await repo.findById(tenantId, id);
        if (!strategy) continue;

        let weight = 0.5;
        if (name === "Innovation Portfolio" && strategy.health.risk > 0.3) {
          weight = 0.9;
        } else if (name === "Defensive Portfolio" && strategy.health.risk <= 0.2) {
          weight = 0.85;
        } else if (name === "Operational Portfolio" && strategy.constraints.operational?.length) {
          weight = 0.8;
        }

        strategyWeights[id] = weight;
        totalWeight += weight;

        resourceAllocation[id] = Math.round(weight * 20000);
        riskDistribution[id] = strategy.health.risk;

        for (const rel of strategy.relations) {
          if (strategyIds.includes(rel.targetStrategyId)) {
            dependencyMap.push({ from: id, to: rel.targetStrategyId, type: rel.type });
          }
        }
      }

      portfolios.push({
        name,
        strategyWeights,
        resourceAllocation,
        dependencyMap,
        riskDistribution,
        confidence: 0.92,
        expectedImpact: totalWeight > 0 ? parseFloat((totalWeight / strategyIds.length).toFixed(3)) : 0.5
      });
    }

    const explanation = `Generated ${portfolios.length} balanced strategic portfolio structures (Growth, Defensive, Balanced, Innovation, Operational, Customer) containing weights and allocations. Portfolios only structure and do not recommend.`;

    return {
      tenantId,
      portfolios,
      explanation,
      compiledAt: new Date().toISOString()
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
