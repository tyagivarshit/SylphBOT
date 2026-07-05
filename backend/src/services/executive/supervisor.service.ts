import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import * as crypto from "crypto";

// ============================================================================
// DATA MODELS & INTERFACES
// ============================================================================

export interface ISupervisorPolicy {
  id: string;
  name: string;
  type: "compliance" | "security" | "budget" | "safety";
  rule: string;
}

export interface ISupervisorViolation {
  policyId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
}

export interface ISupervisorAuditState {
  id: string;
  tenantId: string;
  adaptiveStateId: string;
  policies: ISupervisorPolicy[];
  violations: ISupervisorViolation[];
  status: "APPROVED" | "BLOCKED" | "ESCALATED" | "OVERRIDDEN" | "PENDING";
  supervisorSignature?: string;
  auditLogs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ISealedPackageOutput {
  sealedAt: string;
  tenantId: string;
  auditId: string;
  supervisorSignature: string;
  status: string;
  adaptivePackage: any;
  complianceReport: {
    passed: boolean;
    violationsCount: number;
    violations: ISupervisorViolation[];
  };
  auditHistory: string[];
  explainability: {
    whyApprovedOrBlocked: string;
    whyOverridden: string;
  };
}

// ============================================================================
// SUPERVISOR REPOSITORY INTERFACES & O(1) IMPLEMENTATIONS
// ============================================================================

export interface IExecutiveSupervisorRepository {
  saveAuditState(tenantId: string, state: ISupervisorAuditState): Promise<void>;
  findAuditStateById(tenantId: string, id: string): Promise<ISupervisorAuditState | null>;
  findAuditStateByAdaptiveId(tenantId: string, adaptiveStateId: string): Promise<ISupervisorAuditState | null>;
}

export class MemoryExecutiveSupervisorRepository implements IExecutiveSupervisorRepository {
  private auditsDb = new Map<string, Map<string, ISupervisorAuditState>>();

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

  public async saveAuditState(tenantId: string, state: ISupervisorAuditState): Promise<void> {
    this.verifyTenant(tenantId, state.tenantId);
    if (!this.auditsDb.has(tenantId)) {
      this.auditsDb.set(tenantId, new Map());
    }
    this.auditsDb.get(tenantId)!.set(state.id, JSON.parse(JSON.stringify(state)));
  }

  public async findAuditStateById(tenantId: string, id: string): Promise<ISupervisorAuditState | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.auditsDb.get(tenantId);
    if (!tenantMap) return null;
    const item = tenantMap.get(id);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  public async findAuditStateByAdaptiveId(tenantId: string, adaptiveStateId: string): Promise<ISupervisorAuditState | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.auditsDb.get(tenantId);
    if (!tenantMap) return null;
    for (const state of tenantMap.values()) {
      if (state.adaptiveStateId === adaptiveStateId) {
        return JSON.parse(JSON.stringify(state));
      }
    }
    return null;
  }
}

// ============================================================================
// SUPERVISOR SERVICE
// ============================================================================

export class ExecutiveSupervisorService {
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

  /**
   * Initialize supervisor audit state
   */
  public async createSupervisorAudit(tenantId: string, state: ISupervisorAuditState): Promise<void> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveSupervisorRepository>("IExecutiveSupervisorRepository");
    await repo.saveAuditState(tenantId, state);

    await this.publishEvent(tenantId, "executive.supervisor.audit.created", {
      auditId: state.id,
      tenantId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * O(n) scan over execution settings and nodes against security & compliance policies
   */
  public async evaluatePolicies(tenantId: string, auditId: string): Promise<ISupervisorAuditState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveSupervisorRepository>("IExecutiveSupervisorRepository");
    const state = await repo.findAuditStateById(tenantId, auditId);
    if (!state) throw new Error("Supervisor audit state not found.");

    const adaptiveRepo = this.di.resolve<any>("IExecutiveAdaptiveExecutionRepository");
    const adaptiveState = await adaptiveRepo.findAdaptiveStateById(tenantId, state.adaptiveStateId);
    if (!adaptiveState) throw new Error("Adaptive state not found.");

    const violations: ISupervisorViolation[] = [];
    state.auditLogs.push("Starting policy evaluation scan.");

    // Evaluate policies in O(n)
    for (const policy of state.policies) {
      if (policy.type === "budget" && adaptiveState.budget.spent > adaptiveState.budget.allocated) {
        violations.push({
          policyId: policy.id,
          severity: "HIGH",
          reason: `Policy [${policy.name}] Violated: Spent budget [${adaptiveState.budget.spent}] exceeds allocated [${adaptiveState.budget.allocated}].`
        });
      }
      if (policy.type === "safety" && adaptiveState.riskScore > 50) {
        violations.push({
          policyId: policy.id,
          severity: "CRITICAL",
          reason: `Policy [${policy.name}] Violated: Risk score [${adaptiveState.riskScore}] exceeds safety threshold [50].`
        });
      }
      if (policy.type === "security" && adaptiveState.graph.nodes.some(n => n.id.includes("unsafe"))) {
        violations.push({
          policyId: policy.id,
          severity: "CRITICAL",
          reason: `Policy [${policy.name}] Violated: Unsafe node detected in execution graph.`
        });
      }
    }

    state.violations = violations;
    state.updatedAt = new Date().toISOString();

    if (violations.length > 0) {
      state.status = "ESCALATED";
      state.auditLogs.push(`Policy evaluation finished with [${violations.length}] violation(s). Status escalated.`);
      await repo.saveAuditState(tenantId, state);

      await this.publishEvent(tenantId, "executive.supervisor.policy.violated", {
        auditId,
        tenantId,
        violationsCount: violations.length,
        timestamp: new Date().toISOString()
      });
    } else {
      state.status = "APPROVED";
      state.supervisorSignature = `sig_approved_${crypto.randomUUID().slice(0, 8)}`;
      state.auditLogs.push("Policy evaluation finished with zero violations. Audit auto-approved.");
      await repo.saveAuditState(tenantId, state);

      await this.publishEvent(tenantId, "executive.supervisor.action.approved", {
        auditId,
        tenantId,
        signature: state.supervisorSignature,
        timestamp: new Date().toISOString()
      });
    }

    return state;
  }

  /**
   * Block Action
   */
  public async blockAction(tenantId: string, auditId: string, reason: string): Promise<ISupervisorAuditState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveSupervisorRepository>("IExecutiveSupervisorRepository");
    const state = await repo.findAuditStateById(tenantId, auditId);
    if (!state) throw new Error("Supervisor audit state not found.");

    state.status = "BLOCKED";
    state.auditLogs.push(`Action explicitly blocked. Reason: ${reason}`);
    state.updatedAt = new Date().toISOString();
    await repo.saveAuditState(tenantId, state);

    await this.publishEvent(tenantId, "executive.supervisor.action.blocked", {
      auditId,
      tenantId,
      reason,
      timestamp: new Date().toISOString()
    });

    return state;
  }

  /**
   * Approve Action
   */
  public async approveAction(tenantId: string, auditId: string, signature: string): Promise<ISupervisorAuditState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveSupervisorRepository>("IExecutiveSupervisorRepository");
    const state = await repo.findAuditStateById(tenantId, auditId);
    if (!state) throw new Error("Supervisor audit state not found.");

    state.status = "APPROVED";
    state.supervisorSignature = signature;
    state.auditLogs.push(`Action approved with supervisor signature [${signature}].`);
    state.updatedAt = new Date().toISOString();
    await repo.saveAuditState(tenantId, state);

    await this.publishEvent(tenantId, "executive.supervisor.action.approved", {
      auditId,
      tenantId,
      signature,
      timestamp: new Date().toISOString()
    });

    return state;
  }

  /**
   * Override Action
   */
  public async overrideAction(tenantId: string, auditId: string, signature: string, reason: string): Promise<ISupervisorAuditState> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveSupervisorRepository>("IExecutiveSupervisorRepository");
    const state = await repo.findAuditStateById(tenantId, auditId);
    if (!state) throw new Error("Supervisor audit state not found.");

    state.status = "OVERRIDDEN";
    state.supervisorSignature = signature;
    state.auditLogs.push(`Action validation overridden. Override reason: ${reason}. Signature: [${signature}].`);
    state.updatedAt = new Date().toISOString();
    await repo.saveAuditState(tenantId, state);

    await this.publishEvent(tenantId, "executive.supervisor.override.signed", {
      auditId,
      tenantId,
      signature,
      reason,
      timestamp: new Date().toISOString()
    });

    return state;
  }

  /**
   * Explain Supervisor Decision
   */
  public async explainSupervisorDecision(tenantId: string, auditId: string): Promise<any> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveSupervisorRepository>("IExecutiveSupervisorRepository");
    const state = await repo.findAuditStateById(tenantId, auditId);
    if (!state) throw new Error("Supervisor audit state not found.");

    const whyApprovedOrBlocked = state.status === "APPROVED"
      ? `Supervisor approved the action because all policies evaluated successfully with signature [${state.supervisorSignature}].`
      : state.status === "BLOCKED"
      ? "Supervisor blocked the action because high severity violations were detected and not overridden."
      : "Supervisor has not approved or blocked this action.";

    const whyOverridden = state.status === "OVERRIDDEN"
      ? `Supervisor validation was overridden by operator signature [${state.supervisorSignature}] with reason: ${state.auditLogs[state.auditLogs.length - 1]}.`
      : "Supervisor validation was not overridden.";

    return {
      whyApprovedOrBlocked,
      whyOverridden
    };
  }

  /**
   * Compile final signed and sealed supervisor package
   */
  public async sealSupervisorPackage(tenantId: string, auditId: string): Promise<ISealedPackageOutput> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveSupervisorRepository>("IExecutiveSupervisorRepository");
    const state = await repo.findAuditStateById(tenantId, auditId);
    if (!state) throw new Error("Supervisor audit state not found.");

    const adaptiveService = this.di.resolve<any>("IExecutiveAdaptiveExecutionService");
    const adaptivePackage = await adaptiveService.compileAdaptivePackage(tenantId, state.adaptiveStateId);

    const explainability = await this.explainSupervisorDecision(tenantId, auditId);

    const sealed: ISealedPackageOutput = {
      sealedAt: new Date().toISOString(),
      tenantId,
      auditId,
      supervisorSignature: state.supervisorSignature || "UNSIGNED",
      status: state.status,
      adaptivePackage,
      complianceReport: {
        passed: state.violations.length === 0,
        violationsCount: state.violations.length,
        violations: state.violations
      },
      auditHistory: state.auditLogs,
      explainability
    };

    await this.publishEvent(tenantId, "executive.supervisor.package.sealed", {
      auditId,
      tenantId,
      timestamp: new Date().toISOString()
    });

    return sealed;
  }
}
