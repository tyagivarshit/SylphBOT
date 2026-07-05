import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import { IDecision } from "./decisionIntelligence.service";
import { IExecutiveDecisionAuthorization } from "./decisionAuthorization.service";
import * as crypto from "crypto";

// ============================================================================
// STAGE 3.5H EXECUTIVE DECISION DISPATCH & ROUTING INTERFACES
// ============================================================================

export type DispatchLifecycleState =
  | "PENDING"
  | "ROUTING"
  | "QUEUED"
  | "DISPATCHED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "ARCHIVED";

export interface IDependencyGraph {
  nodes: Array<{ id: string; title: string; type: string }>;
  edges: Array<{ from: string; to: string; type: string }>;
  hasCycle: boolean;
  resolutionOrder: string[];
}

export interface IExecutionWindowResult {
  isValid: boolean;
  currentWindowStart?: string;
  currentWindowEnd?: string;
  nextAvailableExecutionTime?: string;
  explanation: string;
}

export interface IRoutingTargetResult {
  targetsResolved: Array<{
    targetSystem: string;
    routingType: "AGENT" | "SERVICE" | "WEBHOOK" | "MESSAGE_BUS";
    endpoint: string;
    priority: number;
  }>;
  explanation: string;
}

export interface IConstraintsGateResult {
  allConstraintsMet: boolean;
  concurrencyLimitCheck: { passed: boolean; max: number; active: number };
  systemLoadCheck: { passed: boolean; loadAverage: number };
  rateLimitCheck: { passed: boolean; allowedPerHour: number; activeCount: number };
  violations: string[];
}

export interface IRollbackPackage {
  rollbackId: string;
  canRollback: boolean;
  rollbackActions: string[];
  compensatingTransactions: Array<{
    stepIndex: number;
    action: string;
    payload: any;
    targetService: string;
  }>;
}

export interface IRollbackPreparation {
  rollbackPackage: IRollbackPackage;
  recoveryPackage: {
    maxRetries: number;
    retryBackoffMs: number;
    retryPolicyType: "EXPONENTIAL" | "LINEAR";
  };
  fallbackPackage: {
    fallbackExecutionChannel: string;
    alternativeExecutorContacts: string[];
    gracePeriodMs: number;
  };
  compensationPackage: {
    maxFinancialLossCovered: number;
    dataReconciliationQueries: string[];
  };
}

export interface IDispatchReadinessReport {
  isReady: boolean;
  dependencyStatus: { passed: boolean; unresolved: string[] };
  windowStatus: IExecutionWindowResult;
  routingStatus: IRoutingTargetResult;
  constraintsStatus: IConstraintsGateResult;
  explanation: string;
}

export interface IDispatchDriftReport {
  dispatchId: string;
  tenantId: string;
  hasDrift: boolean;
  driftIndicators: {
    dependencyDrift: number; // 0.0 - 1.0
    resourceDrift: number; // 0.0 - 1.0
    timelineDrift: number; // 0.0 - 1.0
    policyDrift: number; // 0.0 - 1.0
    riskDrift: number; // 0.0 - 1.0
    windowDrift: number; // 0.0 - 1.0
    dispatchDrift: number; // 0.0 - 1.0
  };
  details: string[];
  calculatedAt: string;
}

export interface IExecutionReadinessQualityScore {
  completenessScore: number;
  dependencyReadinessScore: number;
  riskReadinessScore: number;
  resourceReadinessScore: number;
  authorizationReadinessScore: number;
  dispatchQualityScore: number;
  rollbackReadinessScore: number;
  monitoringReadinessScore: number;
  explainabilityScore: number;
  overallScore: number;
}

export interface IExecutionExplainabilityReport {
  status: DispatchLifecycleState;
  stateExplanation: string;
  whyReady: boolean;
  whyBlocked: boolean;
  whyWaiting: boolean;
  whyDispatched: boolean;
  windowExplanation: string;
  routingExplanation: string;
}

export interface IExecutiveDecisionDispatch {
  id: string;
  tenantId: string;
  decisionId: string;
  authorizationId: string;
  status: DispatchLifecycleState;
  version: number;
  actorId: string;
  
  // Validation Results
  dependencyGraph?: IDependencyGraph;
  windowValidation?: IExecutionWindowResult;
  routingResult?: IRoutingTargetResult;
  constraintsGate?: IConstraintsGateResult;
  rollbackPackage?: IRollbackPackage;
  readinessReport?: IDispatchReadinessReport;
  
  // Explainability & Drift
  explainabilitySummary?: string;
  driftReport?: IDispatchDriftReport;
  
  // Hardened Locks
  isLocked: boolean;
  lockedAt?: string;
  lockedSnapshot?: string; // Serialized string of completed dispatch package
  
  createdAt: string;
  updatedAt: string;
}

export interface IDispatchHistoryEntry {
  id: string;
  tenantId: string;
  dispatchId: string;
  version: number;
  previousStatus: DispatchLifecycleState | "NONE";
  newStatus: DispatchLifecycleState;
  actorId: string;
  timestamp: string;
  reason: string;
  snapshot: IExecutiveDecisionDispatch;
}

// DELIVERABLE 7: Execution Package Compiler Structure
export interface IExecutionPackage {
  id: string;
  tenantId: string;
  decisionId: string;
  authorizationId: string;
  compiledAt: string;
  
  decision: any;
  authorization: any;
  evidence: any;
  alternatives: any;
  evaluation: any;
  simulation: any;
  selection: any;
  approval: {
    approverId: string;
    approvalChain: string[];
    signatureToken: string;
  };
  
  executionConstraints: IConstraintsGateResult;
  executionWindow: IExecutionWindowResult;
  dependencies: IDependencyGraph;
  rollbackReference: IRollbackPreparation;
  monitoringReference: {
    logTraceToken: string;
    auditTrail: Array<{
      timestamp: string;
      action: string;
      actorId: string;
      reason: string;
    }>;
  };
  dispatchTarget: IRoutingTargetResult;
}

// ============================================================================
// REPOSITORY INTERFACE & IMPLEMENTATION
// ============================================================================

export interface IExecutiveDecisionDispatchRepository {
  saveDispatch(tenantId: string, dispatch: IExecutiveDecisionDispatch): Promise<void>;
  findDispatchById(tenantId: string, id: string): Promise<IExecutiveDecisionDispatch | null>;
  findDispatchByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionDispatch | null>;
  saveHistory(tenantId: string, entry: IDispatchHistoryEntry): Promise<void>;
  getHistory(tenantId: string, dispatchId: string): Promise<IDispatchHistoryEntry[]>;
  saveSnapshot(tenantId: string, dispatchId: string, snapshot: IExecutiveDecisionDispatch): Promise<void>;
  getSnapshot(tenantId: string, dispatchId: string): Promise<IExecutiveDecisionDispatch | null>;
  deleteDispatch(tenantId: string, id: string): Promise<void>;
}

export class MemoryExecutiveDecisionDispatchRepository implements IExecutiveDecisionDispatchRepository {
  private dispatchesDb = new Map<string, Map<string, IExecutiveDecisionDispatch>>();
  private historyDb = new Map<string, Map<string, IDispatchHistoryEntry[]>>();
  private snapshotsDb = new Map<string, Map<string, IExecutiveDecisionDispatch>>();

  public async saveDispatch(tenantId: string, dispatch: IExecutiveDecisionDispatch): Promise<void> {
    this.verifyTenant(tenantId, dispatch.tenantId);
    if (!this.dispatchesDb.has(tenantId)) {
      this.dispatchesDb.set(tenantId, new Map());
    }
    this.dispatchesDb.get(tenantId)!.set(dispatch.id, JSON.parse(JSON.stringify(dispatch)));
  }

  public async findDispatchById(tenantId: string, id: string): Promise<IExecutiveDecisionDispatch | null> {
    const tenantMap = this.dispatchesDb.get(tenantId);
    if (!tenantMap) return null;
    const dispatch = tenantMap.get(id);
    if (!dispatch) return null;
    return JSON.parse(JSON.stringify(dispatch));
  }

  public async findDispatchByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionDispatch | null> {
    const tenantMap = this.dispatchesDb.get(tenantId);
    if (!tenantMap) return null;
    for (const dispatch of tenantMap.values()) {
      if (dispatch.decisionId === decisionId) {
        return JSON.parse(JSON.stringify(dispatch));
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IDispatchHistoryEntry): Promise<void> {
    this.verifyTenant(tenantId, entry.tenantId);
    if (!this.historyDb.has(tenantId)) {
      this.historyDb.set(tenantId, new Map());
    }
    const tenantMap = this.historyDb.get(tenantId)!;
    if (!tenantMap.has(entry.dispatchId)) {
      tenantMap.set(entry.dispatchId, []);
    }
    tenantMap.get(entry.dispatchId)!.push(JSON.parse(JSON.stringify(entry)));
  }

  public async getHistory(tenantId: string, dispatchId: string): Promise<IDispatchHistoryEntry[]> {
    const tenantMap = this.historyDb.get(tenantId);
    if (!tenantMap) return [];
    const history = tenantMap.get(dispatchId) || [];
    return JSON.parse(JSON.stringify(history));
  }

  public async saveSnapshot(tenantId: string, dispatchId: string, snapshot: IExecutiveDecisionDispatch): Promise<void> {
    this.verifyTenant(tenantId, snapshot.tenantId);
    if (!this.snapshotsDb.has(tenantId)) {
      this.snapshotsDb.set(tenantId, new Map());
    }
    this.snapshotsDb.get(tenantId)!.set(dispatchId, JSON.parse(JSON.stringify(snapshot)));
  }

  public async getSnapshot(tenantId: string, dispatchId: string): Promise<IExecutiveDecisionDispatch | null> {
    const tenantMap = this.snapshotsDb.get(tenantId);
    if (!tenantMap) return null;
    const snapshot = tenantMap.get(dispatchId);
    if (!snapshot) return null;
    return JSON.parse(JSON.stringify(snapshot));
  }

  public async deleteDispatch(tenantId: string, id: string): Promise<void> {
    const tenantMap = this.dispatchesDb.get(tenantId);
    if (tenantMap && tenantMap.has(id)) {
      tenantMap.delete(id);
    }
  }

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION (DECISION DISPATCH & ROUTING ENGINE)
// ============================================================================

export class ExecutiveDecisionDispatchService {
  constructor(private di: DIContainer = container) {}

  /**
   * Main entry point to initiate decision dispatch and routing.
   */
  public async dispatchDecision(
    tenantId: string,
    decisionId: string,
    actorId: string = "system"
  ): Promise<IExecutiveDecisionDispatch> {
    this.validateRequestContext(tenantId);

    const dispatchRepo = this.di.resolve<IExecutiveDecisionDispatchRepository>("IExecutiveDecisionDispatchRepository");
    const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
    
    if (!authRepo) {
      throw new Error("IExecutiveDecisionAuthorizationRepository not found in DI container.");
    }

    const authResult: IExecutiveDecisionAuthorization | null = await authRepo.findAuthorizationByDecisionId(tenantId, decisionId);
    if (!authResult || authResult.status !== "AUTHORIZED") {
      throw new Error(`Cannot dispatch decision [${decisionId}]: Authorization missing or status is [${authResult?.status || "NONE"}].`);
    }

    // Check if dispatch already exists
    let dispatch = await dispatchRepo.findDispatchByDecisionId(tenantId, decisionId);
    if (dispatch) {
      if (dispatch.isLocked) {
        return dispatch; // Locked state is immutable
      }
    } else {
      dispatch = {
        id: `disp_${crypto.randomUUID().replace(/-/g, "")}`,
        tenantId,
        decisionId,
        authorizationId: authResult.id,
        status: "PENDING",
        version: 1,
        actorId,
        isLocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await dispatchRepo.saveDispatch(tenantId, dispatch);
      
      await this.publishEvent(tenantId, "executive.dispatch.created", {
        dispatchId: dispatch.id,
        decisionId,
        tenantId,
        actorId,
        timestamp: new Date().toISOString()
      });
      await this.recordHistory(tenantId, dispatch, "NONE", "PENDING", actorId, "Dispatch record initialized.");
    }

    // Transitional state to ROUTING
    await this.updateStatus(tenantId, dispatch.id, "ROUTING", actorId, "Analyzing routing options.");

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error(`Decision [${decisionId}] not found.`);

    // O(V+E) dependency resolution
    const depGraph = await this.resolveDependencies(tenantId, decisionId);
    dispatch.dependencyGraph = depGraph;

    // O(n) readiness checks
    const windowVal = await this.checkWindow(tenantId, decisionId);
    dispatch.windowValidation = windowVal;

    const routingVal = await this.checkRouting(tenantId, decisionId);
    dispatch.routingResult = routingVal;

    const constraintsVal = await this.checkConstraints(tenantId, decisionId);
    dispatch.constraintsGate = constraintsVal;

    const rollbackVal = await this.compileRollbackPackage(tenantId, decisionId);
    dispatch.rollbackPackage = rollbackVal;

    const allPassed =
      !depGraph.hasCycle &&
      windowVal.isValid &&
      routingVal.targetsResolved.length > 0 &&
      constraintsVal.allConstraintsMet &&
      rollbackVal.canRollback;

    const readinessReport: IDispatchReadinessReport = {
      isReady: allPassed,
      dependencyStatus: { passed: !depGraph.hasCycle, unresolved: depGraph.hasCycle ? ["Cyclic dependency detected"] : [] },
      windowStatus: windowVal,
      routingStatus: routingVal,
      constraintsStatus: constraintsVal,
      explanation: allPassed
        ? "All dispatch gates (dependencies, execution windows, constraints, routing targets, rollback recovery) passed."
        : `Readiness check failed: ${[
            depGraph.hasCycle ? "Cyclic dependency" : null,
            !windowVal.isValid ? `Execution Window Violation (${windowVal.explanation})` : null,
            routingVal.targetsResolved.length === 0 ? "No Routing Targets" : null,
            !constraintsVal.allConstraintsMet ? `Constraints Breached (${constraintsVal.violations.join(", ")})` : null,
            !rollbackVal.canRollback ? "Rollback not supported" : null
          ].filter(Boolean).join("; ")}`
    };
    dispatch.readinessReport = readinessReport;
    dispatch.explainabilitySummary = readinessReport.explanation;

    if (allPassed) {
      dispatch.status = "QUEUED";
      dispatch.updatedAt = new Date().toISOString();
      await dispatchRepo.saveDispatch(tenantId, dispatch);
      
      await this.publishEvent(tenantId, "executive.dispatch.ready", {
        dispatchId: dispatch.id,
        decisionId,
        tenantId,
        actorId,
        timestamp: new Date().toISOString()
      });

      // Perform immutable lock
      await this.lockDispatch(tenantId, dispatch.id, actorId);

      // Transition to DISPATCHED state
      await this.updateStatus(tenantId, dispatch.id, "DISPATCHED", actorId, "Decision dispatched to execution target.");
      
      // Automatically trigger monitoring start when successfully dispatched
      if (this.di.has("IExecutiveDecisionMonitoringService")) {
        const monSrv = this.di.resolve<any>("IExecutiveDecisionMonitoringService");
        await monSrv.startMonitoring(tenantId, decisionId, actorId).catch(() => {});
      }
      
      return (await dispatchRepo.findDispatchById(tenantId, dispatch.id))!;
    } else {
      dispatch.status = "FAILED";
      dispatch.updatedAt = new Date().toISOString();
      await dispatchRepo.saveDispatch(tenantId, dispatch);
      
      await this.publishEvent(tenantId, "executive.dispatch.blocked", {
        dispatchId: dispatch.id,
        decisionId,
        tenantId,
        actorId,
        timestamp: new Date().toISOString()
      });
      await this.recordHistory(tenantId, dispatch, "ROUTING", "FAILED", actorId, "Readiness validation gates failed. Dispatch aborted.");
      
      return dispatch;
    }
  }

  /**
   * DELIVERABLE 14 Performance: Dependency Resolution O(V+E)
   */
  public async resolveDependencies(tenantId: string, decisionId: string): Promise<IDependencyGraph> {
    this.validateRequestContext(tenantId);
    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    
    const visited = new Map<string, "VISITING" | "VISITED">();
    const resolutionOrder: string[] = [];
    let hasCycle = false;

    const nodesMap = new Map<string, { id: string; title: string; type: string }>();
    const edges: Array<{ from: string; to: string; type: string }> = [];

    const dfs = async (currentId: string) => {
      if (hasCycle) return;
      if (visited.get(currentId) === "VISITING") {
        hasCycle = true;
        return;
      }
      if (visited.get(currentId) === "VISITED") {
        return;
      }

      visited.set(currentId, "VISITING");

      const dec = await decisionRepo.findDecisionById(tenantId, currentId).catch(() => null);
      if (dec) {
        nodesMap.set(currentId, { id: currentId, title: dec.title, type: dec.type });
        const deps = dec.plans || [];
        for (const depId of deps) {
          edges.push({ from: currentId, to: depId, type: "requires" });
          await dfs(depId);
        }
      }

      visited.set(currentId, "VISITED");
      resolutionOrder.push(currentId);
    };

    await dfs(decisionId);

    return {
      nodes: Array.from(nodesMap.values()),
      edges,
      hasCycle,
      resolutionOrder: resolutionOrder.reverse()
    };
  }

  /**
   * Execution Window check.
   */
  public async checkWindow(tenantId: string, decisionId: string): Promise<IExecutionWindowResult> {
    this.validateRequestContext(tenantId);
    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    if (decision.metadata?.complianceHold === true) {
      return {
        isValid: false,
        explanation: "Execution Window Blocked: Compliance Hold currently active on target business unit."
      };
    }

    if (decision.metadata?.boardDelayUntil) {
      const delayTime = new Date(decision.metadata.boardDelayUntil).getTime();
      if (delayTime > Date.now()) {
        return {
          isValid: false,
          nextAvailableExecutionTime: decision.metadata.boardDelayUntil,
          explanation: `Execution Window Blocked: Board-mandated delay until [${decision.metadata.boardDelayUntil}].`
        };
      }
    }

    if (decision.metadata?.budgetFreezeActive === true) {
      return {
        isValid: false,
        explanation: "Execution Window Blocked: Fiscal budget freeze active on target operations."
      };
    }

    const currentHour = new Date().getHours();
    const maintenanceWindow = decision.metadata?.maintenanceWindow || [2, 4];
    const isMaintenance = currentHour >= maintenanceWindow[0] && currentHour <= maintenanceWindow[1];

    if (isMaintenance && decision.type !== "Security") {
      return {
        isValid: false,
        explanation: "Execution Window Blocked: Maintenance window active. Non-emergency operations deferred."
      };
    }

    return {
      isValid: true,
      currentWindowStart: new Date().toISOString(),
      currentWindowEnd: new Date(Date.now() + 3600000).toISOString(),
      explanation: "Current time falls inside allowed operational execution window."
    };
  }

  /**
   * Routing targets check.
   */
  public async checkRouting(tenantId: string, decisionId: string): Promise<IRoutingTargetResult> {
    this.validateRequestContext(tenantId);
    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    const targets: IRoutingTargetResult["targetsResolved"] = [];

    if (decision.type === "Engineering" || decision.type === "Product") {
      targets.push({
        targetSystem: "automexia-engineering-dispatch",
        routingType: "SERVICE",
        endpoint: "/api/v1/dispatch/engineering",
        priority: 1
      });
    } else if (decision.type === "Hiring" || decision.type === "Operational") {
      targets.push({
        targetSystem: "automexia-hr-dispatch",
        routingType: "AGENT",
        endpoint: "exec_hr_agent",
        priority: 2
      });
    } else {
      targets.push({
        targetSystem: "automexia-core-worker",
        routingType: "MESSAGE_BUS",
        endpoint: "events.executive.dispatch",
        priority: 3
      });
    }

    if (decision.metadata?.emergencyIncident === true) {
      targets.unshift({
        targetSystem: "automexia-emergency-responder",
        routingType: "WEBHOOK",
        endpoint: "https://emergency.automexia.internal/hooks/override",
        priority: 0
      });
    }

    return {
      targetsResolved: targets,
      explanation: `Successfully resolved ${targets.length} dispatch target systems for category [${decision.type}].`
    };
  }

  /**
   * Constraints gate check.
   */
  public async checkConstraints(tenantId: string, decisionId: string): Promise<IConstraintsGateResult> {
    this.validateRequestContext(tenantId);
    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    const violations: string[] = [];
    const concurrencyActive = decision.metadata?.concurrencyActive || 2;
    const concurrencyMax = decision.metadata?.concurrencyMax || 10;
    const concurrencyPassed = concurrencyActive < concurrencyMax;
    if (!concurrencyPassed) violations.push("Concurrency limit breached");

    const systemLoad = decision.metadata?.systemLoad || 0.6;
    const systemLoadPassed = systemLoad < 0.9;
    if (!systemLoadPassed) violations.push("Host target system load average exceeds safety limit");

    const activeRate = decision.metadata?.activeRate || 15;
    const allowedRate = decision.metadata?.allowedRate || 100;
    const rateLimitPassed = activeRate < allowedRate;
    if (!rateLimitPassed) violations.push("Rate limit hourly capacity exhausted");

    const allConstraintsMet = violations.length === 0;

    return {
      allConstraintsMet,
      concurrencyLimitCheck: { passed: concurrencyPassed, max: concurrencyMax, active: concurrencyActive },
      systemLoadCheck: { passed: systemLoadPassed, loadAverage: systemLoad },
      rateLimitCheck: { passed: rateLimitPassed, allowedPerHour: allowedRate, activeCount: activeRate },
      violations
    };
  }

  /**
   * Rollback Package compilation.
   */
  public async compileRollbackPackage(tenantId: string, decisionId: string): Promise<IRollbackPackage> {
    this.validateRequestContext(tenantId);
    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    const canRollback = decision.metadata?.rollbackAvailable !== false;
    const rollbackActions = decision.metadata?.rollbackActions || ["budget:release", "planning:deactivate"];

    const compensatingTransactions = [
      {
        stepIndex: 1,
        action: "release_budget_reservation",
        payload: { amount: decision.metadata?.budget || 0 },
        targetService: "financialGovernanceOS"
      },
      {
        stepIndex: 2,
        action: "revert_plan_activation",
        payload: { planIds: decision.plans || [] },
        targetService: "planningGovernanceOS"
      }
    ];

    return {
      rollbackId: `roll_${crypto.randomUUID().replace(/-/g, "")}`,
      canRollback,
      rollbackActions,
      compensatingTransactions
    };
  }

  /**
   * DELIVERABLE 8: Rollback Preparation Engine
   */
  public async prepareRollback(tenantId: string, decisionId: string): Promise<IRollbackPreparation> {
    const rollbackPackage = await this.compileRollbackPackage(tenantId, decisionId);
    
    return {
      rollbackPackage,
      recoveryPackage: {
        maxRetries: 3,
        retryBackoffMs: 2000,
        retryPolicyType: "EXPONENTIAL"
      },
      fallbackPackage: {
        fallbackExecutionChannel: "human_review",
        alternativeExecutorContacts: ["exec_operations_director@automexia.com"],
        gracePeriodMs: 600000 // 10 minutes fallback window
      },
      compensationPackage: {
        maxFinancialLossCovered: 1000000,
        dataReconciliationQueries: ["SELECT * FROM ledger WHERE decision_id = ?;"]
      }
    };
  }

  /**
   * DELIVERABLE 9: Execution Explainability Engine
   */
  public async getExecutionExplainability(tenantId: string, dispatchId: string): Promise<IExecutionExplainabilityReport> {
    this.validateRequestContext(tenantId);
    const dispatchRepo = this.di.resolve<IExecutiveDecisionDispatchRepository>("IExecutiveDecisionDispatchRepository");
    const dispatch = await dispatchRepo.findDispatchById(tenantId, dispatchId);
    if (!dispatch) throw new Error(`Dispatch [${dispatchId}] not found.`);

    const isReady = dispatch.readinessReport?.isReady || false;
    const isBlocked = dispatch.status === "FAILED";
    const isWaiting = dispatch.status === "PENDING" || dispatch.status === "ROUTING";
    const isDispatched = dispatch.status === "DISPATCHED";

    return {
      status: dispatch.status,
      stateExplanation: dispatch.explainabilitySummary || "Dispatch state analysis pending.",
      whyReady: isReady,
      whyBlocked: isBlocked,
      whyWaiting: isWaiting,
      whyDispatched: isDispatched,
      windowExplanation: dispatch.windowValidation?.explanation || "Execution timing window unverified.",
      routingExplanation: dispatch.routingResult?.explanation || "Routing targets unresolved."
    };
  }

  /**
   * DELIVERABLE 10: Execution Readiness Quality Engine
   */
  public async getExecutionReadinessQuality(tenantId: string, dispatchId: string): Promise<IExecutionReadinessQualityScore> {
    this.validateRequestContext(tenantId);
    const dispatchRepo = this.di.resolve<IExecutiveDecisionDispatchRepository>("IExecutiveDecisionDispatchRepository");
    const dispatch = await dispatchRepo.findDispatchById(tenantId, dispatchId);
    if (!dispatch) throw new Error(`Dispatch [${dispatchId}] not found.`);

    const hasGraph = !!dispatch.dependencyGraph;
    const hasWindow = !!dispatch.windowValidation;
    const hasRouting = !!dispatch.routingResult;
    const hasConstraints = !!dispatch.constraintsGate;
    const hasRollback = !!dispatch.rollbackPackage;
    const hasReadiness = !!dispatch.readinessReport;

    let completenessScore = 0.0;
    if (hasGraph) completenessScore += 0.2;
    if (hasWindow) completenessScore += 0.2;
    if (hasRouting) completenessScore += 0.2;
    if (hasConstraints) completenessScore += 0.2;
    if (hasRollback) completenessScore += 0.1;
    if (hasReadiness) completenessScore += 0.1;

    const dependencyReadinessScore = dispatch.dependencyGraph?.hasCycle ? 0.0 : 1.0;
    const riskReadinessScore = dispatch.readinessReport?.isReady ? 1.0 : 0.4;
    const resourceReadinessScore = dispatch.constraintsGate?.systemLoadCheck?.passed ? 1.0 : 0.2;
    const authorizationReadinessScore = dispatch.authorizationId ? 1.0 : 0.0;
    const dispatchQualityScore = (dispatch.routingResult?.targetsResolved?.length || 0) > 0 ? 1.0 : 0.0;
    const rollbackReadinessScore = dispatch.rollbackPackage?.canRollback ? 1.0 : 0.3;
    const monitoringReadinessScore = dispatch.isLocked ? 1.0 : 0.5;
    const explainabilityScore = dispatch.explainabilitySummary ? 1.0 : 0.1;

    const overallScore = (
      completenessScore +
      dependencyReadinessScore +
      riskReadinessScore +
      resourceReadinessScore +
      authorizationReadinessScore +
      dispatchQualityScore +
      rollbackReadinessScore +
      monitoringReadinessScore +
      explainabilityScore
    ) / 9.0;

    return {
      completenessScore,
      dependencyReadinessScore,
      riskReadinessScore,
      resourceReadinessScore,
      authorizationReadinessScore,
      dispatchQualityScore,
      rollbackReadinessScore,
      monitoringReadinessScore,
      explainabilityScore,
      overallScore
    };
  }

  /**
   * DELIVERABLE 7: Execution Package Compiler
   */
  public async compileExecutionPackage(
    tenantId: string,
    dispatchId: string
  ): Promise<IExecutionPackage> {
    this.validateRequestContext(tenantId);

    const dispatchRepo = this.di.resolve<IExecutiveDecisionDispatchRepository>("IExecutiveDecisionDispatchRepository");
    const dispatch = await dispatchRepo.findDispatchById(tenantId, dispatchId);
    if (!dispatch) throw new Error(`Dispatch [${dispatchId}] not found.`);

    const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
    const auth = await authRepo.findAuthorizationById(tenantId, dispatch.authorizationId);
    if (!auth) throw new Error("Authorization record missing.");

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, dispatch.decisionId);

    // Resolve snapshots from other modules if available
    let evidence = null;
    if (this.di.has("IExecutiveEvidenceRepository")) {
      const repo = this.di.resolve<any>("IExecutiveEvidenceRepository");
      evidence = await repo.findEvidenceById(tenantId, dispatch.decisionId).catch(() => null);
    }

    let alternatives = null;
    if (this.di.has("IExecutiveAlternativeRepository")) {
      const repo = this.di.resolve<any>("IExecutiveAlternativeRepository");
      alternatives = await repo.getAlternatives(tenantId).catch(() => []);
    }

    let evaluation = null;
    if (this.di.has("IExecutiveDecisionEvaluationRepository")) {
      const repo = this.di.resolve<any>("IExecutiveDecisionEvaluationRepository");
      evaluation = await repo.findEvaluationByDecisionId(tenantId, dispatch.decisionId).catch(() => null);
    }

    let simulation = null;
    if (this.di.has("IExecutiveSimulationService")) {
      const srv = this.di.resolve<any>("IExecutiveSimulationService");
      simulation = await srv.getSimulation(tenantId, dispatch.decisionId).catch(() => null);
    }

    let selection = null;
    if (this.di.has("IExecutiveDecisionSelectionRepository")) {
      const repo = this.di.resolve<any>("IExecutiveDecisionSelectionRepository");
      const selections = await repo.getSelections(tenantId).catch(() => []);
      selection = selections.find((s: any) => s.decisionId === dispatch.decisionId) || null;
    }

    const history = await dispatchRepo.getHistory(tenantId, dispatchId);
    const auditTrail = history.map(h => ({
      timestamp: h.timestamp,
      action: h.newStatus,
      actorId: h.actorId,
      reason: h.reason
    }));

    const rollbackReference = await this.prepareRollback(tenantId, dispatch.decisionId);

    return {
      id: dispatch.id,
      tenantId,
      decisionId: dispatch.decisionId,
      authorizationId: dispatch.authorizationId,
      compiledAt: new Date().toISOString(),
      
      decision,
      authorization: auth,
      evidence,
      alternatives,
      evaluation,
      simulation,
      selection,
      approval: {
        approverId: auth.actorId,
        approvalChain: auth.executionToken?.approvers || [],
        signatureToken: auth.executionToken?.signature || ""
      },
      
      executionConstraints: dispatch.constraintsGate || { allConstraintsMet: false, concurrencyLimitCheck: { passed: false, max: 0, active: 0 }, systemLoadCheck: { passed: false, loadAverage: 1.0 }, rateLimitCheck: { passed: false, allowedPerHour: 0, activeCount: 0 }, violations: [] },
      executionWindow: dispatch.windowValidation || { isValid: false, explanation: "Unverified" },
      dependencies: dispatch.dependencyGraph || { nodes: [], edges: [], hasCycle: false, resolutionOrder: [] },
      rollbackReference,
      monitoringReference: {
        logTraceToken: `trace_${crypto.randomUUID().replace(/-/g, "")}`,
        auditTrail
      },
      dispatchTarget: dispatch.routingResult || { targetsResolved: [], explanation: "Unverified" }
    };
  }

  /**
   * DELIVERABLE 18: Dispatch Drift Engine (Track without mutating original)
   */
  public calculateDispatchDrift(
    tenantId: string,
    dispatch: IExecutiveDecisionDispatch,
    currentDecisionState: IDecision
  ): IDispatchDriftReport {
    this.validateRequestContext(tenantId);
    this.verifyTenant(tenantId, dispatch.tenantId);
    this.verifyTenant(tenantId, currentDecisionState.tenantId);

    const details: string[] = [];
    
    // 1. Dependency Drift
    let dependencyDrift = 0.0;
    const currentPlans = currentDecisionState.plans || [];
    const originalOrder = dispatch.dependencyGraph?.resolutionOrder || [];
    const missingPlans = originalOrder.filter(p => !currentPlans.includes(p));
    if (missingPlans.length > 0) {
      dependencyDrift = 1.0;
      details.push(`Dependency Drift: Original execution plans [${missingPlans.join(", ")}] are no longer present.`);
    }

    // 2. Resource Drift
    let resourceDrift = 0.0;
    if (currentDecisionState.metadata?.hostSystemDegraded === true) {
      resourceDrift = 0.5;
      details.push("Resource Drift: Target host CPU/memory resource state degraded.");
    }

    // 3. Timeline Drift
    let timelineDrift = 0.0;
    const currentTimeline = currentDecisionState.metadata?.timelineImpactDays || 0;
    const originalTimeline = dispatch.readinessReport?.windowStatus?.isValid ? 30 : 0;
    if (originalTimeline > 0 && currentTimeline > originalTimeline) {
      timelineDrift = Math.min(1.0, (currentTimeline - originalTimeline) / originalTimeline);
      details.push(`Timeline Drift: Target execution path duration extended by ${currentTimeline - originalTimeline} days.`);
    }

    // 4. Policy Drift
    let policyDrift = 0.0;
    if (currentDecisionState.metadata?.gdprCompliant === false) {
      policyDrift = 1.0;
      details.push("Policy Drift: Target compliance GDPR requirements drifted to failed.");
    }

    // 5. Risk Drift
    let riskDrift = 0.0;
    const currentRisk = currentDecisionState.metadata?.riskIndex || 0.3;
    const originalRisk = 0.3;
    if (currentRisk > originalRisk + 0.1) {
      riskDrift = Math.min(1.0, currentRisk - originalRisk);
      details.push(`Risk Drift: Residual risk escalated from ${originalRisk} to ${currentRisk}.`);
    }

    // 6. Window Drift
    let windowDrift = 0.0;
    if (currentDecisionState.metadata?.complianceHold === true) {
      windowDrift = 1.0;
      details.push("Window Drift: Current execution window locked due to compliance hold.");
    }

    // 7. Dispatch Drift
    let dispatchDrift = 0.0;
    if (currentDecisionState.ownership?.responsibleExecutive !== dispatch.actorId && dispatch.actorId !== "system") {
      dispatchDrift = 0.8;
      details.push("Dispatch Drift: Execution dispatch actor role changed.");
    }

    const hasDrift = details.length > 0;

    return {
      dispatchId: dispatch.id,
      tenantId,
      hasDrift,
      driftIndicators: {
        dependencyDrift,
        resourceDrift,
        timelineDrift,
        policyDrift,
        riskDrift,
        windowDrift,
        dispatchDrift
      },
      details,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * DELIVERABLE 19: Immutable Lock snapshot
   */
  public async lockDispatch(
    tenantId: string,
    dispatchId: string,
    actorId: string
  ): Promise<void> {
    this.validateRequestContext(tenantId);
    const dispatchRepo = this.di.resolve<IExecutiveDecisionDispatchRepository>("IExecutiveDecisionDispatchRepository");
    
    const dispatch = await dispatchRepo.findDispatchById(tenantId, dispatchId);
    if (!dispatch) throw new Error("Dispatch record not found.");

    if (dispatch.isLocked) return;

    dispatch.isLocked = true;
    dispatch.lockedAt = new Date().toISOString();
    dispatch.version += 1;
    dispatch.updatedAt = new Date().toISOString();

    const snapshotObj = JSON.parse(JSON.stringify(dispatch));
    dispatch.lockedSnapshot = JSON.stringify(snapshotObj);

    await dispatchRepo.saveDispatch(tenantId, dispatch);
    await dispatchRepo.saveSnapshot(tenantId, dispatchId, dispatch);
    await this.recordHistory(tenantId, dispatch, "ROUTING", "QUEUED", actorId, "Dispatch configuration locked.");
  }

  /**
   * Retrospectives summary lookup.
   */
  public async dispatchSummary(tenantId: string, dispatchId: string): Promise<IExecutiveDecisionDispatch | null> {
    this.validateRequestContext(tenantId);
    const dispatchRepo = this.di.resolve<IExecutiveDecisionDispatchRepository>("IExecutiveDecisionDispatchRepository");
    return dispatchRepo.findDispatchById(tenantId, dispatchId);
  }

  // ============================================================================
  // INTERNAL PRIVATE HELPERS
  // ============================================================================

  private async updateStatus(
    tenantId: string,
    dispatchId: string,
    newStatus: DispatchLifecycleState,
    actorId: string,
    reason: string
  ): Promise<void> {
    const dispatchRepo = this.di.resolve<IExecutiveDecisionDispatchRepository>("IExecutiveDecisionDispatchRepository");
    const dispatch = await dispatchRepo.findDispatchById(tenantId, dispatchId);
    if (!dispatch) return;

    const previousStatus = dispatch.status;
    if (previousStatus === newStatus) return;

    dispatch.status = newStatus;
    dispatch.version += 1;
    dispatch.updatedAt = new Date().toISOString();
    await dispatchRepo.saveDispatch(tenantId, dispatch);

    await this.recordHistory(tenantId, dispatch, previousStatus, newStatus, actorId, reason);
  }

  private async recordHistory(
    tenantId: string,
    dispatch: IExecutiveDecisionDispatch,
    previousStatus: DispatchLifecycleState | "NONE",
    newStatus: DispatchLifecycleState,
    actorId: string,
    reason: string
  ): Promise<void> {
    const dispatchRepo = this.di.resolve<IExecutiveDecisionDispatchRepository>("IExecutiveDecisionDispatchRepository");
    const historyEntry: IDispatchHistoryEntry = {
      id: `hist_${crypto.randomUUID().replace(/-/g, "")}`,
      tenantId,
      dispatchId: dispatch.id,
      version: dispatch.version,
      previousStatus,
      newStatus,
      actorId,
      timestamp: new Date().toISOString(),
      reason,
      snapshot: JSON.parse(JSON.stringify(dispatch))
    };
    await dispatchRepo.saveHistory(tenantId, historyEntry);
  }

  private async publishEvent(tenantId: string, eventName: string, payload: any): Promise<void> {
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      if (eventBus) {
        await eventBus.publish(eventName, "1.0.0", payload, { tenantId }).catch(() => {});
      }
    }
  }

  private validateRequestContext(tenantId: string): void {
    const ctx = getRequestContext();
    if (ctx && ctx.tenantId && ctx.tenantId !== tenantId) {
      throw new Error(`Security Violation: Request tenant [${ctx.tenantId}] does not match target tenant [${tenantId}].`);
    }
  }

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
  }
}
