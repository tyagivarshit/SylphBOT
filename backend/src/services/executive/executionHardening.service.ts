import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import { IExecutionContext, IExecutionSnapshot, IExecutionHistoryEntry, IExecutiveExecutionRepository, IExecutionExplainability } from "./execution.service";
import * as crypto from "crypto";

// ============================================================================
// HARDENING INTERFACES & REPORT STRUCTURES
// ============================================================================

export interface IExecutionIntegrityReport {
  isValid: boolean;
  issues: string[];
  checksRun: {
    decisionChecked: boolean;
    authorizationChecked: boolean;
    dispatchChecked: boolean;
    crossTenantChecked: boolean;
    dependencyGraphChecked: boolean;
  };
  timestamp: string;
}

export interface IExecutionDriftReport {
  isDrifted: boolean;
  driftMetrics: {
    timelineDriftMs: number;
    policyViolationsCount: number;
    budgetOverrun: number;
    riskScoreDrift: number;
    dependencyFailedCount: number;
    authorizationDriftDetected: boolean;
    dispatchDriftDetected: boolean;
  };
  details: string[];
  timestamp: string;
}

export interface IExecutionExplainabilityReport {
  whyExists: string;
  whyCurrentState: string;
  whyBlocked: string;
  whyWaiting: string;
  whyUnstable: string;
  whyFailed: string;
  whyReady: string;
  whyOwnerChanged: string;
  whyRollbackRequired: string;
  whyRetryRequired: string;
  timestamp: string;
}

export interface IExecutionReadinessReport {
  isReady: boolean;
  score: number;
  checks: {
    contextValid: boolean;
    authorizationValid: boolean;
    dispatchValid: boolean;
    resourcesAllocated: boolean;
    constraintsMet: boolean;
  };
  timestamp: string;
}

export interface IExecutionStabilityReport {
  isStable: boolean;
  score: number;
  signals: {
    retryCount: number;
    failureRatio: number;
    latencySpikes: number;
    policyViolations: number;
  };
  timestamp: string;
}

export interface IExecutionHardeningRecord {
  id: string;
  tenantId: string;
  executionId: string;
  decisionId: string;
  status: "PENDING" | "VERIFIED" | "FAILED" | "DRIFTED" | "HARDENED";
  integrityReport?: IExecutionIntegrityReport;
  driftReport?: IExecutionDriftReport;
  readinessReport?: IExecutionReadinessReport;
  stabilityReport?: IExecutionStabilityReport;
  explainabilityReport?: IExecutionExplainabilityReport;
  traceLog?: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface IHardeningHistoryEntry {
  id: string;
  tenantId: string;
  hardeningId: string;
  previousStatus: string;
  newStatus: string;
  actorId: string;
  timestamp: string;
  reason: string;
}

// Immutable Hardening Package Compiler target
export interface IExecutionHardeningPackage {
  compiledAt: string;
  tenantId: string;
  executionId: string;
  decisionId: string;
  
  decision: any;
  evidence: any;
  evaluation: any;
  simulation: any;
  selection: any;
  authorization: any;
  dispatch: any;
  execution: IExecutionContext;
  snapshots: IExecutionSnapshot[];
  trace: any;
  ownership: any;
  readiness: IExecutionReadinessReport;
  stability: IExecutionStabilityReport;
  integrity: IExecutionIntegrityReport;
  drift: IExecutionDriftReport;
  explainability: IExecutionExplainabilityReport;
  history: IExecutionHistoryEntry[];
  metadata: Record<string, any>;
}

// ============================================================================
// HARDENING REPOSITORY INTERFACE
// ============================================================================

export interface IExecutiveExecutionHardeningRepository {
  saveHardeningRecord(tenantId: string, record: IExecutionHardeningRecord): Promise<void>;
  findHardeningRecordById(tenantId: string, id: string): Promise<IExecutionHardeningRecord | null>;
  findHardeningRecordByExecutionId(tenantId: string, executionId: string): Promise<IExecutionHardeningRecord | null>;
  saveHistory(tenantId: string, entry: IHardeningHistoryEntry): Promise<void>;
  getHistory(tenantId: string, hardeningId: string): Promise<IHardeningHistoryEntry[]>;
  saveSnapshot(tenantId: string, snapshot: IExecutionSnapshot): Promise<void>;
  getSnapshot(tenantId: string, executionId: string, snapshotId: string): Promise<IExecutionSnapshot | null>;
  listSnapshots(tenantId: string, executionId: string): Promise<IExecutionSnapshot[]>;
  deleteHardeningRecord(tenantId: string, id: string): Promise<void>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION (O(1) COMPLYING WITH CONTEXT ISOLATION)
// ============================================================================

export class MemoryExecutiveExecutionHardeningRepository implements IExecutiveExecutionHardeningRepository {
  private recordsDb = new Map<string, Map<string, IExecutionHardeningRecord>>();
  private historyDb = new Map<string, Map<string, IHardeningHistoryEntry[]>>();
  private snapshotsDb = new Map<string, Map<string, Map<string, IExecutionSnapshot>>>();

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

  public async saveHardeningRecord(tenantId: string, record: IExecutionHardeningRecord): Promise<void> {
    this.verifyTenant(tenantId, record.tenantId);
    if (!this.recordsDb.has(tenantId)) {
      this.recordsDb.set(tenantId, new Map());
    }
    this.recordsDb.get(tenantId)!.set(record.id, JSON.parse(JSON.stringify(record)));
  }

  public async findHardeningRecordById(tenantId: string, id: string): Promise<IExecutionHardeningRecord | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.recordsDb.get(tenantId);
    if (!tenantMap) return null;
    const item = tenantMap.get(id);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  public async findHardeningRecordByExecutionId(tenantId: string, executionId: string): Promise<IExecutionHardeningRecord | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.recordsDb.get(tenantId);
    if (!tenantMap) return null;
    for (const record of tenantMap.values()) {
      if (record.executionId === executionId) {
        return JSON.parse(JSON.stringify(record));
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IHardeningHistoryEntry): Promise<void> {
    this.verifyTenant(tenantId, entry.tenantId);
    if (!this.historyDb.has(tenantId)) {
      this.historyDb.set(tenantId, new Map());
    }
    const tenantMap = this.historyDb.get(tenantId)!;
    if (!tenantMap.has(entry.hardeningId)) {
      tenantMap.set(entry.hardeningId, []);
    }
    tenantMap.get(entry.hardeningId)!.push(JSON.parse(JSON.stringify(entry)));
  }

  public async getHistory(tenantId: string, hardeningId: string): Promise<IHardeningHistoryEntry[]> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.historyDb.get(tenantId);
    if (!tenantMap) return [];
    return JSON.parse(JSON.stringify(tenantMap.get(hardeningId) || []));
  }

  public async saveSnapshot(tenantId: string, snapshot: IExecutionSnapshot): Promise<void> {
    this.verifyTenant(tenantId, snapshot.tenantId);
    if (!this.snapshotsDb.has(tenantId)) {
      this.snapshotsDb.set(tenantId, new Map());
    }
    const tenantMap = this.snapshotsDb.get(tenantId)!;
    if (!tenantMap.has(snapshot.executionId)) {
      tenantMap.set(snapshot.executionId, new Map());
    }
    tenantMap.get(snapshot.executionId)!.set(snapshot.id, JSON.parse(JSON.stringify(snapshot)));
  }

  public async getSnapshot(tenantId: string, executionId: string, snapshotId: string): Promise<IExecutionSnapshot | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.snapshotsDb.get(tenantId);
    if (!tenantMap) return null;
    const execMap = tenantMap.get(executionId);
    if (!execMap) return null;
    const item = execMap.get(snapshotId);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  public async listSnapshots(tenantId: string, executionId: string): Promise<IExecutionSnapshot[]> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.snapshotsDb.get(tenantId);
    if (!tenantMap) return [];
    const execMap = tenantMap.get(executionId);
    if (!execMap) return [];
    return Array.from(execMap.values()).map(x => JSON.parse(JSON.stringify(x)));
  }

  public async deleteHardeningRecord(tenantId: string, id: string): Promise<void> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.recordsDb.get(tenantId);
    if (tenantMap) {
      tenantMap.delete(id);
    }
  }
}

// ============================================================================
// EXECUTIVE EXECUTION HARDENING SERVICE
// ============================================================================

export class ExecutiveExecutionHardeningService {
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

  private async recordHistory(
    tenantId: string,
    hardeningId: string,
    previousStatus: string,
    newStatus: string,
    actorId: string,
    reason: string
  ): Promise<void> {
    const repo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");
    const entry: IHardeningHistoryEntry = {
      id: `hhist_${crypto.randomUUID().replace(/-/g, "")}`,
      tenantId,
      hardeningId,
      previousStatus,
      newStatus,
      actorId,
      timestamp: new Date().toISOString(),
      reason
    };
    await repo.saveHistory(tenantId, entry);
  }

  private async getOrCreateHardeningRecord(tenantId: string, executionId: string, decisionId: string): Promise<IExecutionHardeningRecord> {
    const repo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");
    let record = await repo.findHardeningRecordByExecutionId(tenantId, executionId);
    if (!record) {
      record = {
        id: `ehard_${crypto.randomUUID().replace(/-/g, "")}`,
        tenantId,
        executionId,
        decisionId,
        status: "PENDING",
        traceLog: ["Hardening profile initialized."],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };
      await repo.saveHardeningRecord(tenantId, record);
      await this.recordHistory(tenantId, record.id, "NONE", "PENDING", "system", "Initialized hardening record.");
    }
    return record;
  }

  /**
   * 7. Execution Snapshot Engine - Generate Snapshot
   */
  public async createSnapshot(tenantId: string, executionId: string, metadata?: Record<string, any>): Promise<IExecutionSnapshot> {
    this.validateRequestContext(tenantId);
    
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");
    const hardeningRepo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");

    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) throw new Error(`Execution [${executionId}] not found.`);

    const now = new Date().toISOString();
    const snapshot: IExecutionSnapshot = {
      id: `snap_${crypto.randomUUID().replace(/-/g, "")}`,
      executionId,
      tenantId,
      timestamp: now,
      state: JSON.parse(JSON.stringify(exec)),
      metadata: metadata || {}
    };

    await hardeningRepo.saveSnapshot(tenantId, snapshot);

    await this.publishEvent(tenantId, "executive.execution.snapshot.created", {
      snapshotId: snapshot.id,
      executionId,
      tenantId,
      timestamp: now
    });

    return snapshot;
  }

  /**
   * 7. Execution Snapshot Engine - Point-in-Time Recovery
   */
  public async pointInTimeRecovery(tenantId: string, executionId: string, snapshotId: string): Promise<IExecutionContext> {
    this.validateRequestContext(tenantId);
    const hardeningRepo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");

    const snapshot = await hardeningRepo.getSnapshot(tenantId, executionId, snapshotId);
    if (!snapshot) throw new Error(`Snapshot [${snapshotId}] not found for execution [${executionId}].`);

    // Recovery is executed by updating the live execution context back to the snapshotted state
    const revertedContext = await executionService.updateExecution(tenantId, executionId, {
      status: snapshot.state.status,
      priority: snapshot.state.priority,
      metadata: snapshot.state.metadata,
      approver: snapshot.state.approver,
      action: "POINT_IN_TIME_RECOVERY",
      notes: `Reverted to snapshot tag: [${snapshotId}] created at [${snapshot.timestamp}].`
    });

    const record = await this.getOrCreateHardeningRecord(tenantId, executionId, revertedContext.decisionId);
    record.traceLog?.push(`Point-in-Time recovery executed using snapshot [${snapshotId}].`);
    record.updatedAt = new Date().toISOString();
    await hardeningRepo.saveHardeningRecord(tenantId, record);

    await this.publishEvent(tenantId, "executive.execution.integrity.updated", {
      executionId,
      tenantId,
      integrityStatus: "RECOVERED",
      timestamp: new Date().toISOString()
    });

    return revertedContext;
  }

  /**
   * 6. Execution Integrity Engine
   */
  public async verifyIntegrity(tenantId: string, executionId: string): Promise<IExecutionIntegrityReport> {
    this.validateRequestContext(tenantId);
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");

    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) throw new Error(`Execution [${executionId}] not found.`);

    const issues: string[] = [];
    const checks = {
      decisionChecked: false,
      authorizationChecked: false,
      dispatchChecked: false,
      crossTenantChecked: false,
      dependencyGraphChecked: false
    };

    // Decision Check
    if (this.di.has("IExecutiveDecisionRepository")) {
      checks.decisionChecked = true;
      const decRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
      const decision = await decRepo.findDecisionById(tenantId, exec.decisionId).catch(() => null);
      if (!decision) {
        issues.push(`Broken Reference: Decision [${exec.decisionId}] not found.`);
      } else {
        checks.crossTenantChecked = true;
        if (decision.tenantId !== tenantId) {
          issues.push(`Cross-Tenant Violation: Decision tenant [${decision.tenantId}] does not match execution tenant [${tenantId}].`);
        }
      }
    } else {
      issues.push("Missing Dependency: Decision repository is unavailable.");
    }

    // Authorization Check
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      checks.authorizationChecked = true;
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      const auth = await authRepo.findAuthorizationById(tenantId, exec.authorizationId).catch(() => null);
      if (!auth) {
        issues.push(`Broken Reference: Authorization [${exec.authorizationId}] not found.`);
      } else {
        if (auth.tenantId !== tenantId) {
          issues.push(`Cross-Tenant Violation: Authorization tenant [${auth.tenantId}] does not match execution tenant [${tenantId}].`);
        }
      }
    } else {
      issues.push("Missing Dependency: Authorization repository is unavailable.");
    }

    // Dispatch Check
    if (this.di.has("IExecutiveDecisionDispatchRepository")) {
      checks.dispatchChecked = true;
      const dispRepo = this.di.resolve<any>("IExecutiveDecisionDispatchRepository");
      const dispatch = await dispRepo.findDispatchById(tenantId, exec.dispatchId).catch(() => null);
      if (!dispatch) {
        issues.push(`Broken Reference: Dispatch [${exec.dispatchId}] not found.`);
      } else {
        if (dispatch.tenantId !== tenantId) {
          issues.push(`Cross-Tenant Violation: Dispatch tenant [${dispatch.tenantId}] does not match execution tenant [${tenantId}].`);
        }
        // Dependency Graph Check (O(V+E))
        if (dispatch.dependencyGraph) {
          checks.dependencyGraphChecked = true;
          const graph = dispatch.dependencyGraph;
          if (graph.hasCycle) {
            issues.push("Dependency Graph Cycle: Circular dependencies detected in execution routing graph.");
          }
          if (graph.nodes) {
            const nodeIds = new Set(graph.nodes.map((n: any) => n.id));
            if (graph.edges) {
              for (const edge of graph.edges) {
                if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
                  issues.push(`Broken Dependency link: edge [${edge.source} -> ${edge.target}] refers to non-existent nodes.`);
                }
              }
            }
          }
        }
      }
    } else {
      issues.push("Missing Dependency: Dispatch repository is unavailable.");
    }

    const isValid = issues.length === 0;

    const report: IExecutionIntegrityReport = {
      isValid,
      issues,
      checksRun: checks,
      timestamp: new Date().toISOString()
    };

    // Update hardening record
    const hardeningRepo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");
    const record = await this.getOrCreateHardeningRecord(tenantId, executionId, exec.decisionId);
    const oldStatus = record.status;
    record.status = isValid ? "VERIFIED" : "FAILED";
    record.integrityReport = report;
    record.traceLog?.push(`Integrity verification executed. Outcome: ${isValid ? "SUCCESS" : "FAILED"}. Issues count: ${issues.length}`);
    record.updatedAt = new Date().toISOString();
    await hardeningRepo.saveHardeningRecord(tenantId, record);

    if (record.status !== oldStatus) {
      await this.recordHistory(tenantId, record.id, oldStatus, record.status, "system", "Integrity report generated.");
    }

    await this.publishEvent(tenantId, "executive.execution.integrity.updated", {
      executionId,
      tenantId,
      integrityStatus: record.status,
      issuesCount: issues.length,
      timestamp: report.timestamp
    });

    return report;
  }

  /**
   * 8. Execution Drift Engine
   */
  public async detectDrift(tenantId: string, executionId: string): Promise<IExecutionDriftReport> {
    this.validateRequestContext(tenantId);
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");
    const hardeningRepo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");

    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) throw new Error(`Execution [${executionId}] not found.`);

    let timelineDriftMs = 0;
    let policyViolationsCount = 0;
    let budgetOverrun = 0;
    let riskScoreDrift = 0;
    let dependencyFailedCount = 0;
    let authorizationDriftDetected = false;
    let dispatchDriftDetected = false;
    const details: string[] = [];

    // Timeline drift: if running longer than expected
    if (exec.status === "RUNNING" && exec.startedAt) {
      const runTime = Date.now() - new Date(exec.startedAt).getTime();
      const maxWindowMs = exec.metadata?.maxWindowMs || 3600000; // default 1 hour limit
      if (runTime > maxWindowMs) {
        timelineDriftMs = runTime - maxWindowMs;
        details.push(`Timeline Drift: active runtime has exceeded maximum window budget by ${timelineDriftMs}ms.`);
      }
    }

    // Policy drift / boundary violations
    if (this.di.has("IExecutiveRepository")) {
      const execIdentityRepo = this.di.resolve<any>("IExecutiveRepository");
      // Find identity matching owner/role rules if exists
      const identity = await execIdentityRepo.getExecutive(tenantId, exec.owner).catch(() => null);
      if (identity?.dna?.boundaries) {
        for (const bound of identity.dna.boundaries) {
          if (bound.isHardLimit && exec.metadata?.bypassHardLimit) {
            policyViolationsCount++;
            details.push(`Policy Drift: hard boundary limit [${bound.rule}] bypassed.`);
          }
        }
      }
    }

    // Budget overruns
    const budgetAllocated = exec.metadata?.budgetAllocated || 0;
    const actualSpend = exec.metadata?.actualSpend || 0;
    if (actualSpend > budgetAllocated) {
      budgetOverrun = actualSpend - budgetAllocated;
      details.push(`Budget Drift: actual operational spend [$${actualSpend}] exceeds allocated [$${budgetAllocated}].`);
    }

    // Dependency health drift check
    if (exec.metadata?.dependenciesFailed) {
      dependencyFailedCount = exec.metadata.dependenciesFailed.length;
      details.push(`Dependency Drift: failed upstream dependency tasks count: [${dependencyFailedCount}].`);
    }

    // Risk threshold changes
    const initialRiskScore = exec.metadata?.initialRiskScore || 0.0;
    const currentRiskScore = exec.metadata?.currentRiskScore || initialRiskScore;
    if (currentRiskScore > initialRiskScore + 0.25) {
      riskScoreDrift = currentRiskScore - initialRiskScore;
      details.push(`Risk Drift: active execution risk score escalated by ${riskScoreDrift.toFixed(2)}.`);
    }

    // Authorization changes
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      const auth = await authRepo.findAuthorizationById(tenantId, exec.authorizationId).catch(() => null);
      if (auth && auth.status !== "AUTHORIZED") {
        authorizationDriftDetected = true;
        details.push(`Authorization Drift: authorization record changed status from AUTHORIZED to [${auth.status}].`);
      }
    }

    const isDrifted = details.length > 0;

    const report: IExecutionDriftReport = {
      isDrifted,
      driftMetrics: {
        timelineDriftMs,
        policyViolationsCount,
        budgetOverrun,
        riskScoreDrift,
        dependencyFailedCount,
        authorizationDriftDetected,
        dispatchDriftDetected
      },
      details,
      timestamp: new Date().toISOString()
    };

    // Update hardening record state
    const record = await this.getOrCreateHardeningRecord(tenantId, executionId, exec.decisionId);
    const oldStatus = record.status;
    if (isDrifted) {
      record.status = "DRIFTED";
    }
    record.driftReport = report;
    record.traceLog?.push(`Drift evaluation. Outcome: ${isDrifted ? "DRIFT_DETECTED" : "NOMINAL"}. Details count: ${details.length}`);
    record.updatedAt = new Date().toISOString();
    await hardeningRepo.saveHardeningRecord(tenantId, record);

    if (record.status !== oldStatus) {
      await this.recordHistory(tenantId, record.id, oldStatus, record.status, "system", "Drift detection report generated.");
    }

    if (isDrifted) {
      await this.publishEvent(tenantId, "executive.execution.drift.detected", {
        executionId,
        tenantId,
        driftDetails: details,
        timestamp: report.timestamp
      });
    }

    return report;
  }

  /**
   * 9. Execution Explainability Engine
   */
  public async generateHardeningExplainability(tenantId: string, executionId: string): Promise<IExecutionExplainabilityReport> {
    this.validateRequestContext(tenantId);
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");
    const hardeningRepo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");

    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) throw new Error(`Execution [${executionId}] not found.`);

    const record = await this.getOrCreateHardeningRecord(tenantId, executionId, exec.decisionId);

    // Why exists
    const whyExists = `Execution exists to fulfill decision [${exec.decisionId}] which was authorized and committed on tenant [${tenantId}].`;
    
    // Why current state
    const whyCurrentState = `Execution is currently [${exec.status}] because it completed the scheduled lifecycle transition from ${record.integrityReport?.isValid ? "verified parameters" : "pending parameters"}.`;

    // Why blocked
    const whyBlocked = exec.status === "PAUSED" || record.status === "DRIFTED" 
      ? `Execution is blocked due to active drift warnings: ${record.driftReport?.details?.join("; ") || "administrative pause"}.`
      : "Execution is not currently blocked.";

    // Why waiting
    const whyWaiting = exec.status === "WAITING_APPROVAL"
      ? "Execution is waiting for supervisor verification signatures on critical boundary overrides."
      : "Execution is not waiting for manual approvals.";

    // Why unstable
    const whyUnstable = record.status === "FAILED" || (record.driftReport?.driftMetrics.policyViolationsCount || 0) > 0
      ? `Execution is unstable due to verification failures or boundary violations: ${record.integrityReport?.issues?.join("; ") || ""}.`
      : "Execution stability index is nominal.";

    // Why failed
    const whyFailed = exec.status === "FAILED"
      ? `Execution failed due to unrecoverable system exception: ${exec.metadata?.failureReason || "N/A"}.`
      : "Execution has not entered a failed state.";

    // Why ready
    const whyReady = exec.status === "READY" || (record.integrityReport?.isValid && !record.driftReport?.isDrifted)
      ? "Execution is ready because all integrity, policy, and dispatch windows are verified."
      : "Execution validation parameters are still in review.";

    // Why owner changed
    const whyOwnerChanged = exec.metadata?.ownerChangedReason
      ? `Owner changed: ${exec.metadata.ownerChangedReason}`
      : "Ownership parameters are stable and have not changed.";

    // Why rollback required
    const whyRollbackRequired = exec.status === "ROLLBACK_PENDING" || record.status === "FAILED"
      ? "Rollback is required to prevent cross-tenant leakages or transaction integrity failures."
      : "Rollback operations are not required.";

    // Why retry required
    const whyRetryRequired = exec.status === "PAUSED" && (exec.metadata?.retryAttempts || 0) < 3
      ? "Retry is required to recover from temporary network or resource acquisition locks."
      : "Retry attempts are not scheduled.";

    const report: IExecutionExplainabilityReport = {
      whyExists,
      whyCurrentState,
      whyBlocked,
      whyWaiting,
      whyUnstable,
      whyFailed,
      whyReady,
      whyOwnerChanged,
      whyRollbackRequired,
      whyRetryRequired,
      timestamp: new Date().toISOString()
    };

    record.explainabilityReport = report;
    record.updatedAt = new Date().toISOString();
    await hardeningRepo.saveHardeningRecord(tenantId, record);

    return report;
  }

  /**
   * Calculate stability report
   */
  public async getStabilityReport(tenantId: string, executionId: string): Promise<IExecutionStabilityReport> {
    this.validateRequestContext(tenantId);
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");
    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) throw new Error(`Execution [${executionId}] not found.`);

    const retryCount = exec.metadata?.retryCount || 0;
    const policyViolations = exec.metadata?.policyViolationsCount || 0;
    const isUnstable = retryCount > 2 || policyViolations > 0;
    const score = Math.max(0, 100 - (retryCount * 15) - (policyViolations * 40));

    const report: IExecutionStabilityReport = {
      isStable: !isUnstable,
      score,
      signals: {
        retryCount,
        failureRatio: exec.status === "FAILED" ? 1.0 : 0.0,
        latencySpikes: exec.metadata?.latencySpikeCount || 0,
        policyViolations
      },
      timestamp: new Date().toISOString()
    };

    const hardeningRepo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");
    const record = await this.getOrCreateHardeningRecord(tenantId, executionId, exec.decisionId);
    record.stabilityReport = report;
    record.updatedAt = new Date().toISOString();
    await hardeningRepo.saveHardeningRecord(tenantId, record);

    await this.publishEvent(tenantId, "executive.execution.stability.updated", {
      executionId,
      tenantId,
      stabilityScore: score,
      timestamp: report.timestamp
    });

    return report;
  }

  /**
   * 10. Execution Hardening Package Compiler
   */
  public async compileExecutionHardeningPackage(tenantId: string, executionId: string): Promise<IExecutionHardeningPackage> {
    this.validateRequestContext(tenantId);
    
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");
    const hardeningRepo = this.di.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");

    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) throw new Error(`Execution [${executionId}] not found.`);

    // Run active verification and audits to populate reports
    const integrity = await this.verifyIntegrity(tenantId, executionId);
    const drift = await this.detectDrift(tenantId, executionId);
    const explainability = await this.generateHardeningExplainability(tenantId, executionId);
    const stability = await this.getStabilityReport(tenantId, executionId);
    
    const readiness: IExecutionReadinessReport = {
      isReady: integrity.isValid && !drift.isDrifted && exec.status !== "FAILED",
      score: integrity.isValid ? (drift.isDrifted ? 70 : 100) : 30,
      checks: {
        contextValid: true,
        authorizationValid: integrity.checksRun.authorizationChecked,
        dispatchValid: integrity.checksRun.dispatchChecked,
        resourcesAllocated: exec.metadata?.budgetAllocated !== undefined,
        constraintsMet: !drift.isDrifted
      },
      timestamp: new Date().toISOString()
    };

    // Retrieve references from dependencies
    let decision = null;
    if (this.di.has("IExecutiveDecisionRepository")) {
      const decRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
      decision = await decRepo.findDecisionById(tenantId, exec.decisionId).catch(() => null);
    }

    let evidence = null;
    if (this.di.has("IExecutiveEvidenceRepository")) {
      const evRepo = this.di.resolve<any>("IExecutiveEvidenceRepository");
      evidence = await evRepo.findEvidenceById(tenantId, exec.decisionId).catch(() => null);
    }

    let evaluation = null;
    if (this.di.has("IExecutiveDecisionEvaluationRepository")) {
      const evalRepo = this.di.resolve<any>("IExecutiveDecisionEvaluationRepository");
      evaluation = await evalRepo.findEvaluationByDecisionId(tenantId, exec.decisionId).catch(() => null);
    }

    let simulation = null;
    if (this.di.has("IExecutiveSimulationRepository")) {
      const simRepo = this.di.resolve<any>("IExecutiveSimulationRepository");
      simulation = await simRepo.findSimulationByDecisionId(tenantId, exec.decisionId).catch(() => null);
    }

    let selection = null;
    if (this.di.has("IExecutiveDecisionSelectionRepository")) {
      const selRepo = this.di.resolve<any>("IExecutiveDecisionSelectionRepository");
      const selections = await selRepo.getSelections(tenantId).catch(() => []);
      selection = selections.find((s: any) => s.decisionId === exec.decisionId) || null;
    }

    let authorization = null;
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      authorization = await authRepo.findAuthorizationById(tenantId, exec.authorizationId).catch(() => null);
    }

    let dispatch = null;
    if (this.di.has("IExecutiveDecisionDispatchRepository")) {
      const dispRepo = this.di.resolve<any>("IExecutiveDecisionDispatchRepository");
      dispatch = await dispRepo.findDispatchById(tenantId, exec.dispatchId).catch(() => null);
    }

    const snapshots = await hardeningRepo.listSnapshots(tenantId, executionId).catch(() => []);
    const history = await hardeningRepo.getHistory(tenantId, exec.id).catch(() => []);

    const trace = decision?.trace || null;
    const ownership = decision?.ownership || null;

    const record = await this.getOrCreateHardeningRecord(tenantId, executionId, exec.decisionId);
    record.status = readiness.isReady ? "HARDENED" : "FAILED";
    record.readinessReport = readiness;
    record.updatedAt = new Date().toISOString();
    await hardeningRepo.saveHardeningRecord(tenantId, record);

    const compiledPackage: IExecutionHardeningPackage = {
      compiledAt: new Date().toISOString(),
      tenantId,
      executionId,
      decisionId: exec.decisionId,
      
      decision,
      evidence,
      evaluation,
      simulation,
      selection,
      authorization,
      dispatch,
      execution: JSON.parse(JSON.stringify(exec)),
      snapshots,
      trace,
      ownership,
      readiness,
      stability,
      integrity,
      drift,
      explainability,
      history: history as any,
      metadata: {
        hardeningRecordId: record.id,
        hardeningStatus: record.status,
        traceLog: record.traceLog
      }
    };

    await this.publishEvent(tenantId, "executive.execution.hardening.completed", {
      executionId,
      tenantId,
      hardeningRecordId: record.id,
      status: record.status,
      timestamp: compiledPackage.compiledAt
    });

    return JSON.parse(JSON.stringify(compiledPackage));
  }
}
