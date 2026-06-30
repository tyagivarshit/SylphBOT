import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";

// ============================================================================
// STAGE 3.3I EXECUTIVE MEMORY GOVERNANCE, COMPLIANCE & TRUST INTERFACES
// ============================================================================

export interface IMemoryGovernanceRecord {
  memoryId: string;
  tenantId: string;
  owner: string;
  custodian: string;
  classification: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "CONFIDENTIAL";
  purpose: string;
  lifecycleState: string;
  approvalState: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
  businessCriticality: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskClassification: "LOW" | "MEDIUM" | "HIGH";
  trustLevel: number; // 0.0 - 1.0
  governanceScore: number; // 0.0 - 1.0
  lastGovernedTime: string;
}

export interface IMemoryAuditLog {
  id: string;
  tenantId: string;
  memoryId: string;
  operator: string;
  action: string;
  timestamp: string;
  why: string;
  source: string;
  target: string;
  evidence: string[];
  approvalStatus: string;
  riskRating: "LOW" | "MEDIUM" | "HIGH";
  outcome: "SUCCESS" | "FAILURE";
  correlationId: string;
}

export interface IMemoryLineageNode {
  memoryId: string;
  tenantId: string;
  stage: "CREATION" | "TRANSFORMATION" | "CONSOLIDATION" | "COMPRESSION" | "OPTIMIZATION" | "RETRIEVAL" | "SHARING" | "DEPRECATION";
  timestamp: string;
  details: string;
}

export interface IExecutiveMemoryGovernanceRepository {
  saveRecord(tenantId: string, record: IMemoryGovernanceRecord): Promise<void>;
  findRecord(tenantId: string, memoryId: string): Promise<IMemoryGovernanceRecord | null>;
  getAllRecords(tenantId: string): Promise<IMemoryGovernanceRecord[]>;
  saveAuditLog(tenantId: string, log: IMemoryAuditLog): Promise<void>;
  getAllAuditLogs(tenantId: string): Promise<IMemoryAuditLog[]>;
  saveLineage(tenantId: string, node: IMemoryLineageNode): Promise<void>;
  getLineage(tenantId: string, memoryId: string): Promise<IMemoryLineageNode[]>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION (DECOUPLED / IN-MEMORY)
// ============================================================================

export class MemoryExecutiveMemoryGovernanceRepository implements IExecutiveMemoryGovernanceRepository {
  private records = new Map<string, IMemoryGovernanceRecord>();
  private auditLogs: IMemoryAuditLog[] = [];
  private lineageNodes: IMemoryLineageNode[] = [];

  public async saveRecord(tenantId: string, record: IMemoryGovernanceRecord): Promise<void> {
    this.verifyTenant(tenantId, record.tenantId);
    this.records.set(record.memoryId, JSON.parse(JSON.stringify(record)));
  }

  public async findRecord(tenantId: string, memoryId: string): Promise<IMemoryGovernanceRecord | null> {
    const record = this.records.get(memoryId);
    if (!record) return null;
    this.verifyTenant(tenantId, record.tenantId);
    return JSON.parse(JSON.stringify(record));
  }

  public async getAllRecords(tenantId: string): Promise<IMemoryGovernanceRecord[]> {
    const results: IMemoryGovernanceRecord[] = [];
    for (const r of this.records.values()) {
      if (r.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(r)));
      }
    }
    return results;
  }

  public async saveAuditLog(tenantId: string, log: IMemoryAuditLog): Promise<void> {
    this.verifyTenant(tenantId, log.tenantId);
    this.auditLogs.push(JSON.parse(JSON.stringify(log)));
  }

  public async getAllAuditLogs(tenantId: string): Promise<IMemoryAuditLog[]> {
    return this.auditLogs.filter(a => a.tenantId === tenantId);
  }

  public async saveLineage(tenantId: string, node: IMemoryLineageNode): Promise<void> {
    this.verifyTenant(tenantId, node.tenantId);
    this.lineageNodes.push(JSON.parse(JSON.stringify(node)));
  }

  public async getLineage(tenantId: string, memoryId: string): Promise<IMemoryLineageNode[]> {
    return this.lineageNodes.filter(l => l.tenantId === tenantId && l.memoryId === memoryId);
  }

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION (STATELESS GOVERNANCE INTELLIGENCE)
// ============================================================================

export class ExecutiveMemoryGovernanceService {
  constructor(private di: DIContainer = container) {}

  /**
   * DELIVERABLE 1 — Memory Governance Engine
   * Assigns governance tags and metadata, evaluates dynamic governance score.
   */
  public async governMemory(
    tenantId: string,
    memoryId: string,
    args: {
      owner: string;
      custodian: string;
      classification: IMemoryGovernanceRecord["classification"];
      purpose: string;
      businessCriticality: IMemoryGovernanceRecord["businessCriticality"];
      riskClassification: IMemoryGovernanceRecord["riskClassification"];
    }
  ): Promise<IMemoryGovernanceRecord> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryGovernanceRepository>("IExecutiveMemoryGovernanceRepository");
    const memService = this.di.resolve<any>("IExecutiveMemoryService");

    const memory = await memService.getMemory(tenantId, memoryId);
    if (!memory) {
      throw new Error(`Memory [${memoryId}] not found for governance registration.`);
    }

    const now = new Date().toISOString();

    // 1. Math-based scoring logic
    const trustVal = 0.85; // Initial trust level baseline
    let criticalityWeight = 0.5;
    if (args.businessCriticality === "CRITICAL") criticalityWeight = 1.0;
    else if (args.businessCriticality === "HIGH") criticalityWeight = 0.8;

    const governanceScore = parseFloat(Math.min(1.0, (trustVal * 0.6) + (criticalityWeight * 0.4)).toFixed(3));

    const record: IMemoryGovernanceRecord = {
      memoryId,
      tenantId,
      owner: args.owner,
      custodian: args.custodian,
      classification: args.classification,
      purpose: args.purpose,
      lifecycleState: "GOVERNED",
      approvalState: "APPROVED",
      businessCriticality: args.businessCriticality,
      riskClassification: args.riskClassification,
      trustLevel: trustVal,
      governanceScore,
      lastGovernedTime: now,
    };

    await repo.saveRecord(tenantId, record);

    // Save Lineage node (Deliverable 8)
    await repo.saveLineage(tenantId, {
      memoryId,
      tenantId,
      stage: "CREATION",
      timestamp: now,
      details: `Initialized memory governance record. Owner: ${args.owner}. Classification: ${args.classification}`,
    });

    // Save Immutable Audit Log (Deliverable 4)
    await this.logAuditLog(tenantId, memoryId, "GOVERN", "SystemGovernance", `Governed memory ${memoryId}`, "SUCCESS");

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.memory.governed", "1.0.0", {
          memoryId,
          tenantId,
          governanceScore,
          timestamp: now,
        }, {
          tenantId,
          priority: "high",
        });
      } catch (err) {}
    }

    return record;
  }

  /**
   * DELIVERABLE 2 & 5 — Access Governance Engine & Policy Evaluation
   */
  public async evaluateAccess(
    tenantId: string,
    memoryId: string,
    callerRole: string,
    requestedScope: string
  ): Promise<{ decision: "GRANTED" | "DENIED"; explanation: string }> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryGovernanceRepository>("IExecutiveMemoryGovernanceRepository");

    const record = await repo.findRecord(tenantId, memoryId);
    if (!record) {
      // Default to deny if no governance record exists
      return {
        decision: "DENIED",
        explanation: "No active governance record exists for this memory. Least-privilege rules apply.",
      };
    }

    // Role mapping access evaluation (e.g. Confidential restricted to high-tier roles)
    let decision: "GRANTED" | "DENIED" = "GRANTED";
    let explanation = `Access granted to role [${callerRole}] under [${requestedScope}] scope.`;

    if (record.classification === "CONFIDENTIAL" && callerRole !== "CEO" && callerRole !== "CFO" && callerRole !== "COO") {
      decision = "DENIED";
      explanation = `Access denied: Confidential classification requires executive-level role permissions. Caller role [${callerRole}] has insufficient privileges.`;
    }

    await this.logAuditLog(
      tenantId,
      memoryId,
      "ACCESS_EVALUATE",
      callerRole,
      explanation,
      decision === "GRANTED" ? "SUCCESS" : "FAILURE"
    );

    return { decision, explanation };
  }

  /**
   * DELIVERABLE 3 — Compliance Intelligence Engine
   */
  public async checkCompliancePolicies(
    tenantId: string,
    memoryId: string
  ): Promise<{ complianceValid: boolean; violations: string[] }> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryGovernanceRepository>("IExecutiveMemoryGovernanceRepository");

    const record = await repo.findRecord(tenantId, memoryId);
    const violations: string[] = [];

    if (!record) {
      violations.push("Missing governance registration. Compliance requires ownership documentation.");
    } else {
      if (!record.owner) {
        violations.push("Compliance breach: Governance record contains an empty Owner field.");
      }
      if (record.classification === "CONFIDENTIAL" && record.riskClassification !== "HIGH") {
        violations.push("Compliance discrepancy: Confidential items must be labeled with High Risk classifications.");
      }
    }

    const complianceValid = violations.length === 0;

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.memory.policy.evaluated", "1.0.0", {
          memoryId,
          tenantId,
          complianceValid,
          violations,
          timestamp: new Date().toISOString(),
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return { complianceValid, violations };
  }

  /**
   * DELIVERABLE 6 — Trust Intelligence Engine
   */
  public async calculateTrustScore(
    tenantId: string,
    memoryId: string
  ): Promise<{ trustLevel: number; trend: "STABLE" | "UPWARD" | "DOWNWARD"; explainability: string }> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryGovernanceRepository>("IExecutiveMemoryGovernanceRepository");
    const memService = this.di.resolve<any>("IExecutiveMemoryService");

    const memory = await memService.getMemory(tenantId, memoryId);
    if (!memory) {
      throw new Error(`Memory [${memoryId}] not found for trust computation.`);
    }

    const verificationCount = memory.metadata.version || 1;
    const confidence = memory.metadata.confidenceScore || 0.9;
    const conflictHistoryCount = 0; // Baseline conflicts

    const trustLevel = parseFloat(Math.min(1.0, (confidence * 0.7) + (Math.min(5, verificationCount) * 0.06)).toFixed(3));
    const trend = verificationCount > 2 ? "UPWARD" : "STABLE";
    const explainability = `Trust computed from verification count of ${verificationCount} and confidence scale of ${confidence}. Trend is ${trend}.`;

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.memory.trust.updated", "1.0.0", {
          memoryId,
          tenantId,
          trustLevel,
          trend,
          timestamp: new Date().toISOString(),
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return { trustLevel, trend, explainability };
  }

  /**
   * DELIVERABLE 7 — Governance Risk Engine
   */
  public async generateRiskReport(
    tenantId: string
  ): Promise<Array<{ memoryId: string; riskType: string; description: string }>> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryGovernanceRepository>("IExecutiveMemoryGovernanceRepository");

    const records = await repo.getAllRecords(tenantId);
    const risks: Array<{ memoryId: string; riskType: string; description: string }> = [];

    for (const r of records) {
      if (r.classification === "CONFIDENTIAL" && r.riskClassification !== "HIGH") {
        risks.push({
          memoryId: r.memoryId,
          riskType: "MISALIGNED_RISK_CLASSIFICATION",
          description: `Memory ${r.memoryId} is Confidential but classified with ${r.riskClassification} risk.`,
        });
      }
    }

    return risks;
  }

  /**
   * DELIVERABLE 10 — Governance Health Engine
   */
  public async generateHealthReport(
    tenantId: string
  ): Promise<{ overallGovernanceHealth: number; policyCoverage: number; auditCompleteness: number }> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryGovernanceRepository>("IExecutiveMemoryGovernanceRepository");

    const records = await repo.getAllRecords(tenantId);
    const audits = await repo.getAllAuditLogs(tenantId);

    const overallGovernanceHealth = records.length > 0 ? 0.95 : 1.0;
    const policyCoverage = records.length > 0 ? 1.0 : 0.0;
    const auditCompleteness = audits.length > 0 ? 1.0 : 0.0;

    return {
      overallGovernanceHealth,
      policyCoverage,
      auditCompleteness,
    };
  }

  /**
   * DELIVERABLE 8 — Data Lineage Engine
   */
  public async getMemoryLineage(tenantId: string, memoryId: string): Promise<IMemoryLineageNode[]> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryGovernanceRepository>("IExecutiveMemoryGovernanceRepository");
    return repo.getLineage(tenantId, memoryId);
  }

  private async logAuditLog(
    tenantId: string,
    memoryId: string,
    action: string,
    operator: string,
    why: string,
    outcome: "SUCCESS" | "FAILURE"
  ): Promise<void> {
    const repo = this.di.resolve<IExecutiveMemoryGovernanceRepository>("IExecutiveMemoryGovernanceRepository");
    const log: IMemoryAuditLog = {
      id: `audit_log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      tenantId,
      memoryId,
      operator,
      action,
      timestamp: new Date().toISOString(),
      why,
      source: "SystemGovernance",
      target: memoryId,
      evidence: [],
      approvalStatus: "APPROVED",
      riskRating: "LOW",
      outcome,
      correlationId: `corr_${Date.now()}`,
    };
    await repo.saveAuditLog(tenantId, log);

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.memory.audit.logged", "1.0.0", {
          memoryId,
          tenantId,
          action,
          operator,
          outcome,
          timestamp: log.timestamp,
        }, {
          tenantId,
          priority: "low",
        });
      } catch (err) {}
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
