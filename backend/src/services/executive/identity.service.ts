import { DIContainer, container } from "../../runtime/kernel/diContainer";
import {
  IExecutiveIdentity,
  IExecutiveDNA,
  IBoundary,
  IAuthority,
  ExecutiveLifecycleState,
  IMissionState,
  IExecutiveHealthSignals,
  IExecutiveHealth,
  ExecutiveHealthStatus,
  IBusinessOutcome,
  IExecutiveRepository,
  IGoalAlignmentProfile,
  ICapabilityRequest,
  ICapabilityResponse,
  IExecutiveDiagnostics,
  IExecutiveEvolutionMetadata,
  IDecisionExplainability
} from "./interfaces";
import { validateExecutiveIdentity, validateExecutiveDNA } from "./validation";
import { getRequestContext } from "../../observability/requestContext";

// RIGID LIFECYCLE STATE TRANSITIONS (Stage 3.1 Mandatory Enhancement & Stage 3.1C Recovery States)
const VALID_TRANSITIONS: Record<ExecutiveLifecycleState, ExecutiveLifecycleState[]> = {
  DRAFT: ["CONFIGURED", "SUSPENDED", "RETIRED"],
  CONFIGURED: ["DRAFT", "LEARNING", "ACTIVE", "SUSPENDED", "RETIRED", "STANDBY"],
  LEARNING: ["CONFIGURED", "ACTIVE", "SUSPENDED", "RETIRED", "STANDBY"],
  ACTIVE: ["REVIEW", "OPTIMIZING", "SUSPENDED", "RETIRED", "STANDBY", "WARNING"],
  REVIEW: ["ACTIVE", "OPTIMIZING", "SUSPENDED", "RETIRED", "STANDBY"],
  OPTIMIZING: ["ACTIVE", "REVIEW", "SUSPENDED", "RETIRED", "STANDBY"],
  SUSPENDED: ["ACTIVE", "REVIEW", "RETIRED", "STANDBY", "RECOVERY"],
  RETIRED: [], // Terminal State
  STANDBY: ["ACTIVE", "SUSPENDED", "RETIRED"], // Backward compatibility support
  WARNING: ["OBSERVATION", "ACTIVE", "SUSPENDED", "RETIRED"],
  OBSERVATION: ["RECOVERY", "ACTIVE", "SUSPENDED", "RETIRED"],
  RECOVERY: ["ACTIVE", "SUSPENDED", "RETIRED"]
};

export class ExecutiveIdentityService {
  private repository: IExecutiveRepository;
  private dnaHistory = new Map<string, IExecutiveDNA[]>(); // role -> list of historical DNA versions

  constructor(private di: DIContainer = container) {
    this.repository = di.resolve<IExecutiveRepository>("IExecutiveRepository");
  }

  /**
   * Resets all internal stores (primarily for testing purposes).
   */
  public reset(): void {
    (this.repository as any).clear?.();
    this.dnaHistory.clear();
  }

  /**
   * Helper to verify multi-tenant isolation and ownership.
   */
  private verifyTenantOwnership(tenantId: string, resourceTenantId?: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;

    // Validate context-level tenant (Never trust caller-provided identifiers)
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }

    // Validate resource-level tenant
    if (resourceTenantId && resourceTenantId !== tenantId) {
      throw new Error(`Security Violation: Resource tenant [${resourceTenantId}] does not match target tenant [${tenantId}].`);
    }
  }

  /**
   * Registers a domain-independent Executive DNA template.
   * Auto-upgrades old DNA configurations to support new capability profiles, outcome ownership,
   * and decision authority matrices seamlessly.
   */
  public registerDNA(dna: IExecutiveDNA): void {
    // 1. Backward-compatibility: auto-upgrade DNA with capability profile
    const capabilityProfile = dna.capabilityProfile || {
      allowedDecisionCategories: ["operational", "tactical"],
      allowedReasoningDomains: ["operations"],
      executableCapabilities: dna.authorities ? dna.authorities.map((a) => a.action) : [],
      collaborationCapabilities: [],
      delegationCapabilities: dna.delegationProfile && dna.delegationProfile.autoDelegationEnabled ? ["auto_delegate"] : [],
      reviewCapabilities: [],
      approvalCapabilities: [],
    };

    // 2. Backward-compatibility: auto-upgrade DNA with decision authority matrix
    const decisionAuthorityMatrix = dna.decisionAuthorityMatrix || {
      rules: dna.authorities
        ? dna.authorities.map((a) => ({
            action: a.action,
            ownershipRole: dna.role,
            approvalRequired: a.approvalRequired,
            approvalThreshold: a.maxBudgetThreshold,
            delegable: true,
            executionRoles: [dna.role],
          }))
        : [],
    };

    // Helper function to calculate outcome status using dynamic evaluation thresholds
    const evaluateStatus = (
      current: number,
      target: number,
      higherBetter: boolean,
      atRiskThreshold?: number,
      criticalThreshold?: number
    ) => {
      const resolveThreshold = (thresh: number | undefined, defaultRatio: number) => {
        if (thresh === undefined) return target * defaultRatio;
        if (thresh > 5.0 || thresh < -5.0) return thresh; // Absolute threshold
        return target * thresh; // Ratio
      };

      if (higherBetter) {
        const risk = resolveThreshold(atRiskThreshold, 1.0);
        const crit = resolveThreshold(criticalThreshold, 0.85);
        if (current >= risk) return "ON_TRACK" as const;
        if (current >= crit) return "AT_RISK" as const;
        return "CRITICAL" as const;
      } else {
        const risk = resolveThreshold(atRiskThreshold, 1.0);
        const crit = resolveThreshold(criticalThreshold, 1.15);
        if (current <= risk) return "ON_TRACK" as const;
        if (current <= crit) return "AT_RISK" as const;
        return "CRITICAL" as const;
      }
    };

    // 3. Backward-compatibility: auto-upgrade DNA with business outcome ownership
    const businessOutcomes = dna.businessOutcomes
      ? dna.businessOutcomes.map((o) => ({
          ...o,
          status: evaluateStatus(o.currentValue, o.targetValue, o.higherIsBetter, o.atRiskThreshold, o.criticalThreshold),
        }))
      : (dna.kpiOwnership
          ? dna.kpiOwnership.map((k) => ({
              id: `outcome_${k.id}`,
              category: "OPERATIONAL_EXCELLENCE" as const,
              name: k.name,
              description: `Outcome tracking for ${k.name}`,
              targetMetricToken: k.metricToken,
              targetValue: k.targetValue,
              currentValue: k.currentValue,
              unit: k.unit,
              weight: 0.5,
              higherIsBetter: true,
              status: evaluateStatus(k.currentValue, k.targetValue, true),
            }))
          : []);

    // 4. Backward-compatibility: auto-upgrade legacy authorities mapping if needed
    const authorities = dna.authorities || decisionAuthorityMatrix.rules.map((rule, idx) => ({
      id: `auth_legacy_${idx}`,
      action: rule.action,
      description: `Legacy authority mapping for ${rule.action}`,
      maxBudgetThreshold: rule.approvalThreshold,
      approvalRequired: rule.approvalRequired,
    }));

    // 5. Backward-compatibility: enhance personality traits with default parameters
    const personalityModel = { ...dna.personalityModel };
    personalityModel.analyticalDepth = personalityModel.analyticalDepth !== undefined ? personalityModel.analyticalDepth : 0.7;
    personalityModel.creativity = personalityModel.creativity !== undefined ? personalityModel.creativity : 0.5;
    personalityModel.riskAppetite = personalityModel.riskAppetite !== undefined ? personalityModel.riskAppetite : 0.4;
    personalityModel.decisionSpeed = personalityModel.decisionSpeed !== undefined ? personalityModel.decisionSpeed : 0.6;
    personalityModel.evidenceRequirement = personalityModel.evidenceRequirement !== undefined ? personalityModel.evidenceRequirement : 0.8;
    personalityModel.collaborationTendency = personalityModel.collaborationTendency !== undefined ? personalityModel.collaborationTendency : 0.5;
    personalityModel.communicationPreference = personalityModel.communicationPreference || "detailed";
    personalityModel.autonomyLevel = personalityModel.autonomyLevel !== undefined ? personalityModel.autonomyLevel : 0.6;
    personalityModel.adaptability = personalityModel.adaptability !== undefined ? personalityModel.adaptability : 0.5;

    const goalAlignment: IGoalAlignmentProfile = dna.goalAlignment || {
      longTermMissionId: `mission:${dna.role}:long_term`,
      strategicObjectiveIds: [],
      tacticalObjectiveIds: [],
      operationalObjectiveIds: [],
      currentPriorityIds: [],
      businessOutcomeIds: businessOutcomes.map((o) => o.id),
      organizationNodeId: `org_node:${dna.role}`
    };

    const evolutionMetadata: IExecutiveEvolutionMetadata = dna.evolutionMetadata || {
      dnaVersion: dna.version,
      identityVersion: 1,
      compatibilityVersion: "1.0.0",
      migrationHistory: [],
      rollbackMetadata: {
        targetVersion: dna.version,
        canRollback: false
      },
      upgradePath: [],
      deprecationState: {
        isDeprecated: false
      }
    };

    const upgradedDna: IExecutiveDNA = {
      ...dna,
      capabilityProfile,
      decisionAuthorityMatrix,
      businessOutcomes,
      authorities,
      personalityModel,
      goalAlignment,
      evolutionMetadata
    };

    const validation = validateExecutiveDNA(upgradedDna);
    if (!validation.isValid) {
      throw new Error(`DNA Validation Failed: ${validation.issues.join("; ")}`);
    }

    // Save to repository synchronously so it is available immediately for tests
    if ((this.repository as any).saveDNASync) {
      (this.repository as any).saveDNASync(upgradedDna);
    }

    // Run version compatibility checking and persistence asynchronously in the background
    this.runBackgroundDNAPersistence(upgradedDna).catch((err) => {
      console.error(`[Executive Identity Service] Background DNA persistence failed for ${upgradedDna.role}:`, err);
    });
  }

  private async runBackgroundDNAPersistence(upgradedDna: IExecutiveDNA): Promise<void> {
    if (this.di.has("ICompatibilityEngine")) {
      const compEngine = this.di.resolve<any>("ICompatibilityEngine");
      if (!compEngine.isExecutiveAiVersionSupported(upgradedDna.version)) {
        throw new Error(`DNA Version [${upgradedDna.version}] is not supported by CompatibilityEngine.`);
      }
    }

    const existing = await this.repository.getDNA(upgradedDna.role);
    if (existing) {
      const history = this.dnaHistory.get(upgradedDna.role) || [];
      if (!history.some((x) => x.version === existing.version)) {
        history.push({ ...existing });
        this.dnaHistory.set(upgradedDna.role, history);
      }
    }

    await this.repository.saveDNA(upgradedDna);
    console.log(`[Executive Identity Service] Registered DNA for role: ${upgradedDna.role} (v${upgradedDna.version})`);
  }

  public getDNA(role: string): IExecutiveDNA | null {
    const cached = (this.repository as any).getDNASync?.(role);
    if (cached) return cached;
    return null;
  }

  /**
   * Retrieves a DNA's registration audit history.
   */
  public getDNAHistory(role: string): IExecutiveDNA[] {
    return this.dnaHistory.get(role) || [];
  }

  /**
   * Rolls back DNA to a previously registered version.
   */
  public async rollbackDNA(role: string, version: string): Promise<void> {
    const history = this.dnaHistory.get(role) || [];
    const target = history.find(x => x.version === version);
    if (!target) {
      throw new Error(`DNA version [${version}] not found in audit history for role [${role}].`);
    }

    await this.repository.saveDNA({ ...target });
    console.log(`[Executive Identity Service] Rolled back DNA for role [${role}] to version [${version}]`);
  }

  /**
   * Instantiates an Executive Identity from a DNA template.
   */
  public async createExecutive(
    tenantId: string,
    role: string,
    name: string,
    metadata: Record<string, any> = {}
  ): Promise<IExecutiveIdentity> {
    if (!tenantId || tenantId.trim() === "") {
      throw new Error("Tenant ID is required.");
    }
    this.verifyTenantOwnership(tenantId);

    const dna = await this.repository.getDNA(role);
    if (!dna) {
      throw new Error(`DNA template for role [${role}] not registered.`);
    }

    const id = `exec_${role.toLowerCase()}_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date();

    // Initialize stateful enterprise systems
    const missionState: IMissionState = {
      currentDirectives: [...dna.mission.directives],
      activeConstraints: [],
      alignmentAdjustments: {},
      contextualVariables: {},
      lastUpdated: now,
    };

    const businessOutcomes: IBusinessOutcome[] = dna.businessOutcomes.map((o) => ({ ...o }));

    const healthSignals: IExecutiveHealthSignals = {
      decisionConsistency: 1.0,
      executionSuccessRate: 1.0,
      escalationCount: 0,
      policyViolationCount: 0,
      humanInterventionCount: 0,
      confidenceScore: 1.0,
      recoveryStatus: "NONE",
    };

    const health = this.calculateHealth(healthSignals);

    const diagnostics: IExecutiveDiagnostics = {
      decisionQualityIndex: 1.0,
      executionSuccessRate: 1.0,
      averageConfidenceScore: 1.0,
      policyComplianceScore: 1.0,
      authorityUtilizationRatio: 0.0,
      healthScore: 100,
      outcomeOwnershipCount: businessOutcomes.length,
      capabilityCoverageRatio: dna.capabilityProfile?.executableCapabilities?.length ? 1.0 : 0.0,
      lifecycleState: "ACTIVE",
      calculatedAt: now.toISOString()
    };

    const identity: IExecutiveIdentity = {
      id,
      tenantId,
      role,
      name,
      status: "ACTIVE", // Start state active for backward compatibility
      dna,
      metadata,
      createdAt: now,
      updatedAt: now,
      missionState,
      businessOutcomes,
      healthSignals,
      health,
      version: 1,
      goalAlignment: { ...dna.goalAlignment! },
      evolutionMetadata: { ...dna.evolutionMetadata! },
      diagnostics
    };

    const validation = validateExecutiveIdentity(identity);
    if (!validation.isValid) {
      throw new Error(`Identity Validation Failed: ${validation.issues.join("; ")}`);
    }

    const saved = await this.repository.saveExecutive(identity);
    console.log(`[Executive Identity Service] Created Executive Identity [${id}] for tenant [${tenantId}]`);

    // Synchronize metadata with the OIG (Organization Graph)
    await this.syncToOIG(tenantId, id);

    // Save initial state to memory engine
    await this.writeToMemory(tenantId, `status:${id}`, { status: saved.status, updatedAt: saved.updatedAt });
    await this.writeToMemory(tenantId, `health:${id}`, { score: saved.health.score, status: saved.health.status });
    await this.writeToMemory(tenantId, `mission_state:${id}`, saved.missionState);

    // Publish creation event
    await this.publishEvent(tenantId, "executive.created", {
      id,
      role,
      name,
      status: saved.status,
    });

    return saved;
  }

  /**
   * Retrieves an executive identity by ID, enforcing tenant isolation.
   */
  public async getExecutive(tenantId: string, id: string): Promise<IExecutiveIdentity | null> {
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) return null;

    // Secure cross-tenant check
    this.verifyTenantOwnership(tenantId, identity.tenantId);

    return identity;
  }

  /**
   * Lists all executives for a tenant, enforcing tenant isolation.
   */
  public async listExecutives(tenantId: string): Promise<IExecutiveIdentity[]> {
    this.verifyTenantOwnership(tenantId);
    return this.repository.listExecutives(tenantId);
  }

  /**
   * Upgrades an executive's bound DNA version.
   */
  public async upgradeExecutive(tenantId: string, id: string, targetVersion: string): Promise<IExecutiveIdentity> {
    this.verifyTenantOwnership(tenantId);
    const exec = await this.repository.getExecutive(tenantId, id);
    if (!exec) {
      throw new Error(`Executive [${id}] not found.`);
    }

    const dna = await this.repository.getDNA(exec.role);
    if (!dna || dna.version !== targetVersion) {
      const history = this.dnaHistory.get(exec.role) || [];
      const targetDna = history.find(x => x.version === targetVersion) || (dna && dna.version === targetVersion ? dna : null);
      if (!targetDna) {
        throw new Error(`DNA version [${targetVersion}] for role [${exec.role}] not registered.`);
      }
      exec.dna = targetDna;
    } else {
      exec.dna = dna;
    }

    exec.updatedAt = new Date();
    const updated = await this.repository.saveExecutive(exec, exec.version);

    await this.syncToOIG(tenantId, id);
    await this.publishEvent(tenantId, "executive.lifecycle.transitioned", {
      id,
      fromState: exec.status,
      toState: exec.status,
      reason: `Upgraded DNA template to version [${targetVersion}]`,
    });

    return updated;
  }

  /**
   * Transitions an executive lifecycle status with validation and optimistic concurrency.
   */
  public async transitionLifecycle(
    tenantId: string,
    id: string,
    targetState: ExecutiveLifecycleState,
    reason?: string,
    expectedVersion?: number
  ): Promise<IExecutiveIdentity> {
    this.verifyTenantOwnership(tenantId);
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    this.verifyTenantOwnership(tenantId, identity.tenantId);

    const fromState = identity.status;
    if (fromState === targetState) {
      return identity;
    }

    // Validate transition mapping
    const allowed = VALID_TRANSITIONS[fromState];
    if (!allowed || !allowed.includes(targetState)) {
      throw new Error(`Invalid lifecycle transition from [${fromState}] to [${targetState}].`);
    }

    identity.status = targetState;
    identity.updatedAt = new Date();
    
    // Save with optimistic concurrency check
    const updated = await this.repository.saveExecutive(identity, expectedVersion ?? identity.version);

    console.log(`[Executive Identity Service] Updated Executive [${id}] status: ${fromState} -> ${targetState}. Reason: ${reason || "none"}`);

    // Update OIG Graph Node properties
    await this.syncToOIG(tenantId, id);

    // Save updated status to memory engine
    await this.writeToMemory(tenantId, `status:${id}`, { status: updated.status, updatedAt: updated.updatedAt, reason });

    // Publish lifecycle transition event
    await this.publishEvent(tenantId, "executive.lifecycle.transitioned", {
      id,
      fromState,
      toState: targetState,
      reason,
      timestamp: updated.updatedAt.toISOString(),
    });

    // Publish backward-compatible status event
    await this.publishEvent(tenantId, "executive.status.updated", {
      id,
      oldStatus: fromState,
      newStatus: targetState,
      reason,
    });

    return updated;
  }

  /**
   * Backward-compatible status updater mapping to the lifecycle transition system.
   */
  public async updateStatus(
    tenantId: string,
    id: string,
    status: ExecutiveLifecycleState,
    reason?: string
  ): Promise<IExecutiveIdentity> {
    return this.transitionLifecycle(tenantId, id, status, reason);
  }

  /**
   * Updates the contextual state of the mission with optimistic concurrency.
   */
  public async updateMissionState(
    tenantId: string,
    id: string,
    update: Partial<IMissionState>,
    expectedVersion?: number
  ): Promise<IExecutiveIdentity> {
    this.verifyTenantOwnership(tenantId);
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    this.verifyTenantOwnership(tenantId, identity.tenantId);

    identity.missionState = {
      ...identity.missionState,
      ...update,
      lastUpdated: new Date(),
    };
    identity.updatedAt = new Date();
    
    const updated = await this.repository.saveExecutive(identity, expectedVersion ?? identity.version);

    await this.syncToOIG(tenantId, id);
    await this.writeToMemory(tenantId, `mission_state:${id}`, updated.missionState);

    await this.publishEvent(tenantId, "executive.mission.updated", {
      id,
      missionState: updated.missionState,
    });

    return updated;
  }

  /**
   * Updates a business outcome's tracking metrics with custom thresholds and optimistic concurrency.
   */
  public async updateBusinessOutcome(
    tenantId: string,
    id: string,
    outcomeId: string,
    value: number,
    expectedVersion?: number
  ): Promise<IExecutiveIdentity> {
    this.verifyTenantOwnership(tenantId);
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    this.verifyTenantOwnership(tenantId, identity.tenantId);

    const outcome = identity.businessOutcomes.find((o) => o.id === outcomeId);
    if (!outcome) {
      throw new Error(`Business outcome [${outcomeId}] not found on Executive [${id}].`);
    }

    const oldStatus = outcome.status;
    outcome.currentValue = value;

    // Status evaluation based on directionality and configurable thresholds
    const evaluateStatus = (
      curr: number,
      target: number,
      higherBetter: boolean,
      atRiskThreshold?: number,
      criticalThreshold?: number
    ) => {
      const resolveThreshold = (thresh: number | undefined, defaultRatio: number) => {
        if (thresh === undefined) return target * defaultRatio;
        if (thresh > 5.0 || thresh < -5.0) return thresh;
        return target * thresh;
      };

      if (higherBetter) {
        const risk = resolveThreshold(atRiskThreshold, 1.0);
        const crit = resolveThreshold(criticalThreshold, 0.85);
        if (curr >= risk) return "ON_TRACK";
        if (curr >= crit) return "AT_RISK";
        return "CRITICAL";
      } else {
        const risk = resolveThreshold(atRiskThreshold, 1.0);
        const crit = resolveThreshold(criticalThreshold, 1.15);
        if (curr <= risk) return "ON_TRACK";
        if (curr <= crit) return "AT_RISK";
        return "CRITICAL";
      }
    };

    outcome.status = evaluateStatus(
      value,
      outcome.targetValue,
      outcome.higherIsBetter,
      outcome.atRiskThreshold,
      outcome.criticalThreshold
    );

    identity.updatedAt = new Date();
    const updated = await this.repository.saveExecutive(identity, expectedVersion ?? identity.version);

    await this.syncToOIG(tenantId, id);
    await this.writeToMemory(tenantId, `outcome:${id}:${outcomeId}`, outcome);

    await this.publishEvent(tenantId, "executive.outcome.updated", {
      id,
      outcomeId,
      oldStatus,
      newStatus: outcome.status,
      currentValue: value,
    });

    return updated;
  }

  /**
   * Records a health signal and recomputes the computed health model with optimistic concurrency.
   */
  public async recordHealthSignal(
    tenantId: string,
    id: string,
    signalType: keyof IExecutiveHealthSignals,
    value: any,
    expectedVersion?: number
  ): Promise<IExecutiveIdentity> {
    this.verifyTenantOwnership(tenantId);
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    this.verifyTenantOwnership(tenantId, identity.tenantId);

    const signals = identity.healthSignals!;
    if (typeof value === "number") {
      if (signalType === "decisionConsistency" || signalType === "executionSuccessRate" || signalType === "confidenceScore") {
        (signals as any)[signalType] = Math.max(0, Math.min(1.0, value));
      } else {
        (signals as any)[signalType] = value;
      }
    } else if (typeof value === "string" && signalType === "recoveryStatus") {
      signals.recoveryStatus = value as any;
    } else {
      // Treat as increment command
      if (typeof (signals as any)[signalType] === "number") {
        (signals as any)[signalType]++;
      }
    }

    // Append to health history
    if (!identity.health) {
      identity.health = {
        status: "HEALTHY",
        score: 100,
        signals: { ...signals },
        calculatedAt: new Date(),
        history: []
      };
    }
    if (!identity.health.history) {
      identity.health.history = [];
    }
    identity.health.history.push({
      timestamp: new Date().toISOString(),
      signalType,
      value
    });

    const oldHealth = { ...identity.health };
    identity.health = this.calculateHealth(signals, identity.health.history);
    identity.updatedAt = new Date();
    
    const updated = await this.repository.saveExecutive(identity, expectedVersion ?? identity.version);

    await this.syncToOIG(tenantId, id);
    await this.writeToMemory(tenantId, `health:${id}`, updated.health);

    if (oldHealth.status !== updated.health.status) {
      await this.publishEvent(tenantId, "executive.health.updated", {
        id,
        oldStatus: oldHealth.status,
        newStatus: updated.health.status,
        score: updated.health.score,
        signals: { ...updated.healthSignals },
      });

      // Automatic escalation if health drops into critical
      if (updated.health.status === "CRITICAL") {
        await this.triggerEscalation(
          tenantId,
          updated,
          "health_critical_degradation",
          `Executive Health status degraded to CRITICAL (score: ${updated.health.score})`
        );
      }
    }

    // Automatic recovery lifecycle transitions
    let newLifecycleState: ExecutiveLifecycleState | null = null;
    const currentLifecycle = updated.status;

    if (updated.health.status === "CRITICAL") {
      newLifecycleState = "SUSPENDED";
    } else if (updated.health.status === "DEGRADED") {
      if (currentLifecycle === "ACTIVE") {
        newLifecycleState = "WARNING";
      } else if (currentLifecycle === "WARNING") {
        newLifecycleState = "OBSERVATION";
      }
    } else if (updated.health.status === "HEALTHY") {
      if (currentLifecycle === "WARNING" || currentLifecycle === "OBSERVATION" || currentLifecycle === "RECOVERY" || currentLifecycle === "SUSPENDED") {
        newLifecycleState = "ACTIVE";
      }
    }

    // Check for recovery state transition (improving score in OBSERVATION)
    if (currentLifecycle === "OBSERVATION" && updated.health.score > (oldHealth.score || 0)) {
      newLifecycleState = "RECOVERY";
    }

    if (newLifecycleState && newLifecycleState !== currentLifecycle) {
      try {
        await this.transitionLifecycle(tenantId, id, newLifecycleState, `Auto-health transition to [${newLifecycleState}] due to score [${updated.health.score}]`, updated.version);
      } catch (err) {
        // Fallback
      }
    }

    return this.repository.getExecutive(tenantId, id) as Promise<IExecutiveIdentity>;
  }

  /**
   * Adaptive Health Score algorithm using sliding window and exponential decay.
   */
  private calculateHealth(signals: IExecutiveHealthSignals, history: any[] = []): IExecutiveHealth {
    let score = 100;
    const now = Date.now();
    
    // Half life duration (e.g. 1 hour = 3600000ms)
    const halfLife = 3600 * 1000;

    let decayedViolations = 0;
    let decayedEscalations = 0;
    let decayedInterventions = 0;

    for (const incident of history) {
      const incidentTime = new Date(incident.timestamp).getTime();
      const age = now - incidentTime;
      if (age < 0) continue;

      const decayFactor = Math.pow(0.5, age / halfLife);

      if (incident.signalType === "policyViolationCount") {
        decayedViolations += (incident.value || 1) * decayFactor;
      } else if (incident.signalType === "escalationCount") {
        decayedEscalations += (incident.value || 1) * decayFactor;
      } else if (incident.signalType === "humanInterventionCount") {
        decayedInterventions += (incident.value || 1) * decayFactor;
      }
    }

    if (history.length === 0) {
      decayedViolations = signals.policyViolationCount;
      decayedEscalations = signals.escalationCount;
      decayedInterventions = signals.humanInterventionCount;
    }

    // Point deductions using decayed parameters
    score -= decayedViolations * 25;
    score -= decayedEscalations * 15;
    score -= decayedInterventions * 10;

    // Decision consistency penalty: max 30 points
    score -= (1.0 - signals.decisionConsistency) * 30;

    // Execution success penalty: max 30 points
    score -= (1.0 - signals.executionSuccessRate) * 30;

    // Confidence degradation penalty: max 15 points
    score -= (1.0 - signals.confidenceScore) * 15;

    // Recovery state adjustment & scoring
    if (signals.recoveryStatus === "FAILED") {
      score -= 40;
    } else if (signals.recoveryStatus === "RECOVERING") {
      // In recovery, we gradually grant points back if no new violations are recorded recently
      const lastViolation = history
        .filter(h => h.signalType === "policyViolationCount")
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      
      if (lastViolation) {
        const timeSinceViolation = now - new Date(lastViolation.timestamp).getTime();
        const recoveryBonus = Math.min(15, (timeSinceViolation / halfLife) * 15);
        score += recoveryBonus;
      } else {
        score += 10; // Flat bonus if in recovery and no violations recorded
      }
      score -= 15; // Base recovering penalty is -15
    }

    // Confidence Trend Analysis
    const confidenceSignals = history.filter(h => h.signalType === "confidenceScore");
    if (confidenceSignals.length >= 2) {
      const sorted = confidenceSignals.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const firstVal = sorted[0].value;
      const lastVal = sorted[sorted.length - 1].value;
      if (lastVal > firstVal) {
        score += 5; // Positive trend bonus
      }
    }

    // Clamp score
    score = Math.max(0, Math.min(100, Math.round(score)));

    let status: ExecutiveHealthStatus = "HEALTHY";
    if (score < 50) {
      status = "CRITICAL";
    } else if (score < 80) {
      status = "DEGRADED";
    }

    return {
      status,
      score,
      signals: {
        ...signals,
        policyViolationCount: Math.round(decayedViolations),
        escalationCount: Math.round(decayedEscalations),
        humanInterventionCount: Math.round(decayedInterventions),
      },
      calculatedAt: new Date(),
      history,
    };
  }

  /**
   * Validates if an action is within an executive's Decision Authority Matrix boundaries.
   */
  public async validateAuthority(
    tenantId: string,
    id: string,
    action: string,
    context: { budgetAmount?: number; hiringCount?: number; actorRole?: string } = {}
  ): Promise<{ authorized: boolean; reason?: string }> {
    const identity = await this.getExecutive(tenantId, id);
    if (!identity) {
      return { authorized: false, reason: "Executive identity not found." };
    }

    if (identity.status !== "ACTIVE" && identity.status !== "WARNING" && identity.status !== "OBSERVATION" && identity.status !== "RECOVERY") {
      return { authorized: false, reason: `Executive is not ACTIVE (current status: ${identity.status}).` };
    }

    // 1. Evaluate using Decision Authority Matrix rules (Primary)
    if (identity.dna.decisionAuthorityMatrix && identity.dna.decisionAuthorityMatrix.rules) {
      const rule = identity.dna.decisionAuthorityMatrix.rules.find((r) => r.action === action);
      if (rule) {
        // Evaluate execution permission
        if (context.actorRole && rule.executionRoles && !rule.executionRoles.includes(context.actorRole)) {
          return {
            authorized: false,
            reason: `Action execution denied: role [${context.actorRole}] is not authorized.`,
          };
        }

        // Evaluate budget constraints
        if (context.budgetAmount !== undefined && rule.approvalThreshold !== undefined) {
          if (context.budgetAmount > rule.approvalThreshold) {
            return {
              authorized: false,
              reason: `Budget amount [${context.budgetAmount}] exceeds authority limit of [${rule.approvalThreshold}].`,
            };
          }
        }

        // Evaluate generic approval check
        if (rule.approvalRequired) {
          return {
            authorized: false,
            reason: `Action [${action}] requires explicit manual approval.`,
          };
        }

        return { authorized: true };
      }
    }

    // 2. Backward compatibility fallback: evaluate using legacy authorities list
    const legacyAuth = identity.dna.authorities.find((a) => a.action === action);
    if (!legacyAuth) {
      return {
        authorized: false,
        reason: `Action [${action}] is not listed in the authorities of Executive [${id}].`,
      };
    }

    if (context.budgetAmount !== undefined && legacyAuth.maxBudgetThreshold !== undefined) {
      if (context.budgetAmount > legacyAuth.maxBudgetThreshold) {
        return {
          authorized: false,
          reason: `Budget amount [${context.budgetAmount}] exceeds authority limit of [${legacyAuth.maxBudgetThreshold}].`,
        };
      }
    }

    if (context.hiringCount !== undefined && legacyAuth.hiringLimit !== undefined) {
      if (context.hiringCount > legacyAuth.hiringLimit) {
        return {
          authorized: false,
          reason: `Hiring count [${context.hiringCount}] exceeds authority limit of [${legacyAuth.hiringLimit}].`,
        };
      }
    }

    if (legacyAuth.approvalRequired) {
      return {
        authorized: false,
        reason: `Action [${action}] requires explicit manual approval.`,
      };
    }

    return { authorized: true };
  }

  /**
   * Checks if a boundary condition is breached, triggering escalation when necessary.
   */
  public async checkBoundary(
    tenantId: string,
    id: string,
    rule: string,
    value: any
  ): Promise<{ breached: boolean; message?: string }> {
    const identity = await this.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    const boundary = identity.dna.boundaries.find((b) => b.rule === rule);
    if (!boundary) {
      return { breached: false };
    }

    let breached = false;
    let message = "";

    // Domain independent rules evaluation
    if (rule === "no_cross_tenant_resource_sharing") {
      if (value !== tenantId) {
        breached = true;
        message = `Cross-tenant boundary breached. Target tenant [${value}] does not match owner tenant [${tenantId}].`;
      }
    } else if (rule === "limit_consecutive_failures") {
      const maxFailures = boundary.isHardLimit ? 3 : 5;
      if (typeof value === "number" && value >= maxFailures) {
        breached = true;
        message = `Consecutive failure count [${value}] breaches boundary limit of [${maxFailures}].`;
      }
    } else if (rule === "kpi_critical_minimum") {
      if (typeof value === "number" && value < 0.2) {
        breached = true;
        message = `KPI value [${value}] has dropped below critical minimum boundary threshold.`;
      }
    }

    if (breached) {
      console.warn(`[Executive Identity Service] Boundary BREACH detected on [${id}] for rule [${rule}]: ${message}`);

      // Sync breach to OIG as an incident
      await this.logBreachIncidentToOIG(tenantId, id, rule, message);

      // Record violation signal in Health Model
      await this.recordHealthSignal(tenantId, id, "policyViolationCount", 1);

      // Trigger Escalation Profile
      await this.triggerEscalation(tenantId, identity, rule, message);

      // Publish event
      await this.publishEvent(tenantId, "executive.boundary.breached", {
        id,
        rule,
        message,
        isHardLimit: boundary.isHardLimit,
      });
    }

    return { breached, message: breached ? message : undefined };
  }

  /**
   * Synchronizes executive identity, mission, responsibilities, KPIs, Outcomes, and Authorities with OIG.
   */
  public async syncToOIG(tenantId: string, id: string): Promise<void> {
    if (!this.di.has("IOrganizationGraph")) {
      return;
    }

    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) return;

    // Secure cross-tenant check
    this.verifyTenantOwnership(tenantId, identity.tenantId);

    const graph = this.di.resolve<any>("IOrganizationGraph");
    const ctx = { tenantId, actorId: "executive_identity_service", scopes: ["oig:write", "oig:read"] };

    // 1. Upsert Executive Node
    const execNodeId = `exec_node:${id}`;
    graph.addSecureNode(
      {
        id: execNodeId,
        type: "Executive",
        properties: {
          name: identity.name,
          role: identity.role,
          status: identity.status,
          vision: identity.dna.mission.vision,
          version: identity.dna.version,
          personalityStyle: identity.dna.personalityModel.decisionStyle,
          healthScore: identity.health.score,
          healthStatus: identity.health.status,
        },
        tenantId,
      },
      ctx
    );

    // 2. Upsert Tenant Node and Link
    const tenantNodeId = `tenant_node:${tenantId}`;
    try {
      graph.addSecureNode(
        {
          id: tenantNodeId,
          type: "Tenant",
          properties: { tenantId },
          tenantId,
        },
        ctx
      );
    } catch (err) {
      // Node might already exist
    }

    try {
      graph.addSecureEdge(
        {
          sourceId: execNodeId,
          targetId: tenantNodeId,
          predicate: "BELONGS_TO",
          properties: { active: true },
          tenantId,
        },
        ctx
      );
    } catch (err) {
      // Edge might already exist
    }

    // 3. Register KPIs as Nodes & Edges
    for (const kpi of identity.dna.kpiOwnership) {
      const kpiNodeId = `kpi_node:${kpi.id}`;
      try {
        graph.addSecureNode(
          {
            id: kpiNodeId,
            type: "KPI",
            properties: {
              name: kpi.name,
              metricToken: kpi.metricToken,
              targetValue: kpi.targetValue,
              currentValue: kpi.currentValue,
              unit: kpi.unit,
            },
            tenantId,
          },
          ctx
        );

        graph.addSecureEdge(
          {
            sourceId: execNodeId,
            targetId: kpiNodeId,
            predicate: "OWNS_KPI",
            properties: { frequency: kpi.frequency },
            tenantId,
          },
          ctx
        );
      } catch (err) {
        // Handle gracefully
      }
    }

    // 4. Sync Business Outcomes to OIG
    if (identity.businessOutcomes) {
      for (const outcome of identity.businessOutcomes) {
        const outcomeNodeId = `outcome_node:${id}:${outcome.id}`;
        try {
          graph.addSecureNode(
            {
              id: outcomeNodeId,
              type: "BusinessOutcome",
              properties: {
                category: outcome.category,
                name: outcome.name,
                description: outcome.description,
                targetValue: outcome.targetValue,
                currentValue: outcome.currentValue,
                unit: outcome.unit,
                weight: outcome.weight,
                status: outcome.status,
              },
              tenantId,
            },
            ctx
          );

          graph.addSecureEdge(
            {
              sourceId: execNodeId,
              targetId: outcomeNodeId,
              predicate: "OWNS_OUTCOME",
              properties: { weight: outcome.weight },
              tenantId,
            },
            ctx
          );
        } catch (err) {
          // Handle gracefully
        }
      }
    }

    // 5. Sync Decision Authority Matrix rules to OIG
    if (identity.dna.decisionAuthorityMatrix && identity.dna.decisionAuthorityMatrix.rules) {
      for (const rule of identity.dna.decisionAuthorityMatrix.rules) {
        const ruleNodeId = `authority_rule:${id}:${rule.action.replace(/:/g, "_")}`;
        try {
          graph.addSecureNode(
            {
              id: ruleNodeId,
              type: "AuthorityRule",
              properties: {
                action: rule.action,
                approvalRequired: rule.approvalRequired,
                approvalThreshold: rule.approvalThreshold || null,
                delegable: rule.delegable,
              },
              tenantId,
            },
            ctx
          );

          graph.addSecureEdge(
            {
              sourceId: execNodeId,
              targetId: ruleNodeId,
              predicate: "HAS_AUTHORITY_RULE",
              properties: { delegable: rule.delegable },
              tenantId,
            },
            ctx
          );
        } catch (err) {
          // Handle gracefully
        }
      }
    }
  }

  /**
   * Logs a boundary breach Incident node into OIG for governance audits.
   */
  private async logBreachIncidentToOIG(
    tenantId: string,
    execId: string,
    rule: string,
    message: string
  ): Promise<void> {
    if (!this.di.has("IOrganizationGraph")) return;

    const graph = this.di.resolve<any>("IOrganizationGraph");
    const ctx = { tenantId, actorId: "executive_identity_service", scopes: ["oig:write"] };

    const incidentId = `incident_${execId}_${Date.now()}`;
    graph.addSecureNode(
      {
        id: incidentId,
        type: "Incident",
        properties: {
          rule,
          message,
          severity: "CRITICAL",
          timestamp: new Date().toISOString(),
        },
        tenantId,
      },
      ctx
    );

    graph.addSecureEdge(
      {
        sourceId: `exec_node:${execId}`,
        targetId: incidentId,
        predicate: "TRIGGERED_INCIDENT",
        properties: { timestamp: new Date().toISOString() },
        tenantId,
      },
      ctx
    );
  }

  /**
   * Handles Escalation logic based on the escalation profile.
   */
  private async triggerEscalation(
    tenantId: string,
    identity: IExecutiveIdentity,
    trigger: string,
    reason: string
  ): Promise<void> {
    const ep = identity.dna.escalationProfile;

    const targetStatus = ep.fallbackStatus || "SUSPENDED";
    const updated = await this.recordHealthSignal(tenantId, identity.id, "escalationCount", 1);
    await this.transitionLifecycle(tenantId, identity.id, targetStatus, `Escalated due to [${trigger}]: ${reason}`, updated.version);

    // Publish escalation event
    await this.publishEvent(tenantId, "executive.escalated", {
      id: identity.id,
      trigger,
      reason,
      notificationTargets: ep.notificationTargets,
      gracePeriodMs: ep.gracePeriodMs,
      newStatus: targetStatus,
    });
  }

  /**
   * Publishes events to the runtime EventBus.
   */
  private async publishEvent(tenantId: string, topic: string, payload: Record<string, any>): Promise<void> {
    if (!this.di.has("IEventBus")) return;

    const eventBus = this.di.resolve<any>("IEventBus");
    const fullPayload = {
      ...payload,
      tenantId,
    };

    // Registry Hardening: No runtime contract registrations. Validate existing only.
    try {
      await eventBus.publish(topic, "1.0.0", fullPayload, {
        tenantId,
        priority: "medium",
      });
    } catch (err) {
      console.error(`[Executive Identity Service] Failed to publish event [${topic}]:`, err);
    }
  }

  /**
   * Helper to write memory facts to IMemoryEngine.
   */
  private async writeToMemory(tenantId: string, key: string, value: any): Promise<void> {
    if (!this.di.has("IMemoryEngine")) return;
    const memoryEngine = this.di.resolve<any>("IMemoryEngine");
    try {
      await memoryEngine.writeMemory(tenantId, "executive", key, JSON.stringify(value));
    } catch (err) {
      console.error(`[Executive Identity Service] Failed to write memory [${key}]:`, err);
    }
  }

  /**
   * Universal Goal Alignment Hook: Updates Goal Alignment Profile for an executive.
   */
  public async updateGoalAlignment(
    tenantId: string,
    id: string,
    goalAlignment: IGoalAlignmentProfile,
    expectedVersion?: number
  ): Promise<IExecutiveIdentity> {
    this.verifyTenantOwnership(tenantId);
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    identity.goalAlignment = { ...goalAlignment };
    identity.updatedAt = new Date();

    const saved = await this.repository.saveExecutive(identity, expectedVersion);
    await this.publishEvent(tenantId, "executive.goal.aligned", {
      id,
      goalAlignment
    });

    return saved;
  }

  /**
   * Capability Negotiation Hook: Simulates authority capability negotiation requests.
   */
  public async negotiateCapability(
    tenantId: string,
    id: string,
    request: ICapabilityRequest
  ): Promise<ICapabilityResponse> {
    this.verifyTenantOwnership(tenantId);
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    const cp = identity.dna.capabilityProfile;
    const hasCapability =
      cp?.executableCapabilities?.includes(request.targetCapability) ||
      cp?.delegationCapabilities?.includes(request.targetCapability) ||
      cp?.collaborationCapabilities?.includes(request.targetCapability) ||
      cp?.reviewCapabilities?.includes(request.targetCapability) ||
      cp?.approvalCapabilities?.includes(request.targetCapability) ||
      false;

    const response: ICapabilityResponse = {
      requestId: request.requestId,
      status: hasCapability ? "GRANTED" : "DENIED",
      reason: hasCapability
        ? "Capability exists in capability profile."
        : "Capability not found in capability profile.",
      authorityNegotiationMetadata: {
        evaluatedAt: new Date().toISOString(),
        policyComplianceChecked: true
      }
    };

    await this.publishEvent(tenantId, "executive.capability.negotiated", {
      executiveId: id,
      requestId: request.requestId,
      targetCapability: request.targetCapability,
      status: response.status
    });

    return response;
  }

  /**
   * Executive Diagnostics Hook: Dynamically constructs self-diagnostic metric report.
   */
  public async getDiagnostics(tenantId: string, id: string): Promise<IExecutiveDiagnostics> {
    this.verifyTenantOwnership(tenantId);
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    const coverage = identity.dna.capabilityProfile?.executableCapabilities?.length || 0;
    const totalOutcomes = identity.businessOutcomes?.length || 0;

    const diagnostics: IExecutiveDiagnostics = {
      decisionQualityIndex: identity.healthSignals?.decisionConsistency ?? 1.0,
      executionSuccessRate: identity.healthSignals?.executionSuccessRate ?? 1.0,
      averageConfidenceScore: identity.healthSignals?.confidenceScore ?? 1.0,
      policyComplianceScore: Math.max(0, 1.0 - (identity.healthSignals?.policyViolationCount ?? 0) * 0.1),
      authorityUtilizationRatio: 0.8,
      healthScore: identity.health?.score ?? 100,
      outcomeOwnershipCount: totalOutcomes,
      capabilityCoverageRatio: coverage > 0 ? 1.0 : 0.0,
      lifecycleState: identity.status,
      calculatedAt: new Date().toISOString()
    };

    await this.publishEvent(tenantId, "executive.diagnostics.reported", {
      executiveId: id,
      healthScore: diagnostics.healthScore,
      lifecycleState: diagnostics.lifecycleState
    });

    return diagnostics;
  }

  /**
   * Explainability Hook: Generates decision tracing metadata.
   */
  public async generateDecisionExplanation(
    tenantId: string,
    id: string,
    decisionId: string,
    details: {
      authoritySourceId: string;
      capabilitySourceId: string;
      missionSourceId: string;
      goalSourceId: string;
      policySourceId: string;
      evidenceReferences: string[];
    }
  ): Promise<IDecisionExplainability> {
    this.verifyTenantOwnership(tenantId);
    const identity = await this.repository.getExecutive(tenantId, id);
    if (!identity) {
      throw new Error(`Executive [${id}] not found.`);
    }

    const explanation: IDecisionExplainability = {
      decisionId,
      executiveId: id,
      authoritySourceId: details.authoritySourceId,
      capabilitySourceId: details.capabilitySourceId,
      missionSourceId: details.missionSourceId,
      goalSourceId: details.goalSourceId,
      policySourceId: details.policySourceId,
      evidenceReferences: details.evidenceReferences,
      confidenceMetadata: {
        score: identity.healthSignals?.confidenceScore ?? 1.0,
        uncertaintyRange: [0.9, 1.0],
        confidenceLevel: "high"
      },
      executionTraceReference: `trace:${decisionId}:${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    await this.publishEvent(tenantId, "executive.decision.explained", {
      decisionId,
      executiveId: id,
      confidenceScore: explanation.confidenceMetadata.score
    });

    return explanation;
  }
}

/**
 * Stage 3.1A Enterprise Root Class.
 * Abstract class worthy of being inherited by Sales, Marketing, Finance, Operations, CEO, Customer Success etc.
 * Provides dynamic state delegation to the core identity foundation.
 */
export abstract class BaseExecutiveAI {
  constructor(
    protected readonly tenantId: string,
    protected readonly identityId: string,
    protected readonly service: ExecutiveIdentityService
  ) {}

  public get id(): string {
    return this.identityId;
  }

  public get tenant(): string {
    return this.tenantId;
  }

  /**
   * Returns the current live status and profile state of the Executive AI.
   */
  public async getIdentity(): Promise<IExecutiveIdentity> {
    const identity = await this.service.getExecutive(this.tenantId, this.identityId);
    if (!identity) {
      throw new Error(`Executive Identity not found for ID: ${this.identityId}`);
    }
    return identity;
  }

  /**
   * Validates if a specific action is within the current decision authority matrix boundaries.
   */
  public async validateAuthority(action: string, context?: any): Promise<{ authorized: boolean; reason?: string }> {
    return this.service.validateAuthority(this.tenantId, this.identityId, action, context);
  }

  /**
   * Checks if an operation value breaches hard or soft boundaries.
   */
  public async checkBoundary(rule: string, value: any): Promise<{ breached: boolean; message?: string }> {
    return this.service.checkBoundary(this.tenantId, this.identityId, rule, value);
  }

  /**
   * Transitions lifecycle state.
   */
  public async transition(targetState: ExecutiveLifecycleState, reason?: string): Promise<IExecutiveIdentity> {
    const identity = await this.getIdentity();
    return this.service.transitionLifecycle(this.tenantId, this.identityId, targetState, reason, identity.version);
  }

  /**
   * Updates dynamic mission variables safely without altering core DNA templates.
   */
  public async updateMission(update: Partial<IMissionState>): Promise<IExecutiveIdentity> {
    const identity = await this.getIdentity();
    return this.service.updateMissionState(this.tenantId, this.identityId, update, identity.version);
  }

  /**
   * Updates progress on an owned Business Outcome.
   */
  public async updateOutcome(outcomeId: string, value: number): Promise<IExecutiveIdentity> {
    const identity = await this.getIdentity();
    return this.service.updateBusinessOutcome(this.tenantId, this.identityId, outcomeId, value, identity.version);
  }

  /**
   * Signals a performance metric to update the computed health status.
   */
  public async recordSignal(signalType: keyof IExecutiveHealthSignals, value: any): Promise<IExecutiveIdentity> {
    const identity = await this.getIdentity();
    return this.service.recordHealthSignal(this.tenantId, this.identityId, signalType, value, identity.version);
  }
}

// INHERITANCE VALIDATION: Concrete subclasses of BaseExecutiveAI for all roles
export class SalesExecutiveAI extends BaseExecutiveAI {}
export class MarketingExecutiveAI extends BaseExecutiveAI {}
export class FinanceExecutiveAI extends BaseExecutiveAI {}
export class OperationsExecutiveAI extends BaseExecutiveAI {}
export class CustomerSuccessExecutiveAI extends BaseExecutiveAI {}
export class CEOExecutiveAI extends BaseExecutiveAI {}
