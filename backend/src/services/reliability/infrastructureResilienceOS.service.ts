import crypto from "crypto";
import prisma from "../../config/prisma";
import {
  MITIGATION_ACTIONS,
  applyReliabilityOverride,
  raiseReliabilityAlert,
  recordObservabilityEvent,
  recordTraceLedger,
} from "./reliabilityOS.service";
import { enforceSecurityGovernanceInfluence } from "../security/securityGovernanceOS.service";

type JsonRecord = Record<string, unknown>;

export const INFRASTRUCTURE_PHASE_VERSION = "phase6c.final.v1";
const INFRASTRUCTURE_POLICY_KEY = "infra:global:resilience:phase6c.final";
const LEGACY_INFRASTRUCTURE_POLICY_KEYS = new Set([
  "infra:global:resilience:phase6c.1",
  "infra:global:resilience:phase6c",
]);

export const INFRA_AUTHORITIES = [
  "CONTROL_PLANE",
  "QUEUE_FABRIC",
  "WORKER_FABRIC",
  "DATA_FABRIC",
  "PROVIDER_FABRIC",
  "SCHEDULER_FABRIC",
  "OBSERVABILITY_FABRIC",
  "RECOVERY_FABRIC",
] as const;

export const INFRA_ENGINE_HEALTH_STATES = [
  "HEALTHY",
  "DEGRADED",
  "CRITICAL",
  "PAUSED",
] as const;

export const INFRA_OVERRIDE_ACTIONS = [
  "NONE",
  "DENY_RECOVERY",
  "FORCE_RECOVERY",
  "THROTTLE",
  "FAILOVER",
  "ISOLATE",
] as const;

export const INFRA_RECOVERY_STATUSES = [
  "PENDING",
  "COMPLETED",
  "BLOCKED",
  "REPLAYED",
] as const;

type InfraAuthority = (typeof INFRA_AUTHORITIES)[number];
type InfraHealthState = (typeof INFRA_ENGINE_HEALTH_STATES)[number];
type InfraOverrideAction = (typeof INFRA_OVERRIDE_ACTIONS)[number];
type InfraRecoveryStatus = (typeof INFRA_RECOVERY_STATUSES)[number];

type CanonicalSubsystemDefinition = {
  authority: InfraAuthority;
  subsystem: string;
  ownerRole: string;
  criticality: "TIER0" | "TIER1" | "TIER2";
  engines: string[];
};

const CANONICAL_SUBSYSTEM_CATALOG: CanonicalSubsystemDefinition[] = [
  {
    authority: "CONTROL_PLANE",
    subsystem: "API_EDGE",
    ownerRole: "PLATFORM",
    criticality: "TIER0",
    engines: ["REQUEST_CONTEXT", "AUTHORIZATION_GATE", "RATE_LIMIT_GUARD"],
  },
  {
    authority: "QUEUE_FABRIC",
    subsystem: "RECEPTION_QUEUE",
    ownerRole: "SRE",
    criticality: "TIER0",
    engines: ["DEDUPE_GATE", "REPLAY_GATE", "DLQ_RECONCILER"],
  },
  {
    authority: "QUEUE_FABRIC",
    subsystem: "BOOKING_QUEUE",
    ownerRole: "SRE",
    criticality: "TIER1",
    engines: ["BOOKING_DISPATCH", "BACKPRESSURE_GUARD", "RETRY_SCHEDULER"],
  },
  {
    authority: "WORKER_FABRIC",
    subsystem: "RECEPTION_WORKERS",
    ownerRole: "SRE",
    criticality: "TIER0",
    engines: ["LEADER_ELECTION", "PARTITION_ASSIGNMENT", "TAKEOVER_LOCKS"],
  },
  {
    authority: "WORKER_FABRIC",
    subsystem: "APPOINTMENT_WORKERS",
    ownerRole: "SRE",
    criticality: "TIER1",
    engines: ["JOB_DISPATCH", "IDEMPOTENCY_GATE", "RETRY_COORDINATOR"],
  },
  {
    authority: "DATA_FABRIC",
    subsystem: "DATABASE_LAYER",
    ownerRole: "DBA",
    criticality: "TIER0",
    engines: ["PRIMARY_WRITER", "READ_REPLICA_ROUTER", "SCHEMA_GUARD"],
  },
  {
    authority: "DATA_FABRIC",
    subsystem: "CACHE_LAYER",
    ownerRole: "SRE",
    criticality: "TIER1",
    engines: ["CACHE_WRITER", "CACHE_READER", "TTL_ARBITER"],
  },
  {
    authority: "PROVIDER_FABRIC",
    subsystem: "EXTERNAL_PROVIDERS",
    ownerRole: "PLATFORM",
    criticality: "TIER0",
    engines: ["PROVIDER_HEALTH", "FAILOVER_ROUTER", "CREDENTIAL_BOUNDARY"],
  },
  {
    authority: "SCHEDULER_FABRIC",
    subsystem: "CRON_CONTROL",
    ownerRole: "SRE",
    criticality: "TIER1",
    engines: ["LEADER_LOCK", "PLAN_SYNC", "MISFIRE_RECOVERY"],
  },
  {
    authority: "OBSERVABILITY_FABRIC",
    subsystem: "TELEMETRY_PIPELINE",
    ownerRole: "SRE",
    criticality: "TIER1",
    engines: ["METRIC_INGEST", "TRACE_CORRELATION", "ALERT_ROUTER"],
  },
  {
    authority: "RECOVERY_FABRIC",
    subsystem: "RUNBOOK_ORCHESTRATOR",
    ownerRole: "SRE",
    criticality: "TIER0",
    engines: ["RUNBOOK_PLANNER", "ACTION_EXECUTOR", "ROLLBACK_COORDINATOR"],
  },
];

type InfrastructureStore = {
  bootstrappedAt: Date | null;
  invokeCount: number;
  authorities: Map<string, number>;
  policyLedger: Map<string, any>;
  subsystemLedger: Map<string, any>;
  engineLedger: Map<string, any>;
  signalLedger: Map<string, any>;
  recoveryLedger: Map<string, any>;
  overrideLedger: Map<string, any>;
  auditLedger: Map<string, any>;
  chainTailByScope: Map<string, string>;
  replayTokenToRecoveryKey: Map<string, string>;
  securityInfluenceChecks: number;
  reliabilityInfluenceAttempts: number;
  reliabilityInfluenceSuccesses: number;
};

const shouldUseInMemory =
  process.env.NODE_ENV === "test" ||
  process.argv.some((value) => value.includes("run-tests"));

const db = prisma as any;

const getDbLedger = (...candidates: string[]) => {
  for (const candidate of candidates) {
    if ((db as any)[candidate]) {
      return (db as any)[candidate];
    }
  }
  return null;
};

const now = () => new Date();

const stableHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const normalizeIdentifier = (value: unknown) => String(value || "").trim();

const normalizeBusinessId = (value: unknown) => {
  const normalized = normalizeIdentifier(value);
  return normalized || null;
};

const normalizeTenantId = ({
  tenantId,
  businessId,
}: {
  tenantId?: string | null;
  businessId?: string | null;
}) => {
  const normalized = normalizeIdentifier(tenantId || businessId || "");
  return normalized || null;
};

const buildScopedReplayTokenKey = (input: {
  businessId?: string | null;
  tenantId?: string | null;
  authority: InfraAuthority;
  subsystem: string;
  engine?: string | null;
  replayToken: string;
}) =>
  [
    normalizeTenantId({
      tenantId: input.tenantId || null,
      businessId: normalizeBusinessId(input.businessId || null),
    }) || "global",
    input.authority,
    normalizeIdentifier(input.subsystem).toUpperCase(),
    normalizeIdentifier(input.engine || "").toUpperCase() || "*",
    normalizeIdentifier(input.replayToken),
  ].join(":");

const toRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const uniqueStrings = (values: unknown[]) =>
  Array.from(
    new Set(values.map((value) => normalizeIdentifier(value).toUpperCase()).filter(Boolean))
  );

const ensureMitigationAction = (value: string) => {
  const normalized = normalizeIdentifier(value).toUpperCase();
  return MITIGATION_ACTIONS.includes(normalized as (typeof MITIGATION_ACTIONS)[number])
    ? (normalized as (typeof MITIGATION_ACTIONS)[number])
    : "NONE";
};

const globalForInfrastructure = globalThis as typeof globalThis & {
  __sylphInfrastructureStore?: InfrastructureStore;
};

let bootstrapInfrastructureResilienceInFlight: Promise<{
  bootstrappedAt: Date;
  phaseVersion: string;
  alreadyBootstrapped: boolean;
}> | null = null;

const createStore = (): InfrastructureStore => ({
  bootstrappedAt: null,
  invokeCount: 0,
  authorities: new Map(),
  policyLedger: new Map(),
  subsystemLedger: new Map(),
  engineLedger: new Map(),
  signalLedger: new Map(),
  recoveryLedger: new Map(),
  overrideLedger: new Map(),
  auditLedger: new Map(),
  chainTailByScope: new Map(),
  replayTokenToRecoveryKey: new Map(),
  securityInfluenceChecks: 0,
  reliabilityInfluenceAttempts: 0,
  reliabilityInfluenceSuccesses: 0,
});

const getStore = () => {
  if (!globalForInfrastructure.__sylphInfrastructureStore) {
    globalForInfrastructure.__sylphInfrastructureStore = createStore();
  }
  return globalForInfrastructure.__sylphInfrastructureStore;
};

const bumpAuthority = (name: string) => {
  const store = getStore();
  store.authorities.set(name, (store.authorities.get(name) || 0) + 1);
};

const withDbMirror = async (writer: () => Promise<unknown>) => {
  if (shouldUseInMemory) {
    return null;
  }

  try {
    return await writer();
  } catch {
    return null;
  }
};

const withDbMirrorStrict = async <T>(writer: () => Promise<T>) => {
  if (shouldUseInMemory) {
    return null as T | null;
  }
  return writer();
};

const toCanonicalUpdateData = <T extends Record<string, unknown>>(row: T) => {
  const { createdAt: _createdAt, ...updateData } = row as T & {
    createdAt?: unknown;
  };
  return updateData;
};

const appendAuditLedger = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  authority: InfraAuthority;
  subsystem: string;
  engine?: string | null;
  action: string;
  resourceType: string;
  resourceKey: string;
  metadata?: JsonRecord | null;
}) => {
  const store = getStore();
  const timestamp = now();
  const businessId = normalizeBusinessId(input.businessId || null);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId,
  });
  const scopeKey = `${tenantId || businessId || "global"}:${input.authority}`;
  const previousHash = store.chainTailByScope.get(scopeKey) || "GENESIS";

  const auditPayload = {
    businessId,
    tenantId,
    authority: input.authority,
    subsystem: input.subsystem,
    engine: input.engine || null,
    action: normalizeIdentifier(input.action).toUpperCase(),
    resourceType: normalizeIdentifier(input.resourceType).toUpperCase(),
    resourceKey: normalizeIdentifier(input.resourceKey),
    metadata: toRecord(input.metadata),
    previousHash,
  };
  const auditHash = stableHash(auditPayload);
  const auditKey = `infra_audit:${auditHash.slice(0, 28)}`;

  const row = {
    auditKey,
    businessId,
    tenantId,
    authority: input.authority,
    subsystem: input.subsystem,
    engine: input.engine || null,
    action: auditPayload.action,
    resourceType: auditPayload.resourceType,
    resourceKey: auditPayload.resourceKey,
    previousHash,
    auditHash,
    metadata: toRecord(input.metadata),
    occurredAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.auditLedger.set(auditKey, row);
  store.chainTailByScope.set(scopeKey, auditHash);
  bumpAuthority("InfrastructureAuditLedger");

  const ledger = getDbLedger("infrastructureAuditLedger");
  if (ledger) {
    await withDbMirrorStrict(() =>
      ledger.upsert({
        where: {
          auditKey,
        },
        update: {},
        create: row,
      })
    );
  }

  return row;
};

const defaultPolicyRecord = (input?: {
  version?: number;
  thresholds?: JsonRecord | null;
  replayPolicy?: JsonRecord | null;
  overridePolicy?: JsonRecord | null;
  recoveryPolicy?: JsonRecord | null;
  metadata?: JsonRecord | null;
}) => {
  const timestamp = now();
  const defaults = {
    thresholds: {
      latencyDegradedMs: 900,
      latencyCriticalMs: 1600,
      errorRateDegraded: 0.08,
      errorRateCritical: 0.2,
      saturationDegraded: 0.75,
      saturationCritical: 0.9,
      consecutiveFailuresCritical: 3,
    },
    replayPolicy: {
      enabled: true,
      defaultRecoveryReplayCap: 1,
    },
    overridePolicy: {
      defaultPriority: 100,
      maxPriority: 1000,
      requireReason: true,
    },
    recoveryPolicy: {
      autoRecoverCritical: true,
      deterministicOrdering: true,
      rollbackSupported: true,
    },
  };

  return {
    policyKey: INFRASTRUCTURE_POLICY_KEY,
    scopeType: "GLOBAL",
    scopeId: null,
    version: Math.max(1, Math.floor(toNumber(input?.version, 1))),
    isActive: true,
    thresholds: {
      ...defaults.thresholds,
      ...toRecord(input?.thresholds),
    },
    replayPolicy: {
      ...defaults.replayPolicy,
      ...toRecord(input?.replayPolicy),
    },
    overridePolicy: {
      ...defaults.overridePolicy,
      ...toRecord(input?.overridePolicy),
    },
    recoveryPolicy: {
      ...defaults.recoveryPolicy,
      ...toRecord(input?.recoveryPolicy),
    },
    metadata: {
      canonicalCatalogSize: CANONICAL_SUBSYSTEM_CATALOG.length,
      ...toRecord(input?.metadata),
      phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
    },
    effectiveFrom: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const normalizePolicyRecord = (row: any) => ({
  ...row,
  thresholds: toRecord(row?.thresholds),
  replayPolicy: toRecord(row?.replayPolicy),
  overridePolicy: toRecord(row?.overridePolicy),
  recoveryPolicy: toRecord(row?.recoveryPolicy),
  metadata: toRecord(row?.metadata),
});

const policyNeedsUpgrade = (row: any) => {
  const normalized = normalizePolicyRecord(row);
  const metadata = toRecord(normalized.metadata);
  const phaseVersion = normalizeIdentifier(metadata.phaseVersion);
  const policyKey = normalizeIdentifier(normalized.policyKey);

  return (
    policyKey !== INFRASTRUCTURE_POLICY_KEY ||
    LEGACY_INFRASTRUCTURE_POLICY_KEYS.has(policyKey) ||
    phaseVersion !== INFRASTRUCTURE_PHASE_VERSION ||
    phaseVersion.includes("6c.1")
  );
};

const buildUpgradedPolicy = (row: any) => {
  const normalized = normalizePolicyRecord(row);
  const sourceMetadata = toRecord(normalized.metadata);

  return defaultPolicyRecord({
    version: toNumber(normalized.version, 1) + 1,
    thresholds: normalized.thresholds,
    replayPolicy: normalized.replayPolicy,
    overridePolicy: normalized.overridePolicy,
    recoveryPolicy: normalized.recoveryPolicy,
    metadata: {
      ...sourceMetadata,
      migratedFromPolicyKey: normalizeIdentifier(normalized.policyKey) || null,
      migratedAt: now().toISOString(),
    },
  });
};

const ensurePolicy = async () => {
  const store = getStore();
  const activeInMemory = Array.from(store.policyLedger.values()).find(
    (row) => row.isActive
  );
  if (activeInMemory) {
    const normalizedActive = normalizePolicyRecord(activeInMemory);
    if (!policyNeedsUpgrade(normalizedActive)) {
      return normalizedActive;
    }

    const upgraded = buildUpgradedPolicy(normalizedActive);
    store.policyLedger.set(normalizedActive.policyKey, {
      ...normalizedActive,
      isActive: false,
      updatedAt: now(),
    });
    store.policyLedger.set(upgraded.policyKey, upgraded);
    bumpAuthority("InfrastructurePolicyLedger");
    return upgraded;
  }

  const defaultPolicy = defaultPolicyRecord();

  if (shouldUseInMemory) {
    store.policyLedger.set(defaultPolicy.policyKey, defaultPolicy);
    bumpAuthority("InfrastructurePolicyLedger");
    return defaultPolicy;
  }

  const ledger = getDbLedger("infrastructureResiliencePolicy");
  if (!ledger) {
    store.policyLedger.set(defaultPolicy.policyKey, defaultPolicy);
    bumpAuthority("InfrastructurePolicyLedger");
    return defaultPolicy;
  }

  const existing = await ledger.findFirst({
    where: {
      isActive: true,
      scopeType: "GLOBAL",
    },
    orderBy: {
      effectiveFrom: "desc",
    },
  });

  if (existing) {
    const normalizedExisting = normalizePolicyRecord(existing);
    if (!policyNeedsUpgrade(normalizedExisting)) {
      store.policyLedger.set(normalizedExisting.policyKey, normalizedExisting);
      bumpAuthority("InfrastructurePolicyLedger");
      return normalizedExisting;
    }

    const upgraded = buildUpgradedPolicy(normalizedExisting);
    await withDbMirrorStrict(() =>
      ledger.updateMany({
        where: {
          scopeType: "GLOBAL",
          isActive: true,
        },
        data: {
          isActive: false,
          updatedAt: now(),
        },
      })
    );
    const created = await ledger.upsert({
      where: {
        policyKey: upgraded.policyKey,
      },
      update: {
        ...toCanonicalUpdateData(upgraded),
      },
      create: upgraded,
    });
    const normalizedCreated = normalizePolicyRecord(created);
    store.policyLedger.set(normalizedExisting.policyKey, {
      ...normalizedExisting,
      isActive: false,
      updatedAt: now(),
    });
    store.policyLedger.set(normalizedCreated.policyKey, normalizedCreated);
    bumpAuthority("InfrastructurePolicyLedger");
    return normalizedCreated;
  }

  const created = await ledger.upsert({
    where: {
      policyKey: defaultPolicy.policyKey,
    },
    update: {
      ...toCanonicalUpdateData(defaultPolicy),
    },
    create: defaultPolicy,
  });
  const normalized = normalizePolicyRecord(created);
  store.policyLedger.set(normalized.policyKey, normalized);
  bumpAuthority("InfrastructurePolicyLedger");
  return normalized;
};

const enforceSecurityInfluence = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  purpose: string;
  metadata?: JsonRecord | null;
}) => {
  const store = getStore();

  await enforceSecurityGovernanceInfluence({
    domain: "INFRASTRUCTURE_RESILIENCE",
    action: input.action,
    businessId: input.businessId || null,
    tenantId: input.tenantId || input.businessId || null,
    actorId: "infrastructure_resilience_os",
    actorType: "SERVICE",
    role: "SERVICE",
    permissions: [input.action],
    scopes: ["SYSTEM"],
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceTenantId: input.tenantId || input.businessId || null,
    purpose: input.purpose,
    metadata: input.metadata || null,
  }).catch(() => undefined);

  store.securityInfluenceChecks += 1;
};

const resolvePolicyThreshold = async () => {
  const policy = await ensurePolicy();
  const thresholds = toRecord(policy.thresholds);
  return {
    latencyDegradedMs: toNumber(thresholds.latencyDegradedMs, 900),
    latencyCriticalMs: toNumber(thresholds.latencyCriticalMs, 1600),
    errorRateDegraded: toNumber(thresholds.errorRateDegraded, 0.08),
    errorRateCritical: toNumber(thresholds.errorRateCritical, 0.2),
    saturationDegraded: toNumber(thresholds.saturationDegraded, 0.75),
    saturationCritical: toNumber(thresholds.saturationCritical, 0.9),
    consecutiveFailuresCritical: toNumber(
      thresholds.consecutiveFailuresCritical,
      3
    ),
    autoRecoverCritical:
      toRecord(policy.recoveryPolicy).autoRecoverCritical !== false,
  };
};

const resolveSubsystemDefinition = (authority: InfraAuthority, subsystem: string) => {
  const normalizedSubsystem = normalizeIdentifier(subsystem).toUpperCase();
  return CANONICAL_SUBSYSTEM_CATALOG.find(
    (row) =>
      row.authority === authority &&
      normalizeIdentifier(row.subsystem).toUpperCase() === normalizedSubsystem
  );
};

const matchesRowScope = (
  row: { businessId?: string | null; tenantId?: string | null },
  input: { businessId?: string | null; tenantId?: string | null }
) => {
  const normalizedRowBusinessId = normalizeBusinessId(row.businessId || null);
  const normalizedRowTenantId = normalizeTenantId({
    tenantId: row.tenantId || null,
    businessId: normalizedRowBusinessId,
  });
  const normalizedInputBusinessId = normalizeBusinessId(input.businessId || null);
  const normalizedInputTenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: normalizedInputBusinessId,
  });

  if (normalizedRowBusinessId && normalizedRowBusinessId !== normalizedInputBusinessId) {
    return false;
  }

  if (normalizedRowTenantId && normalizedRowTenantId !== normalizedInputTenantId) {
    return false;
  }

  return true;
};

const findSubsystemRow = (input: {
  authority: InfraAuthority;
  subsystem: string;
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  const subsystem = normalizeIdentifier(input.subsystem).toUpperCase();
  return Array.from(getStore().subsystemLedger.values()).find(
    (row) =>
      row.authority === input.authority &&
      normalizeIdentifier(row.subsystem).toUpperCase() === subsystem &&
      matchesRowScope(row, {
        businessId: input.businessId || null,
        tenantId: input.tenantId || null,
      })
  );
};

const ensureCanonicalSubsystemRegistration = async (input: {
  authority: InfraAuthority;
  subsystem: string;
  businessId?: string | null;
  tenantId?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const existing = findSubsystemRow(input);
  if (existing) {
    return existing;
  }

  const definition = resolveSubsystemDefinition(input.authority, input.subsystem);
  if (!definition) {
    throw new Error(
      `Unknown infrastructure subsystem '${normalizeIdentifier(
        input.subsystem
      )}' for authority '${input.authority}'.`
    );
  }

  return registerInfrastructureSubsystem({
    authority: input.authority,
    subsystem: definition.subsystem,
    ownerRole: definition.ownerRole,
    criticality: definition.criticality,
    engines: definition.engines,
    businessId: input.businessId || null,
    tenantId: input.tenantId || null,
    metadata: {
      autoRegisteredFromCatalog: true,
      ...toRecord(input.metadata),
    },
  });
};

const ensureCanonicalEngineMembership = async (input: {
  authority: InfraAuthority;
  subsystem: string;
  engine: string;
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  const engine = normalizeIdentifier(input.engine).toUpperCase();
  const definition = resolveSubsystemDefinition(input.authority, input.subsystem);
  if (!definition) {
    throw new Error(
      `Unknown infrastructure subsystem '${normalizeIdentifier(
        input.subsystem
      )}' for authority '${input.authority}'.`
    );
  }
  if (!definition.engines.includes(engine)) {
    throw new Error(
      `Unsupported infrastructure engine '${engine}' for subsystem '${normalizeIdentifier(
        input.subsystem
      ).toUpperCase()}'.`
    );
  }

  await ensureCanonicalSubsystemRegistration({
    authority: input.authority,
    subsystem: input.subsystem,
    businessId: input.businessId || null,
    tenantId: input.tenantId || null,
  });

  const engineEntry = Array.from(getStore().engineLedger.values()).find(
    (row) =>
      row.authority === input.authority &&
      normalizeIdentifier(row.subsystem).toUpperCase() ===
        normalizeIdentifier(input.subsystem).toUpperCase() &&
      normalizeIdentifier(row.engine).toUpperCase() === engine &&
      matchesRowScope(row, {
        businessId: input.businessId || null,
        tenantId: input.tenantId || null,
      })
  );

  if (!engineEntry) {
    throw new Error(
      `Engine '${engine}' is not registered for subsystem '${normalizeIdentifier(
        input.subsystem
      ).toUpperCase()}'.`
    );
  }

  return engineEntry;
};

const resolveOverridePriority = async (requestedPriority?: number) => {
  const policy = await ensurePolicy();
  const overridePolicy = toRecord(policy.overridePolicy);
  const defaultPriority = Math.max(
    1,
    Math.floor(toNumber(overridePolicy.defaultPriority, 100))
  );
  const maxPriority = Math.max(
    defaultPriority,
    Math.floor(toNumber(overridePolicy.maxPriority, 1000))
  );
  const normalizedRequested = Math.floor(
    toNumber(requestedPriority, defaultPriority)
  );
  return Math.min(Math.max(1, normalizedRequested), maxPriority);
};

export const registerInfrastructureSubsystem = async (input: {
  authority: InfraAuthority;
  subsystem: string;
  ownerRole?: string | null;
  criticality?: "TIER0" | "TIER1" | "TIER2";
  engines: string[];
  businessId?: string | null;
  tenantId?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const store = getStore();
  const timestamp = now();
  const businessId = normalizeBusinessId(input.businessId || null);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId,
  });
  const subsystem = normalizeIdentifier(input.subsystem).toUpperCase();
  const engines = uniqueStrings(input.engines || []);
  const subsystemKey = `infra_subsystem:${stableHash([
    businessId || "global",
    input.authority,
    subsystem,
  ]).slice(0, 24)}`;
  const definition = resolveSubsystemDefinition(input.authority, subsystem);

  const subsystemRow = {
    subsystemKey,
    businessId,
    tenantId,
    authority: input.authority,
    subsystem,
    ownerRole:
      normalizeIdentifier(input.ownerRole || definition?.ownerRole || "SRE").toUpperCase(),
    criticality:
      (input.criticality || definition?.criticality || "TIER1").toUpperCase(),
    engineCount: engines.length,
    isCanonical:
      Boolean(definition) &&
      definition?.engines.every((engine) => engines.includes(engine)) &&
      engines.every((engine) => definition?.engines.includes(engine)),
    isActive: true,
    metadata: {
      phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
      ...toRecord(input.metadata),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.subsystemLedger.set(subsystemKey, subsystemRow);
  bumpAuthority("InfrastructureSubsystemLedger");

  const subsystemLedger = getDbLedger("infrastructureSubsystemLedger");
  if (subsystemLedger) {
    await withDbMirrorStrict(() =>
      subsystemLedger.upsert({
        where: {
          subsystemKey,
        },
        update: {
          ...subsystemRow,
          updatedAt: now(),
        },
        create: subsystemRow,
      })
    );
  }

  const engineLedger = getDbLedger("infrastructureEngineLedger");
  for (let index = 0; index < engines.length; index += 1) {
    const engine = engines[index];
    const engineKey = `infra_engine:${stableHash([
      subsystemKey,
      engine,
    ]).slice(0, 24)}`;
    const existing = store.engineLedger.get(engineKey);
    const engineRow = {
      engineKey,
      subsystemKey,
      businessId,
      tenantId,
      authority: input.authority,
      subsystem,
      engine,
      ordinal: index + 1,
      status: (existing?.status ||
        "HEALTHY") as (typeof INFRA_ENGINE_HEALTH_STATES)[number],
      lastSignalAt: existing?.lastSignalAt || null,
      metadata: {
        phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
        ...toRecord(existing?.metadata),
      },
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    store.engineLedger.set(engineKey, engineRow);
    bumpAuthority("InfrastructureEngineLedger");

    if (engineLedger) {
      await withDbMirrorStrict(() =>
        engineLedger.upsert({
          where: {
            engineKey,
          },
          update: {
            ...engineRow,
            updatedAt: now(),
          },
          create: engineRow,
        })
      );
    }
  }

  await appendAuditLedger({
    businessId,
    tenantId,
    authority: input.authority,
    subsystem,
    action: "SUBSYSTEM_REGISTERED",
    resourceType: "INFRA_SUBSYSTEM",
    resourceKey: subsystemKey,
    metadata: {
      engines,
      canonical: subsystemRow.isCanonical,
    },
  });

  return subsystemRow;
};

export const applyInfrastructureOverride = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  authority: InfraAuthority;
  subsystem: string;
  engine?: string | null;
  scope?: string;
  action: InfraOverrideAction;
  reason: string;
  priority?: number;
  expiresAt?: Date | null;
  createdBy?: string | null;
  idempotencyKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const store = getStore();
  const timestamp = now();
  const businessId = normalizeBusinessId(input.businessId || null);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId,
  });
  const subsystem = normalizeIdentifier(input.subsystem).toUpperCase();
  const engine = normalizeIdentifier(input.engine || "").toUpperCase() || null;
  const scope = normalizeIdentifier(input.scope || "RECOVERY").toUpperCase();
  const reason = normalizeIdentifier(input.reason);
  const action = normalizeIdentifier(input.action).toUpperCase() as InfraOverrideAction;

  if (!reason) {
    throw new Error("Override reason is required.");
  }
  if (!INFRA_OVERRIDE_ACTIONS.includes(action)) {
    throw new Error(`Unsupported override action '${input.action}'.`);
  }

  if (engine) {
    await ensureCanonicalEngineMembership({
      authority: input.authority,
      subsystem,
      engine,
      businessId,
      tenantId,
    });
  } else {
    await ensureCanonicalSubsystemRegistration({
      authority: input.authority,
      subsystem,
      businessId,
      tenantId,
    });
  }

  const idempotencyKey = normalizeIdentifier(input.idempotencyKey || "");
  if (idempotencyKey) {
    const existing = Array.from(store.overrideLedger.values()).find(
      (row) => {
        if (normalizeIdentifier(toRecord(row.metadata).idempotencyKey) !== idempotencyKey) {
          return false;
        }
        if (row.authority !== input.authority) {
          return false;
        }
        if (normalizeIdentifier(row.scope).toUpperCase() !== scope) {
          return false;
        }
        if (normalizeIdentifier(row.subsystem).toUpperCase() !== subsystem) {
          return false;
        }
        if (
          (normalizeIdentifier(row.engine || "").toUpperCase() || null) !==
          (engine || null)
        ) {
          return false;
        }
        return matchesRowScope(row, { businessId, tenantId });
      }
    );
    if (existing) {
      return existing;
    }
  }

  await enforceSecurityInfluence({
    businessId,
    tenantId,
    action: "security:override",
    resourceType: "INFRA_OVERRIDE",
    resourceId: subsystem,
    purpose: "INFRA_GOVERNANCE_OVERRIDE",
    metadata: {
      scope,
      engine,
      requestedAction: input.action,
    },
  });

  const overrideKey = `infra_override:${stableHash([
    businessId || "global",
    tenantId || "global",
    input.authority,
    subsystem,
    engine || "*",
    scope,
    input.action,
    idempotencyKey || timestamp.toISOString(),
  ]).slice(0, 28)}`;
  const row = {
    overrideKey,
    businessId,
    tenantId,
    authority: input.authority,
    scope,
    subsystem,
    engine,
    action,
    reason,
    priority: await resolveOverridePriority(input.priority),
    isActive: true,
    effectiveFrom: timestamp,
    expiresAt: input.expiresAt || null,
    createdBy: normalizeIdentifier(input.createdBy || "") || null,
    metadata: {
      idempotencyKey: idempotencyKey || null,
      phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
      ...toRecord(input.metadata),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.overrideLedger.set(overrideKey, row);
  bumpAuthority("InfrastructureOverrideLedger");

  const ledger = getDbLedger("infrastructureOverrideLedger");
  if (ledger) {
    await withDbMirror(() => ledger.create({ data: row }));
  }

  await appendAuditLedger({
    businessId,
    tenantId,
    authority: input.authority,
    subsystem,
    engine,
    action: "OVERRIDE_APPLIED",
    resourceType: "INFRA_OVERRIDE",
    resourceKey: overrideKey,
    metadata: {
      overrideAction: action,
      scope,
      priority: row.priority,
      reason,
    },
  });

  return row;
};

export const resolveInfrastructureOverride = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  authority: InfraAuthority;
  scope?: string;
  subsystem: string;
  engine?: string | null;
}) => {
  const timestamp = now();
  const businessId = normalizeBusinessId(input.businessId || null);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId,
  });
  const scope = normalizeIdentifier(input.scope || "RECOVERY").toUpperCase();
  const subsystem = normalizeIdentifier(input.subsystem).toUpperCase();
  const engine = normalizeIdentifier(input.engine || "").toUpperCase() || null;

  const candidates = Array.from(getStore().overrideLedger.values()).filter((row) => {
    if (!row.isActive) {
      return false;
    }
    if (row.authority !== input.authority) {
      return false;
    }
    if (normalizeIdentifier(row.scope).toUpperCase() !== scope) {
      return false;
    }
    if (normalizeIdentifier(row.subsystem).toUpperCase() !== subsystem) {
      return false;
    }
    const rowEngine = normalizeIdentifier(row.engine || "").toUpperCase() || null;
    if (rowEngine && engine && rowEngine !== engine) {
      return false;
    }
    if (rowEngine && !engine) {
      return false;
    }
    if (!matchesRowScope(row, { businessId, tenantId })) {
      return false;
    }
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= timestamp.getTime()) {
      return false;
    }
    return true;
  });

  candidates.sort((left, right) => {
    const priorityDelta = toNumber(right.priority, 0) - toNumber(left.priority, 0);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const createdAtDelta =
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }
    return String(left.overrideKey).localeCompare(String(right.overrideKey));
  });

  return candidates[0] || null;
};

const deriveHealthState = (input: {
  latencyMs: number;
  errorRate: number;
  saturation: number;
  consecutiveFailures: number;
  thresholds: {
    latencyDegradedMs: number;
    latencyCriticalMs: number;
    errorRateDegraded: number;
    errorRateCritical: number;
    saturationDegraded: number;
    saturationCritical: number;
    consecutiveFailuresCritical: number;
  };
}): InfraHealthState => {
  const degraded =
    input.latencyMs >= input.thresholds.latencyDegradedMs ||
    input.errorRate >= input.thresholds.errorRateDegraded ||
    input.saturation >= input.thresholds.saturationDegraded;
  const critical =
    input.latencyMs >= input.thresholds.latencyCriticalMs ||
    input.errorRate >= input.thresholds.errorRateCritical ||
    input.saturation >= input.thresholds.saturationCritical ||
    input.consecutiveFailures >= input.thresholds.consecutiveFailuresCritical;

  if (critical) {
    return "CRITICAL";
  }
  if (degraded) {
    return "DEGRADED";
  }
  return "HEALTHY";
};

const defaultRecoveryActionsForAuthority = (authority: InfraAuthority) => {
  if (authority === "QUEUE_FABRIC") {
    return ["THROTTLE", "QUEUE_DRAIN"];
  }
  if (authority === "PROVIDER_FABRIC") {
    return ["FAILOVER", "THROTTLE"];
  }
  if (authority === "DATA_FABRIC") {
    return ["ISOLATE", "THROTTLE"];
  }
  if (authority === "WORKER_FABRIC") {
    return ["THROTTLE", "ROLLBACK"];
  }
  return ["THROTTLE"];
};

const INFRA_SUPPORTED_RECOVERY_ACTIONS = new Set([
  "THROTTLE",
  "QUEUE_DRAIN",
  "FAILOVER",
  "ISOLATE",
  "ROLLBACK",
]);

const resolveRecoveryActions = (
  authority: InfraAuthority,
  requestedActions?: string[] | null
) => {
  const resolvedActions = uniqueStrings(
    (requestedActions && requestedActions.length > 0
      ? requestedActions
      : defaultRecoveryActionsForAuthority(authority)) as unknown[]
  ).sort();

  if (resolvedActions.length === 0) {
    throw new Error("Recovery plan requires at least one action.");
  }

  const unsupported = resolvedActions.filter(
    (action) => !INFRA_SUPPORTED_RECOVERY_ACTIONS.has(action)
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported recovery actions: ${unsupported.join(", ")}.`
    );
  }

  return resolvedActions;
};

const toMitigationAction = (action: string) => {
  const normalized = normalizeIdentifier(action).toUpperCase();
  if (normalized === "FAILOVER") {
    return "PROVIDER_FAILOVER";
  }
  if (normalized === "ISOLATE") {
    return "TENANT_ISOLATE";
  }
  if (normalized === "QUEUE_DRAIN") {
    return "QUEUE_DRAIN";
  }
  if (normalized === "ROLLBACK") {
    return "ROLLBACK";
  }
  if (normalized === "THROTTLE") {
    return "THROTTLE";
  }
  return "NONE";
};

export const executeInfrastructureRecoveryPlan = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  authority: InfraAuthority;
  subsystem: string;
  engine?: string | null;
  trigger: string;
  replayToken?: string | null;
  requestedActions?: string[] | null;
  reason?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const store = getStore();
  const timestamp = now();
  const businessId = normalizeBusinessId(input.businessId || null);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId,
  });
  const subsystem = normalizeIdentifier(input.subsystem).toUpperCase();
  const engine = normalizeIdentifier(input.engine || "").toUpperCase() || null;
  const trigger = normalizeIdentifier(input.trigger).toUpperCase();
  const replayToken =
    normalizeIdentifier(input.replayToken || "") ||
    `infra_recovery:${stableHash([
      businessId || "global",
      tenantId || "global",
      input.authority,
      subsystem,
      engine || "*",
      trigger,
      uniqueStrings(input.requestedActions || []),
      normalizeIdentifier(input.reason || "auto"),
    ]).slice(0, 32)}`;
  const scopedReplayTokenKey = buildScopedReplayTokenKey({
    businessId,
    tenantId,
    authority: input.authority,
    subsystem,
    engine,
    replayToken,
  });

  const existingRecoveryKey = store.replayTokenToRecoveryKey.get(scopedReplayTokenKey);
  if (existingRecoveryKey) {
    const existing = store.recoveryLedger.get(existingRecoveryKey);
    if (existing) {
      return {
        ...existing,
        status: "REPLAYED" as InfraRecoveryStatus,
        replayToken,
        replayed: true,
      };
    }
  }

  if (engine) {
    await ensureCanonicalEngineMembership({
      authority: input.authority,
      subsystem,
      engine,
      businessId,
      tenantId,
    });
  } else {
    await ensureCanonicalSubsystemRegistration({
      authority: input.authority,
      subsystem,
      businessId,
      tenantId,
    });
  }

  await enforceSecurityInfluence({
    businessId,
    tenantId,
    action: "ops:mitigate",
    resourceType: "INFRA_RECOVERY",
    resourceId: subsystem,
    purpose: "INCIDENT_RECOVERY",
    metadata: {
      authority: input.authority,
      engine,
      trigger,
    },
  });

  const resolvedOverride = await resolveInfrastructureOverride({
    businessId,
    tenantId,
    authority: input.authority,
    scope: "RECOVERY",
    subsystem,
    engine,
  });

  if (resolvedOverride?.action === "DENY_RECOVERY") {
    const blockedKey = `infra_recovery:${stableHash([
      replayToken,
      "blocked",
    ]).slice(0, 28)}`;
    const blockedRow = {
      recoveryKey: blockedKey,
      businessId,
      tenantId,
      authority: input.authority,
      subsystem,
      engine,
      trigger,
      status: "BLOCKED" as InfraRecoveryStatus,
      replayToken,
      deterministicPlanHash: stableHash({
        subsystem,
        trigger,
        blockedBy: resolvedOverride.overrideKey,
      }),
      actions: [],
      reason: normalizeIdentifier(input.reason || "blocked_by_override"),
      metadata: {
        blockedByOverrideKey: resolvedOverride.overrideKey,
        phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
        ...toRecord(input.metadata),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    store.recoveryLedger.set(blockedKey, blockedRow);
    store.replayTokenToRecoveryKey.set(scopedReplayTokenKey, blockedKey);
    bumpAuthority("InfrastructureRecoveryLedger");
    await appendAuditLedger({
      businessId,
      tenantId,
      authority: input.authority,
      subsystem,
      engine,
      action: "RECOVERY_BLOCKED",
      resourceType: "INFRA_RECOVERY",
      resourceKey: blockedKey,
      metadata: {
        overrideKey: resolvedOverride.overrideKey,
        replayToken,
      },
    });
    return blockedRow;
  }

  const resolvedActions = resolveRecoveryActions(
    input.authority,
    input.requestedActions
  );

  const deterministicPlanHash = stableHash({
    authority: input.authority,
    subsystem,
    engine,
    trigger,
    actions: resolvedActions,
    override: resolvedOverride?.overrideKey || null,
  });
  const recoveryKey = `infra_recovery:${deterministicPlanHash.slice(0, 28)}`;

  const actionRows = resolvedActions.map((action, index) => ({
    order: index + 1,
    action,
    stepKey: `infra_step:${stableHash([
      recoveryKey,
      action,
      index + 1,
    ]).slice(0, 16)}`,
  }));

  const status: InfraRecoveryStatus = "COMPLETED";
  const row = {
    recoveryKey,
    businessId,
    tenantId,
    authority: input.authority,
    subsystem,
    engine,
    trigger,
    status,
    replayToken,
    deterministicPlanHash,
    actions: actionRows,
    reason: normalizeIdentifier(input.reason || "automated_recovery"),
    metadata: {
      overrideKey: resolvedOverride?.overrideKey || null,
      phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
      ...toRecord(input.metadata),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
  };

  store.recoveryLedger.set(recoveryKey, row);
  store.replayTokenToRecoveryKey.set(scopedReplayTokenKey, recoveryKey);
  bumpAuthority("InfrastructureRecoveryLedger");

  const ledger = getDbLedger("infrastructureRecoveryLedger");
  if (ledger) {
    await withDbMirror(() =>
      ledger.upsert({
        where: {
          recoveryKey,
        },
        update: {
          ...row,
          updatedAt: now(),
        },
        create: row,
      })
    );
  }

  await recordTraceLedger({
    traceId: replayToken,
    correlationId: replayToken,
    businessId,
    tenantId,
    stage: `infra:recovery:${subsystem}:started`,
    status: "IN_PROGRESS",
    metadata: {
      authority: input.authority,
      actions: resolvedActions,
    },
  }).catch(() => undefined);

  await recordObservabilityEvent({
    businessId,
    tenantId,
    eventType: "INFRA_RECOVERY_EXECUTED",
    message: `Infrastructure recovery executed for ${subsystem}`,
    severity: "warn",
    eventKey: recoveryKey,
    metadata: {
      authority: input.authority,
      subsystem,
      engine,
      trigger,
      actions: resolvedActions,
    },
  }).catch(() => undefined);

  for (const action of resolvedActions) {
    const mitigationAction = ensureMitigationAction(toMitigationAction(action));
    if (mitigationAction === "NONE") {
      continue;
    }
    store.reliabilityInfluenceAttempts += 1;
    await applyReliabilityOverride({
      businessId,
      tenantId,
      scope: "AUTO_MITIGATION",
      targetType: "SUBSYSTEM",
      targetId: subsystem,
      action: mitigationAction,
      reason: `infra_recovery:${recoveryKey}`,
      priority: Math.max(150, toNumber(resolvedOverride?.priority, 100)),
      metadata: {
        source: "INFRASTRUCTURE_RESILIENCE_OS",
        replayToken,
      },
    })
      .then(() => {
        store.reliabilityInfluenceSuccesses += 1;
      })
      .catch(() => undefined);
  }

  await recordTraceLedger({
    traceId: replayToken,
    correlationId: replayToken,
    businessId,
    tenantId,
    stage: `infra:recovery:${subsystem}:completed`,
    status: "COMPLETED",
    endedAt: now(),
    metadata: {
      authority: input.authority,
      actions: resolvedActions,
    },
  }).catch(() => undefined);

  await appendAuditLedger({
    businessId,
    tenantId,
    authority: input.authority,
    subsystem,
    engine,
    action: "RECOVERY_EXECUTED",
    resourceType: "INFRA_RECOVERY",
    resourceKey: recoveryKey,
    metadata: {
      actions: resolvedActions,
      replayToken,
    },
  });

  return row;
};

export const recordInfrastructureSignal = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  authority: InfraAuthority;
  subsystem: string;
  engine: string;
  signalId?: string | null;
  occurredAt?: Date;
  latencyMs?: number;
  errorRate?: number;
  saturation?: number;
  backlog?: number;
  consecutiveFailures?: number;
  metadata?: JsonRecord | null;
}) => {
  const store = getStore();
  const businessId = normalizeBusinessId(input.businessId || null);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId,
  });
  const subsystem = normalizeIdentifier(input.subsystem).toUpperCase();
  const engine = normalizeIdentifier(input.engine).toUpperCase();
  const occurredAt = input.occurredAt || now();
  const engineEntry = await ensureCanonicalEngineMembership({
    authority: input.authority,
    subsystem,
    engine,
    businessId,
    tenantId,
  });

  const minuteWindow = Math.floor(occurredAt.getTime() / 60_000);
  const derivedSignalKey = `infra_signal:${stableHash([
    businessId || "global",
    tenantId || "global",
    input.authority,
    subsystem,
    engine,
    minuteWindow,
    toNumber(input.latencyMs, 0),
    toNumber(input.errorRate, 0),
    toNumber(input.saturation, 0),
    toNumber(input.backlog, 0),
    toNumber(input.consecutiveFailures, 0),
  ]).slice(0, 28)}`;
  const providedSignalId = normalizeIdentifier(input.signalId || "");
  const signalKey = providedSignalId || derivedSignalKey;

  const existingSignal = store.signalLedger.get(signalKey);
  if (existingSignal) {
    return existingSignal;
  }

  const thresholds = await resolvePolicyThreshold();
  const latencyMs = toNumber(input.latencyMs, 0);
  const errorRate = toNumber(input.errorRate, 0);
  const saturation = toNumber(input.saturation, 0);
  const backlog = toNumber(input.backlog, 0);
  const consecutiveFailures = toNumber(input.consecutiveFailures, 0);

  const healthState = deriveHealthState({
    latencyMs,
    errorRate,
    saturation,
    consecutiveFailures,
    thresholds,
  });

  const row = {
    signalKey,
    businessId,
    tenantId,
    authority: input.authority,
    subsystem,
    engine,
    healthState,
    latencyMs,
    errorRate,
    saturation,
    backlog,
    consecutiveFailures,
    occurredAt,
    metadata: {
      signalId: providedSignalId || null,
      phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
      ...toRecord(input.metadata),
    },
    createdAt: now(),
    updatedAt: now(),
  };

  store.signalLedger.set(signalKey, row);
  bumpAuthority("InfrastructureSignalLedger");

  const signalLedger = getDbLedger("infrastructureSignalLedger");
  if (signalLedger) {
    await withDbMirror(() =>
      signalLedger.upsert({
        where: {
          signalKey,
        },
        update: {
          ...row,
          updatedAt: now(),
        },
        create: row,
      })
    );
  }

  const nextEngine = {
    ...engineEntry,
    status: healthState,
    lastSignalAt: occurredAt,
    updatedAt: now(),
  };
  store.engineLedger.set(engineEntry.engineKey, nextEngine);

  await appendAuditLedger({
    businessId,
    tenantId,
    authority: input.authority,
    subsystem,
    engine,
    action: "SIGNAL_RECORDED",
    resourceType: "INFRA_SIGNAL",
    resourceKey: signalKey,
    metadata: {
      healthState,
      latencyMs,
      errorRate,
      saturation,
      backlog,
      consecutiveFailures,
    },
  });

  await recordObservabilityEvent({
    businessId,
    tenantId,
    eventType: "INFRA_SIGNAL",
    message: `${input.authority}:${subsystem}:${engine} -> ${healthState}`,
    severity: healthState === "CRITICAL" ? "error" : healthState === "DEGRADED" ? "warn" : "info",
    eventKey: signalKey,
    metadata: {
      healthState,
      latencyMs,
      errorRate,
      saturation,
      backlog,
      consecutiveFailures,
    },
  }).catch(() => undefined);

  if (healthState === "CRITICAL" || healthState === "DEGRADED") {
    await raiseReliabilityAlert({
      businessId,
      tenantId,
      subsystem,
      severity: healthState === "CRITICAL" ? "P1" : "P2",
      title: `Infrastructure ${healthState.toLowerCase()} signal`,
      message: `${input.authority}/${subsystem}/${engine} breached resilience thresholds.`,
      dedupeKey: `infra:${input.authority}:${subsystem}:${engine}:${healthState}`.toLowerCase(),
      rootCauseKey: `infra_${healthState.toLowerCase()}`,
      rootCause: `phase6c.${healthState.toLowerCase()}`,
      context: {
        tenantId: tenantId || businessId || null,
        provider: input.authority,
        component: subsystem,
        phase: "infrastructure",
        version: INFRASTRUCTURE_PHASE_VERSION,
      },
      metadata: {
        signalKey,
        authority: input.authority,
        engine,
      },
    }).catch(() => undefined);
  }

  if (healthState === "CRITICAL" && thresholds.autoRecoverCritical) {
    await executeInfrastructureRecoveryPlan({
      businessId,
      tenantId,
      authority: input.authority,
      subsystem,
      engine,
      trigger: "CRITICAL_SIGNAL",
      replayToken: `recovery:auto:${signalKey}`,
      requestedActions: defaultRecoveryActionsForAuthority(input.authority),
      reason: "auto_recovery_critical_signal",
      metadata: {
        signalKey,
      },
    }).catch(() => undefined);
  }

  return row;
};

export const runInfrastructureResilienceChaosScenario = async (input: {
  businessId: string;
  scenario: "engine_degradation" | "override_kill_switch" | "replay_storm";
}) => {
  const businessId = normalizeBusinessId(input.businessId) || "global";
  const tenantId = businessId;
  const traceId = `infra_chaos:${stableHash([
    input.scenario,
    businessId,
    now().toISOString(),
  ]).slice(0, 18)}`;

  await recordTraceLedger({
    traceId,
    correlationId: traceId,
    businessId,
    tenantId,
    stage: `infra:chaos:${input.scenario}:start`,
    status: "IN_PROGRESS",
    metadata: {
      phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
    },
  }).catch(() => undefined);

  if (input.scenario === "engine_degradation") {
    const signal = await recordInfrastructureSignal({
      businessId,
      tenantId,
      authority: "QUEUE_FABRIC",
      subsystem: "RECEPTION_QUEUE",
      engine: "DEDUPE_GATE",
      signalId: `${traceId}:signal`,
      latencyMs: 2400,
      errorRate: 0.31,
      saturation: 0.96,
      backlog: 480,
      consecutiveFailures: 5,
      metadata: {
        chaos: true,
      },
    });
    await recordTraceLedger({
      traceId,
      correlationId: traceId,
      businessId,
      tenantId,
      stage: `infra:chaos:${input.scenario}:done`,
      status: "COMPLETED",
      endedAt: now(),
      metadata: {
        signalKey: signal.signalKey,
      },
    }).catch(() => undefined);
    return {
      traceId,
      scenario: input.scenario,
      recovered: true,
      signalKey: signal.signalKey,
    };
  }

  if (input.scenario === "override_kill_switch") {
    const override = await applyInfrastructureOverride({
      businessId,
      tenantId,
      authority: "RECOVERY_FABRIC",
      subsystem: "RUNBOOK_ORCHESTRATOR",
      action: "DENY_RECOVERY",
      scope: "RECOVERY",
      reason: "chaos_kill_switch",
      priority: 999,
      metadata: {
        chaos: true,
      },
    });
    const recovery = await executeInfrastructureRecoveryPlan({
      businessId,
      tenantId,
      authority: "RECOVERY_FABRIC",
      subsystem: "RUNBOOK_ORCHESTRATOR",
      trigger: "MANUAL_CHAOS",
      replayToken: `${traceId}:recovery`,
      requestedActions: ["THROTTLE"],
      reason: "chaos_verification",
    });
    await recordTraceLedger({
      traceId,
      correlationId: traceId,
      businessId,
      tenantId,
      stage: `infra:chaos:${input.scenario}:done`,
      status: "COMPLETED",
      endedAt: now(),
      metadata: {
        overrideKey: override.overrideKey,
        recoveryStatus: recovery.status,
      },
    }).catch(() => undefined);
    return {
      traceId,
      scenario: input.scenario,
      recovered: recovery.status === "BLOCKED",
      overrideKey: override.overrideKey,
      recoveryStatus: recovery.status,
    };
  }

  const first = await executeInfrastructureRecoveryPlan({
    businessId,
    tenantId,
    authority: "PROVIDER_FABRIC",
    subsystem: "EXTERNAL_PROVIDERS",
    trigger: "REPLAY_STORM",
    replayToken: `${traceId}:replay`,
    requestedActions: ["FAILOVER", "THROTTLE"],
    reason: "chaos_replay_validation",
  });
  const second = await executeInfrastructureRecoveryPlan({
    businessId,
    tenantId,
    authority: "PROVIDER_FABRIC",
    subsystem: "EXTERNAL_PROVIDERS",
    trigger: "REPLAY_STORM",
    replayToken: `${traceId}:replay`,
    requestedActions: ["FAILOVER", "THROTTLE"],
    reason: "chaos_replay_validation",
  });

  await recordTraceLedger({
    traceId,
    correlationId: traceId,
    businessId,
    tenantId,
    stage: `infra:chaos:${input.scenario}:done`,
    status: "COMPLETED",
    endedAt: now(),
    metadata: {
      firstStatus: first.status,
      secondStatus: second.status,
    },
  }).catch(() => undefined);

  return {
    traceId,
    scenario: input.scenario,
    recovered: second.status === "REPLAYED",
    firstStatus: first.status,
    secondStatus: second.status,
  };
};

const validateAuditChains = () => {
  const store = getStore();
  const grouped = new Map<string, any[]>();
  for (const row of store.auditLedger.values()) {
    const key = `${row.tenantId || row.businessId || "global"}:${row.authority}`;
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  for (const rows of grouped.values()) {
    rows.sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
    let previousHash = "GENESIS";
    for (const row of rows) {
      const expectedHash = stableHash({
        businessId: row.businessId || null,
        tenantId: row.tenantId || null,
        authority: row.authority,
        subsystem: row.subsystem,
        engine: row.engine || null,
        action: row.action,
        resourceType: row.resourceType,
        resourceKey: row.resourceKey,
        metadata: toRecord(row.metadata),
        previousHash,
      });
      if (row.previousHash !== previousHash || row.auditHash !== expectedHash) {
        return false;
      }
      previousHash = row.auditHash;
    }
  }

  return true;
};

export const getInfrastructureControlPlaneProjection = async (input?: {
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  const businessId = normalizeBusinessId(input?.businessId || null);
  const tenantId = normalizeTenantId({
    tenantId: input?.tenantId || null,
    businessId,
  });
  const store = getStore();
  const hasScope = Boolean(businessId || tenantId);
  const scopeFilter = (row: { businessId?: string | null; tenantId?: string | null }) =>
    hasScope
      ? matchesRowScope(row, {
          businessId,
          tenantId,
        })
      : true;

  const subsystems = Array.from(store.subsystemLedger.values()).filter(scopeFilter);
  const engines = Array.from(store.engineLedger.values()).filter(scopeFilter);
  const signals = Array.from(store.signalLedger.values()).filter(scopeFilter);
  const recoveries = Array.from(store.recoveryLedger.values()).filter(scopeFilter);
  const audits = Array.from(store.auditLedger.values()).filter(scopeFilter);

  const byAuthority = INFRA_AUTHORITIES.map((authority) => {
    const authoritySubsystems = subsystems.filter((row) => row.authority === authority);
    const authorityEngines = engines.filter((row) => row.authority === authority);
    const healthy = authorityEngines.filter((row) => row.status === "HEALTHY").length;
    const degraded = authorityEngines.filter((row) => row.status === "DEGRADED").length;
    const critical = authorityEngines.filter((row) => row.status === "CRITICAL").length;
    return {
      authority,
      subsystemCount: authoritySubsystems.length,
      engineCount: authorityEngines.length,
      healthy,
      degraded,
      critical,
    };
  });

  const activeOverrides = Array.from(store.overrideLedger.values()).filter((row) => {
    if (!row.isActive) {
      return false;
    }
    if (!scopeFilter(row)) {
      return false;
    }
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
      return false;
    }
    return true;
  });

  return {
    phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
    generatedAt: now().toISOString(),
    businessId,
    tenantId,
    counts: {
      subsystems: subsystems.length,
      engines: engines.length,
      signals: signals.length,
      recoveries: recoveries.length,
      overrides: activeOverrides.length,
      audits: audits.length,
    },
    byAuthority,
    activeOverrides: activeOverrides.map((row) => ({
      overrideKey: row.overrideKey,
      authority: row.authority,
      scope: row.scope,
      subsystem: row.subsystem,
      engine: row.engine,
      action: row.action,
      priority: row.priority,
      expiresAt: row.expiresAt || null,
    })),
  };
};

export const runInfrastructureResilienceSelfAudit = async (input?: {
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  await bootstrapInfrastructureResilienceOS();
  const businessId = normalizeBusinessId(input?.businessId || null);
  const tenantId = normalizeTenantId({
    tenantId: input?.tenantId || null,
    businessId,
  });
  const store = getStore();
  const hasScope = Boolean(businessId || tenantId);
  const scopeFilter = (row: { businessId?: string | null; tenantId?: string | null }) =>
    hasScope
      ? matchesRowScope(row, {
          businessId,
          tenantId,
        })
      : true;
  const policies = Array.from(store.policyLedger.values());
  const subsystems = Array.from(store.subsystemLedger.values()).filter(scopeFilter);
  const engines = Array.from(store.engineLedger.values()).filter(scopeFilter);
  const signals = Array.from(store.signalLedger.values()).filter(scopeFilter);
  const recoveries = Array.from(store.recoveryLedger.values()).filter(scopeFilter);
  const overrides = Array.from(store.overrideLedger.values()).filter(scopeFilter);
  const audits = Array.from(store.auditLedger.values()).filter(scopeFilter);
  const counts = {
    policyLedger: policies.length,
    subsystemLedger: subsystems.length,
    engineLedger: engines.length,
    signalLedger: signals.length,
    recoveryLedger: recoveries.length,
    overrideLedger: overrides.length,
    auditLedger: audits.length,
  };

  const authoritativeCoverage = INFRA_AUTHORITIES.every((authority) =>
    subsystems.some((row) => row.authority === authority)
  );
  const canonicalCoverage = CANONICAL_SUBSYSTEM_CATALOG.every((definition) => {
    const subsystemRow = subsystems.find(
      (row) =>
        row.authority === definition.authority &&
        normalizeIdentifier(row.subsystem).toUpperCase() ===
          normalizeIdentifier(definition.subsystem).toUpperCase()
    );
    if (!subsystemRow) {
      return false;
    }
    const engineSet = new Set(
      engines
        .filter((row) => row.subsystemKey === subsystemRow.subsystemKey)
        .map((row) => normalizeIdentifier(row.engine).toUpperCase())
    );
    return (
      definition.engines.every((engine) => engineSet.has(engine)) &&
      engineSet.size === definition.engines.length
    );
  });

  const orphanFree =
    engines.every((row) => subsystems.some((subsystem) => subsystem.subsystemKey === row.subsystemKey)) &&
    subsystems.every((row) => {
      const mappedEngines = engines.filter(
        (engine) => engine.subsystemKey === row.subsystemKey
      );
      return mappedEngines.length === toNumber(row.engineCount, 0);
    });

  const replaySafe = recoveries.every((row) => {
    if (!row.replayToken) {
      return false;
    }
    const scopedReplayTokenKey = buildScopedReplayTokenKey({
      businessId: row.businessId || null,
      tenantId: row.tenantId || null,
      authority: row.authority as InfraAuthority,
      subsystem: row.subsystem,
      engine: row.engine || null,
      replayToken: row.replayToken,
    });
    return (
      store.replayTokenToRecoveryKey.get(scopedReplayTokenKey) === row.recoveryKey
    );
  });

  const policy = await ensurePolicy();
  const overridePolicy = toRecord(policy.overridePolicy);
  const maxPriority = Math.max(
    1,
    Math.floor(toNumber(overridePolicy.maxPriority, 1000))
  );
  const overrideSafe = overrides.every((row) => {
    if (!row.reason || !String(row.reason).trim()) {
      return false;
    }
    if (!INFRA_OVERRIDE_ACTIONS.includes(normalizeIdentifier(row.action).toUpperCase() as InfraOverrideAction)) {
      return false;
    }
    if (toNumber(row.priority, 0) < 1 || toNumber(row.priority, 0) > maxPriority) {
      return false;
    }
    return Boolean(resolveSubsystemDefinition(row.authority, row.subsystem));
  });

  const auditReference = new Set(
    audits.map(
      (row) =>
        `${normalizeIdentifier(row.resourceType).toUpperCase()}:${normalizeIdentifier(
          row.resourceKey
        )}`
    )
  );
  const noHiddenState =
    subsystems.every((row) =>
      auditReference.has(`INFRA_SUBSYSTEM:${normalizeIdentifier(row.subsystemKey)}`)
    ) &&
    signals.every((row) =>
      auditReference.has(`INFRA_SIGNAL:${normalizeIdentifier(row.signalKey)}`)
    ) &&
    recoveries.every((row) =>
      auditReference.has(`INFRA_RECOVERY:${normalizeIdentifier(row.recoveryKey)}`)
    ) &&
    overrides.every((row) =>
      auditReference.has(`INFRA_OVERRIDE:${normalizeIdentifier(row.overrideKey)}`)
    ) &&
    store.chainTailByScope.size > 0;

  const legacyFree = policies.every((row) => {
    const policyKey = normalizeIdentifier(row.policyKey);
    const phaseVersion = normalizeIdentifier(toRecord(row.metadata).phaseVersion);
    return !policyKey.includes("6c.1") && !phaseVersion.includes("6c.1");
  });

  const reliabilityWired =
    store.reliabilityInfluenceAttempts === 0
      ? recoveries.length === 0
      : store.reliabilityInfluenceSuccesses > 0 &&
        store.reliabilityInfluenceSuccesses <= store.reliabilityInfluenceAttempts;

  const checks = {
    reachable: true,
    bootstrapped: Boolean(store.bootstrappedAt),
    authoritativeCoverage,
    canonicalEngines: canonicalCoverage,
    legacyFree,
    deterministicReplay: replaySafe,
    overrideSafe,
    auditableChain: validateAuditChains(),
    orphanFree,
    noHiddenState,
    reliabilityWired,
    securityWired: store.securityInfluenceChecks > 0,
  };

  const deeplyWired = Object.values(checks).every(Boolean);

  const projection = await getInfrastructureControlPlaneProjection({
    businessId,
    tenantId,
  });

  return {
    phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
    businessId,
    tenantId,
    deeplyWired,
    checks,
    counts,
    projection,
    invoked: store.invokeCount,
    bootstrappedAt: store.bootstrappedAt?.toISOString() || null,
  };
};

export const bootstrapInfrastructureResilienceOS = async () => {
  const store = getStore();
  store.invokeCount += 1;
  if (store.bootstrappedAt) {
    return {
      bootstrappedAt: store.bootstrappedAt,
      phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
      alreadyBootstrapped: true,
    };
  }

  if (bootstrapInfrastructureResilienceInFlight) {
    return bootstrapInfrastructureResilienceInFlight;
  }

  const bootstrapPromise = (async () => {
    await ensurePolicy();

    for (const definition of CANONICAL_SUBSYSTEM_CATALOG) {
      await registerInfrastructureSubsystem({
        authority: definition.authority,
        subsystem: definition.subsystem,
        ownerRole: definition.ownerRole,
        criticality: definition.criticality,
        engines: definition.engines,
        metadata: {
          bootstrapped: true,
        },
      });
    }

    const timestamp = now();
    store.bootstrappedAt = timestamp;

    await appendAuditLedger({
      authority: "CONTROL_PLANE",
      subsystem: "API_EDGE",
      action: "BOOTSTRAP_COMPLETED",
      resourceType: "INFRA_BOOTSTRAP",
      resourceKey: "phase6c.final",
      metadata: {
        phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
        authorities: INFRA_AUTHORITIES.length,
        subsystems: CANONICAL_SUBSYSTEM_CATALOG.length,
      },
    });

    return {
      bootstrappedAt: timestamp,
      phaseVersion: INFRASTRUCTURE_PHASE_VERSION,
      alreadyBootstrapped: false,
    };
  })();

  bootstrapInfrastructureResilienceInFlight = bootstrapPromise;
  try {
    return await bootstrapPromise;
  } finally {
    if (bootstrapInfrastructureResilienceInFlight === bootstrapPromise) {
      bootstrapInfrastructureResilienceInFlight = null;
    }
  }
};

export const __infrastructurePhase6CTestInternals = {
  resetStore: () => {
    globalForInfrastructure.__sylphInfrastructureStore = createStore();
    bootstrapInfrastructureResilienceInFlight = null;
  },
  getStore: () => getStore(),
  canonicalCatalog: () => CANONICAL_SUBSYSTEM_CATALOG,
};
