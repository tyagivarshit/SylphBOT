import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import { IDecision } from "./decisionIntelligence.service";
import * as crypto from "crypto";

// ============================================================================
// STAGE 3.5I EXECUTIVE DECISION MONITORING & AUDIT INTERFACES
// ============================================================================

export type MonitoringLifecycleState =
  | "ACTIVE"
  | "DRIFTED"
  | "WARNING"
  | "CRITICAL_ALERT"
  | "IN_RECOVERY"
  | "CLOSED"
  | "ARCHIVED";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ITrackedKPI {
  id: string;
  name: string;
  metricToken: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  deviation: number; // percentage variance
}

export interface ITrackedMilestone {
  id: string;
  title: string;
  status: "INCOMING" | "BLOCKED" | "COMPLETED";
  expectedCompletion: string;
  actualCompletion?: string;
}

export interface IMonitoringAlert {
  id: string;
  severity: AlertSeverity;
  source: string; // "KPI" | "TIMELINE" | "BUDGET" | "RISK" | "RESOURCE" | "POLICY" | "FAILURE"
  message: string;
  timestamp: string;
}

export interface IMonitoringDriftReport {
  id: string;
  dependencyDrift: number;
  resourceDrift: number;
  timelineDrift: number;
  policyDrift: number;
  riskDrift: number;
  windowDrift: number;
  dispatchDrift: number;
  hasDrift: boolean;
  details: string[];
  calculatedAt: string;
}

export interface IRecoveryPackage {
  recoveryId: string;
  recommendedAction: "AUTO_RECOVER" | "EXECUTIVE_REVIEW" | "BOARD_APPROVAL" | "ROLLBACK" | "EMERGENCY_INTERVENTION";
  explanation: string;
  compensatingSteps: string[];
  preparedAt: string;
}

export interface ITrendMetadata {
  status: "IMPROVING" | "STABLE" | "DECLINING" | "OSCILLATING" | "UNKNOWN";
  kpiTrend: string;
  healthTrend: string;
  explanation: string;
}

export interface IMonitoringExplainability {
  healthDecreaseReason?: string;
  kpiChangeReason?: string;
  driftIncreaseReason?: string;
  riskIncreaseReason?: string;
  alertFiredReason?: string;
  recoveryRecommendation?: string;
  statusChangeReason?: string;
}

export interface IExecutiveDecisionMonitoring {
  id: string;
  tenantId: string;
  decisionId: string;
  status: MonitoringLifecycleState;
  version: number;
  
  // Metrics & State Evolution (D3, D4, D5, D6)
  kpis: ITrackedKPI[];
  milestones: ITrackedMilestone[];
  completionPercentage: number;
  actualBudgetSpent: number;
  budgetCap: number;
  actualResourcesConsumed: Record<string, number>;
  alerts: IMonitoringAlert[];
  
  healthScore: number; // 0.0 - 1.0
  driftHistory: IMonitoringDriftReport[];
  recoveryPackage?: IRecoveryPackage;
  trend?: ITrendMetadata;
  explainability?: IMonitoringExplainability;
  
  // Audit & Snapshots (D19 Hardening)
  isLocked: boolean;
  lockedAt?: string;
  lockedSnapshot?: string; // Serialized immutable state string
  historicalKpis: Array<{ timestamp: string; kpis: ITrackedKPI[] }>;
  historicalHealth: Array<{ timestamp: string; score: number }>;
  historicalAlerts: IMonitoringAlert[];
  historicalTrends: Array<{ timestamp: string; trend: ITrendMetadata }>;
  
  createdAt: string;
  updatedAt: string;
}

export interface IMonitoringHistoryEntry {
  id: string;
  tenantId: string;
  monitoringId: string;
  version: number;
  previousStatus: MonitoringLifecycleState | "NONE";
  newStatus: MonitoringLifecycleState;
  actorId: string;
  timestamp: string;
  reason: string;
  snapshot: IExecutiveDecisionMonitoring;
}

// DELIVERABLE 12: Immutable Monitoring Package Compiler Output
export interface IMonitoringPackage {
  id: string;
  tenantId: string;
  decisionId: string;
  compiledAt: string;
  
  decision: any;
  evidence: any;
  evaluation: any;
  simulation: any;
  selection: any;
  authorization: any;
  dispatch: any;
  
  executionMetadata: {
    status: MonitoringLifecycleState;
    completionPercentage: number;
    budgetSpent: number;
    budgetCap: number;
    resourcesConsumed: Record<string, number>;
    milestones: ITrackedMilestone[];
  };
  
  kpis: ITrackedKPI[];
  alerts: IMonitoringAlert[];
  health: {
    score: number;
    historicalScores: Array<{ timestamp: string; score: number }>;
  };
  drift: {
    current: IMonitoringDriftReport | null;
    history: IMonitoringDriftReport[];
  };
  recovery: IRecoveryPackage | null;
  trend: ITrendMetadata | null;
  explainability: IMonitoringExplainability | null;
  signature: string;
}

// ============================================================================
// REPOSITORY INTERFACE & IMPLEMENTATION (DELIVERABLE 1)
// ============================================================================

export interface IExecutiveDecisionMonitoringRepository {
  saveMonitoring(tenantId: string, monitoring: IExecutiveDecisionMonitoring): Promise<void>;
  findMonitoringById(tenantId: string, id: string): Promise<IExecutiveDecisionMonitoring | null>;
  findMonitoringByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionMonitoring | null>;
  saveHistory(tenantId: string, entry: IMonitoringHistoryEntry): Promise<void>;
  getHistory(tenantId: string, monitoringId: string): Promise<IMonitoringHistoryEntry[]>;
  saveSnapshot(tenantId: string, monitoringId: string, snapshot: IExecutiveDecisionMonitoring): Promise<void>;
  getSnapshot(tenantId: string, monitoringId: string): Promise<IExecutiveDecisionMonitoring | null>;
  deleteMonitoring(tenantId: string, id: string): Promise<void>;
}

export class MemoryExecutiveDecisionMonitoringRepository implements IExecutiveDecisionMonitoringRepository {
  private monitoringsDb = new Map<string, Map<string, IExecutiveDecisionMonitoring>>();
  private historyDb = new Map<string, Map<string, IMonitoringHistoryEntry[]>>();
  private snapshotsDb = new Map<string, Map<string, IExecutiveDecisionMonitoring>>();

  public async saveMonitoring(tenantId: string, monitoring: IExecutiveDecisionMonitoring): Promise<void> {
    this.verifyTenant(tenantId, monitoring.tenantId);
    if (!this.monitoringsDb.has(tenantId)) {
      this.monitoringsDb.set(tenantId, new Map());
    }
    // Store deep cloned instance to guarantee immutability (without mutating original records)
    this.monitoringsDb.get(tenantId)!.set(monitoring.id, JSON.parse(JSON.stringify(monitoring)));
  }

  public async findMonitoringById(tenantId: string, id: string): Promise<IExecutiveDecisionMonitoring | null> {
    const tenantMap = this.monitoringsDb.get(tenantId);
    if (!tenantMap) return null;
    const item = tenantMap.get(id);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  public async findMonitoringByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionMonitoring | null> {
    const tenantMap = this.monitoringsDb.get(tenantId);
    if (!tenantMap) return null;
    for (const monitoring of tenantMap.values()) {
      if (monitoring.decisionId === decisionId) {
        return JSON.parse(JSON.stringify(monitoring));
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IMonitoringHistoryEntry): Promise<void> {
    this.verifyTenant(tenantId, entry.tenantId);
    if (!this.historyDb.has(tenantId)) {
      this.historyDb.set(tenantId, new Map());
    }
    const tenantMap = this.historyDb.get(tenantId)!;
    if (!tenantMap.has(entry.monitoringId)) {
      tenantMap.set(entry.monitoringId, []);
    }
    tenantMap.get(entry.monitoringId)!.push(JSON.parse(JSON.stringify(entry)));
  }

  public async getHistory(tenantId: string, monitoringId: string): Promise<IMonitoringHistoryEntry[]> {
    const tenantMap = this.historyDb.get(tenantId);
    if (!tenantMap) return [];
    const list = tenantMap.get(monitoringId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  public async saveSnapshot(tenantId: string, monitoringId: string, snapshot: IExecutiveDecisionMonitoring): Promise<void> {
    this.verifyTenant(tenantId, snapshot.tenantId);
    if (!this.snapshotsDb.has(tenantId)) {
      this.snapshotsDb.set(tenantId, new Map());
    }
    this.snapshotsDb.get(tenantId)!.set(monitoringId, JSON.parse(JSON.stringify(snapshot)));
  }

  public async getSnapshot(tenantId: string, monitoringId: string): Promise<IExecutiveDecisionMonitoring | null> {
    const tenantMap = this.snapshotsDb.get(tenantId);
    if (!tenantMap) return null;
    const snapshot = tenantMap.get(monitoringId);
    if (!snapshot) return null;
    return JSON.parse(JSON.stringify(snapshot));
  }

  public async deleteMonitoring(tenantId: string, id: string): Promise<void> {
    const tenantMap = this.monitoringsDb.get(tenantId);
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
// SERVICE IMPLEMENTATION (DECISION MONITORING & AUDIT SERVICE)
// ============================================================================

export class ExecutiveDecisionMonitoringService {
  constructor(private di: DIContainer = container) {}

  /**
   * Initializes a new decision monitoring tracking lifecycle context.
   */
  public async startMonitoring(
    tenantId: string,
    decisionId: string,
    actorId: string = "system"
  ): Promise<IExecutiveDecisionMonitoring> {
    this.validateRequestContext(tenantId);

    const monRepo = this.di.resolve<IExecutiveDecisionMonitoringRepository>("IExecutiveDecisionMonitoringRepository");
    
    // Check if already monitored
    let mon = await monRepo.findMonitoringByDecisionId(tenantId, decisionId);
    if (mon) {
      return mon;
    }

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    // Baseline KPIs from Decision DNA or details
    const kpis: ITrackedKPI[] = (decision.metadata?.kpis || [
      { id: "kpi_1", name: "Strategic Revenue", metricToken: "rev.strategic", targetValue: 100, currentValue: 100, unit: "k$", deviation: 0 }
    ]);

    const milestones: ITrackedMilestone[] = [
      { id: "mile_1", title: "Execution Setup", status: "INCOMING", expectedCompletion: new Date(Date.now() + 86400000).toISOString() },
      { id: "mile_2", title: "Milestone Core Integration", status: "INCOMING", expectedCompletion: new Date(Date.now() + 86400000 * 3).toISOString() }
    ];

    mon = {
      id: `mon_${crypto.randomUUID().replace(/-/g, "")}`,
      tenantId,
      decisionId,
      status: "ACTIVE",
      version: 1,
      kpis,
      milestones,
      completionPercentage: 0.0,
      actualBudgetSpent: 0.0,
      budgetCap: decision.metadata?.budget || 50000,
      actualResourcesConsumed: {},
      alerts: [],
      healthScore: 1.0,
      driftHistory: [],
      historicalKpis: [{ timestamp: new Date().toISOString(), kpis: JSON.parse(JSON.stringify(kpis)) }],
      historicalHealth: [{ timestamp: new Date().toISOString(), score: 1.0 }],
      historicalAlerts: [],
      historicalTrends: [],
      isLocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Calculate baseline trend, explainability
    mon.trend = await this.calculateTrend(tenantId, mon);
    mon.explainability = await this.explainMonitoring(tenantId, mon);

    await monRepo.saveMonitoring(tenantId, mon);
    
    await this.publishEvent(tenantId, "executive.monitoring.started", {
      monitoringId: mon.id,
      decisionId,
      tenantId,
      actorId,
      timestamp: new Date().toISOString()
    });

    await this.recordHistory(tenantId, mon, "NONE", "ACTIVE", actorId, "Decision monitoring initialized.");

    return mon;
  }

  /**
   * Updates monitored KPIs, actual expenditure, milestones status, and triggers sub-gates.
   */
  public async updateMonitoringMetrics(
    tenantId: string,
    monitoringId: string,
    updates: {
      kpiValues?: Record<string, number>;
      milestoneStatus?: Record<string, "INCOMING" | "BLOCKED" | "COMPLETED">;
      actualBudgetSpent?: number;
      actualResourcesConsumed?: Record<string, number>;
      hostSystemDegraded?: boolean;
    },
    actorId: string = "system"
  ): Promise<IExecutiveDecisionMonitoring> {
    this.validateRequestContext(tenantId);
    
    const monRepo = this.di.resolve<IExecutiveDecisionMonitoringRepository>("IExecutiveDecisionMonitoringRepository");
    const mon = await monRepo.findMonitoringById(tenantId, monitoringId);
    if (!mon) throw new Error("Monitoring record not found.");
    if (mon.isLocked) throw new Error("Cannot mutate locked monitoring record.");

    const previousStatus = mon.status;

    // 1. Update KPIs
    if (updates.kpiValues) {
      for (const kpi of mon.kpis) {
        if (updates.kpiValues[kpi.id] !== undefined) {
          kpi.currentValue = updates.kpiValues[kpi.id];
          const diff = kpi.targetValue - kpi.currentValue;
          kpi.deviation = kpi.targetValue > 0 ? (diff / kpi.targetValue) * 100 : 0;
        }
      }
      mon.historicalKpis.push({
        timestamp: new Date().toISOString(),
        kpis: JSON.parse(JSON.stringify(mon.kpis))
      });
    }

    // 2. Update Milestones & Completion Percentage
    if (updates.milestoneStatus) {
      for (const mile of mon.milestones) {
        if (updates.milestoneStatus[mile.id] !== undefined) {
          mile.status = updates.milestoneStatus[mile.id];
          if (mile.status === "COMPLETED") {
            mile.actualCompletion = new Date().toISOString();
          }
        }
      }
    }
    const completedCount = mon.milestones.filter(m => m.status === "COMPLETED").length;
    mon.completionPercentage = mon.milestones.length > 0 ? (completedCount / mon.milestones.length) * 100 : 100;

    // 3. Update Budget & Resources
    if (updates.actualBudgetSpent !== undefined) {
      mon.actualBudgetSpent = updates.actualBudgetSpent;
    }
    if (updates.actualResourcesConsumed) {
      mon.actualResourcesConsumed = { ...mon.actualResourcesConsumed, ...updates.actualResourcesConsumed };
    }

    // 4. Calculate Drift (D18 Mandatory Hardening)
    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, mon.decisionId);
    if (decision) {
      // Mock drift calculation based on updates
      const updatedDec = JSON.parse(JSON.stringify(decision));
      if (updates.hostSystemDegraded) {
        updatedDec.metadata.hostSystemDegraded = true;
      }
      
      const drift = await this.checkDrift(tenantId, mon.id, updatedDec);
      if (drift.hasDrift) {
        mon.driftHistory.push(drift);
        mon.status = "DRIFTED";
        
        await this.publishEvent(tenantId, "executive.monitoring.drift.detected", {
          monitoringId: mon.id,
          tenantId,
          details: drift.details,
          timestamp: new Date().toISOString()
        });
      }
    }

    // 5. Generate Alerts (D7 Alert Engine)
    const alertVal = await this.checkAlerts(tenantId, mon);
    mon.alerts = alertVal;
    if (alertVal.length > 0) {
      mon.historicalAlerts.push(...alertVal);
      const hasCritical = alertVal.some(a => a.severity === "CRITICAL" || a.severity === "HIGH");
      mon.status = hasCritical ? "CRITICAL_ALERT" : "WARNING";
      
      for (const alert of alertVal) {
        await this.publishEvent(tenantId, "executive.monitoring.alert.generated", {
          monitoringId: mon.id,
          alertId: alert.id,
          severity: alert.severity,
          message: alert.message,
          timestamp: alert.timestamp
        });
      }
    }

    // 6. Compute Health (D8 Decision Health Engine)
    mon.healthScore = await this.checkHealth(tenantId, mon);
    mon.historicalHealth.push({ timestamp: new Date().toISOString(), score: mon.healthScore });
    await this.publishEvent(tenantId, "executive.monitoring.health.updated", {
      monitoringId: mon.id,
      healthScore: mon.healthScore,
      timestamp: new Date().toISOString()
    });

    // 7. Recovery Readiness Engine (D9)
    if (mon.healthScore < 0.7) {
      mon.status = "IN_RECOVERY";
      mon.recoveryPackage = await this.checkRecovery(tenantId, mon);
    }

    // 8. Trend & Explainability (D10, D11)
    mon.trend = await this.calculateTrend(tenantId, mon);
    mon.historicalTrends.push({ timestamp: new Date().toISOString(), trend: mon.trend });
    mon.explainability = await this.explainMonitoring(tenantId, mon);

    mon.version += 1;
    mon.updatedAt = new Date().toISOString();

    await monRepo.saveMonitoring(tenantId, mon);
    
    await this.publishEvent(tenantId, "executive.monitoring.updated", {
      monitoringId: mon.id,
      tenantId,
      status: mon.status,
      timestamp: new Date().toISOString()
    });

    await this.recordHistory(tenantId, mon, previousStatus, mon.status, actorId, "Metrics updated.");

    return mon;
  }

  /**
   * DELIVERABLE 7: Alert Engine
   */
  public async checkAlerts(tenantId: string, monitoring: IExecutiveDecisionMonitoring): Promise<IMonitoringAlert[]> {
    this.validateRequestContext(tenantId);
    const alerts: IMonitoringAlert[] = [];

    // KPI deviations
    for (const kpi of monitoring.kpis) {
      if (Math.abs(kpi.deviation) > 20) {
        const severity: AlertSeverity = Math.abs(kpi.deviation) > 50 ? "CRITICAL" : "HIGH";
        alerts.push({
          id: `al_${crypto.randomUUID().replace(/-/g, "")}`,
          severity,
          source: "KPI",
          message: `KPI [${kpi.name}] variance exceeds safety margin: ${kpi.deviation.toFixed(1)}% deviation.`,
          timestamp: new Date().toISOString()
        });
      } else if (Math.abs(kpi.deviation) > 10) {
        alerts.push({
          id: `al_${crypto.randomUUID().replace(/-/g, "")}`,
          severity: "MEDIUM",
          source: "KPI",
          message: `KPI [${kpi.name}] drift noticed: ${kpi.deviation.toFixed(1)}% deviation.`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Timeline slips & blocked milestones
    const blockedCount = monitoring.milestones.filter(m => m.status === "BLOCKED").length;
    if (blockedCount > 0) {
      alerts.push({
        id: `al_${crypto.randomUUID().replace(/-/g, "")}`,
        severity: "CRITICAL",
        source: "TIMELINE",
        message: `${blockedCount} critical milestones currently BLOCKED. Timeline execution disrupted.`,
        timestamp: new Date().toISOString()
      });
    }

    // Budget overruns
    if (monitoring.actualBudgetSpent > monitoring.budgetCap) {
      alerts.push({
        id: `al_${crypto.randomUUID().replace(/-/g, "")}`,
        severity: "CRITICAL",
        source: "BUDGET",
        message: `Budget overrun: Actual spent $${monitoring.actualBudgetSpent} exceeds budget cap $${monitoring.budgetCap}.`,
        timestamp: new Date().toISOString()
      });
    } else if (monitoring.actualBudgetSpent > monitoring.budgetCap * 0.85) {
      alerts.push({
        id: `al_${crypto.randomUUID().replace(/-/g, "")}`,
        severity: "MEDIUM",
        source: "BUDGET",
        message: `Budget exhaustion warning: Spent $${monitoring.actualBudgetSpent} exceeds 85% of budget cap.`,
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  }

  /**
   * DELIVERABLE 8: Decision Health Engine
   */
  public async checkHealth(tenantId: string, monitoring: IExecutiveDecisionMonitoring): Promise<number> {
    this.validateRequestContext(tenantId);
    
    let businessWeight = 1.0;
    // KPI deviations reduce business health
    for (const kpi of monitoring.kpis) {
      if (Math.abs(kpi.deviation) > 15) {
        businessWeight -= 0.15;
      }
    }

    let timelineWeight = 1.0;
    const blocked = monitoring.milestones.filter(m => m.status === "BLOCKED").length;
    if (blocked > 0) timelineWeight -= 0.4 * blocked;

    let budgetWeight = 1.0;
    if (monitoring.actualBudgetSpent > monitoring.budgetCap) {
      budgetWeight = 0.3;
    } else if (monitoring.actualBudgetSpent > monitoring.budgetCap * 0.8) {
      budgetWeight = 0.7;
    }

    let driftWeight = 1.0;
    if (monitoring.driftHistory.length > 0) {
      driftWeight = 0.6;
    }

    const health = (businessWeight + timelineWeight + budgetWeight + driftWeight) / 4.0;
    return Math.max(0.0, Math.min(1.0, parseFloat(health.toFixed(3))));
  }

  /**
   * DELIVERABLE 9: Recovery Readiness Engine (Recovery package preparation)
   */
  public async checkRecovery(tenantId: string, monitoring: IExecutiveDecisionMonitoring): Promise<IRecoveryPackage> {
    this.validateRequestContext(tenantId);
    
    let action: IRecoveryPackage["recommendedAction"] = "AUTO_RECOVER";
    const steps: string[] = ["monitoring:log_recovery_triggered"];

    if (monitoring.actualBudgetSpent > monitoring.budgetCap) {
      action = "ROLLBACK";
      steps.push("financial:suspend_spending", "planning:trigger_rollback");
    } else if (monitoring.milestones.some(m => m.status === "BLOCKED")) {
      action = "EXECUTIVE_REVIEW";
      steps.push("workflow:alert_escalation_owner", "milestone:reschedule_deferred_tasks");
    } else if (monitoring.healthScore < 0.4) {
      action = "EMERGENCY_INTERVENTION";
      steps.push("infrastructure:trigger_circuit_breaker", "human:override_active_workers");
    }

    return {
      recoveryId: `rec_${crypto.randomUUID().replace(/-/g, "")}`,
      recommendedAction: action,
      explanation: `Recovery preparation prepared due to health score dropping to [${monitoring.healthScore}].`,
      compensatingSteps: steps,
      preparedAt: new Date().toISOString()
    };
  }

  /**
   * DELIVERABLE 10: Trend Analysis Engine
   */
  public async calculateTrend(tenantId: string, monitoring: IExecutiveDecisionMonitoring): Promise<ITrendMetadata> {
    this.validateRequestContext(tenantId);
    const healthHistory = monitoring.historicalHealth;
    if (healthHistory.length < 2) {
      return { status: "UNKNOWN", kpiTrend: "Unknown", healthTrend: "Unknown", explanation: "Insufficient historical data." };
    }

    const first = healthHistory[0].score;
    const last = healthHistory[healthHistory.length - 1].score;
    const delta = last - first;

    let status: ITrendMetadata["status"] = "STABLE";
    if (delta > 0.05) {
      status = "IMPROVING";
    } else if (delta < -0.05) {
      status = "DECLINING";
    }

    return {
      status,
      kpiTrend: delta > 0.05 ? "Improving KPI convergence" : delta < -0.05 ? "Declining KPI variance" : "Stable KPI trend",
      healthTrend: status,
      explanation: `Health score shifted from ${first} to ${last} over the course of ${healthHistory.length} checkpoints.`
    };
  }

  /**
   * DELIVERABLE 11: Monitoring Explainability Engine
   */
  public async explainMonitoring(
    tenantId: string,
    monitoring: IExecutiveDecisionMonitoring
  ): Promise<IMonitoringExplainability> {
    this.validateRequestContext(tenantId);

    const explain: IMonitoringExplainability = {
      statusChangeReason: `Monitoring status transitioned to [${monitoring.status}] at version [${monitoring.version}].`
    };

    if (monitoring.healthScore < 0.9) {
      explain.healthDecreaseReason = `Decision health reduced due to budget overruns or timeline deviations.`;
    }
    if (monitoring.alerts.length > 0) {
      explain.alertFiredReason = `Alerts triggered because of deviations exceeding defined safety indices.`;
    }
    if (monitoring.driftHistory.length > 0) {
      explain.driftIncreaseReason = `Drift escalated because of host resources or dependency plan adjustments.`;
    }
    if (monitoring.recoveryPackage) {
      explain.recoveryRecommendation = `Recovery recommended action: [${monitoring.recoveryPackage.recommendedAction}].`;
    }

    return explain;
  }

  /**
   * DELIVERABLE 18 / Stage 3.5I D18: Drift checking
   */
  public async checkDrift(
    tenantId: string,
    monitoringId: string,
    currentDecisionState: any
  ): Promise<IMonitoringDriftReport> {
    this.validateRequestContext(tenantId);
    
    const details: string[] = [];
    let resourceDrift = 0.0;
    let dependencyDrift = 0.0;

    if (currentDecisionState.metadata?.hostSystemDegraded === true) {
      resourceDrift = 0.6;
      details.push("Resource Drift: Infrastructure performance degradation detected on active hosts.");
    }
    
    const status = currentDecisionState.status;
    if (status === "DRIFTED" || currentDecisionState.metadata?.complianceHold === true) {
      dependencyDrift = 1.0;
      details.push("Dependency Drift: System configurations or compliance constraints modified.");
    }

    const hasDrift = details.length > 0;

    return {
      id: `dr_${crypto.randomUUID().replace(/-/g, "")}`,
      dependencyDrift,
      resourceDrift,
      timelineDrift: 0.0,
      policyDrift: 0.0,
      riskDrift: 0.0,
      windowDrift: 0.0,
      dispatchDrift: 0.0,
      hasDrift,
      details,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * DELIVERABLE 12: Monitoring Package Compiler
   */
  public async compileMonitoringPackage(
    tenantId: string,
    monitoringId: string
  ): Promise<IMonitoringPackage> {
    this.validateRequestContext(tenantId);
    
    const monRepo = this.di.resolve<IExecutiveDecisionMonitoringRepository>("IExecutiveDecisionMonitoringRepository");
    const monitoring = await monRepo.findMonitoringById(tenantId, monitoringId);
    if (!monitoring) throw new Error("Monitoring record not found.");

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, monitoring.decisionId);

    const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
    const auth = await authRepo.findAuthorizationByDecisionId(tenantId, monitoring.decisionId);

    const dispatchRepo = this.di.resolve<any>("IExecutiveDecisionDispatchRepository");
    const dispatch = await dispatchRepo.findDispatchByDecisionId(tenantId, monitoring.decisionId);

    // Resolve sibling module snapshots
    let evidence = null;
    if (this.di.has("IExecutiveEvidenceRepository")) {
      evidence = await this.di.resolve<any>("IExecutiveEvidenceRepository").findEvidenceById(tenantId, monitoring.decisionId).catch(() => null);
    }
    let evaluation = null;
    if (this.di.has("IExecutiveDecisionEvaluationRepository")) {
      evaluation = await this.di.resolve<any>("IExecutiveDecisionEvaluationRepository").findEvaluationByDecisionId(tenantId, monitoring.decisionId).catch(() => null);
    }
    let simulation = null;
    if (this.di.has("IExecutiveSimulationService")) {
      simulation = await this.di.resolve<any>("IExecutiveSimulationService").getSimulation(tenantId, monitoring.decisionId).catch(() => null);
    }
    let selection = null;
    if (this.di.has("IExecutiveDecisionSelectionRepository")) {
      const selections = await this.di.resolve<any>("IExecutiveDecisionSelectionRepository").getSelections(tenantId).catch(() => []);
      selection = selections.find((s: any) => s.decisionId === monitoring.decisionId) || null;
    }

    const currentDrift = monitoring.driftHistory.length > 0 ? monitoring.driftHistory[monitoring.driftHistory.length - 1] : null;

    const payload = `${tenantId}:${monitoring.id}:${monitoring.healthScore}:${monitoring.status}`;
    const signature = crypto.createHmac("sha256", "automexia-system-secret").update(payload).digest("hex");

    return {
      id: monitoring.id,
      tenantId,
      decisionId: monitoring.decisionId,
      compiledAt: new Date().toISOString(),
      
      decision,
      evidence,
      evaluation,
      simulation,
      selection,
      authorization: auth,
      dispatch,
      
      executionMetadata: {
        status: monitoring.status,
        completionPercentage: monitoring.completionPercentage,
        budgetSpent: monitoring.actualBudgetSpent,
        budgetCap: monitoring.budgetCap,
        resourcesConsumed: monitoring.actualResourcesConsumed,
        milestones: monitoring.milestones
      },
      
      kpis: monitoring.kpis,
      alerts: monitoring.alerts,
      health: {
        score: monitoring.healthScore,
        historicalScores: monitoring.historicalHealth
      },
      drift: {
        current: currentDrift,
        history: monitoring.driftHistory
      },
      recovery: monitoring.recoveryPackage || null,
      trend: monitoring.trend || null,
      explainability: monitoring.explainability || null,
      signature
    };
  }

  /**
   * Close monitoring tracking, locks execution packages and archives snapshot state.
   */
  public async closeMonitoring(tenantId: string, monitoringId: string, actorId: string = "system"): Promise<void> {
    this.validateRequestContext(tenantId);
    
    const monRepo = this.di.resolve<IExecutiveDecisionMonitoringRepository>("IExecutiveDecisionMonitoringRepository");
    const mon = await monRepo.findMonitoringById(tenantId, monitoringId);
    if (!mon) throw new Error("Monitoring record not found.");

    if (mon.isLocked) return;

    mon.status = "CLOSED";
    mon.isLocked = true;
    mon.lockedAt = new Date().toISOString();
    mon.version += 1;
    mon.updatedAt = new Date().toISOString();

    const snapshotObj = JSON.parse(JSON.stringify(mon));
    mon.lockedSnapshot = JSON.stringify(snapshotObj);

    await monRepo.saveMonitoring(tenantId, mon);
    await monRepo.saveSnapshot(tenantId, monitoringId, mon);
    
    await this.publishEvent(tenantId, "executive.monitoring.closed", {
      monitoringId,
      tenantId,
      actorId,
      timestamp: new Date().toISOString()
    });

    await this.recordHistory(tenantId, mon, "ACTIVE", "CLOSED", actorId, "Decision monitoring closed and locked.");
  }

  /**
   * Archives closed monitoring audits.
   */
  public async archiveMonitoring(tenantId: string, monitoringId: string, actorId: string = "system"): Promise<void> {
    this.validateRequestContext(tenantId);
    
    const monRepo = this.di.resolve<IExecutiveDecisionMonitoringRepository>("IExecutiveDecisionMonitoringRepository");
    const mon = await monRepo.findMonitoringById(tenantId, monitoringId);
    if (!mon) throw new Error("Monitoring record not found.");

    const previousStatus = mon.status;
    mon.status = "ARCHIVED";
    mon.version += 1;
    mon.updatedAt = new Date().toISOString();

    await monRepo.saveMonitoring(tenantId, mon);
    
    await this.publishEvent(tenantId, "executive.monitoring.archived", {
      monitoringId,
      tenantId,
      actorId,
      timestamp: new Date().toISOString()
    });

    await this.recordHistory(tenantId, mon, previousStatus, "ARCHIVED", actorId, "Monitoring package archived.");
  }

  /**
   * Retrospectives summary lookup.
   */
  public async monitoringSummary(tenantId: string, monitoringId: string): Promise<IExecutiveDecisionMonitoring | null> {
    this.validateRequestContext(tenantId);
    const monRepo = this.di.resolve<IExecutiveDecisionMonitoringRepository>("IExecutiveDecisionMonitoringRepository");
    return monRepo.findMonitoringById(tenantId, monitoringId);
  }

  // ============================================================================
  // INTERNAL PRIVATE HELPERS
  // ============================================================================

  private async recordHistory(
    tenantId: string,
    monitoring: IExecutiveDecisionMonitoring,
    previousStatus: MonitoringLifecycleState | "NONE",
    newStatus: MonitoringLifecycleState,
    actorId: string,
    reason: string
  ): Promise<void> {
    const monRepo = this.di.resolve<IExecutiveDecisionMonitoringRepository>("IExecutiveDecisionMonitoringRepository");
    const historyEntry: IMonitoringHistoryEntry = {
      id: `hist_${crypto.randomUUID().replace(/-/g, "")}`,
      tenantId,
      monitoringId: monitoring.id,
      version: monitoring.version,
      previousStatus,
      newStatus,
      actorId,
      timestamp: new Date().toISOString(),
      reason,
      snapshot: JSON.parse(JSON.stringify(monitoring))
    };
    await monRepo.saveHistory(tenantId, historyEntry);
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
}
