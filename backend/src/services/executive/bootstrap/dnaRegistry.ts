import * as crypto from "crypto";
import { getResilientSharedRedisConnection, isRedisHealthy, isRedisWritable } from "../../../config/redis";
import { DIContainer, container } from "../../../runtime/kernel/diContainer";
import { IExecutiveDNA, IDNARepository } from "../interfaces";
import { validateExecutiveDNA } from "../validation";

// Semver comparison helper
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a !== b) return a - b;
  }
  return 0;
}

// Checksum helper for DNA integrity checks
export function computeChecksum(dna: any): string {
  const normalized = {
    role: dna.role,
    version: dna.version,
    mission: dna.mission,
    responsibilities: dna.responsibilities,
    authorities: dna.authorities,
    boundaries: dna.boundaries,
    kpiOwnership: dna.kpiOwnership,
    decisionScope: dna.decisionScope,
    communicationProfile: dna.communicationProfile,
    delegationProfile: dna.delegationProfile,
    escalationProfile: dna.escalationProfile,
    successCriteria: dna.successCriteria,
    failureCriteria: dna.failureCriteria,
    personalityModel: dna.personalityModel,
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

// Phase 7 - DNA Auto-Upgrade Helper
export function upgradeDNA(dna: any): IExecutiveDNA {
  // 1. Backward-compatibility: auto-upgrade DNA with capability profile
  const capabilityProfile = dna.capabilityProfile || {
    allowedDecisionCategories: ["operational", "tactical"],
    allowedReasoningDomains: ["operations"],
    executableCapabilities: dna.authorities ? dna.authorities.map((a: any) => a.action) : [],
    collaborationCapabilities: [],
    delegationCapabilities: dna.delegationProfile && dna.delegationProfile.autoDelegationEnabled ? ["auto_delegate"] : [],
    reviewCapabilities: [],
    approvalCapabilities: [],
  };

  // 2. Backward-compatibility: auto-upgrade DNA with decision authority matrix
  const decisionAuthorityMatrix = dna.decisionAuthorityMatrix || {
    rules: dna.authorities
      ? dna.authorities.map((a: any) => ({
          action: a.action,
          ownershipRole: dna.role,
          approvalRequired: a.approvalRequired,
          approvalThreshold: a.maxBudgetThreshold,
          delegable: true,
          executionRoles: [dna.role],
        }))
      : [],
  };

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
    ? dna.businessOutcomes.map((o: any) => ({
        ...o,
        status: evaluateStatus(o.currentValue, o.targetValue, o.higherIsBetter, o.atRiskThreshold, o.criticalThreshold),
      }))
    : (dna.kpiOwnership
        ? dna.kpiOwnership.map((k: any) => ({
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
  const authorities = dna.authorities || decisionAuthorityMatrix.rules.map((rule: any, idx: number) => ({
    id: `auth_legacy_${idx}`,
    action: rule.action,
    description: `Legacy authority mapping for ${rule.action}`,
    maxBudgetThreshold: rule.approvalThreshold,
    approvalRequired: rule.approvalRequired,
  }));

  // 5. Backward-compatibility: enhance personality traits with default parameters
  const personalityModel = { ...dna.personalityModel };
  if (personalityModel) {
    personalityModel.analyticalDepth = personalityModel.analyticalDepth !== undefined ? personalityModel.analyticalDepth : 0.7;
    personalityModel.creativity = personalityModel.creativity !== undefined ? personalityModel.creativity : 0.5;
    personalityModel.riskAppetite = personalityModel.riskAppetite !== undefined ? personalityModel.riskAppetite : 0.4;
    personalityModel.decisionSpeed = personalityModel.decisionSpeed !== undefined ? personalityModel.decisionSpeed : 0.6;
    personalityModel.evidenceRequirement = personalityModel.evidenceRequirement !== undefined ? personalityModel.evidenceRequirement : 0.8;
    personalityModel.collaborationTendency = personalityModel.collaborationTendency !== undefined ? personalityModel.collaborationTendency : 0.5;
    personalityModel.communicationPreference = personalityModel.communicationPreference || "detailed";
    personalityModel.autonomyLevel = personalityModel.autonomyLevel !== undefined ? personalityModel.autonomyLevel : 0.6;
    personalityModel.adaptability = personalityModel.adaptability !== undefined ? personalityModel.adaptability : 0.5;
  }

  const goalAlignment: any = dna.goalAlignment || {
    longTermMissionId: `mission:${dna.role}:long_term`,
    strategicObjectiveIds: [],
    tacticalObjectiveIds: [],
    operationalObjectiveIds: [],
    currentPriorityIds: [],
    businessOutcomeIds: businessOutcomes.map((o: any) => o.id),
    organizationNodeId: `org_node:${dna.role}`
  };

  const evolutionMetadata: any = dna.evolutionMetadata || {
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

  return {
    ...dna,
    capabilityProfile,
    decisionAuthorityMatrix,
    businessOutcomes,
    authorities,
    personalityModel,
    goalAlignment,
    evolutionMetadata
  };
}

// Built-in DNA templates (Phase 1)
export const BUILTIN_DNA: Record<string, any> = {
  "SPRINT2_EXECUTIVE_RUNTIME": {
    role: "SPRINT2_EXECUTIVE_RUNTIME",
    version: "1.0.0",
    mission: {
      vision: "Operate the Executive Platform as the active production decision runtime.",
      directives: [
        "understand_business_context",
        "plan_execution",
        "select_decision",
        "execute_with_supervision",
        "learn_from_outcome",
      ],
      alignmentTargets: ["production_execution", "tenant_isolation", "runtime_traceability"],
    },
    responsibilities: [
      {
        id: "resp_runtime_execution",
        title: "Runtime execution",
        description: "Standard production execution of business objectives",
        domain: "operations",
        kpiIds: ["kpi_runtime_completion"],
      },
    ],
    authorities: [
      {
        id: "auth_execute_runtime",
        action: "runtime:execute, Operational",
        description: "Execute approved runtime plans",
        approvalRequired: false,
      },
    ],
    boundaries: [
      {
        id: "boundary_tenant",
        rule: "tenant_isolation_required",
        description: "Runtime execution must remain tenant scoped",
        isHardLimit: true,
        vetoRequired: true,
      },
    ],
    kpiOwnership: [
      {
        id: "kpi_runtime_completion",
        name: "Runtime completion",
        metricToken: "executive.runtime.completed",
        targetValue: 1,
        currentValue: 1,
        unit: "request",
        frequency: "daily",
      },
    ],
    decisionScope: [
      {
        id: "scope_runtime_execution",
        decisionType: "operational",
        allowedActions: ["runtime:execute"],
        vetoRules: ["tenant_isolation_required"],
        jurisdiction: "tenant",
      },
    ],
    communicationProfile: {
      style: "structured",
      tone: "analytical",
      channels: ["http"],
      frequency: "realtime",
      protocols: ["execution_trace"],
    },
    delegationProfile: {
      allowedSubagentRoles: [],
      delegableTaskTypes: [],
      requiresApprovalAboveThreshold: 1000000,
      autoDelegationEnabled: false,
    },
    escalationProfile: {
      escalationTriggers: ["service_failure", "policy_violation"],
      notificationTargets: ["owner"],
      gracePeriodMs: 0,
      fallbackStatus: "RECOVERY",
    },
    successCriteria: [
      {
        id: "success_runtime_trace",
        description: "All mounted Executive services execute in one production request",
        kpiId: "kpi_runtime_completion",
        threshold: 1,
        timeframeDays: 1,
      },
    ],
    failureCriteria: [
      {
        id: "failure_unreachable_service",
        description: "Any mounted Executive service is unreachable",
        triggerMetric: "executive.runtime.unreachable",
        breachThreshold: 1,
        consecutiveOccurrences: 1,
      },
    ],
    personalityModel: {
      traits: { precision: 0.9, caution: 0.8 },
      decisionStyle: "analytical",
      cognitiveBiasesToManage: ["automation_bias"],
    },
  }
};

// Phase 6 — Cache Layer
export class ExecutiveDNACache {
  private l1Cache = new Map<string, IExecutiveDNA>();
  private ttlSec: number = 3600;

  public setL1(role: string, dna: IExecutiveDNA): void {
    this.l1Cache.set(role, dna);
  }

  public getL1(role: string): IExecutiveDNA | null {
    return this.l1Cache.get(role) || null;
  }

  public async getL2(role: string): Promise<IExecutiveDNA | null> {
    if (!isRedisHealthy()) return null;
    try {
      const client = getResilientSharedRedisConnection();
      if (client) {
        const val = await client.get(`executive:dna:${role}`);
        return val ? JSON.parse(val) : null;
      }
    } catch (err) {
      console.error("[ExecutiveDNACache] Redis read error:", err);
    }
    return null;
  }

  public async setL2(role: string, dna: IExecutiveDNA): Promise<void> {
    if (!isRedisHealthy() || !isRedisWritable()) return;
    try {
      const client = getResilientSharedRedisConnection();
      if (client) {
        await client.setex(`executive:dna:${role}`, this.ttlSec, JSON.stringify(dna));
      }
    } catch (err) {
      console.error("[ExecutiveDNACache] Redis write error:", err);
    }
  }

  public clearL1(): void {
    this.l1Cache.clear();
  }
}

// Phase 2 — DNA Registry
export class ExecutiveDNARegistry {
  private cache = new ExecutiveDNACache();

  constructor(private dnaRepo: IDNARepository) {}

  public async getDNA(role: string): Promise<IExecutiveDNA | null> {
    // 1. L1 Memory
    const l1 = this.cache.getL1(role);
    if (l1) return l1;

    // 2. L2 Redis
    const l2 = await this.cache.getL2(role);
    if (l2) {
      const upgraded = upgradeDNA(l2);
      this.cache.setL1(role, upgraded);
      return upgraded;
    }

    // 3. Database Repository
    const dbDna = await this.dnaRepo.getDNA(role);
    if (dbDna) {
      const upgraded = upgradeDNA(dbDna);
      this.cache.setL1(role, upgraded);
      await this.cache.setL2(role, upgraded);
      return upgraded;
    }

    return null;
  }

  public getCache(): ExecutiveDNACache {
    return this.cache;
  }

  public async clearCache(): Promise<void> {
    this.cache.clearL1();
    if (isRedisHealthy() && isRedisWritable()) {
      try {
        const client = getResilientSharedRedisConnection();
        if (client) {
          const keys = Object.keys(BUILTIN_DNA);
          for (const k of keys) {
            await client.del(`executive:dna:${k}`);
          }
        }
      } catch (err) {
        console.error("[ExecutiveDNARegistry] Redis L2 clear error:", err);
      }
    }
  }
}

// Phase 3 — Migration Manager
export class DNAMigrationManager {
  constructor(private dnaRepo: IDNARepository) {}

  public async migrate(dna: any): Promise<{ success: boolean; durationMs: number; details: string }> {
    const start = Date.now();
    
    // Auto-upgrade DNA template first
    const upgraded = upgradeDNA(dna);

    // Schema validation
    const val = validateExecutiveDNA(upgraded);
    if (!val.isValid) {
      throw new Error(`DNA Schema validation failed for role [${upgraded.role}]: ${val.issues.join("; ")}`);
    }

    const checksum = computeChecksum(upgraded);
    const version = upgraded.version;

    // Database lookup
    const existing = await this.dnaRepo.getDNA(upgraded.role);

    if (!existing) {
      // Missing -> Insert
      const newDna: IExecutiveDNA = {
        ...upgraded,
        dnaId: upgraded.role,
        revision: 1,
        checksum,
        compatibilityVersion: "1.0.0",
        schemaVersion: "1.0.0",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await this.dnaRepo.saveDNA(newDna);
      return {
        success: true,
        durationMs: Date.now() - start,
        details: `Created new DNA role [${upgraded.role}] version ${version} (rev 1)`
      };
    }

    const dbChecksum = existing.checksum;
    const dbVersion = existing.version;
    const dbRevision = existing.revision || 1;

    // Idempotency: skip if checksums match
    if (dbChecksum === checksum && dbVersion === version) {
      return {
        success: true,
        durationMs: Date.now() - start,
        details: `DNA role [${upgraded.role}] version ${version} is up-to-date (idempotent no-op)`
      };
    }

    const isNewer = compareVersions(version, dbVersion) > 0;
    const isSameVersionDifferentChecksum = version === dbVersion && dbChecksum !== checksum;

    if (isNewer || isSameVersionDifferentChecksum) {
      const nextRevision = isSameVersionDifferentChecksum ? dbRevision + 1 : 1;
      const updatedDna: IExecutiveDNA = {
        ...upgraded,
        dnaId: upgraded.role,
        revision: nextRevision,
        checksum,
        compatibilityVersion: "1.0.0",
        schemaVersion: "1.0.0",
        createdAt: existing.createdAt || new Date(),
        updatedAt: new Date()
      };
      await this.dnaRepo.saveDNA(updatedDna);
      return {
        success: true,
        durationMs: Date.now() - start,
        details: `Migrated DNA role [${upgraded.role}] from ${dbVersion} (rev ${dbRevision}) to ${version} (rev ${nextRevision})`
      };
    }

    // Block outdated DNA rollback attempt
    throw new Error(`Migration error: Database contains a newer version [${dbVersion}] of DNA role [${upgraded.role}] than the built-in [${version}].`);
  }
}

// Phase 1 — ExecutiveDNABootstrapManager
export class ExecutiveDNABootstrapManager {
  private registry!: ExecutiveDNARegistry;
  private migrationManager!: DNAMigrationManager;

  constructor(private di: DIContainer = container) {}

  public async bootstrap(): Promise<{ durationMs: number; verifiedRoles: string[]; report: any }> {
    const start = Date.now();
    console.info("[ExecutiveDNABootstrapManager] Starting DNA Lifecycle Bootstrap...");

    // Resolve repository dependency
    const dnaRepo = this.di.resolve<IDNARepository>("IDNARepository");
    if (!dnaRepo) {
      throw new Error("Startup Verification Failed: IDNARepository not found in DI container.");
    }

    this.registry = new ExecutiveDNARegistry(dnaRepo);
    this.migrationManager = new DNAMigrationManager(dnaRepo);
    
    // Register the registry in DI
    this.di.registerInstance("IExecutiveDNARegistry", this.registry);

    const keys = Object.keys(BUILTIN_DNA);
    const verifiedRoles: string[] = [];
    const report: any = {
      bootstrapDurationMs: 0,
      migrations: [],
      registrySize: 0,
      checksums: {},
      verifications: [],
      status: "COMPLETED",
    };

    const redisHealthy = isRedisHealthy() && isRedisWritable();
    const client = redisHealthy ? getResilientSharedRedisConnection() : null;

    const lockKey = "executive:dna:bootstrap:lock";
    const completedKey = "executive:dna:bootstrap:completed";
    const lockValue = crypto.randomUUID();
    const lockTtlMs = 30000;
    const maxWaitMs = 30000;
    const retryIntervalMs = 500;

    let hasLock = false;

    if (client) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        // 1. Check if another instance already completed bootstrap
        const completed = await client.get(completedKey);
        if (completed === "true") {
          console.info("[ExecutiveDNABootstrapManager] DNA Bootstrap already completed by another instance. Warming cache and skipping.");
          
          // Warm cache L1
          for (const key of keys) {
            const dna = await this.registry.getDNA(key);
            if (!dna) {
              throw new Error(`Startup Verification Failed: Mandatory DNA [${key}] missing from registry.`);
            }
            verifiedRoles.push(key);
            report.verifications.push({ role: key, status: "VERIFIED", version: dna.version });
          }
          
          const duration = Date.now() - start;
          report.bootstrapDurationMs = duration;
          report.registrySize = keys.length;
          report.status = "SKIPPED_ALREADY_COMPLETED";

          return {
            durationMs: duration,
            verifiedRoles,
            report
          };
        }

        // 2. Try to acquire lock
        const acquired = await (client as any).set(lockKey, lockValue, "NX", "PX", lockTtlMs);
        if (acquired === "OK") {
          hasLock = true;
          console.info("[ExecutiveDNABootstrapManager] Acquired distributed bootstrap lock.");
          break;
        }

        // 3. Wait and retry
        await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
      }

      if (!hasLock) {
        // Check once more in case it completed during the final wait
        const completed = await client.get(completedKey);
        if (completed === "true") {
          console.info("[ExecutiveDNABootstrapManager] DNA Bootstrap completed by peer during final wait. Warming cache.");
          for (const key of keys) {
            const dna = await this.registry.getDNA(key);
            if (!dna) {
              throw new Error(`Startup Verification Failed: Mandatory DNA [${key}] missing from registry.`);
            }
            verifiedRoles.push(key);
            report.verifications.push({ role: key, status: "VERIFIED", version: dna.version });
          }
          const duration = Date.now() - start;
          report.bootstrapDurationMs = duration;
          report.registrySize = keys.length;
          report.status = "SKIPPED_ALREADY_COMPLETED";
          return {
            durationMs: duration,
            verifiedRoles,
            report
          };
        }
        throw new Error("Startup Verification Failed: Timeout waiting for DNA bootstrap lock.");
      }
    }

    try {
      // 1. Run Idempotent Migrations
      for (const key of keys) {
        const builtin = BUILTIN_DNA[key];
        const migResult = await this.migrationManager.migrate(builtin);
        report.migrations.push(migResult);
      }

      // 2. Startup Verification & Cache Warming
      for (const key of keys) {
        const dna = await this.registry.getDNA(key);
        if (!dna) {
          throw new Error(`Startup Verification Failed: Mandatory DNA [${key}] missing from registry.`);
        }

        // Checksum validation (Security verification)
        const actualChecksum = computeChecksum(dna);
        if (dna.checksum && dna.checksum !== actualChecksum) {
          throw new Error(`Startup Verification Failed: Checksum validation failed for DNA [${key}]. Registry corruption or unauthorized mutation detected.`);
        }

        // Compatibility validation
        if (this.di.has("ICompatibilityEngine")) {
          const compEngine = this.di.resolve<any>("ICompatibilityEngine");
          if (!compEngine.isExecutiveAiVersionSupported(dna.version)) {
            throw new Error(`Startup Verification Failed: DNA Version [${dna.version}] of [${key}] is not supported by CompatibilityEngine.`);
          }
        }

        verifiedRoles.push(key);
        report.checksums[key] = dna.checksum;
        report.verifications.push({ role: key, status: "VERIFIED", version: dna.version });
      }

      // Mark as completed in Redis L2 (so other instances skip immediately)
      if (client) {
        await client.set(completedKey, "true", "EX", 86400); // 1 day expiration
      }
    } finally {
      // Release lock safely via Lua script
      if (client && hasLock) {
        const releaseScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        try {
          await (client as any).eval(releaseScript, 1, lockKey, lockValue);
          console.info("[ExecutiveDNABootstrapManager] Released distributed bootstrap lock.");
        } catch (err) {
          console.error("[ExecutiveDNABootstrapManager] Failed to release distributed bootstrap lock:", err);
        }
      }
    }

    const duration = Date.now() - start;
    report.bootstrapDurationMs = duration;
    report.registrySize = keys.length;

    console.info(`[ExecutiveDNABootstrapManager] DNA Bootstrap completed successfully in ${duration}ms. Verified roles: ${verifiedRoles.join(", ")}`);
    return {
      durationMs: duration,
      verifiedRoles,
      report
    };
  }
}
