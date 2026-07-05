import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import { IDecision, DecisionStatus } from "./decisionIntelligence.service";
import { IExecutiveDecisionSelection, IExecutiveCommitmentPackage } from "./decisionSelection.service";
import { IExecutiveIdentity } from "./interfaces";
import * as crypto from "crypto";

// ============================================================================
// STAGE 3.5G EXECUTIVE DECISION AUTHORIZATION & POLICY GATE INTERFACES
// ============================================================================

export type AuthorizationLifecycleState =
  | "PENDING"
  | "UNDER_POLICY_REVIEW"
  | "UNDER_FINANCIAL_REVIEW"
  | "UNDER_SECURITY_REVIEW"
  | "UNDER_COMPLIANCE_REVIEW"
  | "AUTHORIZED"
  | "DENIED"
  | "EXPIRED"
  | "ARCHIVED";

export interface IAuthorityValidationResult {
  isValid: boolean;
  errors: string[];
  validatedExecutiveId: string;
  scopeMatched: boolean;
  limitChecked: boolean;
  unitOwnershipValid: boolean;
  chainValid: boolean;
  explanation: string;
}

export interface IPolicyGateResults {
  isPassed: boolean;
  policiesEvaluated: {
    business: { passed: boolean; reason?: string };
    security: { passed: boolean; reason?: string };
    operational: { passed: boolean; reason?: string };
    financial: { passed: boolean; reason?: string };
    legal: { passed: boolean; reason?: string };
    compliance: { passed: boolean; reason?: string };
    customer: { passed: boolean; reason?: string };
    engineering: { passed: boolean; reason?: string };
    aiGovernance: { passed: boolean; reason?: string };
  };
  explanation: string;
}

export interface IBudgetValidationResults {
  isAuthorized: boolean;
  capexPassed: boolean;
  opexPassed: boolean;
  departmentBudgetPassed: boolean;
  runwayImpactAcceptable: boolean;
  cashFlowConstraintsMet: boolean;
  thresholdsRespected: boolean;
  errors: string[];
  explanation: string;
}

export interface IRiskAuthorizationResults {
  isPassed: boolean;
  residualRisk: number; // 0.0 to 1.0
  riskAppetiteMet: boolean;
  criticalThresholdRespected: boolean;
  recoveryAvailable: boolean;
  fallbackAvailable: boolean;
  businessContinuityValid: boolean;
  errors: string[];
  explanation: string;
}

export interface IComplianceValidationResults {
  isCompliant: boolean;
  gdprPassed: boolean;
  soc2Passed: boolean;
  isoPassed: boolean;
  internalGovernancePassed: boolean;
  legalConstraintsMet: boolean;
  regionalRestrictionsMet: boolean;
  industryPoliciesMet: boolean;
  errors: string[];
  explanation: string;
}

export interface IDelegationValidationResults {
  isValid: boolean;
  responsibleExecutive: string;
  delegatedExecutive: string;
  escalationOwner: string;
  fallbackOwner: string;
  reviewChainValid: boolean;
  approvalChainValid: boolean;
  errors: string[];
  explanation: string;
}

export interface IExecutionAuthorizationToken {
  authorizationId: string;
  decisionId: string;
  approvalStatus: AuthorizationLifecycleState;
  approvers: string[];
  expiration: string;
  constraints: string[];
  executionScope: {
    services: string[];
    domains: string[];
  };
  allowedActions: string[];
  deniedActions: string[];
  rollbackEligibility: {
    canRollback: boolean;
    rollbackActions: string[];
  };
  signature: string;
}

export interface IAuthorizationExplainability {
  summary: string;
  reasons: string[];
  budgetAnalysis: string;
  complianceAnalysis: string;
  policyAnalysis: string;
  escalationRequirements: string;
}

export interface IAuthorizationDriftReport {
  authorizationId: string;
  tenantId: string;
  hasDrift: boolean;
  driftIndicators: {
    policyDrift: number; // 0.0 - 1.0
    budgetDrift: number; // 0.0 - 1.0
    authorityDrift: number; // 0.0 - 1.0
    complianceDrift: number; // 0.0 - 1.0
    riskDrift: number; // 0.0 - 1.0
    approvalDrift: number; // 0.0 - 1.0
  };
  details: string[];
  calculatedAt: string;
}

export interface IExecutiveDecisionAuthorization {
  id: string;
  tenantId: string;
  decisionId: string;
  status: AuthorizationLifecycleState;
  version: number;
  actorId: string;
  
  // Validation Results
  authorityValidation?: IAuthorityValidationResult;
  policyGateResults?: IPolicyGateResults;
  budgetValidationResults?: IBudgetValidationResults;
  riskAuthorizationResults?: IRiskAuthorizationResults;
  complianceValidationResults?: IComplianceValidationResults;
  delegationValidationResults?: IDelegationValidationResults;
  
  // Token & Explainability
  executionToken?: IExecutionAuthorizationToken;
  explainability?: IAuthorizationExplainability;
  
  // Hardened Locks & Metadata
  isLocked: boolean;
  lockedAt?: string;
  lockedSnapshot?: string; // Serialized string of completed authorization
  
  createdAt: string;
  updatedAt: string;
}

export interface IAuthorizationHistoryEntry {
  id: string;
  tenantId: string;
  authorizationId: string;
  version: number;
  previousStatus: AuthorizationLifecycleState | "NONE";
  newStatus: AuthorizationLifecycleState;
  actorId: string;
  timestamp: string;
  reason: string;
  snapshot: IExecutiveDecisionAuthorization;
}

export interface IAuthorizationPackage {
  id: string;
  tenantId: string;
  decisionId: string;
  status: AuthorizationLifecycleState;
  compiledAt: string;
  
  decisionSnapshot: IDecision;
  evidenceSnapshot?: any; // from evidence validation
  simulationSnapshot?: any; // from simulation projection
  selectionSnapshot?: IExecutiveDecisionSelection;
  commitmentSnapshot?: IExecutiveCommitmentPackage;
  
  approvalChain: string[];
  policyResults: IPolicyGateResults;
  budgetResults: IBudgetValidationResults;
  complianceResults: IComplianceValidationResults;
  riskResults: IRiskAuthorizationResults;
  executionToken?: IExecutionAuthorizationToken;
}

// ============================================================================
// REPOSITORY INTERFACE & IMPLEMENTATION (DELIVERABLE 1)
// ============================================================================

export interface IExecutiveDecisionAuthorizationRepository {
  saveAuthorization(tenantId: string, auth: IExecutiveDecisionAuthorization): Promise<void>;
  findAuthorizationById(tenantId: string, id: string): Promise<IExecutiveDecisionAuthorization | null>;
  findAuthorizationByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionAuthorization | null>;
  saveHistory(tenantId: string, entry: IAuthorizationHistoryEntry): Promise<void>;
  getHistory(tenantId: string, authorizationId: string): Promise<IAuthorizationHistoryEntry[]>;
  saveSnapshot(tenantId: string, authorizationId: string, snapshot: IExecutiveDecisionAuthorization): Promise<void>;
  getSnapshot(tenantId: string, authorizationId: string): Promise<IExecutiveDecisionAuthorization | null>;
  deleteAuthorization(tenantId: string, id: string): Promise<void>;
}

export class MemoryExecutiveDecisionAuthorizationRepository implements IExecutiveDecisionAuthorizationRepository {
  private authorizationsDb = new Map<string, Map<string, IExecutiveDecisionAuthorization>>();
  private historyDb = new Map<string, Map<string, IAuthorizationHistoryEntry[]>>();
  private snapshotsDb = new Map<string, Map<string, IExecutiveDecisionAuthorization>>();

  public async saveAuthorization(tenantId: string, auth: IExecutiveDecisionAuthorization): Promise<void> {
    this.verifyTenant(tenantId, auth.tenantId);
    if (!this.authorizationsDb.has(tenantId)) {
      this.authorizationsDb.set(tenantId, new Map());
    }
    this.authorizationsDb.get(tenantId)!.set(auth.id, JSON.parse(JSON.stringify(auth)));
  }

  public async findAuthorizationById(tenantId: string, id: string): Promise<IExecutiveDecisionAuthorization | null> {
    const tenantMap = this.authorizationsDb.get(tenantId);
    if (!tenantMap) return null;
    const auth = tenantMap.get(id);
    if (!auth) return null;
    return JSON.parse(JSON.stringify(auth));
  }

  public async findAuthorizationByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionAuthorization | null> {
    const tenantMap = this.authorizationsDb.get(tenantId);
    if (!tenantMap) return null;
    for (const auth of tenantMap.values()) {
      if (auth.decisionId === decisionId) {
        return JSON.parse(JSON.stringify(auth));
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IAuthorizationHistoryEntry): Promise<void> {
    this.verifyTenant(tenantId, entry.tenantId);
    if (!this.historyDb.has(tenantId)) {
      this.historyDb.set(tenantId, new Map());
    }
    const tenantMap = this.historyDb.get(tenantId)!;
    if (!tenantMap.has(entry.authorizationId)) {
      tenantMap.set(entry.authorizationId, []);
    }
    tenantMap.get(entry.authorizationId)!.push(JSON.parse(JSON.stringify(entry)));
  }

  public async getHistory(tenantId: string, authorizationId: string): Promise<IAuthorizationHistoryEntry[]> {
    const tenantMap = this.historyDb.get(tenantId);
    if (!tenantMap) return [];
    const history = tenantMap.get(authorizationId) || [];
    return JSON.parse(JSON.stringify(history));
  }

  public async saveSnapshot(tenantId: string, authorizationId: string, snapshot: IExecutiveDecisionAuthorization): Promise<void> {
    this.verifyTenant(tenantId, snapshot.tenantId);
    if (!this.snapshotsDb.has(tenantId)) {
      this.snapshotsDb.set(tenantId, new Map());
    }
    this.snapshotsDb.get(tenantId)!.set(authorizationId, JSON.parse(JSON.stringify(snapshot)));
  }

  public async getSnapshot(tenantId: string, authorizationId: string): Promise<IExecutiveDecisionAuthorization | null> {
    const tenantMap = this.snapshotsDb.get(tenantId);
    if (!tenantMap) return null;
    const snapshot = tenantMap.get(authorizationId);
    if (!snapshot) return null;
    return JSON.parse(JSON.stringify(snapshot));
  }

  public async deleteAuthorization(tenantId: string, id: string): Promise<void> {
    const tenantMap = this.authorizationsDb.get(tenantId);
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
// SERVICE IMPLEMENTATION (DECISION AUTHORIZATION & POLICY GATE ENGINE)
// ============================================================================

export class ExecutiveDecisionAuthorizationService {
  constructor(private di: DIContainer = container) {}

  /**
   * DELIVERABLE 2 & 12
   * Main entry point to authorize a committed decision selection.
   */
  public async authorizeDecision(
    tenantId: string,
    decisionId: string,
    actorId: string = "system"
  ): Promise<IExecutiveDecisionAuthorization> {
    this.validateRequestContext(tenantId);

    const authRepo = this.di.resolve<IExecutiveDecisionAuthorizationRepository>("IExecutiveDecisionAuthorizationRepository");
    
    // Check if authorization already exists
    let auth = await authRepo.findAuthorizationByDecisionId(tenantId, decisionId);
    
    if (auth) {
      if (auth.isLocked) {
        // Return existing locked authorization as is
        return auth;
      }
      // If PENDING or reviews in progress, we re-run validations
    } else {
      // Create initial authorization
      auth = {
        id: `auth_${crypto.randomUUID().replace(/-/g, "")}`,
        tenantId,
        decisionId,
        status: "PENDING",
        version: 1,
        actorId,
        isLocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await authRepo.saveAuthorization(tenantId, auth);
      await this.publishEvent(tenantId, "executive.authorization.requested", {
        authorizationId: auth.id,
        decisionId,
        tenantId,
        actorId,
        timestamp: new Date().toISOString()
      });
      await this.recordHistory(tenantId, auth, "NONE", "PENDING", actorId, "Authorization record initialized.");
    }

    // Resolve needed components for validations
    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    if (!decisionRepo) {
      throw new Error("IExecutiveDecisionRepository not found in DI container.");
    }
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) {
      throw new Error(`Decision [${decisionId}] not found in repository.`);
    }

    // Stage 1: Transitional lifecycle status
    await this.updateStatus(tenantId, auth.id, "UNDER_POLICY_REVIEW", actorId, "Starting policy reviews.");

    // DELIVERABLE 3: Authority Validation
    const authorityVal = await this.validateAuthority(tenantId, decision, actorId);
    auth.authorityValidation = authorityVal;

    // DELIVERABLE 4: Policy Gate
    const policyVal = await this.policyGate(tenantId, decisionId);
    auth.policyGateResults = policyVal;

    // DELIVERABLE 5: Budget Validation
    await this.updateStatus(tenantId, auth.id, "UNDER_FINANCIAL_REVIEW", actorId, "Running budget validation.");
    const budgetVal = await this.budgetValidation(tenantId, decisionId);
    auth.budgetValidationResults = budgetVal;

    // DELIVERABLE 6: Risk Authorization
    await this.updateStatus(tenantId, auth.id, "UNDER_SECURITY_REVIEW", actorId, "Running risk and security reviews.");
    const riskVal = await this.riskAuthorization(tenantId, decisionId);
    auth.riskAuthorizationResults = riskVal;

    // DELIVERABLE 7 & 8: Compliance & Delegation
    await this.updateStatus(tenantId, auth.id, "UNDER_COMPLIANCE_REVIEW", actorId, "Running compliance and delegation reviews.");
    const complianceVal = await this.complianceAuthorization(tenantId, decisionId);
    auth.complianceValidationResults = complianceVal;
    
    const delegationVal = await this.validateDelegation(tenantId, decision, actorId);
    auth.delegationValidationResults = delegationVal;

    // Compute Overall Decision
    const allPassed =
      authorityVal.isValid &&
      policyVal.isPassed &&
      budgetVal.isAuthorized &&
      riskVal.isPassed &&
      complianceVal.isCompliant &&
      delegationVal.isValid;

    // DELIVERABLE 10: Explainability
    auth.explainability = this.generateExplainability(
      authorityVal,
      policyVal,
      budgetVal,
      riskVal,
      complianceVal,
      delegationVal
    );

    if (allPassed) {
      // DELIVERABLE 9: Generate Execution Token
      auth.status = "AUTHORIZED";
      const token = await this.generateExecutionToken(tenantId, auth.id, decision);
      auth.executionToken = token;
      
      auth.updatedAt = new Date().toISOString();
      await authRepo.saveAuthorization(tenantId, auth);

      // DELIVERABLE 20: Lock the authorized state
      await this.lockAuthorization(tenantId, auth.id, actorId);

      // Reload locked copy
      const finalAuth = await authRepo.findAuthorizationById(tenantId, auth.id);
      if (!finalAuth) throw new Error("Authorized snapshot retrieval failed.");

      await this.publishEvent(tenantId, "executive.authorization.approved", {
        authorizationId: finalAuth.id,
        decisionId: finalAuth.decisionId,
        tenantId,
        actorId,
        timestamp: new Date().toISOString()
      });

      return finalAuth;
    } else {
      auth.status = "DENIED";
      auth.updatedAt = new Date().toISOString();
      await authRepo.saveAuthorization(tenantId, auth);
      await this.recordHistory(tenantId, auth, "UNDER_COMPLIANCE_REVIEW", "DENIED", actorId, "Validations failed. Authorization denied.");

      await this.publishEvent(tenantId, "executive.authorization.denied", {
        authorizationId: auth.id,
        decisionId: auth.decisionId,
        tenantId,
        actorId,
        timestamp: new Date().toISOString()
      });

      return auth;
    }
  }

  /**
   * DELIVERABLE 12 Summary Retrospective
   */
  public async authorizationSummary(tenantId: string, authorizationId: string): Promise<IExecutiveDecisionAuthorization | null> {
    this.validateRequestContext(tenantId);
    const authRepo = this.di.resolve<IExecutiveDecisionAuthorizationRepository>("IExecutiveDecisionAuthorizationRepository");
    return authRepo.findAuthorizationById(tenantId, authorizationId);
  }

  /**
   * DELIVERABLE 3: Validate authority against Executive Identity, Delegation Matrix, boundaries and scope.
   */
  public async validateAuthority(tenantId: string, decision: IDecision, actorId: string): Promise<IAuthorityValidationResult> {
    this.validateRequestContext(tenantId);

    const errors: string[] = [];
    let scopeMatched = false;
    let limitChecked = false;
    let unitOwnershipValid = false;
    let chainValid = false;
    let validatedExecutiveId = actorId;

    // Check Executive Identity in DI
    if (this.di.has("IExecutiveIdentityService")) {
      const identityService = this.di.resolve<any>("IExecutiveIdentityService");
      const identity: IExecutiveIdentity | null = await identityService.getExecutive(tenantId, actorId).catch(() => null);
      if (!identity) {
        errors.push(`Executive Identity [${actorId}] not found in system register.`);
      } else {
        // Executive Identity Role/Status checks
        if (identity.status !== "ACTIVE") {
          errors.push(`Executive Identity [${actorId}] is in state [${identity.status}] (must be ACTIVE).`);
        }

        // Decision Scope validation
        const scope = identity.dna.decisionScope.find(s => s.decisionType.toLowerCase() === decision.type.toLowerCase() || s.allowedActions.includes(decision.type));
        if (scope) {
          scopeMatched = true;
        } else {
          // Fallback check against capability allowed categories
          const cats = identity.dna.capabilityProfile?.allowedDecisionCategories || [];
          if (cats.map(c => c.toLowerCase()).includes("strategic") && decision.type === "Strategic") {
            scopeMatched = true;
          } else if (identity.role === "CEO" || identity.role === "BOARD_OF_DIRECTORS") {
            scopeMatched = true; // CEO & Board have global decision scope
          } else {
            errors.push(`Decision type [${decision.type}] is outside the scope of Executive role [${identity.role}].`);
          }
        }

        // Authority Limits (Monetary limit checked against metadata budget)
        const budget = decision.metadata?.budget || 0;
        const limits = identity.dna.authorities || [];
        const matchesLimit = limits.some(a => a.action.includes(decision.type) && (a.maxBudgetThreshold === undefined || budget <= a.maxBudgetThreshold));
        
        // Also check modern decisionAuthorityMatrix if it exists
        const matrixRules = identity.dna.decisionAuthorityMatrix?.rules || [];
        const matrixMatches = matrixRules.some(r => r.action.toLowerCase() === decision.type.toLowerCase() && (r.approvalThreshold === undefined || budget <= r.approvalThreshold));

        if (matchesLimit || matrixMatches || identity.role === "CEO" || identity.role === "BOARD_OF_DIRECTORS") {
          limitChecked = true;
        } else {
          errors.push(`Decision budget [$${budget}] exceeds authority thresholds for executive actor [${actorId}].`);
        }

        // Business Unit Ownership Validation
        const execBU = identity.metadata?.department || identity.dna.mission?.alignmentTargets?.[0] || "global";
        const decisionBU = decision.metadata?.businessUnit || decision.metadata?.department || "global";
        if (execBU === "global" || execBU === decisionBU || identity.role === "CEO" || identity.role === "BOARD_OF_DIRECTORS") {
          unitOwnershipValid = true;
        } else {
          errors.push(`Executive department [${execBU}] does not own the target decision department [${decisionBU}].`);
        }
      }
    } else {
      // DI fallback mode
      scopeMatched = true;
      limitChecked = true;
      unitOwnershipValid = true;
    }

    // Approval Chain verification
    const reqApprovers = decision.ownership?.stakeholders || [];
    const actualApprovers = decision.trace?.approvalChain || [];
    const missingApprovers = reqApprovers.filter(a => !actualApprovers.includes(a));
    
    // Check Board Approval constraints
    if (decision.metadata?.requiresBoardApproval === true && !actualApprovers.includes("BOARD_OF_DIRECTORS")) {
      errors.push("Board Approval Required: Decision contains high-impact markers requiring Board authorization.");
    }

    // Check Legal Review constraints
    if (decision.metadata?.requiresLegalReview === true && !actualApprovers.includes("legal_counsel")) {
      errors.push("Legal Review Required: Outstanding legal compliance verification required before commitment.");
    }

    if (missingApprovers.length === 0) {
      chainValid = true;
    } else {
      errors.push(`Approval Chain Incomplete: Missing stakeholder reviews from [${missingApprovers.join(", ")}].`);
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      validatedExecutiveId,
      scopeMatched,
      limitChecked,
      unitOwnershipValid,
      chainValid,
      explanation: isValid
        ? `Executive actor [${actorId}] successfully verified against role scope, authority limits, business unit boundaries, and completed approval chains.`
        : `Authority validation failed: ${errors.join("; ")}`
    };
  }

  /**
   * DELIVERABLE 4: Policy Gate Engine
   */
  public async policyGate(tenantId: string, decisionId: string): Promise<IPolicyGateResults> {
    this.validateRequestContext(tenantId);

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    const budget = decision.metadata?.budget || 0;
    const isSecuritySensitive = decision.type === "Security" || decision.metadata?.securitySensitive === true;
    
    // Policies
    const businessPassed = decision.goals && decision.goals.length > 0;
    const securityPassed = !isSecuritySensitive || decision.metadata?.encryptionEnabled === true;
    const operationalPassed = decision.plans && decision.plans.length > 0;
    const financialPassed = budget < 10000000; // Hard cap limit for standard policies
    const legalPassed = decision.metadata?.requiresLegalReview !== true || decision.trace?.approvalChain?.includes("legal_counsel");
    const compliancePassed = decision.metadata?.piiDataRedacted !== false;
    const customerPassed = decision.metadata?.customerSuccessImpact !== "CRITICAL_NEGATIVE";
    const engineeringPassed = decision.assumptions?.every(a => a.validationStatus !== "BROKEN");
    const aiGovernancePassed = decision.metadata?.humanOverrideApproved !== false;

    const explanationParts: string[] = [];
    if (!businessPassed) explanationParts.push("No aligned strategic goals found.");
    if (!securityPassed) explanationParts.push("Security Policy Violation: Sensitive decision lacks encryption validations.");
    if (!operationalPassed) explanationParts.push("Operational plans missing.");
    if (!financialPassed) explanationParts.push("Budget exceeds policy hard cap ($10,000,000).");
    if (!legalPassed) explanationParts.push("Legal review requirement not fulfilled.");
    if (!compliancePassed) explanationParts.push("PII Data Redaction checks failed.");
    if (!customerPassed) explanationParts.push("Customer policy impact unacceptable.");
    if (!engineeringPassed) explanationParts.push("Engineering validation contains broken technical assumptions.");
    if (!aiGovernancePassed) explanationParts.push("AI governance requires explicit human-in-the-loop validation.");

    const isPassed = explanationParts.length === 0;

    return {
      isPassed,
      policiesEvaluated: {
        business: { passed: businessPassed, reason: businessPassed ? undefined : "Goals alignment check failed" },
        security: { passed: securityPassed, reason: securityPassed ? undefined : "Encryption required" },
        operational: { passed: operationalPassed, reason: operationalPassed ? undefined : "Plans empty" },
        financial: { passed: financialPassed, reason: financialPassed ? undefined : "Exceeds hard limit" },
        legal: { passed: legalPassed, reason: legalPassed ? undefined : "Legal review signature missing" },
        compliance: { passed: compliancePassed, reason: compliancePassed ? undefined : "PII redaction unverified" },
        customer: { passed: customerPassed, reason: customerPassed ? undefined : "Negative customer impact check" },
        engineering: { passed: engineeringPassed, reason: engineeringPassed ? undefined : "Broken technical assumptions" },
        aiGovernance: { passed: aiGovernancePassed, reason: aiGovernancePassed ? undefined : "Human override required" }
      },
      explanation: isPassed
        ? "All business, security, operational, financial, compliance, and governance policies evaluated successfully."
        : `Policy validation failures: ${explanationParts.join("; ")}`
    };
  }

  /**
   * DELIVERABLE 5: Budget Authorization Engine
   */
  public async budgetValidation(tenantId: string, decisionId: string): Promise<IBudgetValidationResults> {
    this.validateRequestContext(tenantId);

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    const budget = decision.metadata?.budget || 0;
    const errors: string[] = [];

    // Evaluate budget type limits
    const isCapex = decision.metadata?.capex === true;
    const capexLimit = 5000000;
    const opexLimit = 2000000;

    const capexPassed = !isCapex || budget <= capexLimit;
    const opexPassed = isCapex || budget <= opexLimit;
    
    if (!capexPassed) errors.push(`CAPEX spend [$${budget}] exceeds limit [$${capexLimit}]`);
    if (!opexPassed) errors.push(`OPEX spend [$${budget}] exceeds limit [$${opexLimit}]`);

    // Department budget check
    const deptBudgetAvailable = decision.metadata?.deptBudgetAvailable !== undefined ? decision.metadata.deptBudgetAvailable : 1000000;
    const departmentBudgetPassed = budget <= deptBudgetAvailable;
    if (!departmentBudgetPassed) {
      errors.push(`Budget exhausted: Decision budget [$${budget}] exceeds department balance of [$${deptBudgetAvailable}].`);
    }

    // Runway impact
    const runwayDaysAfter = decision.metadata?.runwayDaysAfter !== undefined ? decision.metadata.runwayDaysAfter : 300;
    const runwayImpactAcceptable = runwayDaysAfter >= 90; // must maintain at least 90 days runway
    if (!runwayImpactAcceptable) {
      errors.push(`Severe Runway Impact: Cash reserves degraded below minimum safety threshold (90 days).`);
    }

    // Cash flow
    const cashFlowNegative = decision.metadata?.cashFlowNegative === true;
    const cashFlowConstraintsMet = !cashFlowNegative || budget < 500000;
    if (!cashFlowConstraintsMet) {
      errors.push(`Cash Flow constraint breach for negative yield decisions above $500,000.`);
    }

    // Approval thresholds
    const thresholdsRespected = budget < 10000000;
    if (!thresholdsRespected) {
      errors.push(`Absolute authorization cap limit breached.`);
    }

    const isAuthorized = errors.length === 0;

    return {
      isAuthorized,
      capexPassed,
      opexPassed,
      departmentBudgetPassed,
      runwayImpactAcceptable,
      cashFlowConstraintsMet,
      thresholdsRespected,
      errors,
      explanation: isAuthorized
        ? `Budget successfully validated against CAPEX/OPEX limits, department balances ($${deptBudgetAvailable} available), runway safety limits, and cash flow constraints.`
        : `Budget authorization rejected: ${errors.join("; ")}`
    };
  }

  /**
   * DELIVERABLE 6: Risk Authorization Engine
   */
  public async riskAuthorization(tenantId: string, decisionId: string): Promise<IRiskAuthorizationResults> {
    this.validateRequestContext(tenantId);

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    const errors: string[] = [];
    
    // Resolve overall risk index from Stage 3.5D evaluation or decision metadata
    const residualRisk = decision.metadata?.riskIndex !== undefined ? decision.metadata.riskIndex : 0.3;
    const riskAppetiteThreshold = decision.metadata?.riskAppetiteThreshold !== undefined ? decision.metadata.riskAppetiteThreshold : 0.6;

    const riskAppetiteMet = residualRisk <= riskAppetiteThreshold;
    if (!riskAppetiteMet) {
      errors.push(`Residual risk score [${residualRisk}] exceeds tenant risk appetite threshold of [${riskAppetiteThreshold}].`);
    }

    const criticalThresholdRespected = residualRisk < 0.75;
    if (!criticalThresholdRespected) {
      errors.push(`Critical Risk Threshold Breached: Residual risk is extremely high [${residualRisk} >= 0.75].`);
    }

    // Check fallback / recovery settings
    const recoveryAvailable = decision.metadata?.recoveryPlanAvailable === true || decision.metadata?.rollbackAvailable === true;
    if (!recoveryAvailable) {
      errors.push("No Recovery Strategy: Disaster recovery and rollback configurations are missing.");
    }

    const fallbackAvailable = decision.metadata?.fallbackPlanAvailable === true;
    if (!fallbackAvailable) {
      errors.push("No Fallback Plan: Alternate contingency execution path not defined.");
    }

    const businessContinuityValid = decision.metadata?.businessContinuityValidated !== false;
    if (!businessContinuityValid) {
      errors.push("Business Continuity validation failed: Potential single-point-of-failure identified.");
    }

    const isPassed = errors.length === 0;

    return {
      isPassed,
      residualRisk,
      riskAppetiteMet,
      criticalThresholdRespected,
      recoveryAvailable,
      fallbackAvailable,
      businessContinuityValid,
      errors,
      explanation: isPassed
        ? `Risk bounds validated. Residual risk of ${residualRisk} fits safely within limits, supported by active fallback and business continuity frameworks.`
        : `Risk validation rejected: ${errors.join("; ")}`
    };
  }

  /**
   * DELIVERABLE 7: Compliance Authorization Engine
   */
  public async complianceAuthorization(tenantId: string, decisionId: string): Promise<IComplianceValidationResults> {
    this.validateRequestContext(tenantId);

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, decisionId);
    if (!decision) throw new Error("Decision not found.");

    const errors: string[] = [];

    const gdprPassed = decision.metadata?.gdprCompliant !== false;
    if (!gdprPassed) errors.push("GDPR: Unredacted PII or missing user data consent records.");

    const soc2Passed = decision.metadata?.soc2AuditClean !== false;
    if (!soc2Passed) errors.push("SOC2: Access validation or logging trails not fully validated.");

    const isoPassed = decision.metadata?.isoCompliant !== false;
    if (!isoPassed) errors.push("ISO: Quality standards verification is missing.");

    const internalGovernancePassed = decision.metadata?.internalGovernanceCompliant !== false;
    if (!internalGovernancePassed) errors.push("Governance: Organization internal bylaws/policies violated.");

    const legalConstraintsMet = decision.metadata?.sanctionedCheckFailed !== true;
    if (!legalConstraintsMet) errors.push("Legal: Partner matches sanctioned entities registry.");

    const regionalRestrictionsMet = decision.metadata?.regionalHostingViolation !== true;
    if (!regionalRestrictionsMet) errors.push("Regional: Execution path violates host location policies.");

    const industryPoliciesMet = decision.metadata?.industryPoliciesMet !== false;
    if (!industryPoliciesMet) errors.push("Industry: Specific financial/medical regulatory guidelines violated.");

    const isCompliant = errors.length === 0;

    return {
      isCompliant,
      gdprPassed,
      soc2Passed,
      isoPassed,
      internalGovernancePassed,
      legalConstraintsMet,
      regionalRestrictionsMet,
      industryPoliciesMet,
      errors,
      explanation: isCompliant
        ? "Compliance check successful. GDPR, SOC2, ISO, and regional regulatory checks verified cleanly."
        : `Compliance validation rejected: ${errors.join("; ")}`
    };
  }

  /**
   * DELIVERABLE 8: Delegation Validation Engine
   */
  public async validateDelegation(tenantId: string, decision: IDecision, actorId: string): Promise<IDelegationValidationResults> {
    this.validateRequestContext(tenantId);
    
    const errors: string[] = [];
    const responsibleExecutive = decision.ownership?.responsibleExecutive || "exec_cto";
    const delegatedExecutive = decision.ownership?.delegatedExecutive || actorId;
    const escalationOwner = decision.ownership?.escalationOwner || "exec_ceo";
    const fallbackOwner = decision.metadata?.fallbackOwner || "exec_operations_director";

    let reviewChainValid = true;
    let approvalChainValid = true;

    // A delegated executive acting on behalf of a responsible executive
    if (delegatedExecutive !== responsibleExecutive) {
      // Check delegation matrix in DI
      if (this.di.has("IExecutiveIdentityService")) {
        const identityService = this.di.resolve<any>("IExecutiveIdentityService");
        const respIdentity = await identityService.getExecutive(tenantId, responsibleExecutive).catch(() => null);
        
        if (respIdentity) {
          const profile = respIdentity.dna.delegationProfile;
          const allowedSubroles = profile.allowedSubagentRoles || [];
          
          const delegIdentity = await identityService.getExecutive(tenantId, delegatedExecutive).catch(() => null);
          const delegRole = delegIdentity?.role || "system";
          
          if (!allowedSubroles.includes(delegRole) && respIdentity.role !== "CEO") {
            errors.push(`Delegation Invalid: Responsible Executive [${responsibleExecutive}] cannot delegate type of decision to Role [${delegRole}].`);
          }
        }
      }
    }

    if (decision.trace?.approvalChain?.length === 0) {
      approvalChainValid = false;
      errors.push("Delegation review chain empty: No prior reviews or approvals are registered.");
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      responsibleExecutive,
      delegatedExecutive,
      escalationOwner,
      fallbackOwner,
      reviewChainValid,
      approvalChainValid,
      errors,
      explanation: isValid
        ? `Delegation from Responsible [${responsibleExecutive}] to Delegate [${delegatedExecutive}] successfully validated against roles and escalation path [${escalationOwner}].`
        : `Delegation invalid: ${errors.join("; ")}`
    };
  }

  /**
   * DELIVERABLE 9: Generate cryptographically signed, immutable Execution Token.
   */
  public async generateExecutionToken(
    tenantId: string,
    authorizationId: string,
    decision: IDecision
  ): Promise<IExecutionAuthorizationToken> {
    this.validateRequestContext(tenantId);

    const approvers = decision.trace?.approvalChain || [];
    const expiration = new Date(Date.now() + 86400000).toISOString(); // 24 hours expiry
    
    const constraints = [
      `MaxBudget=${decision.metadata?.budget || 0}`,
      `TenantId=${tenantId}`,
      `AllowedCategory=${decision.type}`
    ];

    const executionScope = {
      services: [
        "IExecutiveDecisionSelectionService",
        "IExecutiveDecisionAuthorizationService",
        "IExecutivePlanningService"
      ],
      domains: [decision.type.toLowerCase(), "operations"]
    };

    const allowedActions = [
      "budget:reserve",
      "planning:activate",
      "service:triggerExecution"
    ];

    const deniedActions = [
      "budget:bypassLimits",
      "security:overridePII"
    ];

    const rollbackEligibility = {
      canRollback: decision.metadata?.rollbackAvailable !== false,
      rollbackActions: ["budget:release", "planning:deactivate"]
    };

    // Crytographically generate immutable signature hash
    const rawPayload = JSON.stringify({
      authorizationId,
      decisionId: decision.id,
      tenantId,
      approvers,
      expiration,
      constraints
    });
    
    const signature = crypto
      .createHmac("sha256", "automexia_secure_signing_salt_stage35g")
      .update(rawPayload)
      .digest("hex");

    return {
      authorizationId,
      decisionId: decision.id,
      approvalStatus: "AUTHORIZED",
      approvers,
      expiration,
      constraints,
      executionScope,
      allowedActions,
      deniedActions,
      rollbackEligibility,
      signature
    };
  }

  /**
   * DELIVERABLE 11: Compilation Package
   */
  public async compileAuthorizationPackage(
    tenantId: string,
    authorizationId: string
  ): Promise<IAuthorizationPackage> {
    this.validateRequestContext(tenantId);

    const authRepo = this.di.resolve<IExecutiveDecisionAuthorizationRepository>("IExecutiveDecisionAuthorizationRepository");
    const auth = await authRepo.findAuthorizationById(tenantId, authorizationId);
    if (!auth) {
      throw new Error(`Authorization [${authorizationId}] not found.`);
    }

    const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
    const decision = await decisionRepo.findDecisionById(tenantId, auth.decisionId);
    if (!decision) {
      throw new Error(`Decision [${auth.decisionId}] not found.`);
    }

    // Gather from sibling engines if available in container
    let evidenceSnapshot: any = null;
    if (this.di.has("IExecutiveEvidenceRepository")) {
      const evidenceRepo = this.di.resolve<any>("IExecutiveEvidenceRepository");
      evidenceSnapshot = await evidenceRepo.findEvidenceById(tenantId, decision.id).catch(() => null);
    }

    let simulationSnapshot: any = null;
    if (this.di.has("IExecutiveSimulationService")) {
      const simSrv = this.di.resolve<any>("IExecutiveSimulationService");
      simulationSnapshot = await simSrv.getSimulation(tenantId, decision.id).catch(() => null);
    }

    let selectionSnapshot: IExecutiveDecisionSelection | undefined;
    if (this.di.has("IExecutiveDecisionSelectionRepository")) {
      const selectionRepo = this.di.resolve<any>("IExecutiveDecisionSelectionRepository");
      const selections = await selectionRepo.getSelections(tenantId).catch(() => []);
      selectionSnapshot = selections.find((s: any) => s.decisionId === decision.id);
    }

    return {
      id: auth.id,
      tenantId,
      decisionId: auth.decisionId,
      status: auth.status,
      compiledAt: new Date().toISOString(),
      decisionSnapshot: decision,
      evidenceSnapshot,
      simulationSnapshot,
      selectionSnapshot,
      commitmentSnapshot: selectionSnapshot?.commitmentPackage,
      approvalChain: decision.trace?.approvalChain || [],
      policyResults: auth.policyGateResults || { isPassed: false, policiesEvaluated: {} as any, explanation: "Unverified" },
      budgetResults: auth.budgetValidationResults || { isAuthorized: false, capexPassed: false, opexPassed: false, departmentBudgetPassed: false, runwayImpactAcceptable: false, cashFlowConstraintsMet: false, thresholdsRespected: false, errors: [], explanation: "Unverified" },
      complianceResults: auth.complianceValidationResults || { isCompliant: false, gdprPassed: false, soc2Passed: false, isoPassed: false, internalGovernancePassed: false, legalConstraintsMet: false, regionalRestrictionsMet: false, industryPoliciesMet: false, errors: [], explanation: "Unverified" },
      riskResults: auth.riskAuthorizationResults || { isPassed: false, residualRisk: 1.0, riskAppetiteMet: false, criticalThresholdRespected: false, recoveryAvailable: false, fallbackAvailable: false, businessContinuityValid: false, errors: [], explanation: "Unverified" },
      executionToken: auth.executionToken
    };
  }

  /**
   * DELIVERABLE 19: Authorization Drift Engine (No mutation of original)
   */
  public calculateDrift(
    tenantId: string,
    auth: IExecutiveDecisionAuthorization,
    currentDecisionState: IDecision
  ): IAuthorizationDriftReport {
    this.validateRequestContext(tenantId);
    this.verifyTenant(tenantId, auth.tenantId);
    this.verifyTenant(tenantId, currentDecisionState.tenantId);

    const details: string[] = [];
    
    // 1. Budget Drift: Compare current budget to authorized budget
    let originalBudget = 0;
    if (auth.executionToken?.constraints) {
      const budgetConstraint = auth.executionToken.constraints.find(c => c.startsWith("MaxBudget="));
      if (budgetConstraint) {
        originalBudget = parseFloat(budgetConstraint.split("=")[1]) || 0;
      }
    }
    const currentBudget = currentDecisionState.metadata?.budget || 0;
    let budgetDrift = 0.0;
    
    if (originalBudget > 0 && currentBudget !== originalBudget) {
      budgetDrift = Math.min(1.0, Math.abs(currentBudget - originalBudget) / originalBudget);
      details.push(`Budget drifted from original $${originalBudget} to current $${currentBudget} (drift ${Math.round(budgetDrift * 100)}%).`);
    }

    // 2. Risk Drift
    const originalRisk = auth.riskAuthorizationResults?.residualRisk || 0.3;
    const currentRisk = currentDecisionState.metadata?.riskIndex !== undefined ? currentDecisionState.metadata.riskIndex : 0.3;
    const riskDrift = Math.min(1.0, Math.abs(currentRisk - originalRisk));
    if (riskDrift > 0.05) {
      details.push(`Residual risk drifted from original ${originalRisk} to current ${currentRisk}.`);
    }

    // 3. Authority Drift (E.g. executive role/status changes)
    let authorityDrift = 0.0;
    if (currentDecisionState.ownership?.responsibleExecutive !== auth.delegationValidationResults?.responsibleExecutive) {
      authorityDrift = 1.0;
      details.push(`Authority Drift: Responsible executive changed from [${auth.delegationValidationResults?.responsibleExecutive}] to [${currentDecisionState.ownership?.responsibleExecutive}].`);
    }

    // 4. Compliance Drift (E.g. security constraints bypassed)
    let complianceDrift = 0.0;
    if (currentDecisionState.metadata?.gdprCompliant === false && auth.complianceValidationResults?.gdprPassed) {
      complianceDrift = 1.0;
      details.push("Compliance Drift: GDPR compliance state downgraded to failed.");
    }

    // 5. Policy Drift (E.g. new broken assumptions)
    let policyDrift = 0.0;
    const currentBroken = currentDecisionState.assumptions?.filter(a => a.validationStatus === "BROKEN").length || 0;
    if (currentBroken > 0) {
      policyDrift = 0.5;
      details.push(`Policy Drift: ${currentBroken} assumptions are now BROKEN.`);
    }

    // 6. Approval Drift
    let approvalDrift = 0.0;
    const originalApprovers = auth.executionToken?.approvers || [];
    const currentApprovers = currentDecisionState.trace?.approvalChain || [];
    const missing = originalApprovers.filter(a => !currentApprovers.includes(a));
    if (missing.length > 0) {
      approvalDrift = 1.0;
      details.push(`Approval Drift: Authorized approvers [${missing.join(", ")}] are no longer present in current approval chain.`);
    }

    const hasDrift = details.length > 0;

    return {
      authorizationId: auth.id,
      tenantId,
      hasDrift,
      driftIndicators: {
        policyDrift,
        budgetDrift,
        authorityDrift,
        complianceDrift,
        riskDrift,
        approvalDrift
      },
      details,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * DELIVERABLE 20: Locking Engine
   */
  public async lockAuthorization(
    tenantId: string,
    authorizationId: string,
    actorId: string
  ): Promise<void> {
    this.validateRequestContext(tenantId);
    const authRepo = this.di.resolve<IExecutiveDecisionAuthorizationRepository>("IExecutiveDecisionAuthorizationRepository");
    
    const auth = await authRepo.findAuthorizationById(tenantId, authorizationId);
    if (!auth) throw new Error("Authorization record not found.");

    if (auth.isLocked) {
      return; // Already locked
    }

    auth.isLocked = true;
    auth.lockedAt = new Date().toISOString();
    auth.version += 1;
    auth.updatedAt = new Date().toISOString();
    
    // Create static JSON snapshot payload
    const snapshotObj = JSON.parse(JSON.stringify(auth));
    auth.lockedSnapshot = JSON.stringify(snapshotObj);

    await authRepo.saveAuthorization(tenantId, auth);
    await authRepo.saveSnapshot(tenantId, authorizationId, auth);
    await this.recordHistory(tenantId, auth, "UNDER_COMPLIANCE_REVIEW", "AUTHORIZED", actorId, "Authorization complete. Immutable State Locked.");
    
    await this.publishEvent(tenantId, "executive.authorization.token.generated", {
      authorizationId,
      decisionId: auth.decisionId,
      tenantId,
      actorId,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================================================
  // INTERNAL PRIVATE HELPERS
  // ============================================================================

  private generateExplainability(
    authVal: IAuthorityValidationResult,
    policyVal: IPolicyGateResults,
    budgetVal: IBudgetValidationResults,
    riskVal: IRiskAuthorizationResults,
    complianceVal: IComplianceValidationResults,
    delegationVal: IDelegationValidationResults
  ): IAuthorizationExplainability {
    const reasons: string[] = [];
    if (!authVal.isValid) reasons.push(...authVal.errors);
    if (!policyVal.isPassed) reasons.push(policyVal.explanation);
    if (!budgetVal.isAuthorized) reasons.push(...budgetVal.errors);
    if (!riskVal.isPassed) reasons.push(...riskVal.errors);
    if (!complianceVal.isCompliant) reasons.push(...complianceVal.errors);
    if (!delegationVal.isValid) reasons.push(...delegationVal.errors);

    const summary = reasons.length === 0
      ? "Decision selection is fully authorized under all legal, compliance, budget, policy, and risk gates."
      : `Authorization denied due to the following gate blocks: ${reasons.join("; ")}`;

    return {
      summary,
      reasons,
      budgetAnalysis: budgetVal.explanation,
      complianceAnalysis: complianceVal.explanation,
      policyAnalysis: policyVal.explanation,
      escalationRequirements: authVal.chainValid
        ? "No escalations required. Signatures intact."
        : `Escalations required: ${authVal.errors.filter(e => e.includes("Required") || e.includes("Incomplete")).join("; ")}`
    };
  }

  private async updateStatus(
    tenantId: string,
    authorizationId: string,
    newStatus: AuthorizationLifecycleState,
    actorId: string,
    reason: string
  ): Promise<void> {
    const authRepo = this.di.resolve<IExecutiveDecisionAuthorizationRepository>("IExecutiveDecisionAuthorizationRepository");
    const auth = await authRepo.findAuthorizationById(tenantId, authorizationId);
    if (!auth) return;

    const previousStatus = auth.status;
    if (previousStatus === newStatus) return;

    auth.status = newStatus;
    auth.version += 1;
    auth.updatedAt = new Date().toISOString();
    await authRepo.saveAuthorization(tenantId, auth);

    await this.recordHistory(tenantId, auth, previousStatus, newStatus, actorId, reason);
  }

  private async recordHistory(
    tenantId: string,
    auth: IExecutiveDecisionAuthorization,
    previousStatus: AuthorizationLifecycleState | "NONE",
    newStatus: AuthorizationLifecycleState,
    actorId: string,
    reason: string
  ): Promise<void> {
    const authRepo = this.di.resolve<IExecutiveDecisionAuthorizationRepository>("IExecutiveDecisionAuthorizationRepository");
    const historyEntry: IAuthorizationHistoryEntry = {
      id: `hist_${crypto.randomUUID().replace(/-/g, "")}`,
      tenantId,
      authorizationId: auth.id,
      version: auth.version,
      previousStatus,
      newStatus,
      actorId,
      timestamp: new Date().toISOString(),
      reason,
      snapshot: JSON.parse(JSON.stringify(auth))
    };
    await authRepo.saveHistory(tenantId, historyEntry);
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
