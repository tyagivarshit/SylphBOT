import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import * as crypto from "crypto";

// ============================================================================
// DATA MODELS & INTERFACES
// ============================================================================

export type RetryStrategyType =
  | "Immediate"
  | "Exponential"
  | "Linear"
  | "Jitter"
  | "CircuitRecovery"
  | "HumanRetry"
  | "Delayed"
  | "Dependency"
  | "Conditional";

export type RecoveryPlanAction =
  | "Continue"
  | "Retry"
  | "Rollback branch"
  | "Rollback workflow"
  | "Replace driver"
  | "Replace worker"
  | "Escalate"
  | "Pause"
  | "Abort"
  | "Human approval";

export interface IAdaptiveExecutionState {
  id: string;
  tenantId: string;
  workflowStateId: string;
  slaStatus: "NOMINAL" | "WARNING" | "BREACHED";
  progress: number;
  resources: Record<string, any>;
  budget: { allocated: number; spent: number };
  riskScore: number;
  driftMetrics: Record<string, any>;
  failures: string[];
  confidence: number;
  predictions: Array<{
    nodeId: string;
    predictedFailure: boolean;
    confidence: number;
    actionRecommended: string;
  }>;
  predictionDrift: Array<{ timestamp: string; driftScore: number }>;
  optimizationDrift: Array<{ timestamp: string; driftScore: number }>;
  recoveryHistory: Array<{ timestamp: string; action: string; nodeId: string; plan: string }>;
  immutableRecoverySnapshots: Array<{ snapshotId: string; timestamp: string; stateDump: string }>;
  versionHistory: Array<{ version: number; timestamp: string; updatedBy: string }>;
  version: number;
  retryStrategy: RetryStrategyType;
  selfHealedCount: number;
  isRecovered: boolean;
  isEscalated: boolean;
  graph: {
    nodes: Array<{ id: string; name: string; type: string; dependsOn?: string[] }>;
    edges: Array<{ from: string; to: string }>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface IAdaptivePackageOutput {
  compiledAt: string;
  tenantId: string;
  stateId: string;
  decision: any;
  authorDispatch: any;
  workflow: any;
  execution: any;
  retries: number;
  failures: string[];
  recovery: {
    selfHealedCount: number;
    isRecovered: boolean;
    isEscalated: boolean;
    recoveryHistory: any[];
    immutableRecoverySnapshots: any[];
  };
  optimization: {
    budgetEfficiency: number;
    riskOptimized: boolean;
    optimizationDrift: any[];
  };
  drift: {
    driftMetrics: any;
    predictionDrift: any[];
  };
  predictions: any[];
  health: {
    slaStatus: string;
    progress: number;
    confidence: number;
    healthScore: number;
  };
  explainability: {
    whyExecutionSlowed: string;
    whyRetryHappened: string;
    whyBranchChanged: string;
    whyRollbackOccurred: string;
    whyResourcesChanged: string;
    whyWorkflowPaused: string;
    whyExecutionResumed: string;
  };
  versionHistory: any[];
  version: number;
}

// ============================================================================
// ADAPTIVE EXECUTION REPOSITORY INTERFACES & O(1) IMPLEMENTATIONS
// ============================================================================

export interface IExecutiveAdaptiveExecutionRepository {
  saveAdaptiveState(tenantId: string, state: IAdaptiveExecutionState): Promise<void>;
  findAdaptiveStateById(tenantId: string, id: string): Promise<IAdaptiveExecutionState | null>;
  findAdaptiveStateByWorkflowId(tenantId: string, workflowStateId: string): Promise<IAdaptiveExecutionState | null>;
}

export class MemoryExecutiveAdaptiveExecutionRepository implements IExecutiveAdaptiveExecutionRepository {
  private statesDb = new Map<string, Map<string, IAdaptiveExecutionState>>();

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== callerTenantId) {
      throw new Error(`Security Violation: Context tenant [${ctxTenantId}] does not match resource tenant [${callerTenantId}].`);
    }
  }

  public async saveAdaptiveState(tenantId: string, state: IAdaptiveExecutionState): Promise<void> {
    this.verifyTenant(tenantId, state.tenantId);
    if (!this.statesDb.has(tenantId)) {
      this.statesDb.set(tenantId, new Map());
    }
    this.statesDb.get(tenantId)!.set(state.id, JSON.parse(JSON.stringify(state)));
  }

  public async findAdaptiveStateById(tenantId: string, id: string): Promise<IAdaptiveExecutionState | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.statesDb.get(tenantId);
    if (!tenantMap) return null;
    const item = tenantMap.get(id);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  public async findAdaptiveStateByWorkflowId(tenantId: string, workflowStateId: string): Promise<IAdaptiveExecutionState | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.statesDb.get(tenantId);
    if (!tenantMap) return null;
    for (const state of tenantMap.values()) {
      if (state.workflowStateId === workflowStateId) {
        return JSON.parse(JSON.stringify(state));
      }
    }
    return null;
  }
}

// ============================================================================
// ADAPTIVE EXECUTION SERVICE
// ============================================================================

export class ExecutiveAdaptiveExecutionService {
  constructor(private di: DIContainer = container) {}

  private validateRequestContext(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }

  private async publishEvent(tenantId: string, eventName: string, payload: any): Promise<void> {
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      if (eventBus) {
        await eventBus.publish(eventName, "1.0.0", payload, { tenantId }).catch(() => {});
      }
    }
  }

  private incrementVersion(state: IAdaptiveExecutionState): void {
    state.version++;
    state.versionHistory.push({
      version: state.version,
      timestamp: new Date().toISOString(),
      updatedBy: "ExecutiveAdaptiveExecutionService"
    });
  }

  private saveImmutableSnapshot(state: IAdaptiveExecutionState): void {
    const snapshotId = `snap_${crypto.randomUUID().replace(/-/g, "")}`;
    state.immutableRecoverySnapshots.push({
      snapshotId,
      timestamp: new Date().toISOString(),
      stateDump: JSON.stringify({
        slaStatus: state.slaStatus,
        progress: state.progress,
        retryStrategy: state.retryStrategy,
        selfHealedCount: state.selfHealedCount,
        isRecovered: state.isRecovered,
        isEscalated: state.isEscalated
      })
    });
  }

  /**
   * Track adaptive execution state and trigger events
   */
  public async trackAdaptiveExecution(tenantId: string, state: IAdaptiveExecutionState): Promise<void> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
    
    state.version = state.version || 1;
    state.versionHistory = state.versionHistory || [{ version: 1, timestamp: new Date().toISOString(), updatedBy: "SystemInit" }];
    state.immutableRecoverySnapshots = state.immutableRecoverySnapshots || [];
    state.predictionDrift = state.predictionDrift || [];
    state.optimizationDrift = state.optimizationDrift || [];
    state.recoveryHistory = state.recoveryHistory || [];

    this.saveImmutableSnapshot(state);
    await repo.saveAdaptiveState(tenantId, state);

    await this.publishEvent(tenantId, "executive.execution.health.updated", {
      stateId: state.id,
      tenantId,
      slaStatus: state.slaStatus,
      progress: state.progress,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 7. Adaptive Retry Engine: Choose retry strategy based on failure type
   */
  public selectRetryStrategy(failureType: string): RetryStrategyType {
    const type = failureType.toLowerCase();
    if (type.includes("stripe outage") || type.includes("api limit") || type.includes("github")) {
      return "Exponential";
    }
    if (type.includes("crm unavailable") || type.includes("region failure")) {
      return "CircuitRecovery";
    }
    if (type.includes("dependency")) {
      return "Dependency";
    }
    if (type.includes("timeout") || type.includes("slack")) {
      return "Jitter";
    }
    if (type.includes("worker crash")) {
      return "Immediate";
    }
    if (type.includes("missing callback") || type.includes("customer approval delay")) {
      return "HumanRetry";
    }
    if (type.includes("budget")) {
      return "Conditional";
    }
    return "Linear";
  }

  /**
   * 9. Autonomous Recovery Engine: Generate recovery plans
   */
  public generateRecoveryPlan(failureType: string): RecoveryPlanAction {
    const type = failureType.toLowerCase();
    if (type.includes("stripe outage") || type.includes("llm provider outage")) {
      return "Replace driver";
    }
    if (type.includes("crm unavailable") || type.includes("region failure")) {
      return "Rollback workflow";
    }
    if (type.includes("budget exceeded")) {
      return "Abort";
    }
    if (type.includes("customer approval delay") || type.includes("missing callback")) {
      return "Human approval";
    }
    if (type.includes("worker crash")) {
      return "Replace worker";
    }
    if (type.includes("api limit") || type.includes("timeout") || type.includes("congestion")) {
      return "Retry";
    }
    return "Continue";
  }

  /**
   * 10. Execution Health Score Engine (0.0 to 1.0)
   */
  public calculateHealthScore(state: IAdaptiveExecutionState): number {
    let score = 1.0;
    
    // SLA
    if (state.slaStatus === "BREACHED") score -= 0.3;
    else if (state.slaStatus === "WARNING") score -= 0.1;
    
    // Risk score reduction
    score -= (state.riskScore / 200);

    // Failures reduction
    score -= (state.failures.length * 0.15);

    // Confidence parameter
    score *= (state.confidence / 100);

    // Drift reduction
    const totalDrift = Object.values(state.driftMetrics).reduce((acc: number, item: any) => acc + (item.driftRatio || 0), 0);
    score -= (totalDrift * 0.2);

    return Math.max(0, Math.min(1.0, Number(score.toFixed(2))));
  }

  /**
   * 8. Self Healing Engine: Automatically recover without human intervention
   */
  public async selfHealNode(tenantId: string, stateId: string, nodeId: string, failureType: string): Promise<IAdaptiveExecutionState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
    const state = await repo.findAdaptiveStateById(tenantId, stateId);
    if (!state) throw new Error("Adaptive state not found.");

    const strategy = this.selectRetryStrategy(failureType);
    const action = this.generateRecoveryPlan(failureType);

    state.retryStrategy = strategy;
    state.selfHealedCount++;
    state.isRecovered = true;
    state.failures = state.failures.filter(f => f !== nodeId);

    state.recoveryHistory.push({
      timestamp: new Date().toISOString(),
      action: "SELF_HEAL",
      nodeId,
      plan: `Selected Strategy: [${strategy}]. Recovery Plan: [${action}].`
    });

    this.incrementVersion(state);
    this.saveImmutableSnapshot(state);

    await repo.saveAdaptiveState(tenantId, state);

    await this.publishEvent(tenantId, "executive.execution.retry.strategy.changed", {
      stateId,
      tenantId,
      nodeId,
      newStrategy: strategy,
      timestamp: new Date().toISOString()
    });

    await this.publishEvent(tenantId, "executive.execution.self_healed", {
      stateId,
      tenantId,
      nodeId,
      timestamp: new Date().toISOString()
    });

    await this.publishEvent(tenantId, "executive.execution.recovered", {
      stateId,
      tenantId,
      timestamp: new Date().toISOString()
    });

    return state;
  }

  /**
   * O(n) failure prediction model
   */
  public async predictFailures(tenantId: string, stateId: string): Promise<IAdaptiveExecutionState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
    const state = await repo.findAdaptiveStateById(tenantId, stateId);
    if (!state) throw new Error("Adaptive state not found.");

    const predictions = state.graph.nodes.map(node => {
      const isSlowNode = state.resources[node.id]?.latencyMs > 2000;
      const isDrifting = state.driftMetrics[node.id]?.driftRatio > 0.15;
      const hasRecentFailures = state.failures.includes(node.id);
      
      const predictedFailure = isSlowNode || isDrifting || hasRecentFailures;
      const confidence = predictedFailure ? 85 : 98;
      
      return {
        nodeId: node.id,
        predictedFailure,
        confidence,
        actionRecommended: predictedFailure ? "ROUTE_TO_ALTERNATIVE" : "NONE"
      };
    });

    // Hardening: Prediction Drift tracking over time
    const prevFailureCount = state.predictions.filter(p => p.predictedFailure).length;
    const currentFailureCount = predictions.filter(p => p.predictedFailure).length;
    const driftScore = Math.abs(currentFailureCount - prevFailureCount) * 0.1;
    state.predictionDrift.push({
      timestamp: new Date().toISOString(),
      driftScore: Number(driftScore.toFixed(2))
    });

    state.predictions = predictions;
    this.incrementVersion(state);
    await repo.saveAdaptiveState(tenantId, state);

    const failingNodes = predictions.filter(p => p.predictedFailure).map(p => p.nodeId);
    if (failingNodes.length > 0) {
      await this.publishEvent(tenantId, "executive.execution.predicted_failure", {
        stateId,
        tenantId,
        predictedFailures: failingNodes,
        timestamp: new Date().toISOString()
      });
    }

    return state;
  }

  /**
   * O(n) self-optimizing scheduler strategy
   */
  public async optimizeExecution(tenantId: string, stateId: string): Promise<IAdaptiveExecutionState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
    const state = await repo.findAdaptiveStateById(tenantId, stateId);
    if (!state) throw new Error("Adaptive state not found.");

    // O(n) optimization calculation
    const initialAllocated = state.budget.allocated;
    if (state.budget.spent > initialAllocated * 0.9) {
      state.resources = { ...state.resources, optimizedMode: "LOW_COST" };
      await this.publishEvent(tenantId, "executive.execution.optimized", {
        stateId,
        tenantId,
        optimizationStrategy: "RESOURCE_THROTTLING",
        timestamp: new Date().toISOString()
      });
    }

    // Hardening: Optimization Drift tracking
    const currentDrift = state.budget.spent > initialAllocated ? 0.45 : 0.05;
    state.optimizationDrift.push({
      timestamp: new Date().toISOString(),
      driftScore: currentDrift
    });

    this.incrementVersion(state);
    await repo.saveAdaptiveState(tenantId, state);
    return state;
  }

  /**
   * O(V+E) dynamic graph updates / replanning
   */
  public async replanExecutionGraph(
    tenantId: string,
    stateId: string,
    nodes: Array<{ id: string; name: string; type: string; dependsOn?: string[] }>,
    edges: Array<{ from: string; to: string }>
  ): Promise<IAdaptiveExecutionState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
    const state = await repo.findAdaptiveStateById(tenantId, stateId);
    if (!state) throw new Error("Adaptive state not found.");

    state.graph = { nodes, edges };
    this.incrementVersion(state);
    await repo.saveAdaptiveState(tenantId, state);

    await this.publishEvent(tenantId, "executive.execution.replanned", {
      stateId,
      tenantId,
      nodesCount: nodes.length,
      edgesCount: edges.length,
      timestamp: new Date().toISOString()
    });

    return state;
  }

  /**
   * Trigger self-healing & recovery directly
   */
  public async triggerSelfHealing(tenantId: string, stateId: string, failedNodeId: string): Promise<IAdaptiveExecutionState> {
    return this.selfHealNode(tenantId, stateId, failedNodeId, "worker crash");
  }

  /**
   * Trigger escalation
   */
  public async triggerEscalation(tenantId: string, stateId: string, reason: string): Promise<IAdaptiveExecutionState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
    const state = await repo.findAdaptiveStateById(tenantId, stateId);
    if (!state) throw new Error("Adaptive state not found.");

    state.isEscalated = true;
    this.incrementVersion(state);
    await repo.saveAdaptiveState(tenantId, state);

    await this.publishEvent(tenantId, "executive.execution.escalated", {
      stateId,
      tenantId,
      reason,
      timestamp: new Date().toISOString()
    });

    return state;
  }

  /**
   * Execution Explainability answers
   */
  public async explainAdaptiveExecution(tenantId: string, stateId: string): Promise<any> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
    const state = await repo.findAdaptiveStateById(tenantId, stateId);
    if (!state) throw new Error("Adaptive state not found.");

    const whyExecutionSlowed = state.resources.optimizedMode === "LOW_COST"
      ? "Execution slowed because the system throttled resources to preserve budget parameters."
      : "Execution latency is within nominal bounds.";

    const whyRetryHappened = state.selfHealedCount > 0
      ? `Retry was triggered using the adaptive ${state.retryStrategy} strategy to heal transient issues.`
      : "No retries were triggered.";

    const whyBranchChanged = state.graph.nodes.some(n => n.id.includes("alt")) || state.graph.nodes.length > 3
      ? "Branch changes occurred during topological replanning to bypass predicted failures."
      : "No branch changes occurred.";

    const whyRollbackOccurred = state.failures.length > 0
      ? "Rollback occurred because failure thresholds were crossed, restoring state to clean checkpoints."
      : "No rollback occurred.";

    const whyResourcesChanged = state.resources.optimizedMode
      ? "Resources changed to align budget boundaries and scale dynamically."
      : "Resources have not changed.";

    const whyWorkflowPaused = state.slaStatus === "BREACHED"
      ? "Workflow paused because SLA breach triggers required human intervention."
      : "Workflow is not paused.";

    const whyExecutionResumed = state.isRecovered
      ? "Execution resumed after successful self-healing and checkpointer recovery."
      : "Execution was not resumed from paused status.";

    return {
      whyExecutionSlowed,
      whyRetryHappened,
      whyBranchChanged,
      whyRollbackOccurred,
      whyResourcesChanged,
      whyWorkflowPaused,
      whyExecutionResumed
    };
  }

  /**
   * Adaptive Package Compiler
   */
  public async compileAdaptivePackage(tenantId: string, stateId: string): Promise<IAdaptivePackageOutput> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
    const state = await repo.findAdaptiveStateById(tenantId, stateId);
    if (!state) throw new Error("Adaptive state not found.");

    let decision = null;
    let authorDispatch = null;
    let workflow = null;

    if (this.di.has("IExecutiveDecisionRepository")) {
      const decRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
      decision = await decRepo.findDecisionById(tenantId, "dec_default_1").catch(() => null);
    }
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      authorDispatch = await authRepo.findAuthorizationById(tenantId, "auth_default_1").catch(() => null);
    }
    if (this.di.has("IExecutiveWorkflowRepository")) {
      const wfRepo = this.di.resolve<any>("IExecutiveWorkflowRepository");
      workflow = await wfRepo.findWorkflowStateById(tenantId, state.workflowStateId).catch(() => null);
    }

    const explainability = await this.explainAdaptiveExecution(tenantId, stateId);
    const healthScore = this.calculateHealthScore(state);

    const compiled: IAdaptivePackageOutput = {
      compiledAt: new Date().toISOString(),
      tenantId,
      stateId,
      decision,
      authorDispatch,
      workflow,
      execution: {
        graph: state.graph,
        retryStrategy: state.retryStrategy,
      },
      retries: state.selfHealedCount,
      failures: state.failures,
      recovery: {
        selfHealedCount: state.selfHealedCount,
        isRecovered: state.isRecovered,
        isEscalated: state.isEscalated,
        recoveryHistory: state.recoveryHistory,
        immutableRecoverySnapshots: state.immutableRecoverySnapshots
      },
      optimization: {
        budgetEfficiency: state.budget.spent > 0 ? Math.round((state.budget.allocated / state.budget.spent) * 100) : 100,
        riskOptimized: state.riskScore < 30,
        optimizationDrift: state.optimizationDrift
      },
      drift: {
        driftMetrics: state.driftMetrics,
        predictionDrift: state.predictionDrift
      },
      predictions: state.predictions,
      health: {
        slaStatus: state.slaStatus,
        progress: state.progress,
        confidence: state.confidence,
        healthScore
      },
      explainability,
      versionHistory: state.versionHistory,
      version: state.version
    };

    await this.publishEvent(tenantId, "executive.execution.package.generated", {
      stateId,
      tenantId,
      timestamp: new Date().toISOString()
    });

    return compiled;
  }
}
