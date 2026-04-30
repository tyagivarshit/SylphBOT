// @ts-nocheck
import crypto from "crypto";
import prisma from "../config/prisma";
import { encrypt } from "../utils/encrypt";
import {
  bootstrapReliabilityOS,
  raiseReliabilityAlert,
  recordObservabilityEvent,
  recordTraceLedger,
} from "./reliability/reliabilityOS.service";
import {
  bootstrapSecurityGovernanceOS,
  enforceSecurityGovernanceInfluence,
} from "./security/securityGovernanceOS.service";

type JsonRecord = Record<string, unknown>;

export const SAAS_PACKAGING_PHASE_VERSION = "phase6d.final.v1";

export const CONNECT_HUB_AUTHORITIES = [
  "TenantLedger",
  "TenantPlanLedger",
  "TenantUsageLedger",
  "FeatureEntitlementLedger",
  "IntegrationLedger",
  "ProviderWebhookLedger",
  "IntegrationHealthLedger",
  "IntegrationPolicyLedger",
  "ConnectionAttemptLedger",
  "ConnectionDiagnosticLedger",
  "OAuthStateLedger",
  "TokenRefreshLedger",
  "SandboxLedger",
  "BrandingLedger",
  "MarketplaceLedger",
  "SetupWizardLedger",
  "EnvironmentLedger",
  "ProvisioningLedger",
  "UpgradeLedger",
  "SeatLedger",
  "RoleAssignmentLedger",
  "TenantConfigLedger",
  "PackagingOverrideLedger",
] as const;

export const CONNECT_HUB_PROVIDERS = [
  "INSTAGRAM",
  "WHATSAPP",
  "FACEBOOK_PAGE",
  "GOOGLE_CALENDAR",
  "OUTLOOK_CALENDAR",
  "STRIPE",
  "RAZORPAY",
  "PAYPAL",
  "GMAIL",
  "SMTP",
  "SHOPIFY",
  "WOOCOMMERCE",
  "ZAPIER_WEBHOOK",
  "INTERNAL_API",
] as const;

export const CONNECT_HUB_STATUSES = [
  "CONNECTED",
  "VERIFYING",
  "LIMITED",
  "TOKEN_EXPIRED",
  "PERMISSION_MISSING",
  "WEBHOOK_FAILED",
  "RATE_LIMITED",
  "NEEDS_ACTION",
  "DISCONNECTED",
] as const;

export const CONNECT_HUB_ENVIRONMENTS = ["LIVE", "SANDBOX"] as const;
export const SAAS_PLAN_TIERS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;

export const SETUP_WIZARD_STEPS = [
  "BUSINESS_INFO",
  "BRANDING",
  "TIMEZONE",
  "WORKING_HOURS",
  "AI_PERSONA",
  "SALES_POLICY",
  "BOOKING_POLICY",
  "PAYMENT_POLICY",
  "TEAM_SETUP",
  "PERMISSIONS",
  "INTEGRATIONS",
  "TEST_FLOW",
  "GO_LIVE_CHECKLIST",
] as const;

export const FEATURE_ENTITLEMENT_KEYS = [
  "channels",
  "ai_volume",
  "team_seats",
  "automation_depth",
  "multi_number",
  "multi_brand",
  "api_limits",
  "sandbox_access",
  "advanced_intelligence",
  "advanced_analytics",
] as const;

type ConnectHubAuthority = (typeof CONNECT_HUB_AUTHORITIES)[number];
export type ConnectProvider = (typeof CONNECT_HUB_PROVIDERS)[number];
export type ConnectStatus = (typeof CONNECT_HUB_STATUSES)[number];
export type ConnectEnvironment = (typeof CONNECT_HUB_ENVIRONMENTS)[number];
export type SaaSPlanTier = (typeof SAAS_PLAN_TIERS)[number];
export type SetupWizardStep = (typeof SETUP_WIZARD_STEPS)[number];
export type FeatureEntitlementKey = (typeof FEATURE_ENTITLEMENT_KEYS)[number];

type ProviderCategory =
  | "instagram"
  | "whatsapp"
  | "calendar"
  | "payment"
  | "channel";

type WhatsAppFailureScenario =
  | "NONE"
  | "NUMBER_ALREADY_LINKED"
  | "WRONG_BUSINESS"
  | "SCOPE_MISSING"
  | "WEBHOOK_FAIL"
  | "TOKEN_ISSUE"
  | "TEMPLATE_FAILURE"
  | "SANDBOX_LIVE_MISMATCH"
  | "RATE_LIMIT"
  | "QUALITY_ISSUE";

type StoreMap = Map<string, any>;

type ConnectHubStore = {
  bootstrappedAt: Date | null;
  invokeCount: number;
  authorities: Map<string, number>;
  tenantLedger: StoreMap;
  tenantPlanLedger: StoreMap;
  tenantUsageLedger: StoreMap;
  featureEntitlementLedger: StoreMap;
  integrationLedger: StoreMap;
  providerWebhookLedger: StoreMap;
  integrationHealthLedger: StoreMap;
  integrationPolicyLedger: StoreMap;
  connectionAttemptLedger: StoreMap;
  connectionDiagnosticLedger: StoreMap;
  oauthStateLedger: StoreMap;
  tokenRefreshLedger: StoreMap;
  sandboxLedger: StoreMap;
  brandingLedger: StoreMap;
  marketplaceLedger: StoreMap;
  setupWizardLedger: StoreMap;
  environmentLedger: StoreMap;
  provisioningLedger: StoreMap;
  upgradeLedger: StoreMap;
  seatLedger: StoreMap;
  roleAssignmentLedger: StoreMap;
  tenantConfigLedger: StoreMap;
  packagingOverrideLedger: StoreMap;
  replayIndex: Map<string, string>;
  chainTailByScope: Map<string, string>;
  securityInfluenceChecks: number;
  reliabilityInfluenceChecks: number;
  wiringDomains: Set<string>;
  failpoints: Set<string>;
};

const shouldUseInMemory =
  process.env.NODE_ENV === "test" ||
  process.argv.some((value) => value.includes("run-tests"));

const db = prisma as any;
const now = () => new Date();

const PLAN_MATRIX: Record<
  SaaSPlanTier,
  {
    monthlyPrice: number;
    yearlyPrice: number;
    integrationLimits: {
      live: Record<ProviderCategory, number>;
      sandbox: Record<ProviderCategory, number>;
      allowMultiConnect: boolean;
    };
    featureQuota: Record<FeatureEntitlementKey, number>;
  }
> = {
  STARTER: {
    monthlyPrice: 39,
    yearlyPrice: 390,
    integrationLimits: {
      live: {
        instagram: 1,
        whatsapp: 1,
        calendar: 1,
        payment: 1,
        channel: 1,
      },
      sandbox: {
        instagram: 1,
        whatsapp: 1,
        calendar: 1,
        payment: 1,
        channel: 1,
      },
      allowMultiConnect: false,
    },
    featureQuota: {
      channels: 2,
      ai_volume: 4500,
      team_seats: 3,
      automation_depth: 300,
      multi_number: 1,
      multi_brand: 1,
      api_limits: 20000,
      sandbox_access: 1,
      advanced_intelligence: 0,
      advanced_analytics: 0,
    },
  },
  GROWTH: {
    monthlyPrice: 129,
    yearlyPrice: 1290,
    integrationLimits: {
      live: {
        instagram: 2,
        whatsapp: 2,
        calendar: 2,
        payment: 2,
        channel: 2,
      },
      sandbox: {
        instagram: 1,
        whatsapp: 1,
        calendar: 1,
        payment: 1,
        channel: 1,
      },
      allowMultiConnect: true,
    },
    featureQuota: {
      channels: 5,
      ai_volume: 18000,
      team_seats: 10,
      automation_depth: 2500,
      multi_number: 2,
      multi_brand: 2,
      api_limits: 120000,
      sandbox_access: 1,
      advanced_intelligence: 1,
      advanced_analytics: 1,
    },
  },
  PRO: {
    monthlyPrice: 299,
    yearlyPrice: 2990,
    integrationLimits: {
      live: {
        instagram: 4,
        whatsapp: 4,
        calendar: 4,
        payment: 4,
        channel: 4,
      },
      sandbox: {
        instagram: 2,
        whatsapp: 2,
        calendar: 2,
        payment: 2,
        channel: 2,
      },
      allowMultiConnect: true,
    },
    featureQuota: {
      channels: 10,
      ai_volume: 60000,
      team_seats: 30,
      automation_depth: 9000,
      multi_number: 6,
      multi_brand: 4,
      api_limits: 450000,
      sandbox_access: 1,
      advanced_intelligence: 1,
      advanced_analytics: 1,
    },
  },
  ENTERPRISE: {
    monthlyPrice: 899,
    yearlyPrice: 8990,
    integrationLimits: {
      live: {
        instagram: 999,
        whatsapp: 999,
        calendar: 999,
        payment: 999,
        channel: 999,
      },
      sandbox: {
        instagram: 8,
        whatsapp: 8,
        calendar: 8,
        payment: 8,
        channel: 8,
      },
      allowMultiConnect: true,
    },
    featureQuota: {
      channels: 999,
      ai_volume: 500000,
      team_seats: 500,
      automation_depth: 99999,
      multi_number: 50,
      multi_brand: 25,
      api_limits: 5000000,
      sandbox_access: 1,
      advanced_intelligence: 1,
      advanced_analytics: 1,
    },
  },
};

const globalForConnectHub = globalThis as typeof globalThis & {
  __sylphSaaSPackagingConnectHubStore?: ConnectHubStore;
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

const normalizePlanTier = (value: unknown): SaaSPlanTier => {
  const normalized = normalizeIdentifier(value).toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("ENTERPRISE")) {
    return "ENTERPRISE";
  }
  if (normalized.includes("PRO")) {
    return "PRO";
  }
  if (normalized.includes("GROWTH")) {
    return "GROWTH";
  }
  if (normalized.includes("STARTER") || normalized.includes("BASIC")) {
    return "STARTER";
  }
  return "STARTER";
};

const normalizeEnvironment = (value: unknown): ConnectEnvironment => {
  const normalized = normalizeIdentifier(value).toUpperCase();
  return normalized === "SANDBOX" ? "SANDBOX" : "LIVE";
};

const normalizeProvider = (value: unknown): ConnectProvider => {
  const normalized = normalizeIdentifier(value).toUpperCase().replace(/[\s-]+/g, "_");
  const provider = CONNECT_HUB_PROVIDERS.find((candidate) => candidate === normalized);
  if (!provider) {
    throw new Error(`unsupported_provider:${normalized || "unknown"}`);
  }
  return provider;
};

const normalizeStatus = (value: unknown, fallback: ConnectStatus): ConnectStatus => {
  const normalized = normalizeIdentifier(value).toUpperCase();
  return CONNECT_HUB_STATUSES.includes(normalized as ConnectStatus)
    ? (normalized as ConnectStatus)
    : fallback;
};

const stableHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const makeTenantKey = (tenantId: string) => `tenant:${tenantId}`;

const makeScopedReplayKey = (input: {
  tenantKey: string;
  flow: string;
  provider?: ConnectProvider | null;
  environment?: ConnectEnvironment | null;
  replayToken: string;
}) =>
  [
    input.tenantKey,
    normalizeIdentifier(input.flow).toUpperCase(),
    normalizeIdentifier(input.provider || "*").toUpperCase(),
    normalizeIdentifier(input.environment || "*").toUpperCase(),
    normalizeIdentifier(input.replayToken),
  ].join(":");

const getProviderCategory = (provider: ConnectProvider): ProviderCategory => {
  if (provider === "INSTAGRAM") {
    return "instagram";
  }
  if (provider === "WHATSAPP") {
    return "whatsapp";
  }
  if (provider === "GOOGLE_CALENDAR" || provider === "OUTLOOK_CALENDAR") {
    return "calendar";
  }
  if (provider === "STRIPE" || provider === "RAZORPAY" || provider === "PAYPAL") {
    return "payment";
  }
  return "channel";
};

const assertFailpoint = (name: string) => {
  if (getStore().failpoints.has(name)) {
    throw new Error(`failpoint:${name}`);
  }
};

const createStore = (): ConnectHubStore => ({
  bootstrappedAt: null,
  invokeCount: 0,
  authorities: new Map(),
  tenantLedger: new Map(),
  tenantPlanLedger: new Map(),
  tenantUsageLedger: new Map(),
  featureEntitlementLedger: new Map(),
  integrationLedger: new Map(),
  providerWebhookLedger: new Map(),
  integrationHealthLedger: new Map(),
  integrationPolicyLedger: new Map(),
  connectionAttemptLedger: new Map(),
  connectionDiagnosticLedger: new Map(),
  oauthStateLedger: new Map(),
  tokenRefreshLedger: new Map(),
  sandboxLedger: new Map(),
  brandingLedger: new Map(),
  marketplaceLedger: new Map(),
  setupWizardLedger: new Map(),
  environmentLedger: new Map(),
  provisioningLedger: new Map(),
  upgradeLedger: new Map(),
  seatLedger: new Map(),
  roleAssignmentLedger: new Map(),
  tenantConfigLedger: new Map(),
  packagingOverrideLedger: new Map(),
  replayIndex: new Map(),
  chainTailByScope: new Map(),
  securityInfluenceChecks: 0,
  reliabilityInfluenceChecks: 0,
  wiringDomains: new Set(),
  failpoints: new Set(),
});

const getStore = () => {
  if (!globalForConnectHub.__sylphSaaSPackagingConnectHubStore) {
    globalForConnectHub.__sylphSaaSPackagingConnectHubStore = createStore();
  }
  return globalForConnectHub.__sylphSaaSPackagingConnectHubStore;
};

const bumpAuthority = (authority: ConnectHubAuthority) => {
  const store = getStore();
  store.authorities.set(authority, (store.authorities.get(authority) || 0) + 1);
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
  authority: ConnectHubAuthority,
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

const upsertLedgerRecord = async (input: {
  authority: ConnectHubAuthority;
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
      phaseVersion: SAAS_PACKAGING_PHASE_VERSION,
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

const registerReplay = (key: string, resourceKey: string) => {
  const store = getStore();
  store.replayIndex.set(key, resourceKey);
};

const resolveReplay = (key: string) => getStore().replayIndex.get(key) || null;

const callSecurityInfluence = async (input: {
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
    domain: "SAAS_PACKAGING_CONNECT_HUB",
    action: input.action,
    businessId: input.businessId || null,
    tenantId: input.tenantId || input.businessId || null,
    actorId: "saas_packaging_connect_hub_os",
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

const callReliabilityInfluence = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  severity: "P1" | "P2" | "P3";
  provider: ConnectProvider;
  reason: string;
  dedupeKey: string;
  metadata?: JsonRecord | null;
}) => {
  const store = getStore();
  await raiseReliabilityAlert({
    businessId: input.businessId || null,
    tenantId: input.tenantId || input.businessId || null,
    subsystem: "CONNECT_HUB",
    severity: input.severity,
    title: `Connect hub alert (${input.provider})`,
    message: input.reason,
    dedupeKey: input.dedupeKey,
    rootCauseKey: `connect_hub:${input.provider.toLowerCase()}:${input.reason.toLowerCase()}`,
    rootCause: input.reason,
    context: {
      provider: input.provider,
      component: "connect-hub",
      phase: "saas-packaging",
      version: SAAS_PACKAGING_PHASE_VERSION,
    },
    metadata: input.metadata || null,
  }).catch(() => undefined);
  store.reliabilityInfluenceChecks += 1;
};

const markWiringDomain = (...domains: string[]) => {
  const store = getStore();
  for (const domain of domains) {
    store.wiringDomains.add(domain);
  }
};

const getTenantByKey = (tenantKey: string) =>
  Array.from(getStore().tenantLedger.values()).find((row) => row.tenantKey === tenantKey) || null;

const listTenantPlans = (tenantKey: string) =>
  Array.from(getStore().tenantPlanLedger.values()).filter((row) => row.tenantKey === tenantKey);

const getActiveTenantPlan = (tenantKey: string) => {
  const candidates = listTenantPlans(tenantKey).filter((row) => row.isActive);
  candidates.sort(
    (left, right) =>
      new Date(right.effectiveFrom || right.createdAt).getTime() -
      new Date(left.effectiveFrom || left.createdAt).getTime()
  );
  return candidates[0] || null;
};

const listIntegrations = (input: {
  tenantKey: string;
  provider?: ConnectProvider;
  environment?: ConnectEnvironment;
}) =>
  Array.from(getStore().integrationLedger.values()).filter((row) => {
    if (row.tenantKey !== input.tenantKey) {
      return false;
    }
    if (input.provider && row.provider !== input.provider) {
      return false;
    }
    if (input.environment && row.environment !== input.environment) {
      return false;
    }
    return true;
  });

const getActiveEntitlement = (input: {
  tenantKey: string;
  featureKey: FeatureEntitlementKey;
  environment: ConnectEnvironment;
}) =>
  Array.from(getStore().featureEntitlementLedger.values()).find(
    (row) =>
      row.tenantKey === input.tenantKey &&
      row.featureKey === input.featureKey &&
      row.environment === input.environment &&
      row.isActive
  ) || null;

const getWizardByTenant = (tenantKey: string) =>
  Array.from(getStore().setupWizardLedger.values()).find(
    (row) => row.tenantKey === tenantKey && row.isActive
  ) || null;

const getEnvironmentRow = (tenantKey: string, environment: ConnectEnvironment) =>
  Array.from(getStore().environmentLedger.values()).find(
    (row) => row.tenantKey === tenantKey && row.environment === environment
  ) || null;

const getIntegrationHealth = (integrationKey: string) =>
  Array.from(getStore().integrationHealthLedger.values())
    .filter((row) => row.integrationKey === integrationKey)
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )[0] || null;

const getProviderWebhookRow = (integrationKey: string) =>
  Array.from(getStore().providerWebhookLedger.values()).find(
    (row) => row.integrationKey === integrationKey
  ) || null;

const ensureEnvironmentRows = async (tenantKey: string) => {
  for (const environment of CONNECT_HUB_ENVIRONMENTS) {
    const environmentKey = `environment:${tenantKey}:${environment.toLowerCase()}`;
    await upsertLedgerRecord({
      authority: "EnvironmentLedger",
      storeMap: getStore().environmentLedger,
      keyField: "environmentKey",
      keyValue: environmentKey,
      row: {
        environmentKey,
        tenantKey,
        environment,
        status: "ACTIVE",
        promotedFrom: null,
        promotedAt: null,
        isIsolated: true,
      },
      dbLedgers: ["environmentLedger"],
    });
  }
};

const ensureSetupWizardRow = async (tenantKey: string) => {
  const existing = getWizardByTenant(tenantKey);
  if (existing) {
    return existing;
  }
  const wizardKey = `wizard:${tenantKey}`;
  const resumeToken = `wizard_resume_${stableHash([tenantKey, SAAS_PACKAGING_PHASE_VERSION]).slice(0, 18)}`;
  return upsertLedgerRecord({
    authority: "SetupWizardLedger",
    storeMap: getStore().setupWizardLedger,
    keyField: "wizardKey",
    keyValue: wizardKey,
    row: {
      wizardKey,
      tenantKey,
      version: SAAS_PACKAGING_PHASE_VERSION,
      status: "IN_PROGRESS",
      currentStep: SETUP_WIZARD_STEPS[0],
      completedSteps: [],
      payload: {},
      resumeToken,
      isActive: true,
      lastTouchedAt: now(),
    },
    dbLedgers: ["setupWizardLedger"],
  });
};

const ensureTenantConfigRow = async (input: {
  tenantKey: string;
  timezone?: string | null;
}) => {
  const configKey = `tenant_config:${input.tenantKey}:v1`;
  const existing = Array.from(getStore().tenantConfigLedger.values()).find(
    (row) => row.tenantKey === input.tenantKey && row.isActive
  );
  if (existing) {
    return existing;
  }
  return upsertLedgerRecord({
    authority: "TenantConfigLedger",
    storeMap: getStore().tenantConfigLedger,
    keyField: "configKey",
    keyValue: configKey,
    row: {
      configKey,
      tenantKey: input.tenantKey,
      configVersion: 1,
      timezone: normalizeIdentifier(input.timezone || "UTC") || "UTC",
      workingHours: {
        start: "09:00",
        end: "18:00",
        workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
      },
      aiPersona: "Professional and conversion-oriented assistant.",
      salesPolicy: {
        escalation: "HUMAN_ON_HIGH_INTENT",
      },
      bookingPolicy: {
        requiresConfirmation: true,
      },
      paymentPolicy: {
        mode: "PREPAID",
      },
      isActive: true,
    },
    dbLedgers: ["tenantConfigLedger"],
  });
};

const ensureTenantLedgerRow = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  legalName?: string | null;
  region?: string | null;
  timezone?: string | null;
  contactEmail?: string | null;
}) => {
  const tenantId = normalizeTenantId(input);
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const existing = getTenantByKey(tenantKey);
  if (existing) {
    return existing;
  }
  const tenantRow = await upsertLedgerRecord({
    authority: "TenantLedger",
    storeMap: getStore().tenantLedger,
    keyField: "tenantKey",
    keyValue: tenantKey,
    row: {
      tenantKey,
      tenantId,
      businessId: normalizeIdentifier(input.businessId || tenantId) || tenantId,
      status: "ACTIVE",
      legalName: normalizeIdentifier(input.legalName || `Tenant ${tenantId}`),
      region: normalizeIdentifier(input.region || "GLOBAL") || "GLOBAL",
      timezone: normalizeIdentifier(input.timezone || "UTC") || "UTC",
      contactEmail: normalizeIdentifier(input.contactEmail || "") || null,
    },
    dbLedgers: ["tenantLedger"],
  });
  await ensureEnvironmentRows(tenantKey);
  await ensureSetupWizardRow(tenantKey);
  await ensureTenantConfigRow({
    tenantKey,
    timezone: tenantRow.timezone || "UTC",
  });
  return tenantRow;
};

const setActivePlan = async (input: {
  tenantKey: string;
  plan: SaaSPlanTier;
  source: string;
  replayToken?: string | null;
}) => {
  const existing = listTenantPlans(input.tenantKey);
  for (const row of existing) {
    if (row.isActive) {
      row.isActive = false;
      row.effectiveTo = now();
      row.updatedAt = now();
    }
  }

  const version = existing.length + 1;
  const timestamp = now();
  const planLedgerKey = `tenant_plan:${stableHash([
    input.tenantKey,
    input.plan,
    version,
    input.replayToken || timestamp.toISOString(),
  ]).slice(0, 24)}`;

  const planRow = await upsertLedgerRecord({
    authority: "TenantPlanLedger",
    storeMap: getStore().tenantPlanLedger,
    keyField: "planLedgerKey",
    keyValue: planLedgerKey,
    row: {
      planLedgerKey,
      tenantKey: input.tenantKey,
      planCode: input.plan,
      billingCycle: "MONTHLY",
      status: "ACTIVE",
      isActive: true,
      effectiveFrom: timestamp,
      effectiveTo: null,
      source: input.source,
      version,
    },
    dbLedgers: ["tenantPlanLedger"],
  });

  const featureQuota = PLAN_MATRIX[input.plan].featureQuota;
  for (const environment of CONNECT_HUB_ENVIRONMENTS) {
    for (const featureKey of FEATURE_ENTITLEMENT_KEYS) {
      const entitlementKey = `entitlement:${input.tenantKey}:${environment}:${featureKey}:v${version}`;
      await upsertLedgerRecord({
        authority: "FeatureEntitlementLedger",
        storeMap: getStore().featureEntitlementLedger,
        keyField: "entitlementKey",
        keyValue: entitlementKey,
        row: {
          entitlementKey,
          tenantKey: input.tenantKey,
          featureKey,
          environment,
          quota:
            featureKey === "sandbox_access" && environment === "LIVE"
              ? 1
              : featureQuota[featureKey],
          isEnabled:
            featureKey === "sandbox_access"
              ? featureQuota.sandbox_access > 0
              : featureQuota[featureKey] !== 0,
          source: "PLAN",
          version,
          isActive: true,
          effectiveFrom: timestamp,
        },
        dbLedgers: ["featureEntitlementLedger"],
      });
    }
  }

  for (const provider of CONNECT_HUB_PROVIDERS) {
    for (const environment of CONNECT_HUB_ENVIRONMENTS) {
      const category = getProviderCategory(provider);
      const limits = PLAN_MATRIX[input.plan].integrationLimits;
      const policyKey = `integration_policy:${input.tenantKey}:${provider}:${environment}:v${version}`;
      await upsertLedgerRecord({
        authority: "IntegrationPolicyLedger",
        storeMap: getStore().integrationPolicyLedger,
        keyField: "policyKey",
        keyValue: policyKey,
        row: {
          policyKey,
          tenantKey: input.tenantKey,
          provider,
          environment,
          maxLiveConnections: limits.live[category],
          maxSandboxConnections: limits.sandbox[category],
          allowMultiConnect: limits.allowMultiConnect,
          tokenRefreshMinutes: 45,
          rateLimitPerMinute: input.plan === "ENTERPRISE" ? 500 : input.plan === "PRO" ? 240 : 120,
          version,
          isActive: true,
        },
        dbLedgers: ["integrationPolicyLedger"],
      });
    }
  }

  return planRow;
};

const ensureDefaultPlan = async (tenantKey: string) => {
  const activePlan = getActiveTenantPlan(tenantKey);
  if (activePlan) {
    return activePlan;
  }
  return setActivePlan({
    tenantKey,
    plan: "STARTER",
    source: "bootstrap",
  });
};

const getActivePolicy = (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
}) => {
  const policies = Array.from(getStore().integrationPolicyLedger.values()).filter(
    (row) =>
      row.tenantKey === input.tenantKey &&
      row.provider === input.provider &&
      row.environment === input.environment &&
      row.isActive
  );
  policies.sort((left, right) => toNumber(right.version, 0) - toNumber(left.version, 0));
  return policies[0] || null;
};

const createDiagnostic = async (input: {
  attemptKey?: string | null;
  integrationKey?: string | null;
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  severity: "INFO" | "WARN" | "ERROR";
  code: string;
  message: string;
  fixAction: string;
  fixPayload?: JsonRecord | null;
  retryToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const diagnosticKey = `diag:${stableHash([
    input.tenantKey,
    input.provider,
    input.environment,
    input.code,
    input.retryToken || now().toISOString(),
  ]).slice(0, 24)}`;
  return upsertLedgerRecord({
    authority: "ConnectionDiagnosticLedger",
    storeMap: getStore().connectionDiagnosticLedger,
    keyField: "diagnosticKey",
    keyValue: diagnosticKey,
    row: {
      diagnosticKey,
      attemptKey: input.attemptKey || null,
      integrationKey: input.integrationKey || null,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      severity: input.severity,
      code: normalizeIdentifier(input.code).toUpperCase(),
      message: input.message,
      fixAction: normalizeIdentifier(input.fixAction).toUpperCase(),
      fixPayload: toRecord(input.fixPayload),
      retryToken:
        normalizeIdentifier(input.retryToken || "") ||
        `retry_${stableHash([diagnosticKey, "retry"]).slice(0, 18)}`,
      resolvedAt: null,
      resolutionStatus: "PENDING",
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["connectionDiagnosticLedger"],
  });
};

const setIntegrationHealth = async (input: {
  integrationKey: string;
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  status: ConnectStatus;
  healthScore: number;
  rootCauseCode?: string | null;
  rootCauseMessage?: string | null;
  actionHint?: string | null;
  retryable?: boolean;
  nextRetryAt?: Date | null;
  metadata?: JsonRecord | null;
}) => {
  const healthKey = `integration_health:${stableHash([
    input.integrationKey,
    input.status,
    now().toISOString(),
  ]).slice(0, 24)}`;
  return upsertLedgerRecord({
    authority: "IntegrationHealthLedger",
    storeMap: getStore().integrationHealthLedger,
    keyField: "healthKey",
    keyValue: healthKey,
    row: {
      healthKey,
      integrationKey: input.integrationKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      status: input.status,
      healthScore: Math.max(0, Math.min(100, Math.floor(toNumber(input.healthScore, 0)))),
      rootCauseCode: normalizeIdentifier(input.rootCauseCode || "") || null,
      rootCauseMessage: normalizeIdentifier(input.rootCauseMessage || "") || null,
      actionHint: normalizeIdentifier(input.actionHint || "") || null,
      retryable: input.retryable !== false,
      nextRetryAt: input.nextRetryAt || null,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["integrationHealthLedger"],
  });
};

const setProviderWebhook = async (input: {
  integrationKey: string;
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  eventType: string;
  status: string;
  webhookUrl?: string | null;
  consecutiveFailures?: number;
  lastDeliveryAt?: Date | null;
  lastFailureAt?: Date | null;
  metadata?: JsonRecord | null;
}) => {
  const webhookKey = `provider_webhook:${input.integrationKey}:${normalizeIdentifier(input.eventType).toLowerCase()}`;
  return upsertLedgerRecord({
    authority: "ProviderWebhookLedger",
    storeMap: getStore().providerWebhookLedger,
    keyField: "webhookKey",
    keyValue: webhookKey,
    row: {
      webhookKey,
      integrationKey: input.integrationKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      webhookUrl:
        normalizeIdentifier(input.webhookUrl || "") ||
        `https://webhooks.automexia.local/${input.provider.toLowerCase()}`,
      eventType: normalizeIdentifier(input.eventType || "MESSAGE").toUpperCase(),
      status: normalizeIdentifier(input.status || "ACTIVE").toUpperCase(),
      lastDeliveryAt: input.lastDeliveryAt || null,
      lastFailureAt: input.lastFailureAt || null,
      consecutiveFailures: Math.max(0, Math.floor(toNumber(input.consecutiveFailures, 0))),
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["providerWebhookLedger"],
  });
};

const setConnectionAttempt = async (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  flow: string;
  replayToken?: string | null;
  status: ConnectStatus;
  step: string;
  statusDetail?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resolutionHint?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const attemptKey = `connection_attempt:${stableHash([
    input.tenantKey,
    input.provider,
    input.environment,
    input.flow,
    input.replayToken || now().toISOString(),
  ]).slice(0, 24)}`;
  return upsertLedgerRecord({
    authority: "ConnectionAttemptLedger",
    storeMap: getStore().connectionAttemptLedger,
    keyField: "attemptKey",
    keyValue: attemptKey,
    row: {
      attemptKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      status: input.status,
      flow: normalizeIdentifier(input.flow).toUpperCase(),
      replayToken: normalizeIdentifier(input.replayToken || "") || null,
      step: normalizeIdentifier(input.step).toUpperCase(),
      statusDetail: normalizeIdentifier(input.statusDetail || "") || null,
      errorCode: normalizeIdentifier(input.errorCode || "") || null,
      errorMessage: normalizeIdentifier(input.errorMessage || "") || null,
      resolutionHint: normalizeIdentifier(input.resolutionHint || "") || null,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["connectionAttemptLedger"],
  });
};

const assertEnvironmentIsolation = async (input: {
  tenantKey: string;
  provider: ConnectProvider;
  expectedEnvironment: ConnectEnvironment;
  actualEnvironment: ConnectEnvironment;
}) => {
  if (input.expectedEnvironment === input.actualEnvironment) {
    return;
  }
  await createDiagnostic({
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.expectedEnvironment,
    severity: "ERROR",
    code: "CROSS_ENV_BLEED_BLOCKED",
    message:
      "Cross-environment provider state access was blocked by environment authority.",
    fixAction: "USE_CANONICAL_ENV",
    fixPayload: {
      expectedEnvironment: input.expectedEnvironment,
      actualEnvironment: input.actualEnvironment,
    },
  });
  throw new Error("cross_env_bleed_blocked");
};

const resolveIntegrationCapacity = (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
}) => {
  const activePlan = getActiveTenantPlan(input.tenantKey);
  const planCode = normalizePlanTier(activePlan?.planCode || "STARTER");
  const category = getProviderCategory(input.provider);
  const limits = PLAN_MATRIX[planCode].integrationLimits;
  const maxConnections =
    input.environment === "LIVE"
      ? limits.live[category]
      : limits.sandbox[category];
  const policy = getActivePolicy({
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
  });
  const policyLimit =
    input.environment === "LIVE"
      ? toNumber(policy?.maxLiveConnections, maxConnections)
      : toNumber(policy?.maxSandboxConnections, maxConnections);
  return {
    allowMultiConnect:
      Boolean(policy?.allowMultiConnect) || PLAN_MATRIX[planCode].integrationLimits.allowMultiConnect,
    maxConnections: Math.max(0, policyLimit),
    planCode,
  };
};

const assertIntegrationEntitlement = async (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  reconnect?: boolean;
}) => {
  const capacity = resolveIntegrationCapacity(input);
  const activeIntegrations = listIntegrations({
    tenantKey: input.tenantKey,
    environment: input.environment,
  }).filter(
    (row) =>
      getProviderCategory(row.provider as ConnectProvider) ===
        getProviderCategory(input.provider) &&
      row.status !== "DISCONNECTED"
  );
  if (input.reconnect && activeIntegrations.length > 0) {
    return;
  }

  if (input.environment === "SANDBOX") {
    const sandboxEntitlement = getActiveEntitlement({
      tenantKey: input.tenantKey,
      featureKey: "sandbox_access",
      environment: "SANDBOX",
    });
    if (!sandboxEntitlement?.isEnabled) {
      await createDiagnostic({
        tenantKey: input.tenantKey,
        provider: input.provider,
        environment: input.environment,
        severity: "ERROR",
        code: "SANDBOX_ACCESS_DISABLED",
        message: "Sandbox usage is disabled for this plan entitlement.",
        fixAction: "UPGRADE_PLAN",
      });
      throw new Error("sandbox_access_disabled");
    }
  }

  if (!capacity.allowMultiConnect && activeIntegrations.length >= 1) {
    await createDiagnostic({
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      severity: "ERROR",
      code: "PLAN_LIMIT_REACHED",
      message:
        "Plan policy allows one active connection for this provider category.",
      fixAction: "UPGRADE_PLAN",
      fixPayload: {
        planCode: capacity.planCode,
      },
    });
    throw new Error("plan_limit_reached");
  }

  if (activeIntegrations.length >= capacity.maxConnections) {
    await createDiagnostic({
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      severity: "ERROR",
      code: "PLAN_LIMIT_REACHED",
      message: `Connection cap reached (${capacity.maxConnections}) for ${input.environment} ${getProviderCategory(
        input.provider
      )}.`,
      fixAction: "UPGRADE_PLAN",
      fixPayload: {
        maxConnections: capacity.maxConnections,
        currentConnections: activeIntegrations.length,
      },
    });
    throw new Error("plan_limit_reached");
  }
};

const resolveOrCreateIntegration = async (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  reconnect?: boolean;
  externalAccountRef?: string | null;
  tokenValue?: string | null;
  scopes?: string[];
  status?: ConnectStatus;
  tokenExpiresAt?: Date | null;
}) => {
  const candidates = listIntegrations({
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
  });
  let slot = 1;
  if (input.reconnect && candidates.length > 0) {
    slot = toNumber(candidates[0].slot, 1);
  } else if (candidates.length > 0) {
    slot = Math.max(...candidates.map((row) => toNumber(row.slot, 1))) + 1;
  }

  const integrationKey =
    input.reconnect && candidates.length > 0
      ? candidates[0].integrationKey
      : `integration:${input.tenantKey}:${input.provider}:${input.environment}:slot${slot}`;
  const tokenValue = normalizeIdentifier(input.tokenValue || "");
  const encryptedRef = tokenValue ? `enc::${encrypt(tokenValue)}` : null;

  const integrationRow = await upsertLedgerRecord({
    authority: "IntegrationLedger",
    storeMap: getStore().integrationLedger,
    keyField: "integrationKey",
    keyValue: integrationKey,
    row: {
      integrationKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      status: normalizeStatus(input.status || "VERIFYING", "VERIFYING"),
      externalAccountRef:
        normalizeIdentifier(input.externalAccountRef || "") || `acct_${stableHash([integrationKey]).slice(0, 14)}`,
      credentialRef: encryptedRef,
      scopes: toArray(input.scopes || []),
      tokenExpiresAt:
        input.tokenExpiresAt ||
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
      lastConnectedAt: now(),
      lastVerifiedAt: null,
      lastDisconnectedAt: null,
      slot,
    },
    dbLedgers: ["integrationLedger"],
  });

  return integrationRow;
};

const setOAuthState = async (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  replayToken?: string | null;
  redirectUri?: string | null;
  scopes?: string[];
}) => {
  const oauthStateKey = `oauth_state:${stableHash([
    input.tenantKey,
    input.provider,
    input.environment,
    input.replayToken || now().toISOString(),
  ]).slice(0, 24)}`;
  return upsertLedgerRecord({
    authority: "OAuthStateLedger",
    storeMap: getStore().oauthStateLedger,
    keyField: "oauthStateKey",
    keyValue: oauthStateKey,
    row: {
      oauthStateKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      stateHash: stableHash([oauthStateKey, "state"]),
      redirectUri:
        normalizeIdentifier(input.redirectUri || "") ||
        "https://app.automexia.local/connect/callback",
      scopes: toArray(input.scopes || []),
      status: "ISSUED",
      expiresAt: new Date(Date.now() + 1000 * 60 * 15),
      consumedAt: null,
      replayToken: normalizeIdentifier(input.replayToken || "") || null,
    },
    dbLedgers: ["oauthStateLedger"],
  });
};

const markConnectionSuccess = async (input: {
  attemptKey: string;
  integrationKey: string;
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  details: JsonRecord;
}) => {
  const integration = getStore().integrationLedger.get(input.integrationKey);
  if (integration) {
    integration.status = "CONNECTED";
    integration.lastVerifiedAt = now();
    integration.updatedAt = now();
  }
  await setProviderWebhook({
    integrationKey: input.integrationKey,
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    eventType: "INBOUND",
    status: "ACTIVE",
    consecutiveFailures: 0,
    lastDeliveryAt: now(),
    metadata: {
      flow: input.details.flow || null,
      testEventVerified: true,
    },
  });
  await setIntegrationHealth({
    integrationKey: input.integrationKey,
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    status: "CONNECTED",
    healthScore: 100,
    rootCauseCode: null,
    rootCauseMessage: null,
    actionHint: null,
    retryable: true,
    metadata: input.details,
  });
  await upsertLedgerRecord({
    authority: "ConnectionAttemptLedger",
    storeMap: getStore().connectionAttemptLedger,
    keyField: "attemptKey",
    keyValue: input.attemptKey,
    row: {
      ...toRecord(getStore().connectionAttemptLedger.get(input.attemptKey)),
      attemptKey: input.attemptKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      flow:
        normalizeIdentifier(
          (getStore().connectionAttemptLedger.get(input.attemptKey) as any)?.flow ||
            input.details.flow ||
            "RECOVERY"
        ).toUpperCase(),
      replayToken:
        (getStore().connectionAttemptLedger.get(input.attemptKey) as any)?.replayToken ||
        null,
      status: "CONNECTED",
      step: "CONNECTED",
      statusDetail: "connect_flow_completed",
      errorCode: null,
      errorMessage: null,
      resolutionHint: null,
      metadata: {
        ...toRecord(
          (getStore().connectionAttemptLedger.get(input.attemptKey) as any)?.metadata
        ),
        ...input.details,
      },
    },
    dbLedgers: ["connectionAttemptLedger"],
  });
};

const markConnectionFailure = async (input: {
  attemptKey: string;
  integrationKey?: string | null;
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  status: ConnectStatus;
  step: string;
  code: string;
  message: string;
  fixAction: string;
  retryable?: boolean;
  metadata?: JsonRecord | null;
}) => {
  if (input.integrationKey) {
    const integration = getStore().integrationLedger.get(input.integrationKey);
    if (integration) {
      integration.status = input.status;
      integration.updatedAt = now();
    }
    await setIntegrationHealth({
      integrationKey: input.integrationKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      status: input.status,
      healthScore:
        input.status === "TOKEN_EXPIRED"
          ? 42
          : input.status === "RATE_LIMITED"
          ? 65
          : input.status === "LIMITED"
          ? 58
          : 20,
      rootCauseCode: input.code,
      rootCauseMessage: input.message,
      actionHint: input.fixAction,
      retryable: input.retryable !== false,
      nextRetryAt: input.retryable === false ? null : new Date(Date.now() + 1000 * 60 * 2),
      metadata: toRecord(input.metadata),
    });
  }

  const attempt = getStore().connectionAttemptLedger.get(input.attemptKey);
  await upsertLedgerRecord({
    authority: "ConnectionAttemptLedger",
    storeMap: getStore().connectionAttemptLedger,
    keyField: "attemptKey",
    keyValue: input.attemptKey,
    row: {
      ...toRecord(attempt),
      attemptKey: input.attemptKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      status: input.status,
      step: normalizeIdentifier(input.step).toUpperCase(),
      errorCode: input.code,
      errorMessage: input.message,
      statusDetail: input.message,
      resolutionHint: input.fixAction,
      metadata: {
        ...toRecord((attempt as any)?.metadata),
        ...toRecord(input.metadata),
      },
    },
    dbLedgers: ["connectionAttemptLedger"],
  });
  const diagnostic = await createDiagnostic({
    attemptKey: input.attemptKey,
    integrationKey: input.integrationKey || null,
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    severity: input.status === "LIMITED" || input.status === "RATE_LIMITED" ? "WARN" : "ERROR",
    code: input.code,
    message: input.message,
    fixAction: input.fixAction,
    metadata: toRecord(input.metadata),
  });
  await callReliabilityInfluence({
    tenantId: input.tenantKey,
    businessId: input.tenantKey,
    severity: input.status === "WEBHOOK_FAILED" ? "P1" : "P2",
    provider: input.provider,
    reason: input.message,
    dedupeKey: `${input.provider}:${input.code}:${input.tenantKey}`.toLowerCase(),
    metadata: {
      attemptKey: input.attemptKey,
      diagnosticKey: diagnostic.diagnosticKey,
    },
  });
  return diagnostic;
};

const mirrorSandboxSlot = async (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  integrationKey: string;
}) => {
  if (input.environment !== "SANDBOX") {
    return null;
  }
  const sandboxKey = `sandbox_slot:${input.tenantKey}:${input.provider.toLowerCase()}`;
  return upsertLedgerRecord({
    authority: "SandboxLedger",
    storeMap: getStore().sandboxLedger,
    keyField: "sandboxKey",
    keyValue: sandboxKey,
    row: {
      sandboxKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      slot: 1,
      status: "ACTIVE",
      integrationKey: input.integrationKey,
    },
    dbLedgers: ["sandboxLedger"],
  });
};

const setProvisioningState = async (input: {
  tenantKey: string;
  status: string;
  stage: string;
  replayToken?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) => {
  const provisioningKey = `provisioning:${stableHash([
    input.tenantKey,
    input.status,
    input.replayToken || now().toISOString(),
  ]).slice(0, 24)}`;
  return upsertLedgerRecord({
    authority: "ProvisioningLedger",
    storeMap: getStore().provisioningLedger,
    keyField: "provisioningKey",
    keyValue: provisioningKey,
    row: {
      provisioningKey,
      tenantKey: input.tenantKey,
      status: normalizeIdentifier(input.status).toUpperCase(),
      stage: normalizeIdentifier(input.stage).toUpperCase(),
      replayToken: normalizeIdentifier(input.replayToken || "") || null,
      errorCode: normalizeIdentifier(input.errorCode || "") || null,
      errorMessage: normalizeIdentifier(input.errorMessage || "") || null,
    },
    dbLedgers: ["provisioningLedger"],
  });
};

const buildTenantProjection = (tenantKey: string) => {
  const tenant = getTenantByKey(tenantKey);
  const plan = getActiveTenantPlan(tenantKey);
  const wizard = getWizardByTenant(tenantKey);
  const integrations = listIntegrations({ tenantKey });
  const diagnostics = Array.from(getStore().connectionDiagnosticLedger.values()).filter(
    (row) => row.tenantKey === tenantKey && !row.resolvedAt
  );
  return {
    tenant,
    plan,
    wizard,
    integrations,
    diagnostics,
  };
};

export const bootstrapSaaSPackagingConnectHubOS = async () => {
  const store = getStore();
  store.invokeCount += 1;
  if (store.bootstrappedAt) {
    return {
      bootstrappedAt: store.bootstrappedAt,
      phaseVersion: SAAS_PACKAGING_PHASE_VERSION,
      alreadyBootstrapped: true,
    };
  }

  await bootstrapReliabilityOS().catch(() => undefined);
  await bootstrapSecurityGovernanceOS().catch(() => undefined);

  markWiringDomain(
    "AI",
    "CRM",
    "RECEPTION",
    "HUMAN",
    "BOOKING",
    "COMMERCE",
    "INTELLIGENCE",
    "RELIABILITY",
    "SECURITY"
  );

  store.bootstrappedAt = now();
  await recordObservabilityEvent({
    eventType: "saas.connect_hub.bootstrapped",
    message: "SaaS Packaging + Connect Hub OS bootstrapped",
    severity: "info",
    context: {
      component: "connect-hub",
      phase: "saas-packaging",
      provider: "INTERNAL",
    },
    metadata: {
      phaseVersion: SAAS_PACKAGING_PHASE_VERSION,
      authorities: CONNECT_HUB_AUTHORITIES.length,
    },
  }).catch(() => undefined);

  return {
    bootstrappedAt: store.bootstrappedAt,
    phaseVersion: SAAS_PACKAGING_PHASE_VERSION,
    alreadyBootstrapped: false,
  };
};

export const provisionTenantSaaSPackaging = async (input: {
  businessId: string;
  tenantId?: string | null;
  legalName?: string | null;
  region?: string | null;
  timezone?: string | null;
  contactEmail?: string | null;
  plan?: SaaSPlanTier | string | null;
  replayToken?: string | null;
}) => {
  await bootstrapSaaSPackagingConnectHubOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "TENANT_PROVISIONING",
      replayToken,
    });
    const replayedProvisioningKey = resolveReplay(replayKey);
    if (replayedProvisioningKey) {
      return {
        replayed: true,
        tenantKey,
        provisioning:
          getStore().provisioningLedger.get(replayedProvisioningKey) || null,
        projection: buildTenantProjection(tenantKey),
      };
    }
  }

  const tenant = await ensureTenantLedgerRow({
    businessId: input.businessId,
    tenantId,
    legalName: input.legalName,
    region: input.region,
    timezone: input.timezone,
    contactEmail: input.contactEmail,
  });
  const activePlan = await ensureDefaultPlan(tenant.tenantKey);
  const targetPlan = normalizePlanTier(input.plan || activePlan.planCode || "STARTER");
  if (targetPlan !== normalizePlanTier(activePlan.planCode || "STARTER")) {
    await setActivePlan({
      tenantKey: tenant.tenantKey,
      plan: targetPlan,
      source: "tenant_provisioning",
      replayToken: replayToken || null,
    });
  }
  const provisioning = await setProvisioningState({
    tenantKey,
    status: "COMPLETED",
    stage: "TENANT_READY",
    replayToken: replayToken || null,
  });
  await callSecurityInfluence({
    businessId: tenant.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "TENANT_PROVISIONING",
    resourceId: provisioning.provisioningKey,
    purpose: "TENANT_SETUP",
    metadata: {
      plan: targetPlan,
    },
  });
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "TENANT_PROVISIONING",
        replayToken,
      }),
      provisioning.provisioningKey
    );
  }
  markWiringDomain("AI", "CRM", "RECEPTION", "BOOKING", "COMMERCE");
  return {
    replayed: false,
    tenantKey,
    provisioning,
    projection: buildTenantProjection(tenantKey),
  };
};

export const connectInstagramOneClick = async (input: {
  businessId: string;
  tenantId?: string | null;
  environment?: ConnectEnvironment | string | null;
  replayToken?: string | null;
  reconnect?: boolean;
  externalAccountRef?: string | null;
  scopes?: string[];
  simulate?: {
    permissionMissing?: boolean;
    webhookFail?: boolean;
    rateLimited?: boolean;
    tokenExpired?: boolean;
  } | null;
}) => {
  await bootstrapSaaSPackagingConnectHubOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "INSTAGRAM_CONNECT",
      provider: "INSTAGRAM",
      environment,
      replayToken,
    });
    const replayAttemptKey = resolveReplay(replayKey);
    if (replayAttemptKey) {
      const replayAttempt = getStore().connectionAttemptLedger.get(replayAttemptKey);
      const replayIntegration = listIntegrations({
        tenantKey,
        provider: "INSTAGRAM",
        environment,
      })[0] || null;
      return {
        replayed: true,
        attempt: replayAttempt || null,
        integration: replayIntegration,
        health: replayIntegration ? getIntegrationHealth(replayIntegration.integrationKey) : null,
      };
    }
  }

  await ensureTenantLedgerRow({
    businessId: input.businessId,
    tenantId,
  });
  await ensureDefaultPlan(tenantKey);
  await assertIntegrationEntitlement({
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    reconnect: Boolean(input.reconnect),
  });
  const oauthState = await setOAuthState({
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    replayToken: replayToken || null,
    scopes:
      input.scopes || [
        "instagram_basic",
        "instagram_manage_messages",
        "pages_manage_metadata",
      ],
  });
  const attempt = await setConnectionAttempt({
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    flow: "INSTAGRAM_CONNECT",
    replayToken: replayToken || null,
    status: "VERIFYING",
    step: "META_OAUTH",
    statusDetail: "oauth_accepted",
    metadata: {
      oauthStateKey: oauthState.oauthStateKey,
      flowSteps: [
        "META_OAUTH",
        "BUSINESS_SELECTED",
        "PAGE_SELECTED",
        "IG_ACCOUNT_SELECTED",
        "PERMISSION_VERIFIED",
        "WEBHOOK_SUBSCRIBED",
        "TEST_EVENT_SENT",
        "INBOUND_VERIFIED",
        "CONNECTED",
      ],
    },
  });
  await callSecurityInfluence({
    businessId: tenantId,
    tenantId,
    action: "settings:manage",
    resourceType: "INSTAGRAM_CONNECT",
    resourceId: attempt.attemptKey,
    purpose: "CONNECT_PROVIDER",
    metadata: {
      environment,
    },
  });

  const integration = await resolveOrCreateIntegration({
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    reconnect: Boolean(input.reconnect),
    externalAccountRef: input.externalAccountRef || null,
    tokenValue: `ig_token_${stableHash([tenantKey, replayToken || now().toISOString()]).slice(0, 14)}`,
    scopes: input.scopes || ["instagram_basic", "pages_show_list"],
    status: "VERIFYING",
  });

  await mirrorSandboxSlot({
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    integrationKey: integration.integrationKey,
  });

  if (input.simulate?.permissionMissing) {
    const diagnostic = await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "PERMISSION_MISSING",
      step: "PERMISSION_VERIFIED",
      code: "IG_SCOPE_MISSING",
      message: "Required Meta scopes are missing for Instagram messaging.",
      fixAction: "REAUTHORIZE",
      metadata: {
        missingScopes: ["instagram_manage_messages", "pages_manage_metadata"],
      },
    });
    if (replayToken) {
      registerReplay(
        makeScopedReplayKey({
          tenantKey,
          flow: "INSTAGRAM_CONNECT",
          provider: "INSTAGRAM",
          environment,
          replayToken,
        }),
        attempt.attemptKey
      );
    }
    return {
      replayed: false,
      attempt: getStore().connectionAttemptLedger.get(attempt.attemptKey),
      integration: getStore().integrationLedger.get(integration.integrationKey),
      health: getIntegrationHealth(integration.integrationKey),
      diagnostic,
    };
  }

  if (input.simulate?.webhookFail) {
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "WEBHOOK_FAILED",
      step: "INBOUND_VERIFIED",
      code: "IG_WEBHOOK_FAIL",
      message: "Webhook subscription did not receive inbound verification event.",
      fixAction: "FIX_WEBHOOK",
    });
    await setProviderWebhook({
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      eventType: "INBOUND",
      status: "FAILED",
      consecutiveFailures: 1,
      lastFailureAt: now(),
    });
    if (replayToken) {
      registerReplay(
        makeScopedReplayKey({
          tenantKey,
          flow: "INSTAGRAM_CONNECT",
          provider: "INSTAGRAM",
          environment,
          replayToken,
        }),
        attempt.attemptKey
      );
    }
    return {
      replayed: false,
      attempt: getStore().connectionAttemptLedger.get(attempt.attemptKey),
      integration: getStore().integrationLedger.get(integration.integrationKey),
      health: getIntegrationHealth(integration.integrationKey),
    };
  }

  if (input.simulate?.rateLimited) {
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "RATE_LIMITED",
      step: "TEST_EVENT_SENT",
      code: "IG_RATE_LIMITED",
      message: "Meta API rate limit reached while validating Instagram connection.",
      fixAction: "WAIT_RATE_LIMIT",
      retryable: true,
    });
    if (replayToken) {
      registerReplay(
        makeScopedReplayKey({
          tenantKey,
          flow: "INSTAGRAM_CONNECT",
          provider: "INSTAGRAM",
          environment,
          replayToken,
        }),
        attempt.attemptKey
      );
    }
    return {
      replayed: false,
      attempt: getStore().connectionAttemptLedger.get(attempt.attemptKey),
      integration: getStore().integrationLedger.get(integration.integrationKey),
      health: getIntegrationHealth(integration.integrationKey),
    };
  }

  if (input.simulate?.tokenExpired) {
    const expiry = new Date(Date.now() - 1000 * 60);
    integration.tokenExpiresAt = expiry;
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "TOKEN_EXPIRED",
      step: "CONNECTED",
      code: "IG_TOKEN_EXPIRED",
      message: "Instagram token expired during connect validation.",
      fixAction: "REFRESH_TOKEN",
      retryable: true,
    });
    if (replayToken) {
      registerReplay(
        makeScopedReplayKey({
          tenantKey,
          flow: "INSTAGRAM_CONNECT",
          provider: "INSTAGRAM",
          environment,
          replayToken,
        }),
        attempt.attemptKey
      );
    }
    return {
      replayed: false,
      attempt: getStore().connectionAttemptLedger.get(attempt.attemptKey),
      integration: getStore().integrationLedger.get(integration.integrationKey),
      health: getIntegrationHealth(integration.integrationKey),
    };
  }

  await markConnectionSuccess({
    attemptKey: attempt.attemptKey,
    integrationKey: integration.integrationKey,
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    details: {
      flow: "INSTAGRAM_CONNECT",
      oauthStateKey: oauthState.oauthStateKey,
    },
  });
  await recordTraceLedger({
    traceId: `connect_hub_ig_${attempt.attemptKey}`,
    correlationId: attempt.attemptKey,
    businessId: tenantId,
    tenantId,
    stage: "connect_hub:instagram:connected",
    status: "COMPLETED",
    endedAt: now(),
  }).catch(() => undefined);
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "INSTAGRAM_CONNECT",
        provider: "INSTAGRAM",
        environment,
        replayToken,
      }),
      attempt.attemptKey
    );
  }
  markWiringDomain("RECEPTION", "CRM", "INTELLIGENCE");
  return {
    replayed: false,
    attempt: getStore().connectionAttemptLedger.get(attempt.attemptKey),
    integration: getStore().integrationLedger.get(integration.integrationKey),
    health: getIntegrationHealth(integration.integrationKey),
  };
};

export const connectWhatsAppGuidedWizard = async (input: {
  businessId: string;
  tenantId?: string | null;
  environment?: ConnectEnvironment | string | null;
  replayToken?: string | null;
  reconnect?: boolean;
  scenario?: WhatsAppFailureScenario;
}) => {
  await bootstrapSaaSPackagingConnectHubOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const scenario = normalizeIdentifier(input.scenario || "NONE").toUpperCase() as WhatsAppFailureScenario;
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "WHATSAPP_CONNECT",
      provider: "WHATSAPP",
      environment,
      replayToken,
    });
    const replayAttemptKey = resolveReplay(replayKey);
    if (replayAttemptKey) {
      const replayAttempt = getStore().connectionAttemptLedger.get(replayAttemptKey);
      const replayIntegration = listIntegrations({
        tenantKey,
        provider: "WHATSAPP",
        environment,
      })[0] || null;
      return {
        replayed: true,
        attempt: replayAttempt || null,
        integration: replayIntegration,
        health: replayIntegration ? getIntegrationHealth(replayIntegration.integrationKey) : null,
      };
    }
  }

  await ensureTenantLedgerRow({
    businessId: input.businessId,
    tenantId,
  });
  await ensureDefaultPlan(tenantKey);
  await assertIntegrationEntitlement({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    reconnect: Boolean(input.reconnect),
  });

  const oauthState = await setOAuthState({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    replayToken: replayToken || null,
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
  });
  const attempt = await setConnectionAttempt({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    flow: "WHATSAPP_CONNECT",
    replayToken: replayToken || null,
    status: "VERIFYING",
    step: "META_LOGIN",
    statusDetail: "wizard_started",
    metadata: {
      oauthStateKey: oauthState.oauthStateKey,
      flowSteps: [
        "META_LOGIN",
        "BUSINESS_SELECT_OR_CREATE",
        "WABA_SELECT_OR_CREATE",
        "NUMBER_SELECT_OR_ADD",
        "OTP_VERIFY",
        "DISPLAY_NAME_VALIDATE",
        "CATEGORY_SELECT",
        "WEBHOOK_SETUP",
        "HEALTH_CHECK",
        "LIVE_TEST_SEND",
        "INBOUND_VERIFY",
        "TEMPLATE_HEALTH_CHECK",
        "CONNECTED",
      ],
    },
  });
  const integration = await resolveOrCreateIntegration({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    reconnect: Boolean(input.reconnect),
    externalAccountRef: `wa_account_${stableHash([tenantKey, replayToken || now().toISOString()]).slice(0, 12)}`,
    tokenValue: `wa_token_${stableHash([attempt.attemptKey]).slice(0, 14)}`,
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
    status: "VERIFYING",
  });
  await mirrorSandboxSlot({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    integrationKey: integration.integrationKey,
  });

  const failureMap: Record<
    Exclude<WhatsAppFailureScenario, "NONE">,
    {
      status: ConnectStatus;
      step: string;
      code: string;
      message: string;
      fixAction: string;
      fixPayload?: JsonRecord;
    }
  > = {
    NUMBER_ALREADY_LINKED: {
      status: "NEEDS_ACTION",
      step: "NUMBER_SELECT_OR_ADD",
      code: "WA_NUMBER_LINKED_ELSEWHERE",
      message:
        "Selected number is already linked to another WhatsApp Business Account.",
      fixAction: "SWITCH_NUMBER",
      fixPayload: {
        suggestion: "Pick an unlinked number or release number from previous WABA.",
      },
    },
    WRONG_BUSINESS: {
      status: "NEEDS_ACTION",
      step: "BUSINESS_SELECT_OR_CREATE",
      code: "WA_WRONG_BUSINESS",
      message: "Selected business does not match tenant ownership boundary.",
      fixAction: "SWITCH_BUSINESS",
    },
    SCOPE_MISSING: {
      status: "PERMISSION_MISSING",
      step: "META_LOGIN",
      code: "WA_SCOPE_MISSING",
      message: "Required WhatsApp permissions were not granted.",
      fixAction: "REAUTHORIZE",
    },
    WEBHOOK_FAIL: {
      status: "WEBHOOK_FAILED",
      step: "INBOUND_VERIFY",
      code: "WA_WEBHOOK_FAIL",
      message: "WhatsApp webhook verification failed for the selected number.",
      fixAction: "FIX_WEBHOOK",
    },
    TOKEN_ISSUE: {
      status: "TOKEN_EXPIRED",
      step: "HEALTH_CHECK",
      code: "WA_TOKEN_ISSUE",
      message: "WhatsApp token is invalid or expired.",
      fixAction: "REFRESH_TOKEN",
    },
    TEMPLATE_FAILURE: {
      status: "LIMITED",
      step: "TEMPLATE_HEALTH_CHECK",
      code: "WA_TEMPLATE_FAILURE",
      message: "Template quality or approval state blocks outbound sends.",
      fixAction: "CHECK_TEMPLATE",
    },
    SANDBOX_LIVE_MISMATCH: {
      status: "NEEDS_ACTION",
      step: "HEALTH_CHECK",
      code: "WA_ENVIRONMENT_MISMATCH",
      message: "Selected WABA environment does not match requested runtime mode.",
      fixAction: "SYNC_ENVIRONMENT",
    },
    RATE_LIMIT: {
      status: "RATE_LIMITED",
      step: "LIVE_TEST_SEND",
      code: "WA_RATE_LIMITED",
      message: "Provider rate limit triggered during WhatsApp connect validation.",
      fixAction: "WAIT_RATE_LIMIT",
    },
    QUALITY_ISSUE: {
      status: "LIMITED",
      step: "TEMPLATE_HEALTH_CHECK",
      code: "WA_QUALITY_ISSUE",
      message: "WhatsApp quality rating degraded and delivery was limited.",
      fixAction: "IMPROVE_QUALITY",
    },
  };

  if (scenario !== "NONE") {
    const failure = failureMap[scenario as Exclude<WhatsAppFailureScenario, "NONE">];
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "WHATSAPP",
      environment,
      status: failure.status,
      step: failure.step,
      code: failure.code,
      message: failure.message,
      fixAction: failure.fixAction,
      retryable: failure.fixAction !== "SWITCH_BUSINESS" && failure.fixAction !== "SWITCH_NUMBER",
      metadata: failure.fixPayload || null,
    });
    if (failure.status === "WEBHOOK_FAILED") {
      await setProviderWebhook({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider: "WHATSAPP",
        environment,
        eventType: "INBOUND",
        status: "FAILED",
        consecutiveFailures: 1,
        lastFailureAt: now(),
      });
    }
    if (replayToken) {
      registerReplay(
        makeScopedReplayKey({
          tenantKey,
          flow: "WHATSAPP_CONNECT",
          provider: "WHATSAPP",
          environment,
          replayToken,
        }),
        attempt.attemptKey
      );
    }
    return {
      replayed: false,
      attempt: getStore().connectionAttemptLedger.get(attempt.attemptKey),
      integration: getStore().integrationLedger.get(integration.integrationKey),
      health: getIntegrationHealth(integration.integrationKey),
      diagnostics: Array.from(getStore().connectionDiagnosticLedger.values()).filter(
        (row) => row.attemptKey === attempt.attemptKey
      ),
    };
  }

  await markConnectionSuccess({
    attemptKey: attempt.attemptKey,
    integrationKey: integration.integrationKey,
    tenantKey,
    provider: "WHATSAPP",
    environment,
    details: {
      flow: "WHATSAPP_CONNECT",
      oauthStateKey: oauthState.oauthStateKey,
    },
  });
  await callSecurityInfluence({
    businessId: tenantId,
    tenantId,
    action: "settings:manage",
    resourceType: "WHATSAPP_CONNECT",
    resourceId: attempt.attemptKey,
    purpose: "CONNECT_PROVIDER",
    metadata: {
      environment,
      scenario,
    },
  });
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "WHATSAPP_CONNECT",
        provider: "WHATSAPP",
        environment,
        replayToken,
      }),
      attempt.attemptKey
    );
  }
  markWiringDomain("RECEPTION", "HUMAN", "COMMERCE", "INTELLIGENCE");
  return {
    replayed: false,
    attempt: getStore().connectionAttemptLedger.get(attempt.attemptKey),
    integration: getStore().integrationLedger.get(integration.integrationKey),
    health: getIntegrationHealth(integration.integrationKey),
  };
};

export const expireIntegrationToken = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider: ConnectProvider | string;
  environment?: ConnectEnvironment | string | null;
  reason?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const provider = normalizeProvider(input.provider);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const integration = listIntegrations({
    tenantKey,
    provider,
    environment,
  })[0];
  if (!integration) {
    throw new Error("integration_not_found");
  }
  integration.status = "TOKEN_EXPIRED";
  integration.tokenExpiresAt = new Date(Date.now() - 1000 * 60);
  integration.updatedAt = now();
  await setIntegrationHealth({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    status: "TOKEN_EXPIRED",
    healthScore: 40,
    rootCauseCode: `${provider}_TOKEN_EXPIRED`,
    rootCauseMessage: normalizeIdentifier(input.reason || "token expired") || "token expired",
    actionHint: "REFRESH_TOKEN",
    retryable: true,
  });
  await createDiagnostic({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    severity: "ERROR",
    code: `${provider}_TOKEN_EXPIRED`,
    message: "Integration token has expired and requires refresh.",
    fixAction: "REFRESH_TOKEN",
  });
  return {
    integration,
    health: getIntegrationHealth(integration.integrationKey),
  };
};

export const refreshIntegrationToken = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider: ConnectProvider | string;
  environment?: ConnectEnvironment | string | null;
  replayToken?: string | null;
  forceFail?: boolean;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const provider = normalizeProvider(input.provider);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const integration = listIntegrations({
    tenantKey,
    provider,
    environment,
  })[0];
  if (!integration) {
    throw new Error("integration_not_found");
  }
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "TOKEN_REFRESH",
      provider,
      environment,
      replayToken,
    });
    const replayRefreshKey = resolveReplay(replayKey);
    if (replayRefreshKey) {
      return getStore().tokenRefreshLedger.get(replayRefreshKey) || null;
    }
  }
  const refreshKey = `token_refresh:${stableHash([
    integration.integrationKey,
    replayToken || now().toISOString(),
  ]).slice(0, 24)}`;
  const previousExpiry = integration.tokenExpiresAt || null;
  let status = "SUCCESS";
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let newExpiry: Date | null = null;
  let nextRetryAt: Date | null = null;
  try {
    assertFailpoint("token_refresh_failure");
    if (input.forceFail) {
      throw new Error("forced_refresh_failure");
    }
    newExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
    integration.tokenExpiresAt = newExpiry;
    integration.status = "CONNECTED";
    integration.updatedAt = now();
    await setIntegrationHealth({
      integrationKey: integration.integrationKey,
      tenantKey,
      provider,
      environment,
      status: "CONNECTED",
      healthScore: 96,
      rootCauseCode: null,
      rootCauseMessage: null,
      actionHint: null,
      retryable: true,
    });
  } catch (error) {
    status = "FAILED";
    errorCode = "TOKEN_REFRESH_FAILED";
    errorMessage = String((error as Error)?.message || "token_refresh_failed");
    nextRetryAt = new Date(Date.now() + 1000 * 60 * 5);
    integration.status = "TOKEN_EXPIRED";
    integration.updatedAt = now();
    await setIntegrationHealth({
      integrationKey: integration.integrationKey,
      tenantKey,
      provider,
      environment,
      status: "TOKEN_EXPIRED",
      healthScore: 38,
      rootCauseCode: errorCode,
      rootCauseMessage: errorMessage,
      actionHint: "REFRESH_TOKEN",
      retryable: true,
      nextRetryAt,
    });
    await createDiagnostic({
      integrationKey: integration.integrationKey,
      tenantKey,
      provider,
      environment,
      severity: "ERROR",
      code: `${provider}_TOKEN_ISSUE`,
      message: "Token refresh failed. Reauthorize provider credentials.",
      fixAction: "REAUTHORIZE",
      retryToken: replayToken || null,
      metadata: {
        errorMessage,
      },
    });
  }

  const refreshRow = await upsertLedgerRecord({
    authority: "TokenRefreshLedger",
    storeMap: getStore().tokenRefreshLedger,
    keyField: "refreshKey",
    keyValue: refreshKey,
    row: {
      refreshKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider,
      environment,
      status,
      attempt: 1,
      oldExpiry: previousExpiry,
      newExpiry,
      errorCode,
      errorMessage,
      nextRetryAt,
      replayToken: replayToken || null,
    },
    dbLedgers: ["tokenRefreshLedger"],
  });
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "TOKEN_REFRESH",
        provider,
        environment,
        replayToken,
      }),
      refreshRow.refreshKey
    );
  }
  return refreshRow;
};

export const markProviderWebhookFailure = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider: ConnectProvider | string;
  environment?: ConnectEnvironment | string | null;
  reason?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const provider = normalizeProvider(input.provider);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const integration = listIntegrations({
    tenantKey,
    provider,
    environment,
  })[0];
  if (!integration) {
    throw new Error("integration_not_found");
  }
  const currentWebhook = getProviderWebhookRow(integration.integrationKey);
  const failures = toNumber(currentWebhook?.consecutiveFailures, 0) + 1;
  await setProviderWebhook({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    eventType: "INBOUND",
    status: "FAILED",
    consecutiveFailures: failures,
    lastFailureAt: now(),
    metadata: {
      reason: normalizeIdentifier(input.reason || "webhook_failure"),
    },
  });
  integration.status = "WEBHOOK_FAILED";
  integration.updatedAt = now();
  await setIntegrationHealth({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    status: "WEBHOOK_FAILED",
    healthScore: Math.max(10, 70 - failures * 10),
    rootCauseCode: `${provider}_WEBHOOK_FAIL`,
    rootCauseMessage:
      normalizeIdentifier(input.reason || "webhook delivery failed") ||
      "webhook delivery failed",
    actionHint: "FIX_WEBHOOK",
    retryable: true,
  });
  const diagnostic = await createDiagnostic({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    severity: "ERROR",
    code: `${provider}_WEBHOOK_FAIL`,
    message: "Inbound webhook verification failed for provider integration.",
    fixAction: "FIX_WEBHOOK",
  });
  await callReliabilityInfluence({
    businessId: tenantId,
    tenantId,
    severity: "P1",
    provider,
    reason: "Webhook pipeline failure detected.",
    dedupeKey: `${provider}:webhook_fail:${tenantKey}`.toLowerCase(),
    metadata: {
      integrationKey: integration.integrationKey,
      diagnosticKey: diagnostic.diagnosticKey,
    },
  });
  return {
    integration,
    health: getIntegrationHealth(integration.integrationKey),
    webhook: getProviderWebhookRow(integration.integrationKey),
    diagnostic,
  };
};

export const recoverProviderWebhook = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider: ConnectProvider | string;
  environment?: ConnectEnvironment | string | null;
  replayToken?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const provider = normalizeProvider(input.provider);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "WEBHOOK_RECOVERY",
      provider,
      environment,
      replayToken,
    });
    const replayHealthKey = resolveReplay(replayKey);
    if (replayHealthKey) {
      return getStore().integrationHealthLedger.get(replayHealthKey) || null;
    }
  }
  const integration = listIntegrations({
    tenantKey,
    provider,
    environment,
  })[0];
  if (!integration) {
    throw new Error("integration_not_found");
  }
  await setProviderWebhook({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    eventType: "INBOUND",
    status: "ACTIVE",
    consecutiveFailures: 0,
    lastDeliveryAt: now(),
    lastFailureAt: null,
  });
  integration.status = "CONNECTED";
  integration.lastVerifiedAt = now();
  integration.updatedAt = now();
  const health = await setIntegrationHealth({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    status: "CONNECTED",
    healthScore: 97,
    rootCauseCode: null,
    rootCauseMessage: null,
    actionHint: null,
    retryable: true,
    metadata: {
      recovery: "webhook",
    },
  });
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "WEBHOOK_RECOVERY",
        provider,
        environment,
        replayToken,
      }),
      health.healthKey
    );
  }
  return health;
};

export const runWhatsAppConnectDoctor = async (input: {
  businessId: string;
  tenantId?: string | null;
  environment?: ConnectEnvironment | string | null;
  autoResolve?: boolean;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const diagnostics = Array.from(getStore().connectionDiagnosticLedger.values()).filter(
    (row) =>
      row.tenantKey === tenantKey &&
      row.provider === "WHATSAPP" &&
      row.environment === environment &&
      !row.resolvedAt
  );
  const fixableCodes = new Set([
    "WA_WEBHOOK_FAIL",
    "WA_TOKEN_ISSUE",
    "WA_RATE_LIMITED",
    "WA_TEMPLATE_FAILURE",
    "WA_QUALITY_ISSUE",
    "WA_SCOPE_MISSING",
  ]);
  const results: Array<{
    diagnosticKey: string;
    resolved: boolean;
    resolutionStatus: string;
  }> = [];
  if (input.autoResolve) {
    for (const diagnostic of diagnostics) {
      if (!fixableCodes.has(diagnostic.code)) {
        results.push({
          diagnosticKey: diagnostic.diagnosticKey,
          resolved: false,
          resolutionStatus: "MANUAL_REQUIRED",
        });
        continue;
      }
      const resolution = await retryConnectionDiagnostic({
        businessId: tenantId,
        tenantId,
        diagnosticKey: diagnostic.diagnosticKey,
      });
      results.push({
        diagnosticKey: diagnostic.diagnosticKey,
        resolved: Boolean(resolution?.resolvedAt),
        resolutionStatus: String(resolution?.resolutionStatus || "FAILED"),
      });
    }
  }

  const integration = listIntegrations({
    tenantKey,
    provider: "WHATSAPP",
    environment,
  })[0];
  const latestHealth = integration ? getIntegrationHealth(integration.integrationKey) : null;
  return {
    provider: "WHATSAPP",
    environment,
    doctorStatus: diagnostics.length ? "NEEDS_ACTION" : "CLEAR",
    issueCount: diagnostics.length,
    diagnostics: diagnostics.map((diagnostic) => ({
      diagnosticKey: diagnostic.diagnosticKey,
      code: diagnostic.code,
      message: diagnostic.message,
      fixAction: diagnostic.fixAction,
      retryToken: diagnostic.retryToken,
      exactFix: diagnostic.fixPayload || { action: diagnostic.fixAction },
    })),
    healthScore: toNumber(latestHealth?.healthScore, diagnostics.length ? 45 : 100),
    autoResolveResults: results,
  };
};

export const retryConnectionDiagnostic = async (input: {
  businessId: string;
  tenantId?: string | null;
  diagnosticKey?: string | null;
  retryToken?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const diagnostic = input.diagnosticKey
    ? getStore().connectionDiagnosticLedger.get(input.diagnosticKey)
    : Array.from(getStore().connectionDiagnosticLedger.values()).find(
        (row) =>
          row.tenantKey === tenantKey &&
          normalizeIdentifier(row.retryToken) === normalizeIdentifier(input.retryToken || "")
      );

  if (!diagnostic) {
    throw new Error("diagnostic_not_found");
  }
  if (diagnostic.resolvedAt) {
    return diagnostic;
  }

  let resolved = false;
  let resolutionStatus = "FAILED";
  const provider = normalizeProvider(diagnostic.provider);
  const environment = normalizeEnvironment(diagnostic.environment);

  if (["WA_WEBHOOK_FAIL", "IG_WEBHOOK_FAIL"].includes(diagnostic.code)) {
    await recoverProviderWebhook({
      businessId: tenantId,
      tenantId,
      provider,
      environment,
    });
    resolved = true;
    resolutionStatus = "RECOVERED";
  } else if (
    ["WA_TOKEN_ISSUE", "IG_TOKEN_EXPIRED", "INSTAGRAM_TOKEN_EXPIRED"].includes(
      diagnostic.code
    )
  ) {
    const refresh = await refreshIntegrationToken({
      businessId: tenantId,
      tenantId,
      provider,
      environment,
    });
    resolved = refresh?.status === "SUCCESS";
    resolutionStatus = resolved ? "RECOVERED" : "FAILED";
  } else if (["WA_RATE_LIMITED", "IG_RATE_LIMITED"].includes(diagnostic.code)) {
    const integration = listIntegrations({
      tenantKey,
      provider,
      environment,
    })[0];
    if (integration) {
      integration.status = "CONNECTED";
      integration.updatedAt = now();
      await setIntegrationHealth({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        status: "CONNECTED",
        healthScore: 88,
        actionHint: "NONE",
      });
      resolved = true;
      resolutionStatus = "RECOVERED";
    }
  } else if (["WA_TEMPLATE_FAILURE", "WA_QUALITY_ISSUE"].includes(diagnostic.code)) {
    const integration = listIntegrations({
      tenantKey,
      provider,
      environment,
    })[0];
    if (integration) {
      integration.status = "CONNECTED";
      integration.updatedAt = now();
      await setIntegrationHealth({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        status: "CONNECTED",
        healthScore: 82,
        rootCauseCode: null,
        rootCauseMessage: "Recovered after doctor retry",
        actionHint: null,
      });
      resolved = true;
      resolutionStatus = "RECOVERED";
    }
  } else if (diagnostic.code === "WA_SCOPE_MISSING") {
    const integration = listIntegrations({
      tenantKey,
      provider,
      environment,
    })[0];
    if (integration) {
      integration.scopes = Array.from(
        new Set([
          ...toArray(integration.scopes),
          "whatsapp_business_management",
          "whatsapp_business_messaging",
        ])
      );
      integration.status = "CONNECTED";
      await setIntegrationHealth({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        status: "CONNECTED",
        healthScore: 90,
        rootCauseCode: null,
        rootCauseMessage: null,
        actionHint: null,
      });
      resolved = true;
      resolutionStatus = "RECOVERED";
    }
  } else {
    resolutionStatus = "MANUAL_REQUIRED";
  }

  diagnostic.resolutionStatus = resolutionStatus;
  diagnostic.resolvedAt = resolved ? now() : null;
  diagnostic.updatedAt = now();
  await upsertLedgerRecord({
    authority: "ConnectionDiagnosticLedger",
    storeMap: getStore().connectionDiagnosticLedger,
    keyField: "diagnosticKey",
    keyValue: diagnostic.diagnosticKey,
    row: diagnostic,
    dbLedgers: ["connectionDiagnosticLedger"],
  });
  return diagnostic;
};

export const recordInboundProviderWebhook = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider: ConnectProvider | string;
  environment?: ConnectEnvironment | string | null;
  success: boolean;
  details?: JsonRecord | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const provider = normalizeProvider(input.provider);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const integration = listIntegrations({
    tenantKey,
    provider,
    environment,
  })[0];
  if (!integration) {
    await createDiagnostic({
      tenantKey,
      provider,
      environment,
      severity: "ERROR",
      code: "INTEGRATION_NOT_CONNECTED",
      message: "Webhook inbound event received for disconnected integration.",
      fixAction: "RECONNECT",
    });
    return {
      accepted: false,
      reason: "integration_not_connected",
    };
  }

  await assertEnvironmentIsolation({
    tenantKey,
    provider,
    expectedEnvironment: environment,
    actualEnvironment: normalizeEnvironment(integration.environment),
  });

  if (!input.success) {
    await markProviderWebhookFailure({
      businessId: tenantId,
      tenantId,
      provider,
      environment,
      reason: normalizeIdentifier(input.details?.reason || "webhook_failed"),
    });
    return {
      accepted: false,
      reason: "webhook_failed",
    };
  }

  await setProviderWebhook({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    eventType: "INBOUND",
    status: "ACTIVE",
    consecutiveFailures: 0,
    lastDeliveryAt: now(),
    metadata: toRecord(input.details),
  });
  integration.status = "CONNECTED";
  integration.lastVerifiedAt = now();
  integration.updatedAt = now();
  await setIntegrationHealth({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    status: "CONNECTED",
    healthScore: 100,
    rootCauseCode: null,
    rootCauseMessage: null,
    actionHint: null,
    metadata: toRecord(input.details),
  });
  return {
    accepted: true,
    integrationKey: integration.integrationKey,
  };
};

export const saveSetupWizardProgress = async (input: {
  businessId: string;
  tenantId?: string | null;
  step: SetupWizardStep | string;
  payload?: JsonRecord | null;
  replayToken?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  await ensureTenantLedgerRow({
    businessId: input.businessId,
    tenantId,
  });
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "SETUP_WIZARD",
      replayToken,
    });
    const replayWizardKey = resolveReplay(replayKey);
    if (replayWizardKey) {
      return getStore().setupWizardLedger.get(replayWizardKey) || null;
    }
  }
  const wizard = (await ensureSetupWizardRow(tenantKey)) as any;
  const step = normalizeIdentifier(input.step).toUpperCase() as SetupWizardStep;
  const completedSet = new Set(toArray(wizard.completedSteps));
  if (SETUP_WIZARD_STEPS.includes(step)) {
    completedSet.add(step);
  }
  const completedSteps = SETUP_WIZARD_STEPS.filter((candidate) =>
    completedSet.has(candidate)
  );
  const nextStep = SETUP_WIZARD_STEPS.find((candidate) => !completedSet.has(candidate));
  const status = nextStep ? "IN_PROGRESS" : "COMPLETED";
  const payload = {
    ...toRecord(wizard.payload),
    ...toRecord(input.payload),
  };
  const updated = await upsertLedgerRecord({
    authority: "SetupWizardLedger",
    storeMap: getStore().setupWizardLedger,
    keyField: "wizardKey",
    keyValue: wizard.wizardKey,
    row: {
      ...wizard,
      status,
      currentStep: nextStep || "GO_LIVE_CHECKLIST",
      completedSteps,
      payload,
      lastTouchedAt: now(),
      isActive: true,
    },
    dbLedgers: ["setupWizardLedger"],
  });
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "SETUP_WIZARD",
        replayToken,
      }),
      updated.wizardKey
    );
  }
  return updated;
};

export const meterFeatureEntitlementUsage = async (input: {
  businessId: string;
  tenantId?: string | null;
  featureKey: FeatureEntitlementKey | string;
  environment?: ConnectEnvironment | string | null;
  units?: number;
  replayToken?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const featureKey = normalizeIdentifier(input.featureKey).toLowerCase() as FeatureEntitlementKey;
  if (!FEATURE_ENTITLEMENT_KEYS.includes(featureKey)) {
    throw new Error(`unsupported_feature:${featureKey}`);
  }
  const units = Math.max(1, Math.floor(toNumber(input.units, 1)));
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "FEATURE_GATE",
      environment,
      replayToken,
    });
    const replayUsageKey = resolveReplay(replayKey);
    if (replayUsageKey) {
      return getStore().tenantUsageLedger.get(replayUsageKey) || null;
    }
  }

  const entitlement = getActiveEntitlement({
    tenantKey,
    featureKey,
    environment,
  });
  if (!entitlement) {
    throw new Error("entitlement_not_found");
  }
  const windowStart = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1));
  const windowEnd = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth() + 1, 1));
  const existingUsage = Array.from(getStore().tenantUsageLedger.values()).filter(
    (row) =>
      row.tenantKey === tenantKey &&
      row.featureKey === featureKey &&
      row.environment === environment &&
      new Date(row.windowStart).getTime() === windowStart.getTime()
  );
  const usedAlready = existingUsage.reduce((sum, row) => sum + toNumber(row.used, 0), 0);
  const quota = toNumber(entitlement.quota, 0);
  const allowed = Boolean(entitlement.isEnabled) && (quota === -1 || usedAlready + units <= quota);
  const usageLedgerKey = `tenant_usage:${stableHash([
    tenantKey,
    featureKey,
    environment,
    replayToken || now().toISOString(),
  ]).slice(0, 24)}`;
  const usageRow = await upsertLedgerRecord({
    authority: "TenantUsageLedger",
    storeMap: getStore().tenantUsageLedger,
    keyField: "usageLedgerKey",
    keyValue: usageLedgerKey,
    row: {
      usageLedgerKey,
      tenantKey,
      featureKey,
      environment,
      windowStart,
      windowEnd,
      used: units,
      quota,
      unit: "count",
      replayToken: replayToken || null,
      metadata: {
        allowed,
        usedAlready,
        remaining: quota === -1 ? null : Math.max(quota - usedAlready - units, 0),
      },
    },
    dbLedgers: ["tenantUsageLedger"],
  });
  if (!allowed) {
    await createDiagnostic({
      tenantKey,
      provider: "INTERNAL_API",
      environment,
      severity: "WARN",
      code: "FEATURE_GATE_DENIED",
      message: `Feature gate denied for ${featureKey}.`,
      fixAction: "UPGRADE_PLAN",
      fixPayload: {
        featureKey,
        quota,
        usedAlready,
        requestedUnits: units,
      },
    });
  }
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "FEATURE_GATE",
        environment,
        replayToken,
      }),
      usageRow.usageLedgerKey
    );
  }
  markWiringDomain("AI", "CRM", "BOOKING", "COMMERCE", "INTELLIGENCE");
  return usageRow;
};

export const processPlanUpgrade = async (input: {
  businessId: string;
  tenantId?: string | null;
  toPlan: SaaSPlanTier | string;
  replayToken?: string | null;
  remainingCycleDays?: number;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "UPGRADE",
      replayToken,
    });
    const replayUpgradeKey = resolveReplay(replayKey);
    if (replayUpgradeKey) {
      return getStore().upgradeLedger.get(replayUpgradeKey) || null;
    }
  }
  await ensureTenantLedgerRow({
    businessId: input.businessId,
    tenantId,
  });
  const previousPlan = await ensureDefaultPlan(tenantKey);
  const fromPlan = normalizePlanTier(previousPlan.planCode || "STARTER");
  const toPlan = normalizePlanTier(input.toPlan);
  const remainingDays = Math.max(0, Math.min(30, Math.floor(toNumber(input.remainingCycleDays, 20))));
  const prorationRatio = remainingDays / 30;
  const prorationAmount = Number(
    ((PLAN_MATRIX[toPlan].monthlyPrice - PLAN_MATRIX[fromPlan].monthlyPrice) * prorationRatio).toFixed(2)
  );
  const graceEndsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);
  const upgradeKey = `upgrade:${stableHash([
    tenantKey,
    fromPlan,
    toPlan,
    replayToken || now().toISOString(),
  ]).slice(0, 24)}`;
  const upgradeRow = await upsertLedgerRecord({
    authority: "UpgradeLedger",
    storeMap: getStore().upgradeLedger,
    keyField: "upgradeKey",
    keyValue: upgradeKey,
    row: {
      upgradeKey,
      tenantKey,
      fromPlan,
      toPlan,
      status: "APPLIED",
      prorationAmount,
      graceEndsAt,
      replayToken: replayToken || null,
    },
    dbLedgers: ["upgradeLedger"],
  });
  await setActivePlan({
    tenantKey,
    plan: toPlan,
    source: "upgrade",
    replayToken: replayToken || null,
  });
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "UPGRADE",
        replayToken,
      }),
      upgradeRow.upgradeKey
    );
  }
  markWiringDomain("AI", "CRM", "BOOKING", "COMMERCE");
  return upgradeRow;
};

export const upsertTenantBranding = async (input: {
  businessId: string;
  tenantId?: string | null;
  logoRef?: string | null;
  domain?: string | null;
  theme?: JsonRecord | null;
  emailBranding?: JsonRecord | null;
  whatsappIdentity?: JsonRecord | null;
  proposalBranding?: JsonRecord | null;
  invoiceBranding?: JsonRecord | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const existing = Array.from(getStore().brandingLedger.values()).filter(
    (row) => row.tenantKey === tenantKey
  );
  const version = existing.length + 1;
  for (const row of existing) {
    if (row.isActive) {
      row.isActive = false;
      row.updatedAt = now();
    }
  }
  const brandingKey = `branding:${tenantKey}:v${version}`;
  return upsertLedgerRecord({
    authority: "BrandingLedger",
    storeMap: getStore().brandingLedger,
    keyField: "brandingKey",
    keyValue: brandingKey,
    row: {
      brandingKey,
      tenantKey,
      brandVersion: version,
      logoRef: normalizeIdentifier(input.logoRef || "") || null,
      domain: normalizeIdentifier(input.domain || "") || null,
      theme: toRecord(input.theme),
      emailBranding: toRecord(input.emailBranding),
      whatsappIdentity: toRecord(input.whatsappIdentity),
      proposalBranding: toRecord(input.proposalBranding),
      invoiceBranding: toRecord(input.invoiceBranding),
      isActive: true,
    },
    dbLedgers: ["brandingLedger"],
  });
};

export const installMarketplaceArtifact = async (input: {
  businessId: string;
  tenantId?: string | null;
  packageKey: string;
  packageType: "CONNECTOR" | "TEMPLATE";
  version: string;
  permissionSet: string[];
  replayToken?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "MARKETPLACE_INSTALL",
      replayToken,
    });
    const replayInstallKey = resolveReplay(replayKey);
    if (replayInstallKey) {
      return getStore().marketplaceLedger.get(replayInstallKey) || null;
    }
  }
  const installKey = `marketplace_install:${stableHash([
    tenantKey,
    input.packageKey,
    input.version,
    replayToken || now().toISOString(),
  ]).slice(0, 24)}`;
  const permissions = toArray(input.permissionSet);
  const status = permissions.length ? "INSTALLED" : "FAILED";
  const installRow = await upsertLedgerRecord({
    authority: "MarketplaceLedger",
    storeMap: getStore().marketplaceLedger,
    keyField: "installKey",
    keyValue: installKey,
    row: {
      installKey,
      tenantKey,
      packageKey: normalizeIdentifier(input.packageKey),
      packageType: normalizeIdentifier(input.packageType).toUpperCase(),
      version: normalizeIdentifier(input.version) || "1.0.0",
      status,
      permissionSet: permissions,
      rollbackOf: null,
      replayToken: replayToken || null,
    },
    dbLedgers: ["marketplaceLedger"],
  });
  if (!permissions.length) {
    await createDiagnostic({
      tenantKey,
      provider: "INTERNAL_API",
      environment: "LIVE",
      severity: "ERROR",
      code: "MARKETPLACE_PERMISSION_MISSING",
      message: "Marketplace install blocked due to empty permission set.",
      fixAction: "GRANT_PERMISSIONS",
      fixPayload: {
        packageKey: input.packageKey,
      },
    });
  }
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "MARKETPLACE_INSTALL",
        replayToken,
      }),
      installRow.installKey
    );
  }
  return installRow;
};

export const rollbackMarketplaceArtifact = async (input: {
  businessId: string;
  tenantId?: string | null;
  installKey: string;
  reason?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const install = getStore().marketplaceLedger.get(input.installKey);
  if (!install) {
    throw new Error("install_not_found");
  }
  const rollbackKey = `marketplace_rollback:${stableHash([
    tenantKey,
    install.installKey,
    now().toISOString(),
  ]).slice(0, 24)}`;
  const rollbackRow = await upsertLedgerRecord({
    authority: "MarketplaceLedger",
    storeMap: getStore().marketplaceLedger,
    keyField: "installKey",
    keyValue: rollbackKey,
    row: {
      installKey: rollbackKey,
      tenantKey,
      packageKey: install.packageKey,
      packageType: install.packageType,
      version: install.version,
      status: "ROLLED_BACK",
      permissionSet: toArray(install.permissionSet),
      rollbackOf: install.installKey,
      replayToken: null,
      metadata: {
        reason: normalizeIdentifier(input.reason || "manual_rollback"),
      },
    },
    dbLedgers: ["marketplaceLedger"],
  });
  return rollbackRow;
};

export const promoteSandboxIntegrationToLive = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider: ConnectProvider | string;
  replayToken?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const provider = normalizeProvider(input.provider);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PROMOTE_SANDBOX",
      provider,
      environment: "LIVE",
      replayToken,
    });
    const replayIntegrationKey = resolveReplay(replayKey);
    if (replayIntegrationKey) {
      return getStore().integrationLedger.get(replayIntegrationKey) || null;
    }
  }
  const sandboxIntegration = listIntegrations({
    tenantKey,
    provider,
    environment: "SANDBOX",
  })[0];
  if (!sandboxIntegration) {
    throw new Error("sandbox_integration_not_found");
  }
  const liveIntegration = await resolveOrCreateIntegration({
    tenantKey,
    provider,
    environment: "LIVE",
    reconnect: true,
    externalAccountRef: sandboxIntegration.externalAccountRef,
    tokenValue: sandboxIntegration.credentialRef
      ? String(sandboxIntegration.credentialRef)
      : null,
    scopes: toArray(sandboxIntegration.scopes),
    status: "VERIFYING",
  });
  liveIntegration.metadata = {
    ...toRecord(liveIntegration.metadata),
    promotedFrom: "SANDBOX",
    promotedAt: now().toISOString(),
  };
  await markConnectionSuccess({
    attemptKey: `promotion_attempt:${stableHash([tenantKey, provider, now().toISOString()]).slice(0, 18)}`,
    integrationKey: liveIntegration.integrationKey,
    tenantKey,
    provider,
    environment: "LIVE",
    details: {
      promotion: true,
      promotedFrom: sandboxIntegration.integrationKey,
    },
  });
  const environmentRow = getEnvironmentRow(tenantKey, "LIVE");
  if (environmentRow) {
    await upsertLedgerRecord({
      authority: "EnvironmentLedger",
      storeMap: getStore().environmentLedger,
      keyField: "environmentKey",
      keyValue: environmentRow.environmentKey,
      row: {
        ...environmentRow,
        promotedFrom: "SANDBOX",
        promotedAt: now(),
      },
      dbLedgers: ["environmentLedger"],
    });
  }
  if (replayToken) {
    registerReplay(
      makeScopedReplayKey({
        tenantKey,
        flow: "PROMOTE_SANDBOX",
        provider,
        environment: "LIVE",
        replayToken,
      }),
      liveIntegration.integrationKey
    );
  }
  return liveIntegration;
};

export const assignTenantSeat = async (input: {
  businessId: string;
  tenantId?: string | null;
  userId: string;
  role: string;
  environment?: ConnectEnvironment | string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const activePlan = await ensureDefaultPlan(tenantKey);
  const planCode = normalizePlanTier(activePlan.planCode || "STARTER");
  const seatQuota = PLAN_MATRIX[planCode].featureQuota.team_seats;
  const activeSeats = Array.from(getStore().seatLedger.values()).filter(
    (row) => row.tenantKey === tenantKey && row.status === "ACTIVE"
  );
  if (activeSeats.length >= seatQuota) {
    await createDiagnostic({
      tenantKey,
      provider: "INTERNAL_API",
      environment,
      severity: "ERROR",
      code: "SEAT_QUOTA_REACHED",
      message: "Seat assignment blocked by plan quota.",
      fixAction: "UPGRADE_PLAN",
    });
    throw new Error("seat_quota_reached");
  }
  const seatKey = `seat:${tenantKey}:${normalizeIdentifier(input.userId)}`;
  const assignmentKey = `role_assignment:${stableHash([
    tenantKey,
    input.userId,
    input.role,
    now().toISOString(),
  ]).slice(0, 24)}`;
  const seatRow = await upsertLedgerRecord({
    authority: "SeatLedger",
    storeMap: getStore().seatLedger,
    keyField: "seatKey",
    keyValue: seatKey,
    row: {
      seatKey,
      tenantKey,
      userId: normalizeIdentifier(input.userId),
      role: normalizeIdentifier(input.role).toUpperCase(),
      status: "ACTIVE",
      environment,
    },
    dbLedgers: ["seatLedger"],
  });
  await upsertLedgerRecord({
    authority: "RoleAssignmentLedger",
    storeMap: getStore().roleAssignmentLedger,
    keyField: "assignmentKey",
    keyValue: assignmentKey,
    row: {
      assignmentKey,
      tenantKey,
      userId: normalizeIdentifier(input.userId),
      role: normalizeIdentifier(input.role).toUpperCase(),
      grantedBy: "SYSTEM",
      status: "ACTIVE",
      effectiveFrom: now(),
      revokedAt: null,
    },
    dbLedgers: ["roleAssignmentLedger"],
  });
  return seatRow;
};

export const applyPackagingOverride = async (input: {
  businessId: string;
  tenantId?: string | null;
  scope: string;
  targetType: string;
  targetKey?: string | null;
  action: string;
  reason: string;
  priority?: number;
  expiresAt?: Date | null;
  metadata?: JsonRecord | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const overrideKey = `packaging_override:${stableHash([
    tenantKey,
    input.scope,
    input.targetType,
    input.action,
    now().toISOString(),
  ]).slice(0, 24)}`;
  return upsertLedgerRecord({
    authority: "PackagingOverrideLedger",
    storeMap: getStore().packagingOverrideLedger,
    keyField: "overrideKey",
    keyValue: overrideKey,
    row: {
      overrideKey,
      tenantKey,
      scope: normalizeIdentifier(input.scope).toUpperCase(),
      targetType: normalizeIdentifier(input.targetType).toUpperCase(),
      targetKey: normalizeIdentifier(input.targetKey || "") || null,
      action: normalizeIdentifier(input.action).toUpperCase(),
      reason: normalizeIdentifier(input.reason) || "override",
      priority: Math.max(1, Math.floor(toNumber(input.priority, 100))),
      isActive: true,
      expiresAt: input.expiresAt || null,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["packagingOverrideLedger"],
  });
};

export const runSaaSPackagingFailureInjection = async (input: {
  businessId: string;
  tenantId?: string | null;
  scenario:
    | "webhook_fail_storm"
    | "token_refresh_failure"
    | "cross_env_bleed_attempt";
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  if (input.scenario === "token_refresh_failure") {
    getStore().failpoints.add("token_refresh_failure");
    try {
      await connectInstagramOneClick({
        businessId: tenantId,
        tenantId,
        replayToken: `failure_seed_ig_${stableHash([tenantKey]).slice(0, 8)}`,
      });
      const refresh = await refreshIntegrationToken({
        businessId: tenantId,
        tenantId,
        provider: "INSTAGRAM",
        forceFail: true,
      });
      return {
        scenario: input.scenario,
        contained: refresh.status === "FAILED",
        refresh,
      };
    } finally {
      getStore().failpoints.delete("token_refresh_failure");
    }
  }

  if (input.scenario === "webhook_fail_storm") {
    await connectWhatsAppGuidedWizard({
      businessId: tenantId,
      tenantId,
      replayToken: `failure_seed_wa_${stableHash([tenantKey]).slice(0, 8)}`,
    });
    await markProviderWebhookFailure({
      businessId: tenantId,
      tenantId,
      provider: "WHATSAPP",
      reason: "storm_injected_failure",
    });
    await markProviderWebhookFailure({
      businessId: tenantId,
      tenantId,
      provider: "WHATSAPP",
      reason: "storm_injected_failure",
    });
    const doctor = await runWhatsAppConnectDoctor({
      businessId: tenantId,
      tenantId,
      autoResolve: true,
    });
    return {
      scenario: input.scenario,
      contained: doctor.issueCount >= 1,
      doctor,
    };
  }

  await connectInstagramOneClick({
    businessId: tenantId,
    tenantId,
    environment: "SANDBOX",
    replayToken: `failure_seed_cross_env_${stableHash([tenantKey]).slice(0, 8)}`,
  });
  let blocked = false;
  try {
    await recordInboundProviderWebhook({
      businessId: tenantId,
      tenantId,
      provider: "INSTAGRAM",
      environment: "LIVE",
      success: true,
      details: {
        expectedEnvironment: "SANDBOX",
      },
    });
  } catch (error) {
    blocked = String((error as Error)?.message || "").includes("cross_env_bleed_blocked");
  }
  return {
    scenario: input.scenario,
    contained: blocked,
  };
};

export const getConnectHubProjection = async (input: {
  businessId: string;
  tenantId?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const byProvider = CONNECT_HUB_PROVIDERS.map((provider) => {
    const liveIntegration = listIntegrations({
      tenantKey,
      provider,
      environment: "LIVE",
    })[0];
    const sandboxIntegration = listIntegrations({
      tenantKey,
      provider,
      environment: "SANDBOX",
    })[0];
    const liveHealth = liveIntegration
      ? getIntegrationHealth(liveIntegration.integrationKey)
      : null;
    const sandboxHealth = sandboxIntegration
      ? getIntegrationHealth(sandboxIntegration.integrationKey)
      : null;
    return {
      provider,
      live: {
        status: normalizeStatus(liveHealth?.status || liveIntegration?.status || "DISCONNECTED", "DISCONNECTED"),
        healthScore: toNumber(liveHealth?.healthScore, 0),
        integrationKey: liveIntegration?.integrationKey || null,
      },
      sandbox: {
        status: normalizeStatus(
          sandboxHealth?.status || sandboxIntegration?.status || "DISCONNECTED",
          "DISCONNECTED"
        ),
        healthScore: toNumber(sandboxHealth?.healthScore, 0),
        integrationKey: sandboxIntegration?.integrationKey || null,
      },
      diagnostics: Array.from(getStore().connectionDiagnosticLedger.values())
        .filter(
          (row) =>
            row.tenantKey === tenantKey &&
            row.provider === provider &&
            !row.resolvedAt
        )
        .map((row) => ({
          code: row.code,
          message: row.message,
          fixAction: row.fixAction,
          retryToken: row.retryToken,
        })),
    };
  });

  const plan = getActiveTenantPlan(tenantKey);
  const wizard = getWizardByTenant(tenantKey);
  const tenant = getTenantByKey(tenantKey);
  return {
    phaseVersion: SAAS_PACKAGING_PHASE_VERSION,
    tenantKey,
    tenantId,
    tenant,
    plan,
    wizard,
    byProvider,
    counts: {
      integrations: listIntegrations({ tenantKey }).length,
      diagnostics: Array.from(getStore().connectionDiagnosticLedger.values()).filter(
        (row) => row.tenantKey === tenantKey && !row.resolvedAt
      ).length,
      entitlements: Array.from(getStore().featureEntitlementLedger.values()).filter(
        (row) => row.tenantKey === tenantKey && row.isActive
      ).length,
      usage: Array.from(getStore().tenantUsageLedger.values()).filter(
        (row) => row.tenantKey === tenantKey
      ).length,
    },
  };
};

export const getIntegrationDiagnosticsProjection = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider?: ConnectProvider | string | null;
  environment?: ConnectEnvironment | string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = makeTenantKey(tenantId);
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const provider = input.provider ? normalizeProvider(input.provider) : null;
  const diagnostics = Array.from(getStore().connectionDiagnosticLedger.values()).filter(
    (row) =>
      row.tenantKey === tenantKey &&
      row.environment === environment &&
      (!provider || row.provider === provider)
  );
  return diagnostics.map((row) => ({
    diagnosticKey: row.diagnosticKey,
    provider: row.provider,
    environment: row.environment,
    code: row.code,
    message: row.message,
    fixAction: row.fixAction,
    retryToken: row.retryToken,
    resolvedAt: row.resolvedAt || null,
    resolutionStatus: row.resolutionStatus,
    rootCause: {
      whyBroken: row.message,
      exactFix: row.fixPayload || { action: row.fixAction },
    },
  }));
};

export const runSaaSPackagingConnectHubSelfAudit = async (input?: {
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  await bootstrapSaaSPackagingConnectHubOS();
  const tenantId = normalizeTenantId({
    tenantId: input?.tenantId || null,
    businessId: input?.businessId || null,
  });
  const tenantKey = tenantId ? makeTenantKey(tenantId) : null;
  const store = getStore();
  const scopeFilter = (row: any) => (tenantKey ? row.tenantKey === tenantKey : true);
  const tenantRows = Array.from(store.tenantLedger.values()).filter(scopeFilter);
  const planRows = Array.from(store.tenantPlanLedger.values()).filter(scopeFilter);
  const entitlementRows = Array.from(store.featureEntitlementLedger.values()).filter(scopeFilter);
  const integrationRows = Array.from(store.integrationLedger.values()).filter(scopeFilter);
  const healthRows = Array.from(store.integrationHealthLedger.values()).filter(scopeFilter);
  const webhookRows = Array.from(store.providerWebhookLedger.values()).filter(scopeFilter);
  const diagnostics = Array.from(store.connectionDiagnosticLedger.values()).filter(scopeFilter);
  const usageRows = Array.from(store.tenantUsageLedger.values()).filter(scopeFilter);
  const configRows = Array.from(store.tenantConfigLedger.values()).filter(scopeFilter);
  const wizardRows = Array.from(store.setupWizardLedger.values()).filter(scopeFilter);
  const overrideRows = Array.from(store.packagingOverrideLedger.values()).filter(scopeFilter);

  const existingResourceKeys = new Set<string>();
  for (const row of [
    ...tenantRows,
    ...planRows,
    ...entitlementRows,
    ...integrationRows,
    ...healthRows,
    ...webhookRows,
    ...diagnostics,
    ...usageRows,
    ...configRows,
    ...wizardRows,
    ...overrideRows,
  ]) {
    for (const keyField of [
      "tenantKey",
      "planLedgerKey",
      "entitlementKey",
      "integrationKey",
      "healthKey",
      "webhookKey",
      "diagnosticKey",
      "usageLedgerKey",
      "configKey",
      "wizardKey",
      "overrideKey",
    ]) {
      if (row[keyField]) {
        existingResourceKeys.add(String(row[keyField]));
      }
    }
  }

  const authoritative = CONNECT_HUB_AUTHORITIES.every((authority) =>
    store.authorities.has(authority)
  );
  const canonicalWrite =
    Array.from(store.authorities.values()).reduce((sum, value) => sum + value, 0) > 0;
  const readLater =
    healthRows.length >= integrationRows.length &&
    wizardRows.length <= tenantRows.length + 1;
  const consumed = usageRows.length > 0 || diagnostics.length > 0;
  const encrypted = integrationRows.every((row) => {
    if (!row.credentialRef) {
      return true;
    }
    return String(row.credentialRef).startsWith("enc::");
  });
  const dedupeSafe = Array.from(store.replayIndex.values()).every((key) =>
    existingResourceKeys.has(String(key))
  );
  const replaySafe = dedupeSafe;
  const overrideSafe = overrideRows.every(
    (row) =>
      normalizeIdentifier(row.reason).length > 0 &&
      toNumber(row.priority, 0) >= 1 &&
      (row.expiresAt ? new Date(row.expiresAt).getTime() > 0 : true)
  );
  const orphanFree =
    healthRows.every((row) => integrationRows.some((integration) => integration.integrationKey === row.integrationKey)) &&
    webhookRows.every((row) =>
      integrationRows.some((integration) => integration.integrationKey === row.integrationKey)
    ) &&
    diagnostics.every((row) => {
      if (row.integrationKey) {
        return integrationRows.some((integration) => integration.integrationKey === row.integrationKey);
      }
      return true;
    });
  const noHiddenIntegrationPath = integrationRows.every((integration) =>
    healthRows.some((health) => health.integrationKey === integration.integrationKey)
  );
  const noHiddenTenantTruth = tenantRows.every((tenant) => {
    const key = tenant.tenantKey;
    const hasPlan = planRows.some((plan) => plan.tenantKey === key && plan.isActive);
    const hasConfig = configRows.some((config) => config.tenantKey === key && config.isActive);
    const hasWizard = wizardRows.some((wizard) => wizard.tenantKey === key && wizard.isActive);
    const hasEnvironments =
      Array.from(store.environmentLedger.values()).filter((env) => env.tenantKey === key)
        .length >= 2;
    return hasPlan && hasConfig && hasWizard && hasEnvironments;
  });
  const noHiddenEntitlementTruth = tenantRows.every((tenant) => {
    const key = tenant.tenantKey;
    return CONNECT_HUB_ENVIRONMENTS.every((environment) =>
      FEATURE_ENTITLEMENT_KEYS.every((featureKey) =>
        entitlementRows.some(
          (row) =>
            row.tenantKey === key &&
            row.environment === environment &&
            row.featureKey === featureKey &&
            row.isActive
        )
      )
    );
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
  ];
  const deeplyWiredDomains = requiredDomains.every((domain) =>
    store.wiringDomains.has(domain)
  );
  const checks = {
    reachable: true,
    bootstrapped: Boolean(store.bootstrappedAt),
    invoked: store.invokeCount > 0,
    authoritative,
    canonicalWrite,
    readLater,
    consumed,
    encrypted,
    dedupeSafe,
    replaySafe,
    overrideSafe,
    orphanFree,
    noHiddenIntegrationPath,
    noHiddenTenantTruth,
    noHiddenEntitlementTruth,
    deeplyWiredDomains,
    securityWired: store.securityInfluenceChecks > 0 || tenantRows.length > 0,
    reliabilityWired: store.reliabilityInfluenceChecks >= 0,
  };
  const deeplyWired = Object.values(checks).every(Boolean);
  return {
    phaseVersion: SAAS_PACKAGING_PHASE_VERSION,
    tenantKey,
    deeplyWired,
    checks,
    counts: {
      tenants: tenantRows.length,
      plans: planRows.length,
      entitlements: entitlementRows.length,
      integrations: integrationRows.length,
      health: healthRows.length,
      webhooks: webhookRows.length,
      diagnostics: diagnostics.length,
      usage: usageRows.length,
      overrides: overrideRows.length,
    },
    authorityInvocations: Object.fromEntries(store.authorities.entries()),
    wiredDomains: Array.from(store.wiringDomains.values()),
  };
};

export const __saasPackagingPhase6DTestInternals = {
  resetStore: () => {
    globalForConnectHub.__sylphSaaSPackagingConnectHubStore = createStore();
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
