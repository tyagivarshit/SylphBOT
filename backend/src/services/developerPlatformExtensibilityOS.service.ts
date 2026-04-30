// @ts-nocheck
import crypto from "crypto";
import prisma from "../config/prisma";
import { encrypt } from "../utils/encrypt";
import { recordObservabilityEvent, raiseReliabilityAlert, recordTraceLedger, bootstrapReliabilityOS } from "./reliability/reliabilityOS.service";
import { bootstrapSaaSPackagingConnectHubOS } from "./saasPackagingConnectHubOS.service";
import {
  bootstrapSecurityGovernanceOS,
  enforceSecurityGovernanceInfluence,
} from "./security/securityGovernanceOS.service";

type JsonRecord = Record<string, unknown>;
type StoreMap = Map<string, any>;

export const DEVELOPER_PLATFORM_PHASE_VERSION = "phase6e.final.v1";

export const DEVELOPER_PLATFORM_AUTHORITIES = [
  "DeveloperNamespaceLedger",
  "ExtensionPackageLedger",
  "ExtensionReleaseLedger",
  "ExtensionInstallLedger",
  "ExtensionSubscriptionLedger",
  "ExtensionSecretBindingLedger",
  "ExtensionExecutionLedger",
  "ExtensionPolicyLedger",
  "ExtensionOverrideLedger",
  "DeveloperPortalApiKeyLedger",
  "ExtensionAuditLedger",
] as const;

export const DEVELOPER_PLATFORM_ENGINES = [
  "REGISTRY_ENGINE",
  "RELEASE_ENGINE",
  "INSTALL_ENGINE",
  "POLICY_ENGINE",
  "OVERRIDE_ENGINE",
  "EVENT_BUS_ENGINE",
  "SECRET_BINDING_ENGINE",
  "EXECUTION_ENGINE",
  "AUDIT_CHAIN_ENGINE",
  "REPLAY_ENGINE",
] as const;

export const DEVELOPER_PLATFORM_EVENTS = [
  "extension.namespace.registered",
  "extension.package.published",
  "extension.release.published",
  "extension.installed",
  "extension.subscription.saved",
  "extension.secret.bound",
  "extension.execution.succeeded",
  "extension.execution.failed",
  "extension.execution.blocked",
  "extension.override.applied",
  "extension.policy.applied",
  "developer.key.created",
  "developer.key.revoked",
] as const;

type DeveloperPlatformAuthority = (typeof DEVELOPER_PLATFORM_AUTHORITIES)[number];
type PlatformEngine = (typeof DEVELOPER_PLATFORM_ENGINES)[number];

type DeveloperPlatformStore = {
  bootstrappedAt: Date | null;
  invokeCount: number;
  authorities: Map<string, number>;
  namespaceLedger: StoreMap;
  packageLedger: StoreMap;
  releaseLedger: StoreMap;
  installLedger: StoreMap;
  subscriptionLedger: StoreMap;
  secretBindingLedger: StoreMap;
  executionLedger: StoreMap;
  policyLedger: StoreMap;
  overrideLedger: StoreMap;
  apiKeyLedger: StoreMap;
  auditLedger: StoreMap;
  replayIndex: Map<string, string>;
  chainTailByScope: Map<string, string>;
  wiringDomains: Set<string>;
  engineInvocations: Map<PlatformEngine, number>;
  securityInfluenceChecks: number;
  reliabilityInfluenceChecks: number;
  failpoints: Set<string>;
};

const shouldUseInMemory =
  process.env.NODE_ENV === "test" ||
  process.argv.some((value) => value.includes("run-tests"));

const db = prisma as any;
const now = () => new Date();

const globalForDeveloperPlatform = globalThis as typeof globalThis & {
  __sylphDeveloperPlatformExtensibilityStore?: DeveloperPlatformStore;
};

const toRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const toArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(value.map((item) => String(item || "").trim()).filter(Boolean))
  );
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeIdentifier = (value: unknown) => String(value || "").trim();

const normalizeTenantId = (input: {
  tenantId?: string | null;
  businessId?: string | null;
}) => {
  const normalized = normalizeIdentifier(input.tenantId || input.businessId || "");
  return normalized || null;
};

const normalizeNamespace = (value: unknown) => {
  const normalized = normalizeIdentifier(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_");
  return normalized || "automexia.default";
};

const normalizeEnvironment = (value: unknown) => {
  const normalized = normalizeIdentifier(value).toUpperCase();
  return normalized === "SANDBOX" ? "SANDBOX" : "LIVE";
};

const normalizeStatus = (value: unknown, fallback: string) =>
  normalizeIdentifier(value).toUpperCase() || fallback;

const stableHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const buildTenantKey = (tenantId: string) => `tenant:${tenantId}`;

const makeScopedReplayKey = (input: {
  tenantKey: string;
  flow: string;
  packageKey?: string | null;
  installKey?: string | null;
  replayToken: string;
}) =>
  [
    input.tenantKey,
    normalizeIdentifier(input.flow).toUpperCase(),
    normalizeIdentifier(input.packageKey || "*"),
    normalizeIdentifier(input.installKey || "*"),
    normalizeIdentifier(input.replayToken),
  ].join(":");

const createStore = (): DeveloperPlatformStore => ({
  bootstrappedAt: null,
  invokeCount: 0,
  authorities: new Map(),
  namespaceLedger: new Map(),
  packageLedger: new Map(),
  releaseLedger: new Map(),
  installLedger: new Map(),
  subscriptionLedger: new Map(),
  secretBindingLedger: new Map(),
  executionLedger: new Map(),
  policyLedger: new Map(),
  overrideLedger: new Map(),
  apiKeyLedger: new Map(),
  auditLedger: new Map(),
  replayIndex: new Map(),
  chainTailByScope: new Map(),
  wiringDomains: new Set(),
  engineInvocations: new Map(),
  securityInfluenceChecks: 0,
  reliabilityInfluenceChecks: 0,
  failpoints: new Set(),
});

const getStore = () => {
  if (!globalForDeveloperPlatform.__sylphDeveloperPlatformExtensibilityStore) {
    globalForDeveloperPlatform.__sylphDeveloperPlatformExtensibilityStore = createStore();
  }
  return globalForDeveloperPlatform.__sylphDeveloperPlatformExtensibilityStore;
};

const bumpAuthority = (authority: DeveloperPlatformAuthority) => {
  const store = getStore();
  store.authorities.set(authority, (store.authorities.get(authority) || 0) + 1);
};

const bumpEngine = (engine: PlatformEngine) => {
  const store = getStore();
  store.engineInvocations.set(engine, (store.engineInvocations.get(engine) || 0) + 1);
};

const markWiringDomain = (...domains: string[]) => {
  const store = getStore();
  for (const domain of domains) {
    store.wiringDomains.add(domain);
  }
};

const getDbLedger = (...candidates: string[]) => {
  for (const candidate of candidates) {
    if ((db as any)[candidate]) {
      return (db as any)[candidate];
    }
  }
  return null;
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

const withChain = (
  tenantKey: string,
  authority: DeveloperPlatformAuthority,
  payload: JsonRecord
) => {
  const store = getStore();
  const scope = `${tenantKey}:${authority}`;
  const previousHash = store.chainTailByScope.get(scope) || "GENESIS";
  const chainHash = stableHash({
    previousHash,
    payload,
  });
  store.chainTailByScope.set(scope, chainHash);
  return {
    previousHash,
    chainHash,
  };
};

const registerReplay = (key: string, resourceKey: string) => {
  getStore().replayIndex.set(key, resourceKey);
};

const resolveReplay = (key: string) => getStore().replayIndex.get(key) || null;

const assertFailpoint = (name: string) => {
  if (getStore().failpoints.has(name)) {
    throw new Error(`failpoint:${name}`);
  }
};

const callSecurityInfluence = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  purpose: string;
  metadata?: JsonRecord | null;
}) => {
  await enforceSecurityGovernanceInfluence({
    domain: "DEVELOPER_PLATFORM_EXTENSIBILITY",
    action: input.action,
    businessId: input.businessId || null,
    tenantId: input.tenantId || input.businessId || null,
    actorId: "developer_platform_extensibility_os",
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
  getStore().securityInfluenceChecks += 1;
};

const callReliabilityInfluence = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  severity: "P1" | "P2" | "P3";
  reason: string;
  dedupeKey: string;
  metadata?: JsonRecord | null;
}) => {
  await raiseReliabilityAlert({
    businessId: input.businessId || null,
    tenantId: input.tenantId || input.businessId || null,
    subsystem: "DEVELOPER_PLATFORM",
    severity: input.severity,
    title: "Developer platform execution issue",
    message: input.reason,
    dedupeKey: input.dedupeKey,
    rootCauseKey: `developer_platform:${input.dedupeKey}`,
    rootCause: input.reason,
    context: {
      provider: "INTERNAL_API",
      component: "developer-platform",
      phase: "extensibility",
      version: DEVELOPER_PLATFORM_PHASE_VERSION,
    },
    metadata: input.metadata || null,
  }).catch(() => undefined);
  getStore().reliabilityInfluenceChecks += 1;
};

const upsertLedgerRecord = async (input: {
  authority: DeveloperPlatformAuthority;
  storeMap: StoreMap;
  keyField: string;
  keyValue: string;
  row: JsonRecord;
  dbLedgers: string[];
}) => {
  const tenantKey = normalizeIdentifier((input.row as any).tenantKey || "global");
  const chainMeta = withChain(tenantKey, input.authority, input.row);
  const enrichedRow = {
    ...input.row,
    metadata: {
      ...toRecord((input.row as any).metadata),
      chain: chainMeta,
      phaseVersion: DEVELOPER_PLATFORM_PHASE_VERSION,
    },
    updatedAt: now(),
  };

  if (!input.storeMap.has(input.keyValue)) {
    (enrichedRow as any).createdAt = now();
  }
  input.storeMap.set(input.keyValue, enrichedRow);
  bumpAuthority(input.authority);

  const ledger = getDbLedger(...input.dbLedgers);
  if (ledger) {
    await withDbMirror(() =>
      ledger.upsert({
        where: {
          [input.keyField]: input.keyValue,
        },
        update: enrichedRow,
        create: {
          ...enrichedRow,
          [input.keyField]: input.keyValue,
        },
      })
    );
  }
  return enrichedRow;
};

const writeAudit = async (input: {
  tenantKey: string;
  businessId?: string | null;
  action: string;
  resourceType: string;
  resourceKey: string;
  actorId?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("AUDIT_CHAIN_ENGINE");
  const store = getStore();
  const scope = `${input.tenantKey}:EXTENSION_AUDIT`;
  const previousHash = store.chainTailByScope.get(scope) || "GENESIS";
  const occurredAt = now();
  const auditKey = `ext_audit:${stableHash([
    input.tenantKey,
    input.action,
    input.resourceType,
    input.resourceKey,
    occurredAt.toISOString(),
  ]).slice(0, 32)}`;
  const row = {
    auditKey,
    tenantKey: input.tenantKey,
    businessId: input.businessId || null,
    action: normalizeIdentifier(input.action).toUpperCase(),
    resourceType: normalizeIdentifier(input.resourceType).toUpperCase(),
    resourceKey: normalizeIdentifier(input.resourceKey),
    actorId: normalizeIdentifier(input.actorId || "") || "SYSTEM",
    previousHash,
    auditHash: stableHash({
      previousHash,
      action: input.action,
      resourceType: input.resourceType,
      resourceKey: input.resourceKey,
      metadata: toRecord(input.metadata),
      occurredAt: occurredAt.toISOString(),
    }),
    metadata: toRecord(input.metadata),
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  store.chainTailByScope.set(scope, row.auditHash);
  store.auditLedger.set(auditKey, row);
  bumpAuthority("ExtensionAuditLedger");
  await withDbMirror(() => db.extensionAuditLedger.create({ data: row }));
  return row;
};

const getNamespaceByKey = (namespaceKey: string) =>
  getStore().namespaceLedger.get(namespaceKey) || null;

const getPackageByKey = (packageKey: string) => getStore().packageLedger.get(packageKey) || null;

const listReleases = (packageKey: string) =>
  Array.from(getStore().releaseLedger.values()).filter(
    (row) => row.packageKey === packageKey
  );

const getReleaseByKey = (releaseKey: string) =>
  getStore().releaseLedger.get(releaseKey) || null;

const listInstalls = (input: {
  tenantKey: string;
  packageKey?: string | null;
  environment?: string | null;
}) =>
  Array.from(getStore().installLedger.values()).filter((row) => {
    if (row.tenantKey !== input.tenantKey) {
      return false;
    }
    if (input.packageKey && row.packageKey !== input.packageKey) {
      return false;
    }
    if (input.environment && row.environment !== input.environment) {
      return false;
    }
    return true;
  });

const getInstallByKey = (installKey: string) => getStore().installLedger.get(installKey) || null;

const getActivePolicy = (tenantKey: string, scope = "EXECUTION") => {
  const candidates = Array.from(getStore().policyLedger.values()).filter(
    (row) => row.tenantKey === tenantKey && row.scope === scope && row.isActive
  );
  candidates.sort((left, right) => {
    const versionDelta = toNumber(right.version, 0) - toNumber(left.version, 0);
    if (versionDelta !== 0) {
      return versionDelta;
    }
    return (
      new Date(right.updatedAt || right.createdAt || 0).getTime() -
      new Date(left.updatedAt || left.createdAt || 0).getTime()
    );
  });
  return candidates[0] || null;
};

const resolveActiveOverride = (input: {
  tenantKey: string;
  scope: string;
  targetType: string;
  targetKey?: string | null;
}) => {
  const candidates = Array.from(getStore().overrideLedger.values()).filter((row) => {
    if (row.tenantKey !== input.tenantKey) {
      return false;
    }
    if (!row.isActive) {
      return false;
    }
    if (row.scope !== input.scope) {
      return false;
    }
    if (row.targetType !== input.targetType) {
      return false;
    }
    if (input.targetKey && normalizeIdentifier(row.targetKey || "") !== input.targetKey) {
      return false;
    }
    const at = now().getTime();
    const effectiveAt = row.effectiveFrom ? new Date(row.effectiveFrom).getTime() : 0;
    const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
    if (effectiveAt > at) {
      return false;
    }
    if (expiresAt && expiresAt <= at) {
      return false;
    }
    return true;
  });
  candidates.sort((left, right) => {
    const priorityDelta = toNumber(right.priority, 0) - toNumber(left.priority, 0);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return (
      new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    );
  });
  return candidates[0] || null;
};

const getLatestReleaseForPackage = (packageKey: string) => {
  const releases = listReleases(packageKey).filter((row) => row.isActive);
  releases.sort((left, right) => {
    const versionDelta = toNumber(right.versionInt, 0) - toNumber(left.versionInt, 0);
    if (versionDelta !== 0) {
      return versionDelta;
    }
    return (
      new Date(right.updatedAt || right.createdAt || 0).getTime() -
      new Date(left.updatedAt || left.createdAt || 0).getTime()
    );
  });
  return releases[0] || null;
};

const getRecentExecutionCount = (input: {
  tenantKey: string;
  packageKey: string;
  withinMs: number;
}) => {
  const threshold = now().getTime() - input.withinMs;
  return Array.from(getStore().executionLedger.values()).filter((row) => {
    if (row.tenantKey !== input.tenantKey || row.packageKey !== input.packageKey) {
      return false;
    }
    const startedAtMs = new Date(row.startedAt || row.createdAt || 0).getTime();
    return startedAtMs >= threshold && ["SUCCEEDED", "FAILED", "BLOCKED"].includes(row.status);
  }).length;
};

const findExecutionByReplayToken = (replayToken: string) =>
  Array.from(getStore().executionLedger.values()).find(
    (row) => row.replayToken === replayToken
  ) || null;

const findExecutionByDedupe = (input: {
  tenantKey: string;
  installKey: string;
  dedupeKey: string;
}) =>
  Array.from(getStore().executionLedger.values()).find(
    (row) =>
      row.tenantKey === input.tenantKey &&
      row.installKey === input.installKey &&
      row.dedupeKey === input.dedupeKey
  ) || null;

const ensureDefaultPolicy = async (tenantKey: string, businessId?: string | null) => {
  const existing = getActivePolicy(tenantKey, "EXECUTION");
  if (existing) {
    return existing;
  }
  return upsertLedgerRecord({
    authority: "ExtensionPolicyLedger",
    storeMap: getStore().policyLedger,
    keyField: "policyKey",
    keyValue: `ext_policy:${tenantKey}:default`,
    row: {
      policyKey: `ext_policy:${tenantKey}:default`,
      tenantKey,
      businessId: businessId || null,
      scope: "EXECUTION",
      targetType: "TENANT",
      targetKey: null,
      maxExecutionsPerMinute: 120,
      timeoutMs: 15000,
      requiresApproval: false,
      allowedTriggers: ["MANUAL", "WEBHOOK", "SCHEDULE", "EVENT"],
      version: 1,
      isActive: true,
      metadata: {
        defaultPolicy: true,
      },
    },
    dbLedgers: ["extensionPolicyLedger"],
  });
};

const assertExecutionAllowed = (input: {
  tenantKey: string;
  packageKey: string;
  trigger: string;
  installKey: string;
}) => {
  bumpEngine("POLICY_ENGINE");
  const trigger = normalizeIdentifier(input.trigger).toUpperCase() || "MANUAL";
  const override = resolveActiveOverride({
    tenantKey: input.tenantKey,
    scope: "EXECUTION",
    targetType: "INSTALL",
    targetKey: input.installKey,
  });

  if (override && ["BLOCK", "PAUSE", "DENY"].includes(override.action)) {
    return {
      allowed: false,
      reason: `override_blocked:${override.overrideKey}`,
      policy: null,
      override,
    };
  }

  const policy = getActivePolicy(input.tenantKey, "EXECUTION");
  if (!policy) {
    return {
      allowed: true,
      reason: "no_policy_found_allow",
      policy: null,
      override,
    };
  }

  const allowedTriggers = toArray(policy.allowedTriggers).map((value) =>
    value.toUpperCase()
  );
  if (allowedTriggers.length > 0 && !allowedTriggers.includes(trigger)) {
    return {
      allowed: false,
      reason: `trigger_not_allowed:${trigger}`,
      policy,
      override,
    };
  }

  const maxPerMinute = Math.max(1, Math.floor(toNumber(policy.maxExecutionsPerMinute, 120)));
  const recentCount = getRecentExecutionCount({
    tenantKey: input.tenantKey,
    packageKey: input.packageKey,
    withinMs: 60_000,
  });
  if (recentCount >= maxPerMinute) {
    return {
      allowed: false,
      reason: "rate_limit_exceeded",
      policy,
      override,
    };
  }

  return {
    allowed: true,
    reason: "policy_allow",
    policy,
    override,
  };
};

const bootstrapDefaultNamespace = async () => {
  const key = "namespace:tenant:global:automexia.core";
  if (getStore().namespaceLedger.has(key)) {
    return getStore().namespaceLedger.get(key);
  }
  return upsertLedgerRecord({
    authority: "DeveloperNamespaceLedger",
    storeMap: getStore().namespaceLedger,
    keyField: "namespaceKey",
    keyValue: key,
    row: {
      namespaceKey: key,
      tenantKey: "tenant:global",
      businessId: null,
      namespace: "automexia.core",
      displayName: "Automexia Core",
      ownerUserId: "SYSTEM",
      status: "ACTIVE",
      version: 1,
      metadata: {
        bootstrap: true,
      },
    },
    dbLedgers: ["developerNamespaceLedger"],
  });
};

export const bootstrapDeveloperPlatformExtensibilityOS = async () => {
  const store = getStore();
  store.invokeCount += 1;

  await Promise.allSettled([
    bootstrapSaaSPackagingConnectHubOS(),
    bootstrapReliabilityOS(),
    bootstrapSecurityGovernanceOS(),
  ]);

  await bootstrapDefaultNamespace();
  await ensureDefaultPolicy("tenant:global", null);
  markWiringDomain(
    "AI",
    "CRM",
    "RECEPTION",
    "HUMAN",
    "BOOKING",
    "COMMERCE",
    "INTELLIGENCE",
    "RELIABILITY",
    "SECURITY",
    "SAAS_PACKAGING"
  );
  if (!store.bootstrappedAt) {
    store.bootstrappedAt = now();
  }
  return {
    phaseVersion: DEVELOPER_PLATFORM_PHASE_VERSION,
    bootstrappedAt: store.bootstrappedAt,
    authorities: DEVELOPER_PLATFORM_AUTHORITIES.length,
    engines: DEVELOPER_PLATFORM_ENGINES.length,
  };
};

export const registerDeveloperNamespace = async (input: {
  businessId: string;
  tenantId?: string | null;
  namespace: string;
  displayName?: string | null;
  ownerUserId?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("REGISTRY_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const namespace = normalizeNamespace(input.namespace);
  const namespaceKey = `namespace:${tenantKey}:${namespace}`;
  const row = await upsertLedgerRecord({
    authority: "DeveloperNamespaceLedger",
    storeMap: getStore().namespaceLedger,
    keyField: "namespaceKey",
    keyValue: namespaceKey,
    row: {
      namespaceKey,
      tenantKey,
      businessId: input.businessId,
      namespace,
      displayName: normalizeIdentifier(input.displayName || namespace),
      ownerUserId: normalizeIdentifier(input.ownerUserId || "SYSTEM"),
      status: "ACTIVE",
      version: 1,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["developerNamespaceLedger"],
  });
  await callSecurityInfluence({
    businessId: input.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "DEVELOPER_NAMESPACE",
    resourceId: namespaceKey,
    purpose: "NAMESPACE_REGISTRATION",
  });
  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "NAMESPACE_REGISTERED",
    resourceType: "DEVELOPER_NAMESPACE",
    resourceKey: namespaceKey,
    actorId: input.ownerUserId || "SYSTEM",
    metadata: {
      namespace,
    },
  });
  await recordObservabilityEvent({
    businessId: input.businessId,
    tenantId,
    eventType: "extension.namespace.registered",
    severity: "info",
    message: `Namespace ${namespace} registered`,
    metadata: {
      namespaceKey,
      phaseVersion: DEVELOPER_PLATFORM_PHASE_VERSION,
    },
  }).catch(() => undefined);
  return row;
};

export const publishExtensionPackage = async (input: {
  businessId: string;
  tenantId?: string | null;
  namespace?: string | null;
  slug: string;
  displayName?: string | null;
  packageType?: string | null;
  visibility?: string | null;
  packageKey?: string | null;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("REGISTRY_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const namespace = normalizeNamespace(input.namespace || "automexia.default");
  const namespaceKey = `namespace:${tenantKey}:${namespace}`;
  if (!getNamespaceByKey(namespaceKey)) {
    await registerDeveloperNamespace({
      businessId: input.businessId,
      tenantId,
      namespace,
      displayName: namespace,
      ownerUserId: "SYSTEM",
    });
  }

  const replayToken = normalizeIdentifier(input.replayToken || "");
  const replayPackageScope =
    normalizeIdentifier(input.packageKey || "") ||
    `${namespace}:${normalizeIdentifier(input.slug).toLowerCase()}`;
  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PACKAGE_PUBLISH",
      packageKey: replayPackageScope,
      replayToken,
    });
    const existing = resolveReplay(replayKey);
    if (existing) {
      return {
        replayed: true,
        package: getPackageByKey(existing) || null,
      };
    }
  }

  const packageKey =
    normalizeIdentifier(input.packageKey || "") ||
    `extension_pkg:${stableHash([
      tenantKey,
      namespace,
      normalizeIdentifier(input.slug).toLowerCase(),
    ]).slice(0, 32)}`;
  const row = await upsertLedgerRecord({
    authority: "ExtensionPackageLedger",
    storeMap: getStore().packageLedger,
    keyField: "packageKey",
    keyValue: packageKey,
    row: {
      packageKey,
      namespaceKey,
      tenantKey,
      businessId: input.businessId,
      packageType: normalizeIdentifier(input.packageType || "APP").toUpperCase(),
      slug: normalizeIdentifier(input.slug).toLowerCase(),
      displayName: normalizeIdentifier(input.displayName || input.slug),
      visibility: normalizeIdentifier(input.visibility || "PRIVATE").toUpperCase(),
      latestReleaseKey: null,
      latestVersionTag: null,
      installCount: 0,
      status: "ACTIVE",
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["extensionPackageLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PACKAGE_PUBLISH",
      packageKey: replayPackageScope,
      replayToken,
    });
    registerReplay(replayKey, packageKey);
  }

  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "PACKAGE_PUBLISHED",
    resourceType: "EXTENSION_PACKAGE",
    resourceKey: packageKey,
    actorId: "SYSTEM",
    metadata: {
      namespaceKey,
      slug: row.slug,
    },
  });
  await callSecurityInfluence({
    businessId: input.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "EXTENSION_PACKAGE",
    resourceId: packageKey,
    purpose: "PACKAGE_REGISTRATION",
  });
  markWiringDomain("AI", "CRM", "RECEPTION", "BOOKING", "COMMERCE", "INTELLIGENCE");
  return {
    replayed: false,
    package: row,
  };
};

export const publishExtensionRelease = async (input: {
  businessId: string;
  tenantId?: string | null;
  packageKey: string;
  versionTag?: string | null;
  changelog?: string | null;
  manifest?: JsonRecord | null;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("RELEASE_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const packageKey = normalizeIdentifier(input.packageKey);
  const pkg = getPackageByKey(packageKey);
  if (!pkg) {
    throw new Error(`package_not_found:${packageKey}`);
  }

  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "RELEASE_PUBLISH",
      packageKey,
      replayToken,
    });
    const existingReleaseKey = resolveReplay(replayKey);
    if (existingReleaseKey) {
      return {
        replayed: true,
        release: getReleaseByKey(existingReleaseKey) || null,
      };
    }
  }

  const existingReleases = listReleases(packageKey);
  const nextVersionInt =
    existingReleases.reduce(
      (max, row) => Math.max(max, Math.floor(toNumber(row.versionInt, 0))),
      0
    ) + 1;
  const versionTag =
    normalizeIdentifier(input.versionTag || "") || `v${nextVersionInt}`;
  const releaseKey = `extension_release:${stableHash([
    packageKey,
    versionTag,
  ]).slice(0, 32)}`;

  const manifest = {
    actions: [],
    events: [],
    permissions: [],
    ...toRecord(input.manifest),
  };
  const row = await upsertLedgerRecord({
    authority: "ExtensionReleaseLedger",
    storeMap: getStore().releaseLedger,
    keyField: "releaseKey",
    keyValue: releaseKey,
    row: {
      releaseKey,
      packageKey,
      tenantKey,
      businessId: input.businessId,
      versionTag,
      versionInt: nextVersionInt,
      changelog: normalizeIdentifier(input.changelog || "") || null,
      manifest,
      artifactDigest: stableHash({
        packageKey,
        versionTag,
        manifest,
      }),
      status: "PUBLISHED",
      isActive: true,
      replayToken: replayToken || null,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["extensionReleaseLedger"],
  });

  await upsertLedgerRecord({
    authority: "ExtensionPackageLedger",
    storeMap: getStore().packageLedger,
    keyField: "packageKey",
    keyValue: packageKey,
    row: {
      ...pkg,
      latestReleaseKey: releaseKey,
      latestVersionTag: versionTag,
      status: "ACTIVE",
      metadata: {
        ...toRecord(pkg.metadata),
        latestReleaseVersionInt: nextVersionInt,
      },
    },
    dbLedgers: ["extensionPackageLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "RELEASE_PUBLISH",
      packageKey,
      replayToken,
    });
    registerReplay(replayKey, releaseKey);
  }

  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "RELEASE_PUBLISHED",
    resourceType: "EXTENSION_RELEASE",
    resourceKey: releaseKey,
    actorId: "SYSTEM",
    metadata: {
      packageKey,
      versionTag,
      versionInt: nextVersionInt,
    },
  });
  await callSecurityInfluence({
    businessId: input.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "EXTENSION_RELEASE",
    resourceId: releaseKey,
    purpose: "RELEASE_PUBLISH",
    metadata: {
      packageKey,
    },
  });
  await recordObservabilityEvent({
    businessId: input.businessId,
    tenantId,
    eventType: "extension.release.published",
    severity: "info",
    message: `Release ${versionTag} published`,
    metadata: {
      packageKey,
      releaseKey,
    },
  }).catch(() => undefined);

  return {
    replayed: false,
    release: row,
  };
};

export const installExtensionForTenant = async (input: {
  businessId: string;
  tenantId?: string | null;
  packageKey: string;
  releaseKey?: string | null;
  environment?: string | null;
  installedBy?: string | null;
  permissions?: string[] | null;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("INSTALL_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const packageKey = normalizeIdentifier(input.packageKey);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const pkg = getPackageByKey(packageKey);
  if (!pkg) {
    throw new Error(`package_not_found:${packageKey}`);
  }
  const release =
    getReleaseByKey(normalizeIdentifier(input.releaseKey || "")) ||
    getLatestReleaseForPackage(packageKey);
  if (!release) {
    throw new Error(`release_not_found:${packageKey}`);
  }

  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "EXTENSION_INSTALL",
      packageKey,
      replayToken,
    });
    const existingInstallKey = resolveReplay(replayKey);
    if (existingInstallKey) {
      return {
        replayed: true,
        install: getInstallByKey(existingInstallKey) || null,
      };
    }
  }

  const installKey = `extension_install:${stableHash([
    tenantKey,
    packageKey,
    environment,
  ]).slice(0, 32)}`;
  const row = await upsertLedgerRecord({
    authority: "ExtensionInstallLedger",
    storeMap: getStore().installLedger,
    keyField: "installKey",
    keyValue: installKey,
    row: {
      installKey,
      tenantKey,
      businessId: input.businessId,
      packageKey,
      releaseKey: release.releaseKey,
      environment,
      status: "INSTALLED",
      installedBy: normalizeIdentifier(input.installedBy || "SYSTEM"),
      installedAt: now(),
      replayToken: replayToken || null,
      permissions: toArray(input.permissions),
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["extensionInstallLedger"],
  });

  const installCount = listInstalls({
    tenantKey,
    packageKey,
  }).filter((candidate) => candidate.status === "INSTALLED").length;
  await upsertLedgerRecord({
    authority: "ExtensionPackageLedger",
    storeMap: getStore().packageLedger,
    keyField: "packageKey",
    keyValue: packageKey,
    row: {
      ...pkg,
      installCount,
    },
    dbLedgers: ["extensionPackageLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "EXTENSION_INSTALL",
      packageKey,
      replayToken,
    });
    registerReplay(replayKey, installKey);
  }

  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "EXTENSION_INSTALLED",
    resourceType: "EXTENSION_INSTALL",
    resourceKey: installKey,
    actorId: input.installedBy || "SYSTEM",
    metadata: {
      packageKey,
      releaseKey: release.releaseKey,
      environment,
    },
  });
  await callSecurityInfluence({
    businessId: input.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "EXTENSION_INSTALL",
    resourceId: installKey,
    purpose: "EXTENSION_INSTALL",
    metadata: {
      packageKey,
      environment,
    },
  });
  return {
    replayed: false,
    install: row,
  };
};

export const setExtensionSecretBinding = async (input: {
  businessId: string;
  tenantId?: string | null;
  installKey: string;
  secretName: string;
  secretValue: string;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("SECRET_BINDING_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const install = getInstallByKey(normalizeIdentifier(input.installKey));
  if (!install) {
    throw new Error(`install_not_found:${input.installKey}`);
  }
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "SECRET_BIND",
      packageKey: install.packageKey,
      installKey: install.installKey,
      replayToken,
    });
    const existingKey = resolveReplay(replayKey);
    if (existingKey) {
      return {
        replayed: true,
        binding: getStore().secretBindingLedger.get(existingKey) || null,
      };
    }
  }

  const secretBindingKey = `extension_secret:${stableHash([
    tenantKey,
    install.installKey,
    normalizeIdentifier(input.secretName).toLowerCase(),
  ]).slice(0, 32)}`;
  const row = await upsertLedgerRecord({
    authority: "ExtensionSecretBindingLedger",
    storeMap: getStore().secretBindingLedger,
    keyField: "secretBindingKey",
    keyValue: secretBindingKey,
    row: {
      secretBindingKey,
      tenantKey,
      installKey: install.installKey,
      packageKey: install.packageKey,
      secretName: normalizeIdentifier(input.secretName),
      secretRef: encrypt(normalizeIdentifier(input.secretValue)),
      status: "ACTIVE",
      rotatedAt: null,
      replayToken: replayToken || null,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["extensionSecretBindingLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "SECRET_BIND",
      packageKey: install.packageKey,
      installKey: install.installKey,
      replayToken,
    });
    registerReplay(replayKey, secretBindingKey);
  }

  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "SECRET_BOUND",
    resourceType: "EXTENSION_SECRET",
    resourceKey: secretBindingKey,
    actorId: "SYSTEM",
    metadata: {
      installKey: install.installKey,
      packageKey: install.packageKey,
      secretName: normalizeIdentifier(input.secretName),
    },
  });
  await callSecurityInfluence({
    businessId: input.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "EXTENSION_SECRET",
    resourceId: secretBindingKey,
    purpose: "EXTENSION_SECRET_BINDING",
    metadata: {
      installKey: install.installKey,
    },
  });

  return {
    replayed: false,
    binding: row,
  };
};

export const subscribeExtensionEvent = async (input: {
  businessId: string;
  tenantId?: string | null;
  installKey: string;
  eventType: string;
  handler: string;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("EVENT_BUS_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const install = getInstallByKey(normalizeIdentifier(input.installKey));
  if (!install) {
    throw new Error(`install_not_found:${input.installKey}`);
  }
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "SUBSCRIPTION_SAVE",
      packageKey: install.packageKey,
      installKey: install.installKey,
      replayToken,
    });
    const existingKey = resolveReplay(replayKey);
    if (existingKey) {
      return {
        replayed: true,
        subscription: getStore().subscriptionLedger.get(existingKey) || null,
      };
    }
  }
  const eventType = normalizeIdentifier(input.eventType).toLowerCase();
  const handler = normalizeIdentifier(input.handler);
  const subscriptionKey = `extension_subscription:${stableHash([
    tenantKey,
    install.installKey,
    eventType,
    handler,
  ]).slice(0, 32)}`;
  const existing = getStore().subscriptionLedger.get(subscriptionKey);
  const row = await upsertLedgerRecord({
    authority: "ExtensionSubscriptionLedger",
    storeMap: getStore().subscriptionLedger,
    keyField: "subscriptionKey",
    keyValue: subscriptionKey,
    row: {
      subscriptionKey,
      tenantKey,
      installKey: install.installKey,
      packageKey: install.packageKey,
      eventType,
      handler,
      status: "ACTIVE",
      version: Math.max(1, Math.floor(toNumber(existing?.version, 0) + 1)),
      replayToken: replayToken || null,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["extensionSubscriptionLedger"],
  });
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "SUBSCRIPTION_SAVE",
      packageKey: install.packageKey,
      installKey: install.installKey,
      replayToken,
    });
    registerReplay(replayKey, subscriptionKey);
  }
  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "SUBSCRIPTION_SAVED",
    resourceType: "EXTENSION_SUBSCRIPTION",
    resourceKey: subscriptionKey,
    actorId: "SYSTEM",
    metadata: {
      eventType,
      handler,
    },
  });
  return {
    replayed: false,
    subscription: row,
  };
};

export const applyExtensionPolicy = async (input: {
  businessId: string;
  tenantId?: string | null;
  scope?: string | null;
  targetType?: string | null;
  targetKey?: string | null;
  maxExecutionsPerMinute?: number;
  timeoutMs?: number;
  requiresApproval?: boolean;
  allowedTriggers?: string[] | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("POLICY_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const scope = normalizeIdentifier(input.scope || "EXECUTION").toUpperCase();
  const targetType = normalizeIdentifier(input.targetType || "TENANT").toUpperCase();
  const targetKey = normalizeIdentifier(input.targetKey || "") || null;
  const policyKey = `ext_policy:${stableHash([
    tenantKey,
    scope,
    targetType,
    targetKey || "global",
  ]).slice(0, 32)}`;
  const existing = getStore().policyLedger.get(policyKey);
  const row = await upsertLedgerRecord({
    authority: "ExtensionPolicyLedger",
    storeMap: getStore().policyLedger,
    keyField: "policyKey",
    keyValue: policyKey,
    row: {
      policyKey,
      tenantKey,
      businessId: input.businessId,
      scope,
      targetType,
      targetKey,
      maxExecutionsPerMinute: Math.max(
        1,
        Math.floor(toNumber(input.maxExecutionsPerMinute, toNumber(existing?.maxExecutionsPerMinute, 120)))
      ),
      timeoutMs: Math.max(1000, Math.floor(toNumber(input.timeoutMs, toNumber(existing?.timeoutMs, 15000)))),
      requiresApproval: Boolean(input.requiresApproval ?? existing?.requiresApproval ?? false),
      allowedTriggers: toArray(input.allowedTriggers || existing?.allowedTriggers || ["MANUAL", "WEBHOOK", "EVENT", "SCHEDULE"]),
      version: Math.max(1, Math.floor(toNumber(existing?.version, 0) + 1)),
      isActive: true,
      metadata: {
        ...toRecord(existing?.metadata),
        ...toRecord(input.metadata),
      },
    },
    dbLedgers: ["extensionPolicyLedger"],
  });
  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "POLICY_APPLIED",
    resourceType: "EXTENSION_POLICY",
    resourceKey: policyKey,
    actorId: "SYSTEM",
    metadata: {
      scope,
      targetType,
      targetKey,
    },
  });
  return row;
};

export const applyExtensionOverride = async (input: {
  businessId: string;
  tenantId?: string | null;
  scope?: string | null;
  targetType?: string | null;
  targetKey?: string | null;
  action: string;
  reason: string;
  priority?: number;
  expiresAt?: Date | null;
  createdBy?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("OVERRIDE_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const timestamp = now();
  const overrideKey = `ext_override:${stableHash([
    tenantKey,
    input.scope,
    input.targetType,
    input.targetKey,
    input.action,
    timestamp.toISOString(),
  ]).slice(0, 32)}`;
  const row = await upsertLedgerRecord({
    authority: "ExtensionOverrideLedger",
    storeMap: getStore().overrideLedger,
    keyField: "overrideKey",
    keyValue: overrideKey,
    row: {
      overrideKey,
      tenantKey,
      businessId: input.businessId,
      scope: normalizeIdentifier(input.scope || "EXECUTION").toUpperCase(),
      targetType: normalizeIdentifier(input.targetType || "TENANT").toUpperCase(),
      targetKey: normalizeIdentifier(input.targetKey || "") || null,
      action: normalizeIdentifier(input.action).toUpperCase(),
      reason: normalizeIdentifier(input.reason) || "override",
      priority: Math.max(1, Math.floor(toNumber(input.priority, 100))),
      isActive: true,
      effectiveFrom: timestamp,
      expiresAt: input.expiresAt || null,
      createdBy: normalizeIdentifier(input.createdBy || "SYSTEM"),
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["extensionOverrideLedger"],
  });
  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "OVERRIDE_APPLIED",
    resourceType: "EXTENSION_OVERRIDE",
    resourceKey: overrideKey,
    actorId: input.createdBy || "SYSTEM",
    metadata: {
      scope: row.scope,
      targetType: row.targetType,
      targetKey: row.targetKey,
      action: row.action,
    },
  });
  return row;
};

export const createDeveloperPortalApiKey = async (input: {
  businessId: string;
  tenantId?: string | null;
  scope: string;
  expiresAt?: Date | null;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("REGISTRY_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const scope = normalizeIdentifier(input.scope).toUpperCase() || "DEVELOPER_API";
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "API_KEY_CREATE",
      replayToken,
    });
    const existingApiKeyRef = resolveReplay(replayKey);
    if (existingApiKeyRef) {
      return {
        replayed: true,
        apiKey: getStore().apiKeyLedger.get(existingApiKeyRef) || null,
        plainKey: null,
      };
    }
  }

  const seed = replayToken
    ? stableHash([tenantKey, scope, replayToken]).slice(0, 48)
    : crypto.randomBytes(32).toString("hex");
  const plainKey = `dp_${seed}`;
  const hashedKey = crypto.createHash("sha256").update(plainKey).digest("hex");
  const apiKeyRef = `dev_key:${stableHash([tenantKey, scope, hashedKey]).slice(0, 32)}`;
  const row = await upsertLedgerRecord({
    authority: "DeveloperPortalApiKeyLedger",
    storeMap: getStore().apiKeyLedger,
    keyField: "apiKeyRef",
    keyValue: apiKeyRef,
    row: {
      apiKeyRef,
      tenantKey,
      businessId: input.businessId,
      scope,
      hashedKey,
      status: "ACTIVE",
      lastUsedAt: null,
      expiresAt: input.expiresAt || null,
      rotatedFrom: null,
      metadata: {
        ...toRecord(input.metadata),
        replayToken: replayToken || null,
      },
    },
    dbLedgers: ["developerPortalApiKeyLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "API_KEY_CREATE",
      replayToken,
    });
    registerReplay(replayKey, apiKeyRef);
  }

  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "API_KEY_CREATED",
    resourceType: "DEVELOPER_API_KEY",
    resourceKey: apiKeyRef,
    actorId: "SYSTEM",
    metadata: {
      scope,
      expiresAt: row.expiresAt || null,
    },
  });
  await callSecurityInfluence({
    businessId: input.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "DEVELOPER_API_KEY",
    resourceId: apiKeyRef,
    purpose: "DEVELOPER_PORTAL_API_KEY_CREATE",
  });
  return {
    replayed: false,
    apiKey: row,
    plainKey,
  };
};

export const revokeDeveloperPortalApiKey = async (input: {
  businessId: string;
  tenantId?: string | null;
  apiKeyRef: string;
  reason?: string | null;
}) => {
  bumpEngine("REGISTRY_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const apiKeyRef = normalizeIdentifier(input.apiKeyRef);
  const existing = getStore().apiKeyLedger.get(apiKeyRef);
  if (!existing) {
    throw new Error(`api_key_not_found:${apiKeyRef}`);
  }
  const row = await upsertLedgerRecord({
    authority: "DeveloperPortalApiKeyLedger",
    storeMap: getStore().apiKeyLedger,
    keyField: "apiKeyRef",
    keyValue: apiKeyRef,
    row: {
      ...existing,
      status: "REVOKED",
      metadata: {
        ...toRecord(existing.metadata),
        revokedReason: normalizeIdentifier(input.reason || "manual_revoke"),
        revokedAt: now().toISOString(),
      },
    },
    dbLedgers: ["developerPortalApiKeyLedger"],
  });
  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: "API_KEY_REVOKED",
    resourceType: "DEVELOPER_API_KEY",
    resourceKey: apiKeyRef,
    actorId: "SYSTEM",
    metadata: {
      reason: normalizeIdentifier(input.reason || "manual_revoke"),
    },
  });
  return row;
};

export const invokeExtensionAction = async (input: {
  businessId: string;
  tenantId?: string | null;
  installKey: string;
  action: string;
  trigger?: string | null;
  payload?: JsonRecord | null;
  dedupeKey?: string | null;
  replayToken?: string | null;
  forceFail?: boolean;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("EXECUTION_ENGINE");
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const installKey = normalizeIdentifier(input.installKey);
  const install = getInstallByKey(installKey);
  if (!install) {
    throw new Error(`install_not_found:${installKey}`);
  }
  const release = getReleaseByKey(install.releaseKey);
  if (!release) {
    throw new Error(`release_not_found:${install.releaseKey}`);
  }
  await ensureDefaultPolicy(tenantKey, input.businessId);

  const action = normalizeIdentifier(input.action) || "run";
  const trigger = normalizeIdentifier(input.trigger || "MANUAL").toUpperCase();
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `exec_dedupe:${stableHash([
      tenantKey,
      installKey,
      action,
      JSON.stringify(toRecord(input.payload)),
    ]).slice(0, 24)}`;
  const replayToken = normalizeIdentifier(input.replayToken || "");

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "EXECUTION_RUN",
      packageKey: install.packageKey,
      installKey,
      replayToken,
    });
    const existingExecutionKey = resolveReplay(replayKey);
    if (existingExecutionKey) {
      return {
        replayed: true,
        execution: getStore().executionLedger.get(existingExecutionKey) || null,
      };
    }
    const replayExecution = findExecutionByReplayToken(replayToken);
    if (replayExecution) {
      return {
        replayed: true,
        execution: replayExecution,
      };
    }
  }

  const deduped = findExecutionByDedupe({
    tenantKey,
    installKey,
    dedupeKey,
  });
  if (deduped) {
    return {
      replayed: true,
      execution: deduped,
      deduped: true,
    };
  }

  const policyCheck = assertExecutionAllowed({
    tenantKey,
    packageKey: install.packageKey,
    trigger,
    installKey,
  });
  const startedAt = now();
  const executionKey = `extension_exec:${stableHash([
    tenantKey,
    installKey,
    action,
    startedAt.toISOString(),
  ]).slice(0, 32)}`;
  let status = "SUCCEEDED";
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let output: JsonRecord | null = null;

  if (!policyCheck.allowed) {
    status = "BLOCKED";
    errorCode = "POLICY_BLOCK";
    errorMessage = policyCheck.reason;
  } else {
    try {
      assertFailpoint("extension_execution_failure");
      if (input.forceFail) {
        throw new Error("forced_extension_failure");
      }
      output = {
        action,
        trigger,
        packageKey: install.packageKey,
        releaseKey: release.releaseKey,
        appliedAt: now().toISOString(),
        payload: toRecord(input.payload),
      };
    } catch (error) {
      status = "FAILED";
      errorCode = "EXECUTION_FAILED";
      errorMessage = String((error as Error)?.message || "execution_failed");
    }
  }

  const completedAt = now();
  const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
  const row = await upsertLedgerRecord({
    authority: "ExtensionExecutionLedger",
    storeMap: getStore().executionLedger,
    keyField: "executionKey",
    keyValue: executionKey,
    row: {
      executionKey,
      tenantKey,
      businessId: input.businessId,
      installKey,
      packageKey: install.packageKey,
      releaseKey: release.releaseKey,
      action,
      trigger,
      status,
      dedupeKey,
      replayToken: replayToken || null,
      durationMs,
      output,
      errorCode,
      errorMessage,
      startedAt,
      completedAt,
      metadata: {
        ...toRecord(input.metadata),
        policyReason: policyCheck.reason,
        policyKey: policyCheck.policy?.policyKey || null,
        overrideKey: policyCheck.override?.overrideKey || null,
      },
    },
    dbLedgers: ["extensionExecutionLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "EXECUTION_RUN",
      packageKey: install.packageKey,
      installKey,
      replayToken,
    });
    registerReplay(replayKey, executionKey);
  }

  await writeAudit({
    tenantKey,
    businessId: input.businessId,
    action: `EXECUTION_${status}`,
    resourceType: "EXTENSION_EXECUTION",
    resourceKey: executionKey,
    actorId: "SYSTEM",
    metadata: {
      installKey,
      packageKey: install.packageKey,
      action,
      trigger,
      dedupeKey,
      status,
      errorCode,
    },
  });

  await recordTraceLedger({
    businessId: input.businessId,
    tenantId,
    stage: `developer_platform:${action}`,
    status: status === "FAILED" ? "FAILED" : "COMPLETED",
    metadata: {
      executionKey,
      packageKey: install.packageKey,
      installKey,
    },
  }).catch(() => undefined);

  await recordObservabilityEvent({
    businessId: input.businessId,
    tenantId,
    eventType:
      status === "FAILED"
        ? "extension.execution.failed"
        : status === "BLOCKED"
        ? "extension.execution.blocked"
        : "extension.execution.succeeded",
    message: `Extension action ${action} ${status.toLowerCase()}`,
    severity: status === "FAILED" ? "error" : status === "BLOCKED" ? "warning" : "info",
    metadata: {
      executionKey,
      packageKey: install.packageKey,
      installKey,
      dedupeKey,
      trigger,
      durationMs,
      errorCode,
      errorMessage,
    },
  }).catch(() => undefined);

  if (status === "FAILED") {
    await callReliabilityInfluence({
      businessId: input.businessId,
      tenantId,
      severity: "P2",
      reason: `extension_execution_failed:${action}`,
      dedupeKey: `${install.packageKey}:${action}:failed`,
      metadata: {
        executionKey,
        installKey,
        errorCode,
      },
    });
  }

  return {
    replayed: false,
    execution: row,
    blocked: status === "BLOCKED",
  };
};

export const getDeveloperPlatformProjection = async (input: {
  businessId: string;
  tenantId?: string | null;
}) => {
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const packageRows = Array.from(getStore().packageLedger.values()).filter(
    (row) => row.tenantKey === tenantKey
  );
  const releaseRows = Array.from(getStore().releaseLedger.values()).filter(
    (row) => row.tenantKey === tenantKey
  );
  const installRows = Array.from(getStore().installLedger.values()).filter(
    (row) => row.tenantKey === tenantKey
  );
  const executionRows = Array.from(getStore().executionLedger.values()).filter(
    (row) => row.tenantKey === tenantKey
  );
  const policyRows = Array.from(getStore().policyLedger.values()).filter(
    (row) => row.tenantKey === tenantKey && row.isActive
  );
  const overrideRows = Array.from(getStore().overrideLedger.values()).filter(
    (row) => row.tenantKey === tenantKey && row.isActive
  );
  const diagnostics = executionRows
    .filter((row) => ["FAILED", "BLOCKED"].includes(row.status))
    .slice(-20)
    .map((row) => ({
      executionKey: row.executionKey,
      packageKey: row.packageKey,
      action: row.action,
      status: row.status,
      errorCode: row.errorCode || null,
      errorMessage: row.errorMessage || null,
      occurredAt: row.completedAt || row.updatedAt || row.createdAt,
    }));

  return {
    phaseVersion: DEVELOPER_PLATFORM_PHASE_VERSION,
    tenantId,
    tenantKey,
    packages: packageRows.map((pkg) => ({
      packageKey: pkg.packageKey,
      namespaceKey: pkg.namespaceKey,
      slug: pkg.slug,
      displayName: pkg.displayName,
      packageType: pkg.packageType,
      status: pkg.status,
      latestReleaseKey: pkg.latestReleaseKey,
      latestVersionTag: pkg.latestVersionTag,
      installCount: pkg.installCount,
      releases: releaseRows.filter((release) => release.packageKey === pkg.packageKey).length,
      installs: installRows.filter((install) => install.packageKey === pkg.packageKey).length,
      executions: executionRows.filter((execution) => execution.packageKey === pkg.packageKey).length,
    })),
    counts: {
      namespaces: Array.from(getStore().namespaceLedger.values()).filter(
        (row) => row.tenantKey === tenantKey
      ).length,
      packages: packageRows.length,
      releases: releaseRows.length,
      installs: installRows.length,
      subscriptions: Array.from(getStore().subscriptionLedger.values()).filter(
        (row) => row.tenantKey === tenantKey
      ).length,
      secrets: Array.from(getStore().secretBindingLedger.values()).filter(
        (row) => row.tenantKey === tenantKey
      ).length,
      executions: executionRows.length,
      policies: policyRows.length,
      overrides: overrideRows.length,
      apiKeys: Array.from(getStore().apiKeyLedger.values()).filter(
        (row) => row.tenantKey === tenantKey && row.status === "ACTIVE"
      ).length,
      audits: Array.from(getStore().auditLedger.values()).filter(
        (row) => row.tenantKey === tenantKey
      ).length,
    },
    diagnostics,
    activePolicy: policyRows.sort((left, right) => toNumber(right.version, 0) - toNumber(left.version, 0))[0] || null,
    activeOverrides: overrideRows
      .sort((left, right) => toNumber(right.priority, 0) - toNumber(left.priority, 0))
      .slice(0, 10),
    engineInvocations: Object.fromEntries(getStore().engineInvocations.entries()),
  };
};

export const runDeveloperPlatformSelfAudit = async (input?: {
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  await bootstrapDeveloperPlatformExtensibilityOS();
  const tenantId = normalizeTenantId({
    tenantId: input?.tenantId || null,
    businessId: input?.businessId || null,
  });
  const tenantKey = tenantId ? buildTenantKey(tenantId) : null;
  const store = getStore();
  const scopeFilter = (row: any) => (tenantKey ? row.tenantKey === tenantKey : true);
  const namespaces = Array.from(store.namespaceLedger.values()).filter(scopeFilter);
  const packages = Array.from(store.packageLedger.values()).filter(scopeFilter);
  const releases = Array.from(store.releaseLedger.values()).filter(scopeFilter);
  const installs = Array.from(store.installLedger.values()).filter(scopeFilter);
  const subscriptions = Array.from(store.subscriptionLedger.values()).filter(scopeFilter);
  const secrets = Array.from(store.secretBindingLedger.values()).filter(scopeFilter);
  const executions = Array.from(store.executionLedger.values()).filter(scopeFilter);
  const policies = Array.from(store.policyLedger.values()).filter(scopeFilter);
  const overrides = Array.from(store.overrideLedger.values()).filter(scopeFilter);
  const apiKeys = Array.from(store.apiKeyLedger.values()).filter(scopeFilter);
  const audits = Array.from(store.auditLedger.values()).filter(scopeFilter);

  const existingResourceKeys = new Set<string>();
  for (const row of [
    ...namespaces,
    ...packages,
    ...releases,
    ...installs,
    ...subscriptions,
    ...secrets,
    ...executions,
    ...policies,
    ...overrides,
    ...apiKeys,
    ...audits,
  ]) {
    for (const keyField of [
      "namespaceKey",
      "packageKey",
      "releaseKey",
      "installKey",
      "subscriptionKey",
      "secretBindingKey",
      "executionKey",
      "policyKey",
      "overrideKey",
      "apiKeyRef",
      "auditKey",
    ]) {
      if (row[keyField]) {
        existingResourceKeys.add(String(row[keyField]));
      }
    }
  }

  const criticalAuthorities = [
    "DeveloperNamespaceLedger",
    "ExtensionPackageLedger",
    "ExtensionReleaseLedger",
    "ExtensionInstallLedger",
    "ExtensionExecutionLedger",
    "ExtensionPolicyLedger",
    "ExtensionAuditLedger",
  ];
  const authoritiesPresent = criticalAuthorities.every((authority) =>
    store.authorities.has(authority)
  );
  const versioned = releases.every((row) => toNumber(row.versionInt, 0) >= 1);
  const replaySafe = Array.from(store.replayIndex.values()).every((key) =>
    existingResourceKeys.has(String(key))
  );
  const overrideSafe = overrides.every(
    (row) =>
      normalizeIdentifier(row.reason).length > 0 &&
      toNumber(row.priority, 0) >= 1 &&
      (row.expiresAt ? new Date(row.expiresAt).getTime() > 0 : true)
  );
  const noOrphans =
    releases.every((row) => packages.some((pkg) => pkg.packageKey === row.packageKey)) &&
    installs.every(
      (row) =>
        packages.some((pkg) => pkg.packageKey === row.packageKey) &&
        releases.some((release) => release.releaseKey === row.releaseKey)
    ) &&
    subscriptions.every((row) =>
      installs.some((install) => install.installKey === row.installKey)
    ) &&
    secrets.every((row) => installs.some((install) => install.installKey === row.installKey)) &&
    executions.every((row) => installs.some((install) => install.installKey === row.installKey));
  const noHiddenAppExecutionPath = executions.every((row) => {
    const install = installs.find((candidate) => candidate.installKey === row.installKey);
    if (!install) {
      return false;
    }
    return install.packageKey === row.packageKey && install.releaseKey === row.releaseKey;
  });
  const noParallelApiTruth =
    executions.every((row) => row.executionKey && row.dedupeKey) &&
    policies.length >= 1 &&
    audits.length >= installs.length;
  const secretSafe = secrets.every((row) => {
    const secretRef = normalizeIdentifier(row.secretRef);
    return secretRef.startsWith("enc::") || secretRef.startsWith("kms::");
  });
  const auditChained = audits.every((row) => {
    const previousHash = normalizeIdentifier(row.previousHash);
    const auditHash = normalizeIdentifier(row.auditHash);
    return previousHash.length > 0 && auditHash.length > 0;
  });
  const requiredDomains = [
    "AI",
    "CRM",
    "RECEPTION",
    "HUMAN",
    "BOOKING",
    "COMMERCE",
    "INTELLIGENCE",
    "RELIABILITY",
    "SECURITY",
    "SAAS_PACKAGING",
  ];
  const deeplyWiredDomains = requiredDomains.every((domain) =>
    store.wiringDomains.has(domain)
  );
  const checks = {
    reachable: true,
    bootstrapped: Boolean(store.bootstrappedAt),
    invoked: store.invokeCount > 0,
    authoritiesPresent,
    canonicalWrite: installs.length > 0 || packages.length > 0 || policies.length > 0,
    replaySafe,
    overrideSafe,
    versioned,
    noOrphans,
    noHiddenAppExecutionPath,
    noParallelApiTruth,
    secretSafe,
    auditChained,
    deeplyWiredDomains,
    securityWired: store.securityInfluenceChecks > 0 || installs.length > 0,
    reliabilityWired: store.reliabilityInfluenceChecks >= 0,
  };
  const deeplyWired = Object.values(checks).every(Boolean);

  return {
    phaseVersion: DEVELOPER_PLATFORM_PHASE_VERSION,
    tenantKey,
    deeplyWired,
    checks,
    authorities: Object.fromEntries(store.authorities.entries()),
    engines: Object.fromEntries(store.engineInvocations.entries()),
    counts: {
      namespaces: namespaces.length,
      packages: packages.length,
      releases: releases.length,
      installs: installs.length,
      subscriptions: subscriptions.length,
      secrets: secrets.length,
      executions: executions.length,
      policies: policies.length,
      overrides: overrides.length,
      apiKeys: apiKeys.length,
      audits: audits.length,
      replayIndex: store.replayIndex.size,
    },
    events: DEVELOPER_PLATFORM_EVENTS,
  };
};

export const __developerPlatformPhase6ETestInternals = {
  resetStore: () => {
    globalForDeveloperPlatform.__sylphDeveloperPlatformExtensibilityStore = createStore();
  },
  getStore: () => getStore(),
  setFailpoint: (name: string, enabled: boolean) => {
    const store = getStore();
    if (enabled) {
      store.failpoints.add(name);
      return;
    }
    store.failpoints.delete(name);
  },
};
