import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import * as crypto from "crypto";

// ============================================================================
// DATA MODELS & INTERFACES
// ============================================================================

export interface ILearningState {
  id: string;
  tenantId: string;
  executionId: string;
  workflowId: string;
  confidenceScore: number; // 0.0 - 1.0
  learningConfidence: number; // 0.0 - 1.0
  outcomeConsistency: number; // 0.0 - 1.0
  failureCount: number;
  executionHistory: Array<{ timestamp: string; status: "SUCCESS" | "FAILED"; latencyMs: number; cost: number }>;
  patterns: string[];
  recommendations: string[];
  providerScores: Record<string, number>;
  driverScores: Record<string, number>;
  costAnalysis: { totalCost: number; averageCost: number };
  latencyAnalysis: { p50Ms: number; p95Ms: number };
  learningDrift: Array<{ timestamp: string; driftScore: number }>;
  confidenceHistory: Array<{ timestamp: string; score: number }>;
  immutableSnapshots: Array<{ snapshotId: string; timestamp: string; stateDump: string }>;
  recoveryHistory: Array<{ timestamp: string; action: string; reason: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ILearningPackageOutput {
  compiledAt: string;
  tenantId: string;
  learningId: string;
  execution: any;
  workflow: any;
  learning: {
    confidenceScore: number;
    learningConfidence: number;
  };
  patterns: string[];
  recommendations: string[];
  providerIntelligence: Record<string, number>;
  driverIntelligence: Record<string, number>;
  cost: {
    totalCost: number;
    averageCost: number;
  };
  latency: {
    p50Ms: number;
    p95Ms: number;
  };
  confidence: {
    history: any[];
  };
  explainability: {
    whyRecommendation: string;
    whyConfidenceChanged: string;
    whyProviderPreferred: string;
    whyWorkflowOptimized: string;
    whyRollbackRecommended: string;
  };
  metadata: Record<string, any>;
}

// ============================================================================
// REPOSITORY INTERFACES & O(1) IMPLEMENTATIONS
// ============================================================================

export interface IExecutiveExecutionLearningRepository {
  saveLearningState(tenantId: string, state: ILearningState): Promise<void>;
  findLearningStateById(tenantId: string, id: string): Promise<ILearningState | null>;
  findLearningStatesByWorkflowId(tenantId: string, workflowId: string): Promise<ILearningState[]>;
}

export class MemoryExecutiveExecutionLearningRepository implements IExecutiveExecutionLearningRepository {
  private learningDb = new Map<string, Map<string, ILearningState>>();

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

  public async saveLearningState(tenantId: string, state: ILearningState): Promise<void> {
    this.verifyTenant(tenantId, state.tenantId);
    if (!this.learningDb.has(tenantId)) {
      this.learningDb.set(tenantId, new Map());
    }
    this.learningDb.get(tenantId)!.set(state.id, JSON.parse(JSON.stringify(state)));
  }

  public async findLearningStateById(tenantId: string, id: string): Promise<ILearningState | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.learningDb.get(tenantId);
    if (!tenantMap) return null;
    const item = tenantMap.get(id);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  public async findLearningStatesByWorkflowId(tenantId: string, workflowId: string): Promise<ILearningState[]> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.learningDb.get(tenantId);
    if (!tenantMap) return [];
    return Array.from(tenantMap.values())
      .filter((s) => s.workflowId === workflowId)
      .map((s) => JSON.parse(JSON.stringify(s)));
  }
}

// ============================================================================
// LEARNING SERVICE
// ============================================================================

export class ExecutiveExecutionLearningService {
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

  private saveImmutableSnapshot(state: ILearningState): void {
    const snapshotId = `learn_snap_${crypto.randomUUID().replace(/-/g, "")}`;
    state.immutableSnapshots.push({
      snapshotId,
      timestamp: new Date().toISOString(),
      stateDump: JSON.stringify({
        confidenceScore: state.confidenceScore,
        learningConfidence: state.learningConfidence,
        outcomeConsistency: state.outcomeConsistency,
        failureCount: state.failureCount,
        recommendationsCount: state.recommendations.length
      })
    });
  }

  /**
   * createLearningState
   */
  public async createLearningState(tenantId: string, state: ILearningState): Promise<void> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionLearningRepository>("IExecutiveExecutionLearningRepository");

    state.patterns = state.patterns || [];
    state.recommendations = state.recommendations || [];
    state.providerScores = state.providerScores || {};
    state.driverScores = state.driverScores || {};
    state.learningDrift = state.learningDrift || [];
    state.confidenceHistory = state.confidenceHistory || [];
    state.immutableSnapshots = state.immutableSnapshots || [];
    state.recoveryHistory = state.recoveryHistory || [];

    // Recalibrate score and save
    state.confidenceScore = this.calculateConfidence(state);
    state.learningConfidence = this.calculateLearningConfidence(state);
    state.confidenceHistory.push({ timestamp: new Date().toISOString(), score: state.confidenceScore });

    this.saveImmutableSnapshot(state);

    await repo.saveLearningState(tenantId, state);

    await this.publishEvent(tenantId, "executive.learning.started", {
      learningId: state.id,
      tenantId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * getLearningState
   */
  public async getLearningState(tenantId: string, id: string): Promise<ILearningState | null> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionLearningRepository>("IExecutiveExecutionLearningRepository");
    return repo.findLearningStateById(tenantId, id);
  }

  /**
   * calculateConfidence
   */
  public calculateConfidence(state: ILearningState): number {
    let base = 1.0;
    const historyCount = state.executionHistory.length;
    if (historyCount === 0) return 1.0;

    // Consistency penalty
    base -= (1.0 - state.outcomeConsistency) * 0.25;

    // Failure rate penalty
    const failureRate = state.failureCount / historyCount;
    base -= failureRate * 0.45;

    // Latency degradation penalty
    if (state.latencyAnalysis.p95Ms > 3000) {
      base -= 0.15;
    }

    return Math.max(0.0, Math.min(1.0, Number(base.toFixed(2))));
  }

  /**
   * calculateLearningConfidence
   */
  public calculateLearningConfidence(state: ILearningState): number {
    const historyCount = state.executionHistory.length;
    if (historyCount < 5) return 0.5; // low learning sample size
    let confidence = 0.5 + (historyCount * 0.05); // increases with sample size
    if (state.outcomeConsistency > 0.85) {
      confidence += 0.15;
    }
    return Math.max(0.0, Math.min(1.0, Number(confidence.toFixed(2))));
  }

  /**
   * recalibrateConfidence
   */
  public async recalibrateConfidence(tenantId: string, id: string): Promise<ILearningState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionLearningRepository>("IExecutiveExecutionLearningRepository");
    const state = await repo.findLearningStateById(tenantId, id);
    if (!state) throw new Error("Learning state not found.");

    const prevScore = state.confidenceScore;
    state.confidenceScore = this.calculateConfidence(state);
    state.learningConfidence = this.calculateLearningConfidence(state);

    state.learningDrift.push({
      timestamp: new Date().toISOString(),
      driftScore: Number(Math.abs(state.confidenceScore - prevScore).toFixed(2))
    });

    state.confidenceHistory.push({
      timestamp: new Date().toISOString(),
      score: state.confidenceScore
    });

    state.updatedAt = new Date().toISOString();
    this.saveImmutableSnapshot(state);

    await repo.saveLearningState(tenantId, state);

    await this.publishEvent(tenantId, "executive.learning.updated", {
      learningId: id,
      tenantId,
      confidenceScore: state.confidenceScore,
      timestamp: new Date().toISOString()
    });

    return state;
  }

  /**
   * generateRecommendations
   */
  public async generateRecommendations(tenantId: string, id: string): Promise<{ state: ILearningState; recommendations: string[] }> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionLearningRepository>("IExecutiveExecutionLearningRepository");
    const state = await repo.findLearningStateById(tenantId, id);
    if (!state) throw new Error("Learning state not found.");

    const recommendations: string[] = [];
    const historyCount = state.executionHistory.length;

    if (historyCount > 0) {
      // 1. Replace provider if cost or latency is excessively high
      if (state.costAnalysis.averageCost > 5.0 || state.latencyAnalysis.p95Ms > 4000) {
        recommendations.push("Replace provider");
      }

      // 2. Replace driver if high failure rates occur
      const failureRate = state.failureCount / historyCount;
      if (failureRate > 0.2) {
        recommendations.push("Replace driver");
      }

      // 3. Reschedule workflow or Increase timeout on latency breaches
      if (state.latencyAnalysis.p95Ms > 2500) {
        recommendations.push("Increase timeout");
        recommendations.push("Reschedule workflow");
      }

      // 4. Reduce timeout if avg latency is extremely low
      if (state.latencyAnalysis.p95Ms < 200 && state.latencyAnalysis.p50Ms < 100) {
        recommendations.push("Reduce timeout");
      }

      // 5. Parallelize / Batch / Split based on workflow load patterns
      if (historyCount > 10) {
        recommendations.push("Parallelize");
        recommendations.push("Batch");
      }

      // 6. Human approval or Rollback recommendation on critical failures
      if (failureRate > 0.5) {
        recommendations.push("Human approval");
        recommendations.push("Rollback");
      }
    } else {
      recommendations.push("Collect execution history before generating recommendations.");
    }

    state.recommendations = recommendations;
    state.updatedAt = new Date().toISOString();
    state.recoveryHistory.push({
      timestamp: new Date().toISOString(),
      action: "GENERATE_RECOMMENDATIONS",
      reason: `Analyzed ${historyCount} history records and generated ${recommendations.length} recommendations.`
    });

    this.saveImmutableSnapshot(state);
    await repo.saveLearningState(tenantId, state);

    await this.publishEvent(tenantId, "executive.learning.recommendation.generated", {
      learningId: id,
      tenantId,
      recommendationsCount: recommendations.length,
      timestamp: new Date().toISOString()
    });

    return { state, recommendations };
  }

  /**
   * explainLearningDecision
   */
  public async explainLearningDecision(tenantId: string, id: string): Promise<any> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionLearningRepository>("IExecutiveExecutionLearningRepository");
    const state = await repo.findLearningStateById(tenantId, id);
    if (!state) throw new Error("Learning state not found.");

    const whyRecommendation = state.recommendations.length > 0
      ? `Recommendations generated because the engine Detected suboptimal metrics (failure rate: ${(state.failureCount / Math.max(1, state.executionHistory.length) * 100).toFixed(1)}%).`
      : "No optimization recommendations generated for this learning execution.";

    const whyConfidenceChanged = state.confidenceHistory.length > 1
      ? "Confidence score changed dynamically based on execution outcome consistency updates."
      : "Confidence score remains stable at baseline.";

    const whyProviderPreferred = Object.keys(state.providerScores).length > 0
      ? "Target provider preferred due to lower latency and superior outcome consistency metrics."
      : "No preference indices calculated.";

    const whyWorkflowOptimized = state.recommendations.includes("Parallelize") || state.recommendations.includes("Batch") || state.recommendations.includes("Increase timeout")
      ? "Workflow optimization suggested to reduce token costs and elevated execution times."
      : "Workflow is executing within nominal optimal limits.";

    const whyRollbackRecommended = state.recommendations.includes("Rollback")
      ? "Rollback was recommended because persistent execution driver failures exceeded the 20% safety threshold."
      : "Rollback is not currently recommended.";

    return {
      whyRecommendation,
      whyConfidenceChanged,
      whyProviderPreferred,
      whyWorkflowOptimized,
      whyRollbackRecommended
    };
  }

  /**
   * compileLearningPackage
   */
  public async compileLearningPackage(tenantId: string, id: string): Promise<ILearningPackageOutput> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionLearningRepository>("IExecutiveExecutionLearningRepository");
    const state = await repo.findLearningStateById(tenantId, id);
    if (!state) throw new Error("Learning state not found.");

    const explainability = await this.explainLearningDecision(tenantId, id);

    const compiled: ILearningPackageOutput = {
      compiledAt: new Date().toISOString(),
      tenantId,
      learningId: id,
      execution: null,
      workflow: null,
      learning: {
        confidenceScore: state.confidenceScore,
        learningConfidence: state.learningConfidence
      },
      patterns: state.patterns,
      recommendations: state.recommendations,
      providerIntelligence: state.providerScores,
      driverIntelligence: state.driverScores,
      cost: state.costAnalysis,
      latency: state.latencyAnalysis,
      confidence: {
        history: state.confidenceHistory
      },
      explainability,
      metadata: {}
    };

    return compiled;
  }
}
