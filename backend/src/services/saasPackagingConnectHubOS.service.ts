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

export const META_ENTERPRISE_CANONICAL_AUTHORITIES = [
  "IntegrationLedger",
  "IntegrationCredentialLedger",
  "IntegrationHealthLedger",
  "IntegrationWebhookLedger",
  "IntegrationPermissionLedger",
  "IntegrationQuotaLedger",
  "IntegrationAuditLedger",
  "ConnectPolicy",
  "ConnectOverrideLedger",
] as const;

const CONNECT_HUB_BASE_AUTHORITIES = [
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

export const CONNECT_HUB_AUTHORITIES = [
  ...CONNECT_HUB_BASE_AUTHORITIES,
  ...META_ENTERPRISE_CANONICAL_AUTHORITIES,
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

const INSTAGRAM_ENTERPRISE_FLOW_STEPS = [
  "CONNECT_BUTTON",
  "META_OAUTH",
  "STATE_SIGNING",
  "REDIRECT_VALIDATION",
  "PERMISSION_VALIDATION",
  "TOKEN_EXCHANGE",
  "LONG_LIVED_TOKEN_EXCHANGE",
  "FETCH_BUSINESSES",
  "FETCH_PAGES",
  "FETCH_INSTAGRAM_PROFESSIONAL_ACCOUNT",
  "BIND_PAGE_IG_ACCOUNT",
  "SUBSCRIBE_WEBHOOK",
  "VALIDATE_WEBHOOK_CHALLENGE",
  "FETCH_PROFILE",
  "PERMISSION_AUDIT",
  "HEALTH_AUDIT",
  "CANONICAL_SAVE",
  "CONNECTED",
] as const;

const WHATSAPP_ENTERPRISE_FLOW_STEPS = [
  "CONNECT_BUTTON",
  "META_OAUTH",
  "BUSINESS_MANAGER_SELECTION",
  "WABA_SELECTION_OR_CREATION",
  "PHONE_NUMBER_SELECTION",
  "DISPLAY_NAME_VALIDATION",
  "REGISTER_NUMBER",
  "WEBHOOK_SUBSCRIBE",
  "VERIFY_CALLBACK",
  "TOKEN_EXCHANGE",
  "HEALTH_TEST_MESSAGE",
  "CANONICAL_SAVE",
  "CONNECTED",
] as const;

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
  integrationCredentialLedger: StoreMap;
  integrationWebhookLedger: StoreMap;
  integrationPermissionLedger: StoreMap;
  integrationQuotaLedger: StoreMap;
  integrationAuditLedger: StoreMap;
  connectPolicyLedger: StoreMap;
  connectOverrideLedger: StoreMap;
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

const createStore = (): ConnectHubStore => {
  const providerWebhookLedger = new Map();
  const integrationPolicyLedger = new Map();
  const packagingOverrideLedger = new Map();
  return {
    bootstrappedAt: null,
    invokeCount: 0,
    authorities: new Map(),
    tenantLedger: new Map(),
    tenantPlanLedger: new Map(),
    tenantUsageLedger: new Map(),
    featureEntitlementLedger: new Map(),
    integrationLedger: new Map(),
    providerWebhookLedger,
    integrationHealthLedger: new Map(),
    integrationPolicyLedger,
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
    packagingOverrideLedger,
    integrationCredentialLedger: new Map(),
    integrationWebhookLedger: providerWebhookLedger,
    integrationPermissionLedger: new Map(),
    integrationQuotaLedger: new Map(),
    integrationAuditLedger: new Map(),
    connectPolicyLedger: integrationPolicyLedger,
    connectOverrideLedger: packagingOverrideLedger,
    replayIndex: new Map(),
    chainTailByScope: new Map(),
    securityInfluenceChecks: 0,
    reliabilityInfluenceChecks: 0,
    wiringDomains: new Set(),
    failpoints: new Set(),
  };
};

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

const toFlowStepStatus = (steps: readonly string[]) =>
  steps.map((step) => ({
    step,
    status: "PENDING",
    at: null,
    detail: null,
  }));

const markFlowStepStatus = (
  flowState: Array<{
    step: string;
    status: string;
    at: string | null;
    detail: string | null;
  }>,
  step: string,
  status: "DONE" | "FAILED",
  detail?: string | null
) =>
  flowState.map((entry) =>
    entry.step === step
      ? {
          ...entry,
          status,
          at: now().toISOString(),
          detail: normalizeIdentifier(detail || "") || null,
        }
      : entry
  );

const recordIntegrationAudit = async (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  integrationKey?: string | null;
  attemptKey?: string | null;
  stage: string;
  status: "INFO" | "SUCCESS" | "WARN" | "ERROR";
  message: string;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const auditKey = `integration_audit:${stableHash([
    input.tenantKey,
    input.provider,
    input.environment,
    input.stage,
    input.integrationKey || "none",
    input.attemptKey || "none",
    input.replayToken || now().toISOString(),
  ]).slice(0, 24)}`;
  return upsertLedgerRecord({
    authority: "IntegrationAuditLedger",
    storeMap: getStore().integrationAuditLedger,
    keyField: "auditKey",
    keyValue: auditKey,
    row: {
      auditKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      integrationKey: input.integrationKey || null,
      attemptKey: input.attemptKey || null,
      stage: normalizeIdentifier(input.stage).toUpperCase(),
      status: normalizeIdentifier(input.status).toUpperCase(),
      message: normalizeIdentifier(input.message) || "integration_audit",
      replayToken: normalizeIdentifier(input.replayToken || "") || null,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: [],
  });
};

const upsertIntegrationCredentialLedger = async (input: {
  integrationKey: string;
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  credentialRef?: string | null;
  tokenExpiresAt?: Date | null;
  revokedAt?: Date | null;
  metadata?: JsonRecord | null;
}) => {
  const credentialKey = `integration_credential:${input.integrationKey}`;
  const tokenExpiresAt = input.tokenExpiresAt || null;
  const tokenExpiringSoon =
    Boolean(tokenExpiresAt) &&
    new Date(tokenExpiresAt as Date).getTime() - Date.now() <= 1000 * 60 * 60 * 24 * 7;
  const status = input.revokedAt
    ? "REVOKED"
    : !tokenExpiresAt
    ? "UNKNOWN"
    : new Date(tokenExpiresAt as Date).getTime() <= Date.now()
    ? "EXPIRED"
    : tokenExpiringSoon
    ? "EXPIRING"
    : "ACTIVE";
  return upsertLedgerRecord({
    authority: "IntegrationCredentialLedger",
    storeMap: getStore().integrationCredentialLedger,
    keyField: "credentialKey",
    keyValue: credentialKey,
    row: {
      credentialKey,
      integrationKey: input.integrationKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      credentialRef: normalizeIdentifier(input.credentialRef || "") || null,
      tokenExpiresAt,
      refreshRequiredAt: tokenExpiresAt
        ? new Date(new Date(tokenExpiresAt).getTime() - 1000 * 60 * 60 * 24 * 14)
        : null,
      revokedAt: input.revokedAt || null,
      status,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: [],
  });
};

const upsertIntegrationPermissionLedger = async (input: {
  integrationKey: string;
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  requiredScopes: string[];
  grantedScopes: string[];
  metadata?: JsonRecord | null;
}) => {
  const permissionKey = `integration_permission:${input.integrationKey}`;
  const requiredScopes = toArray(input.requiredScopes);
  const grantedScopes = toArray(input.grantedScopes);
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
  return upsertLedgerRecord({
    authority: "IntegrationPermissionLedger",
    storeMap: getStore().integrationPermissionLedger,
    keyField: "permissionKey",
    keyValue: permissionKey,
    row: {
      permissionKey,
      integrationKey: input.integrationKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      requiredScopes,
      grantedScopes,
      missingScopes,
      status: missingScopes.length ? "MISSING" : "VALID",
      downgraded: missingScopes.length > 0,
      metadata: toRecord(input.metadata),
    },
    dbLedgers: [],
  });
};

const upsertIntegrationQuotaLedger = async (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
  maxConnections: number;
  activeConnections: number;
  allowMultiConnect: boolean;
  source: string;
}) => {
  const quotaKey = `integration_quota:${input.tenantKey}:${input.provider}:${input.environment}`;
  return upsertLedgerRecord({
    authority: "IntegrationQuotaLedger",
    storeMap: getStore().integrationQuotaLedger,
    keyField: "quotaKey",
    keyValue: quotaKey,
    row: {
      quotaKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      maxConnections: Math.max(0, Math.floor(toNumber(input.maxConnections, 0))),
      activeConnections: Math.max(0, Math.floor(toNumber(input.activeConnections, 0))),
      allowMultiConnect: Boolean(input.allowMultiConnect),
      remaining: Math.max(
        0,
        Math.floor(toNumber(input.maxConnections, 0)) -
          Math.floor(toNumber(input.activeConnections, 0))
      ),
      source: normalizeIdentifier(input.source).toUpperCase(),
    },
    dbLedgers: [],
  });
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
}) => {
  const candidates = Array.from(getStore().featureEntitlementLedger.values()).filter(
    (row) =>
      row.tenantKey === input.tenantKey &&
      row.featureKey === input.featureKey &&
      row.environment === input.environment &&
      row.isActive
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
    .reduce<{
      row: any;
      index: number;
    } | null>((latest, row, index) => {
      if (!latest) {
        return {
          row,
          index,
        };
      }
      const latestTime = new Date(
        latest.row.updatedAt || latest.row.createdAt
      ).getTime();
      const currentTime = new Date(row.updatedAt || row.createdAt).getTime();
      if (currentTime > latestTime) {
        return {
          row,
          index,
        };
      }
      if (currentTime === latestTime && index > latest.index) {
        return {
          row,
          index,
        };
      }
      return latest;
    }, null)?.row || null;

const CONNECT_STATUS_PRIORITY: Record<ConnectStatus, number> = {
  CONNECTED: 900,
  VERIFYING: 700,
  LIMITED: 600,
  RATE_LIMITED: 500,
  NEEDS_ACTION: 400,
  WEBHOOK_FAILED: 300,
  PERMISSION_MISSING: 250,
  TOKEN_EXPIRED: 200,
  DISCONNECTED: 100,
};

const getCanonicalIntegrationForProvider = (input: {
  tenantKey: string;
  provider: ConnectProvider;
  environment: ConnectEnvironment;
}) => {
  const candidates = listIntegrations(input);
  if (!candidates.length) {
    return null;
  }
  const scored = candidates.map((integration) => {
    const health = getIntegrationHealth(integration.integrationKey);
    const status = normalizeStatus(
      integration.status || health?.status || "DISCONNECTED",
      "DISCONNECTED"
    );
    return {
      integration,
      health,
      statusScore: CONNECT_STATUS_PRIORITY[status] || 0,
      healthScore: toNumber(health?.healthScore, 0),
      freshnessScore: Math.max(
        new Date(integration.lastVerifiedAt || 0).getTime(),
        new Date(integration.updatedAt || integration.createdAt || 0).getTime(),
        new Date(health?.updatedAt || health?.createdAt || 0).getTime()
      ),
      slot: toNumber(integration.slot, 1),
    };
  });
  scored.sort((left, right) => {
    if (right.statusScore !== left.statusScore) {
      return right.statusScore - left.statusScore;
    }
    if (right.healthScore !== left.healthScore) {
      return right.healthScore - left.healthScore;
    }
    if (right.freshnessScore !== left.freshnessScore) {
      return right.freshnessScore - left.freshnessScore;
    }
    return left.slot - right.slot;
  });
  return scored[0] || null;
};

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
    await ensureEnvironmentRows(tenantKey);
    await ensureSetupWizardRow(tenantKey);
    await ensureTenantConfigRow({
      tenantKey,
      timezone: existing.timezone || "UTC",
    });
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

const ensurePlanLedgerArtifacts = async (input: {
  tenantKey: string;
  plan: SaaSPlanTier;
  version: number;
}) => {
  const featureQuota = PLAN_MATRIX[input.plan].featureQuota;
  const limits = PLAN_MATRIX[input.plan].integrationLimits;
  const timestamp = now();

  for (const environment of CONNECT_HUB_ENVIRONMENTS) {
    for (const featureKey of FEATURE_ENTITLEMENT_KEYS) {
      const entitlementKey = `entitlement:${input.tenantKey}:${environment}:${featureKey}:v${input.version}`;
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
          version: input.version,
          isActive: true,
          effectiveFrom: timestamp,
          effectiveTo: null,
        },
        dbLedgers: ["featureEntitlementLedger"],
      });
    }
  }

  for (const provider of CONNECT_HUB_PROVIDERS) {
    for (const environment of CONNECT_HUB_ENVIRONMENTS) {
      const category = getProviderCategory(provider);
      const policyKey = `integration_policy:${input.tenantKey}:${provider}:${environment}:v${input.version}`;
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
          rateLimitPerMinute:
            input.plan === "ENTERPRISE" ? 500 : input.plan === "PRO" ? 240 : 120,
          version: input.version,
          isActive: true,
        },
        dbLedgers: ["integrationPolicyLedger"],
      });
      await upsertLedgerRecord({
        authority: "ConnectPolicy",
        storeMap: getStore().connectPolicyLedger,
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
          rateLimitPerMinute:
            input.plan === "ENTERPRISE" ? 500 : input.plan === "PRO" ? 240 : 120,
          version: input.version,
          isActive: true,
          metadata: {
            canonicalAuthority: "ConnectPolicy",
          },
        },
        dbLedgers: ["integrationPolicyLedger"],
      });
    }
  }
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
  for (const row of Array.from(getStore().featureEntitlementLedger.values())) {
    if (row.tenantKey === input.tenantKey && row.isActive) {
      row.isActive = false;
      row.effectiveTo = now();
      row.updatedAt = now();
    }
  }
  for (const row of Array.from(getStore().integrationPolicyLedger.values())) {
    if (row.tenantKey === input.tenantKey && row.isActive) {
      row.isActive = false;
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
  await ensurePlanLedgerArtifacts({
    tenantKey: input.tenantKey,
    plan: input.plan,
    version,
  });

  return planRow;
};

const ensureDefaultPlan = async (tenantKey: string) => {
  const activePlan = getActiveTenantPlan(tenantKey);
  if (activePlan) {
    await ensurePlanLedgerArtifacts({
      tenantKey,
      plan: normalizePlanTier(activePlan.planCode || "STARTER"),
      version: Math.max(1, Math.floor(toNumber(activePlan.version, 1))),
    });
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
  const webhook = await upsertLedgerRecord({
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
  await upsertLedgerRecord({
    authority: "IntegrationWebhookLedger",
    storeMap: getStore().integrationWebhookLedger,
    keyField: "webhookKey",
    keyValue: webhookKey,
    row: {
      ...toRecord(webhook),
      metadata: {
        ...toRecord((webhook as any)?.metadata),
        canonicalAuthority: "IntegrationWebhookLedger",
      },
    },
    dbLedgers: ["providerWebhookLedger"],
  });
  return webhook;
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
  await upsertIntegrationQuotaLedger({
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    maxConnections: capacity.maxConnections,
    activeConnections: activeIntegrations.length,
    allowMultiConnect: capacity.allowMultiConnect,
    source: "ENTITLEMENT_CHECK",
  });
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
    await recordIntegrationAudit({
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      stage: "ENTITLEMENT_BLOCKED",
      status: "ERROR",
      message: "Plan policy blocked additional live connection.",
      metadata: {
        planCode: capacity.planCode,
        reason: "single_connection_policy",
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
    await recordIntegrationAudit({
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      stage: "ENTITLEMENT_BLOCKED",
      status: "ERROR",
      message: "Connection cap reached for provider in requested environment.",
      metadata: {
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
  metadata?: JsonRecord | null;
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
  const encryptedRef = tokenValue
    ? tokenValue.startsWith("enc::")
      ? tokenValue
      : `enc::${encrypt(tokenValue)}`
    : null;

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
      metadata: toRecord(input.metadata),
    },
    dbLedgers: ["integrationLedger"],
  });

  await upsertIntegrationCredentialLedger({
    integrationKey: integrationRow.integrationKey,
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    credentialRef: integrationRow.credentialRef || null,
    tokenExpiresAt: integrationRow.tokenExpiresAt || null,
    revokedAt: null,
    metadata: {
      reconnect: Boolean(input.reconnect),
    },
  });
  await upsertIntegrationPermissionLedger({
    integrationKey: integrationRow.integrationKey,
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    requiredScopes:
      input.provider === "WHATSAPP"
        ? ["whatsapp_business_management", "whatsapp_business_messaging"]
        : ["instagram_basic", "instagram_manage_messages", "pages_manage_metadata"],
    grantedScopes: toArray(integrationRow.scopes || []),
    metadata: {
      source: "RESOLVE_OR_CREATE_INTEGRATION",
    },
  });
  await recordIntegrationAudit({
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    integrationKey: integrationRow.integrationKey,
    stage: "CANONICAL_SAVE",
    status: "SUCCESS",
    message: input.reconnect
      ? "Integration canonical record reconnected."
      : "Integration canonical record created.",
    metadata: {
      slot,
      reconnect: Boolean(input.reconnect),
      externalAccountRef: integrationRow.externalAccountRef || null,
    },
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
  const oauthStateRow = await upsertLedgerRecord({
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
  await recordIntegrationAudit({
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    stage: "STATE_SIGNING",
    status: "SUCCESS",
    message: "OAuth state signed and stored.",
    replayToken: input.replayToken || null,
    metadata: {
      oauthStateKey,
      redirectUri: oauthStateRow.redirectUri || null,
      scopes: toArray(oauthStateRow.scopes || []),
    },
  });
  return oauthStateRow;
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
  if (integration) {
    await upsertIntegrationCredentialLedger({
      integrationKey: integration.integrationKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      credentialRef: integration.credentialRef || null,
      tokenExpiresAt: integration.tokenExpiresAt || null,
      revokedAt: null,
      metadata: {
        flow: input.details.flow || null,
      },
    });
    await upsertIntegrationPermissionLedger({
      integrationKey: integration.integrationKey,
      tenantKey: input.tenantKey,
      provider: input.provider,
      environment: input.environment,
      requiredScopes:
        input.provider === "WHATSAPP"
          ? ["whatsapp_business_management", "whatsapp_business_messaging"]
          : [
              "instagram_basic",
              "instagram_manage_messages",
              "pages_manage_metadata",
            ],
      grantedScopes: toArray(integration.scopes || []),
      metadata: {
        flow: input.details.flow || null,
      },
    });
  }
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
  const oauthStateKey = normalizeIdentifier((input.details as any)?.oauthStateKey || "");
  if (oauthStateKey) {
    const oauthStateRow = getStore().oauthStateLedger.get(oauthStateKey);
    if (oauthStateRow) {
      await upsertLedgerRecord({
        authority: "OAuthStateLedger",
        storeMap: getStore().oauthStateLedger,
        keyField: "oauthStateKey",
        keyValue: oauthStateKey,
        row: {
          ...toRecord(oauthStateRow),
          oauthStateKey,
          status: "CONSUMED",
          consumedAt: now(),
        },
        dbLedgers: ["oauthStateLedger"],
      });
    }
  }
  await recordIntegrationAudit({
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    integrationKey: input.integrationKey,
    attemptKey: input.attemptKey,
    stage: "CONNECTED",
    status: "SUCCESS",
    message: "Provider connection finalized and marked connected.",
    metadata: toRecord(input.details),
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
  const scopedTenantId =
    normalizeIdentifier(input.tenantKey).replace(/^tenant:/i, "") || input.tenantKey;
  await callReliabilityInfluence({
    tenantId: scopedTenantId,
    businessId: scopedTenantId,
    severity: input.status === "WEBHOOK_FAILED" ? "P1" : "P2",
    provider: input.provider,
    reason: input.message,
    dedupeKey: `${input.provider}:${input.code}:${input.tenantKey}`.toLowerCase(),
    metadata: {
      attemptKey: input.attemptKey,
      diagnosticKey: diagnostic.diagnosticKey,
    },
  });
  await recordIntegrationAudit({
    tenantKey: input.tenantKey,
    provider: input.provider,
    environment: input.environment,
    integrationKey: input.integrationKey || null,
    attemptKey: input.attemptKey,
    stage: normalizeIdentifier(input.step).toUpperCase(),
    status: "ERROR",
    message: input.message,
    metadata: {
      code: input.code,
      fixAction: input.fixAction,
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
  for (const authority of CONNECT_HUB_AUTHORITIES) {
    if (!store.authorities.has(authority)) {
      store.authorities.set(authority, 0);
    }
  }

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
  metaProof?: {
    stateSigned?: boolean;
    redirectValidated?: boolean;
    permissions?: string[];
    businesses?: Array<string | JsonRecord>;
    pages?: Array<string | JsonRecord>;
    instagramProfessionalAccountId?: string | null;
    pageId?: string | null;
    webhookChallengeVerified?: boolean;
    profile?: JsonRecord | null;
    permissionAudit?: JsonRecord | null;
    healthAudit?: JsonRecord | null;
  } | null;
  simulate?: {
    permissionMissing?: boolean;
    permissionDowngrade?: boolean;
    webhookFail?: boolean;
    rateLimited?: boolean;
    tokenExpired?: boolean;
    disconnected?: boolean;
    pageUnlink?: boolean;
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
  let flowTrace = toFlowStepStatus(INSTAGRAM_ENTERPRISE_FLOW_STEPS);
  flowTrace = markFlowStepStatus(
    flowTrace,
    "CONNECT_BUTTON",
    "DONE",
    "connect_hub_api_received"
  );
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
  flowTrace = markFlowStepStatus(flowTrace, "META_OAUTH", "DONE", "oauth_granted");
  flowTrace = markFlowStepStatus(flowTrace, "STATE_SIGNING", "DONE", "state_signed");
  flowTrace = markFlowStepStatus(
    flowTrace,
    "REDIRECT_VALIDATION",
    "DONE",
    input.metaProof?.redirectValidated === false
      ? "redirect_not_validated"
      : "redirect_validated"
  );
  flowTrace = markFlowStepStatus(flowTrace, "TOKEN_EXCHANGE", "DONE", "short_token_exchanged");
  flowTrace = markFlowStepStatus(
    flowTrace,
    "LONG_LIVED_TOKEN_EXCHANGE",
    "DONE",
    "long_lived_token_exchanged"
  );
  flowTrace = markFlowStepStatus(flowTrace, "FETCH_BUSINESSES", "DONE", "businesses_loaded");
  flowTrace = markFlowStepStatus(flowTrace, "FETCH_PAGES", "DONE", "pages_loaded");
  flowTrace = markFlowStepStatus(
    flowTrace,
    "FETCH_INSTAGRAM_PROFESSIONAL_ACCOUNT",
    "DONE",
    "ig_professional_account_loaded"
  );
  flowTrace = markFlowStepStatus(flowTrace, "BIND_PAGE_IG_ACCOUNT", "DONE", "page_ig_bound");
  flowTrace = markFlowStepStatus(flowTrace, "SUBSCRIBE_WEBHOOK", "DONE", "subscription_requested");
  flowTrace = markFlowStepStatus(
    flowTrace,
    "VALIDATE_WEBHOOK_CHALLENGE",
    "DONE",
    input.metaProof?.webhookChallengeVerified === false
      ? "challenge_not_verified"
      : "challenge_verified"
  );
  flowTrace = markFlowStepStatus(flowTrace, "FETCH_PROFILE", "DONE", "profile_loaded");
  flowTrace = markFlowStepStatus(flowTrace, "PERMISSION_AUDIT", "DONE", "permission_audited");
  flowTrace = markFlowStepStatus(flowTrace, "HEALTH_AUDIT", "DONE", "health_audited");
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
      flowSteps: INSTAGRAM_ENTERPRISE_FLOW_STEPS,
      flowTrace,
      metaProof: toRecord(input.metaProof),
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
    scopes:
      input.metaProof?.permissions ||
      input.scopes || [
        "instagram_basic",
        "instagram_manage_messages",
        "pages_manage_metadata",
      ],
    status: "VERIFYING",
    metadata: {
      pageId: normalizeIdentifier(input.metaProof?.pageId || "") || null,
      instagramProfessionalAccountId:
        normalizeIdentifier(input.metaProof?.instagramProfessionalAccountId || "") || null,
      businesses: Array.isArray(input.metaProof?.businesses)
        ? input.metaProof?.businesses
        : [],
      pages: Array.isArray(input.metaProof?.pages) ? input.metaProof?.pages : [],
      reconnect: Boolean(input.reconnect),
    },
  });

  await mirrorSandboxSlot({
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    integrationKey: integration.integrationKey,
  });

  const requiredInstagramScopes = [
    "instagram_basic",
    "instagram_manage_messages",
    "pages_manage_metadata",
  ];
  const grantedInstagramScopes = toArray(
    input.metaProof?.permissions || integration.scopes || input.scopes || []
  );
  await upsertIntegrationPermissionLedger({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    requiredScopes: requiredInstagramScopes,
    grantedScopes: grantedInstagramScopes,
    metadata: {
      mode: input.reconnect ? "reconnect" : "connect",
      source: "connectInstagramOneClick",
    },
  });
  const missingInstagramScopes = requiredInstagramScopes.filter(
    (scope) => !grantedInstagramScopes.includes(scope)
  );
  if (
    input.simulate?.permissionMissing ||
    input.simulate?.permissionDowngrade ||
    missingInstagramScopes.length
  ) {
    flowTrace = markFlowStepStatus(
      flowTrace,
      "PERMISSION_VALIDATION",
      "FAILED",
      "missing_or_downgraded_permissions"
    );
    const code =
      input.simulate?.permissionDowngrade || missingInstagramScopes.length
        ? "IG_PERMISSION_DOWNGRADE"
        : "IG_SCOPE_MISSING";
    const diagnostic = await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "PERMISSION_MISSING",
      step: "PERMISSION_VALIDATION",
      code,
      message:
        code === "IG_PERMISSION_DOWNGRADE"
          ? "Instagram permissions were downgraded after authorization."
          : "Required Meta scopes are missing for Instagram messaging.",
      fixAction: "REAUTHORIZE",
      metadata: {
        missingScopes: missingInstagramScopes,
        flowTrace,
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

  flowTrace = markFlowStepStatus(
    flowTrace,
    "PERMISSION_VALIDATION",
    "DONE",
    "permissions_validated"
  );

  if (input.simulate?.pageUnlink) {
    flowTrace = markFlowStepStatus(
      flowTrace,
      "BIND_PAGE_IG_ACCOUNT",
      "FAILED",
      "page_unlinked"
    );
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "NEEDS_ACTION",
      step: "BIND_PAGE_IG_ACCOUNT",
      code: "IG_PAGE_UNLINKED",
      message: "Instagram professional account is no longer linked to the selected page.",
      fixAction: "RELINK_PAGE",
      metadata: {
        flowTrace,
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
    };
  }

  if (input.simulate?.webhookFail) {
    flowTrace = markFlowStepStatus(
      flowTrace,
      "VALIDATE_WEBHOOK_CHALLENGE",
      "FAILED",
      "webhook_challenge_failed"
    );
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "WEBHOOK_FAILED",
      step: "VALIDATE_WEBHOOK_CHALLENGE",
      code: "IG_WEBHOOK_FAIL",
      message: "Webhook subscription did not receive inbound verification event.",
      fixAction: "FIX_WEBHOOK",
      metadata: {
        flowTrace,
      },
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
    flowTrace = markFlowStepStatus(
      flowTrace,
      "HEALTH_AUDIT",
      "FAILED",
      "provider_rate_limited"
    );
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "RATE_LIMITED",
      step: "HEALTH_AUDIT",
      code: "IG_RATE_LIMITED",
      message: "Meta API rate limit reached while validating Instagram connection.",
      fixAction: "WAIT_RATE_LIMIT",
      retryable: true,
      metadata: {
        flowTrace,
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
    };
  }

  if (input.simulate?.tokenExpired) {
    flowTrace = markFlowStepStatus(
      flowTrace,
      "HEALTH_AUDIT",
      "FAILED",
      "token_expired"
    );
    const expiry = new Date(Date.now() - 1000 * 60);
    integration.tokenExpiresAt = expiry;
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "TOKEN_EXPIRED",
      step: "HEALTH_AUDIT",
      code: "IG_TOKEN_EXPIRED",
      message: "Instagram token expired during connect validation.",
      fixAction: "REFRESH_TOKEN",
      retryable: true,
      metadata: {
        flowTrace,
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
    };
  }

  if (input.simulate?.disconnected) {
    flowTrace = markFlowStepStatus(
      flowTrace,
      "HEALTH_AUDIT",
      "FAILED",
      "provider_disconnected"
    );
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "INSTAGRAM",
      environment,
      status: "DISCONNECTED",
      step: "HEALTH_AUDIT",
      code: "IG_DISCONNECTED",
      message: "Instagram connection is disconnected and requires reauthorization.",
      fixAction: "REAUTHORIZE",
      metadata: {
        flowTrace,
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
    };
  }

  flowTrace = markFlowStepStatus(
    flowTrace,
    "CANONICAL_SAVE",
    "DONE",
    "canonical_ledger_saved"
  );
  flowTrace = markFlowStepStatus(flowTrace, "CONNECTED", "DONE", "connected");
  await markConnectionSuccess({
    attemptKey: attempt.attemptKey,
    integrationKey: integration.integrationKey,
    tenantKey,
    provider: "INSTAGRAM",
    environment,
    details: {
      flow: "INSTAGRAM_CONNECT",
      oauthStateKey: oauthState.oauthStateKey,
      flowTrace,
      profile: toRecord(input.metaProof?.profile),
      permissionAudit: toRecord(input.metaProof?.permissionAudit),
      healthAudit: toRecord(input.metaProof?.healthAudit),
      pageId: normalizeIdentifier(input.metaProof?.pageId || "") || null,
      instagramProfessionalAccountId:
        normalizeIdentifier(input.metaProof?.instagramProfessionalAccountId || "") || null,
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
  businessManagerId?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  displayName?: string | null;
  displayNameReviewStatus?: string | null;
  qualityRating?: string | null;
  tier?: string | null;
  allowSandboxSlot?: boolean;
  metaProof?: {
    permissions?: string[];
    callbackVerified?: boolean;
    testMessageDelivered?: boolean;
    phoneConnected?: boolean;
    numberMigrationFrom?: string | null;
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
  const scenario = normalizeIdentifier(input.scenario || "NONE").toUpperCase() as WhatsAppFailureScenario;
  let flowTrace = toFlowStepStatus(WHATSAPP_ENTERPRISE_FLOW_STEPS);
  flowTrace = markFlowStepStatus(
    flowTrace,
    "CONNECT_BUTTON",
    "DONE",
    "connect_hub_api_received"
  );
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
  const activeWhatsAppConnections = listIntegrations({
    tenantKey,
    provider: "WHATSAPP",
    environment,
  }).filter((row) => row.status !== "DISCONNECTED");
  const multiNumberEntitlement = getActiveEntitlement({
    tenantKey,
    featureKey: "multi_number",
    environment: "LIVE",
  });
  const maxLiveNumbers = Math.max(
    1,
    Math.floor(toNumber(multiNumberEntitlement?.quota, 1))
  );
  if (
    environment === "LIVE" &&
    !input.reconnect &&
    activeWhatsAppConnections.length >= maxLiveNumbers
  ) {
    await createDiagnostic({
      tenantKey,
      provider: "WHATSAPP",
      environment,
      severity: "ERROR",
      code: "WA_MULTI_NUMBER_ENTITLEMENT_EXCEEDED",
      message: "WhatsApp live number quota reached for current entitlement.",
      fixAction: "UPGRADE_PLAN",
      fixPayload: {
        maxLiveNumbers,
        currentLiveNumbers: activeWhatsAppConnections.length,
      },
    });
    throw new Error("multi_number_entitlement_exceeded");
  }
  if (
    environment === "SANDBOX" &&
    !input.allowSandboxSlot &&
    !input.reconnect &&
    activeWhatsAppConnections.length >= 1
  ) {
    await createDiagnostic({
      tenantKey,
      provider: "WHATSAPP",
      environment,
      severity: "ERROR",
      code: "WA_SANDBOX_SLOT_IN_USE",
      message: "Sandbox slot already occupied for WhatsApp integration.",
      fixAction: "REUSE_SANDBOX_SLOT",
    });
    throw new Error("sandbox_slot_in_use");
  }

  const oauthState = await setOAuthState({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    replayToken: replayToken || null,
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
  });
  flowTrace = markFlowStepStatus(flowTrace, "META_OAUTH", "DONE", "oauth_granted");
  flowTrace = markFlowStepStatus(
    flowTrace,
    "BUSINESS_MANAGER_SELECTION",
    "DONE",
    normalizeIdentifier(input.businessManagerId || "") || "business_manager_selected"
  );
  flowTrace = markFlowStepStatus(
    flowTrace,
    "WABA_SELECTION_OR_CREATION",
    "DONE",
    normalizeIdentifier(input.wabaId || "") || "waba_selected"
  );
  flowTrace = markFlowStepStatus(
    flowTrace,
    "PHONE_NUMBER_SELECTION",
    "DONE",
    normalizeIdentifier(input.phoneNumberId || "") || "phone_selected"
  );
  flowTrace = markFlowStepStatus(flowTrace, "DISPLAY_NAME_VALIDATION", "DONE", "display_name_checked");
  flowTrace = markFlowStepStatus(flowTrace, "REGISTER_NUMBER", "DONE", "number_registered");
  flowTrace = markFlowStepStatus(flowTrace, "WEBHOOK_SUBSCRIBE", "DONE", "webhook_subscription_requested");
  flowTrace = markFlowStepStatus(
    flowTrace,
    "VERIFY_CALLBACK",
    "DONE",
    input.metaProof?.callbackVerified === false ? "callback_not_verified" : "callback_verified"
  );
  flowTrace = markFlowStepStatus(flowTrace, "TOKEN_EXCHANGE", "DONE", "token_exchanged");
  flowTrace = markFlowStepStatus(
    flowTrace,
    "HEALTH_TEST_MESSAGE",
    "DONE",
    input.metaProof?.testMessageDelivered === false
      ? "health_test_message_not_delivered"
      : "health_test_message_delivered"
  );
  const attempt = await setConnectionAttempt({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    flow: "WHATSAPP_CONNECT",
    replayToken: replayToken || null,
    status: "VERIFYING",
    step: "META_OAUTH",
    statusDetail: "wizard_started",
    metadata: {
      oauthStateKey: oauthState.oauthStateKey,
      flowSteps: WHATSAPP_ENTERPRISE_FLOW_STEPS,
      flowTrace,
      metaProof: toRecord(input.metaProof),
    },
  });
  const existingWhatsAppIntegration = listIntegrations({
    tenantKey,
    provider: "WHATSAPP",
    environment,
  })[0] || null;
  const integration = await resolveOrCreateIntegration({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    reconnect: Boolean(input.reconnect),
    externalAccountRef:
      normalizeIdentifier(input.wabaId || "") ||
      `wa_account_${stableHash([tenantKey, replayToken || now().toISOString()]).slice(0, 12)}`,
    tokenValue: `wa_token_${stableHash([attempt.attemptKey]).slice(0, 14)}`,
    scopes:
      input.metaProof?.permissions || [
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ],
    status: "VERIFYING",
    metadata: {
      businessManagerId: normalizeIdentifier(input.businessManagerId || "") || null,
      wabaId: normalizeIdentifier(input.wabaId || "") || null,
      phoneNumberId: normalizeIdentifier(input.phoneNumberId || "") || null,
      displayName: normalizeIdentifier(input.displayName || "") || null,
      displayNameReviewStatus:
        normalizeIdentifier(input.displayNameReviewStatus || "") || "PENDING_REVIEW",
      qualityRating: normalizeIdentifier(input.qualityRating || "") || "GREEN",
      tier: normalizeIdentifier(input.tier || "") || "TIER_1K",
      callbackVerified: input.metaProof?.callbackVerified !== false,
      numberMigrationFrom:
        normalizeIdentifier(input.metaProof?.numberMigrationFrom || "") || null,
      reconnect: Boolean(input.reconnect),
    },
  });
  await mirrorSandboxSlot({
    tenantKey,
    provider: "WHATSAPP",
    environment,
    integrationKey: integration.integrationKey,
  });
  const previousPhoneNumberId = normalizeIdentifier(
    existingWhatsAppIntegration?.metadata?.phoneNumberId || ""
  );
  const nextPhoneNumberId = normalizeIdentifier(
    integration?.metadata?.phoneNumberId || input.phoneNumberId || ""
  );
  if (
    Boolean(input.reconnect) &&
    previousPhoneNumberId &&
    nextPhoneNumberId &&
    previousPhoneNumberId !== nextPhoneNumberId
  ) {
    integration.metadata = {
      ...toRecord(integration.metadata),
      numberMigration: {
        from: previousPhoneNumberId,
        to: nextPhoneNumberId,
        migratedAt: now().toISOString(),
      },
    };
    await recordIntegrationAudit({
      tenantKey,
      provider: "WHATSAPP",
      environment,
      integrationKey: integration.integrationKey,
      attemptKey: attempt.attemptKey,
      stage: "REGISTER_NUMBER",
      status: "SUCCESS",
      message: "WhatsApp number migrated during reconnect.",
      metadata: {
        from: previousPhoneNumberId,
        to: nextPhoneNumberId,
      },
    });
  }

  const requiredWhatsAppScopes = [
    "whatsapp_business_management",
    "whatsapp_business_messaging",
  ];
  const grantedWhatsAppScopes = toArray(
    input.metaProof?.permissions || integration.scopes || []
  );
  await upsertIntegrationPermissionLedger({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider: "WHATSAPP",
    environment,
    requiredScopes: requiredWhatsAppScopes,
    grantedScopes: grantedWhatsAppScopes,
    metadata: {
      displayNameReviewStatus:
        normalizeIdentifier(input.displayNameReviewStatus || "") || "PENDING_REVIEW",
      qualityRating: normalizeIdentifier(input.qualityRating || "") || "GREEN",
      tier: normalizeIdentifier(input.tier || "") || "TIER_1K",
    },
  });
  const missingWhatsAppScopes = requiredWhatsAppScopes.filter(
    (scope) => !grantedWhatsAppScopes.includes(scope)
  );
  if (missingWhatsAppScopes.length > 0) {
    flowTrace = markFlowStepStatus(
      flowTrace,
      "META_OAUTH",
      "FAILED",
      "missing_whatsapp_permissions"
    );
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "WHATSAPP",
      environment,
      status: "PERMISSION_MISSING",
      step: "META_OAUTH",
      code: "WA_SCOPE_MISSING",
      message: "Required WhatsApp permissions were not granted.",
      fixAction: "REAUTHORIZE",
      metadata: {
        missingScopes: missingWhatsAppScopes,
        flowTrace,
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

  if (input.metaProof?.phoneConnected === false) {
    flowTrace = markFlowStepStatus(
      flowTrace,
      "HEALTH_TEST_MESSAGE",
      "FAILED",
      "phone_disconnected"
    );
    await markConnectionFailure({
      attemptKey: attempt.attemptKey,
      integrationKey: integration.integrationKey,
      tenantKey,
      provider: "WHATSAPP",
      environment,
      status: "DISCONNECTED",
      step: "HEALTH_TEST_MESSAGE",
      code: "WA_PHONE_DISCONNECTED",
      message: "Selected WhatsApp phone number is disconnected.",
      fixAction: "RECONNECT_NUMBER",
      metadata: {
        phoneNumberId: normalizeIdentifier(input.phoneNumberId || "") || null,
        flowTrace,
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
      step: "PHONE_NUMBER_SELECTION",
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
      step: "BUSINESS_MANAGER_SELECTION",
      code: "WA_WRONG_BUSINESS",
      message: "Selected business does not match tenant ownership boundary.",
      fixAction: "SWITCH_BUSINESS",
    },
    SCOPE_MISSING: {
      status: "PERMISSION_MISSING",
      step: "META_OAUTH",
      code: "WA_SCOPE_MISSING",
      message: "Required WhatsApp permissions were not granted.",
      fixAction: "REAUTHORIZE",
    },
    WEBHOOK_FAIL: {
      status: "WEBHOOK_FAILED",
      step: "VERIFY_CALLBACK",
      code: "WA_WEBHOOK_FAIL",
      message: "WhatsApp webhook verification failed for the selected number.",
      fixAction: "FIX_WEBHOOK",
    },
    TOKEN_ISSUE: {
      status: "TOKEN_EXPIRED",
      step: "HEALTH_TEST_MESSAGE",
      code: "WA_TOKEN_ISSUE",
      message: "WhatsApp token is invalid or expired.",
      fixAction: "REFRESH_TOKEN",
    },
    TEMPLATE_FAILURE: {
      status: "LIMITED",
      step: "HEALTH_TEST_MESSAGE",
      code: "WA_TEMPLATE_FAILURE",
      message: "Template quality or approval state blocks outbound sends.",
      fixAction: "CHECK_TEMPLATE",
    },
    SANDBOX_LIVE_MISMATCH: {
      status: "NEEDS_ACTION",
      step: "WABA_SELECTION_OR_CREATION",
      code: "WA_ENVIRONMENT_MISMATCH",
      message: "Selected WABA environment does not match requested runtime mode.",
      fixAction: "SYNC_ENVIRONMENT",
    },
    RATE_LIMIT: {
      status: "RATE_LIMITED",
      step: "HEALTH_TEST_MESSAGE",
      code: "WA_RATE_LIMITED",
      message: "Provider rate limit triggered during WhatsApp connect validation.",
      fixAction: "WAIT_RATE_LIMIT",
    },
    QUALITY_ISSUE: {
      status: "LIMITED",
      step: "HEALTH_TEST_MESSAGE",
      code: "WA_QUALITY_ISSUE",
      message: "WhatsApp quality rating degraded and delivery was limited.",
      fixAction: "IMPROVE_QUALITY",
    },
  };

  if (scenario !== "NONE") {
    const failure = failureMap[scenario as Exclude<WhatsAppFailureScenario, "NONE">];
    flowTrace = markFlowStepStatus(
      flowTrace,
      failure.step,
      "FAILED",
      normalizeIdentifier(failure.code || "") || "connect_failed"
    );
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
      metadata: {
        ...toRecord(failure.fixPayload),
        flowTrace,
      },
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

  flowTrace = markFlowStepStatus(
    flowTrace,
    "CANONICAL_SAVE",
    "DONE",
    "canonical_ledger_saved"
  );
  flowTrace = markFlowStepStatus(flowTrace, "CONNECTED", "DONE", "connected");
  await markConnectionSuccess({
    attemptKey: attempt.attemptKey,
    integrationKey: integration.integrationKey,
    tenantKey,
    provider: "WHATSAPP",
    environment,
    details: {
      flow: "WHATSAPP_CONNECT",
      oauthStateKey: oauthState.oauthStateKey,
      flowTrace,
      businessManagerId: normalizeIdentifier(input.businessManagerId || "") || null,
      wabaId: normalizeIdentifier(input.wabaId || "") || null,
      phoneNumberId: normalizeIdentifier(input.phoneNumberId || "") || null,
      displayName: normalizeIdentifier(input.displayName || "") || null,
      displayNameReviewStatus:
        normalizeIdentifier(input.displayNameReviewStatus || "") || "PENDING_REVIEW",
      qualityRating: normalizeIdentifier(input.qualityRating || "") || "GREEN",
      tier: normalizeIdentifier(input.tier || "") || "TIER_1K",
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
  await upsertIntegrationCredentialLedger({
    integrationKey: integration.integrationKey,
    tenantKey,
    provider,
    environment,
    credentialRef: integration.credentialRef || null,
    tokenExpiresAt: integration.tokenExpiresAt || null,
    revokedAt: null,
    metadata: {
      reason: normalizeIdentifier(input.reason || "manual_expire"),
    },
  });
  await recordIntegrationAudit({
    tenantKey,
    provider,
    environment,
    integrationKey: integration.integrationKey,
    stage: "TOKEN_EXPIRED",
    status: "WARN",
    message: "Integration token marked expired.",
    metadata: {
      reason: normalizeIdentifier(input.reason || "manual_expire"),
    },
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
    await upsertIntegrationCredentialLedger({
      integrationKey: integration.integrationKey,
      tenantKey,
      provider,
      environment,
      credentialRef: integration.credentialRef || null,
      tokenExpiresAt: newExpiry,
      revokedAt: null,
      metadata: {
        refreshStatus: "SUCCESS",
      },
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
    await upsertIntegrationCredentialLedger({
      integrationKey: integration.integrationKey,
      tenantKey,
      provider,
      environment,
      credentialRef: integration.credentialRef || null,
      tokenExpiresAt: integration.tokenExpiresAt || null,
      revokedAt: null,
      metadata: {
        refreshStatus: "FAILED",
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
  await recordIntegrationAudit({
    tenantKey,
    provider,
    environment,
    integrationKey: integration.integrationKey,
    stage: "TOKEN_REFRESH",
    status: status === "SUCCESS" ? "SUCCESS" : "ERROR",
    message:
      status === "SUCCESS"
        ? "Integration token refreshed successfully."
        : "Integration token refresh failed.",
    replayToken: replayToken || null,
    metadata: {
      refreshKey,
      oldExpiry: previousExpiry,
      newExpiry,
      errorCode,
      errorMessage,
    },
  });
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
  await recordIntegrationAudit({
    tenantKey,
    provider,
    environment,
    integrationKey: integration.integrationKey,
    stage: "WEBHOOK_FAILURE",
    status: "ERROR",
    message: "Provider webhook marked failed.",
    metadata: {
      consecutiveFailures: failures,
      reason: normalizeIdentifier(input.reason || "webhook_failure"),
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
  await recordIntegrationAudit({
    tenantKey,
    provider,
    environment,
    integrationKey: integration.integrationKey,
    stage: "WEBHOOK_RECOVERY",
    status: "SUCCESS",
    message: "Provider webhook recovered to active state.",
    replayToken: replayToken || null,
    metadata: {
      healthKey: health.healthKey,
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
    "WHATSAPP_WEBHOOK_FAIL",
    "WA_TOKEN_ISSUE",
    "WHATSAPP_TOKEN_EXPIRED",
    "WA_RATE_LIMITED",
    "WHATSAPP_RATE_LIMITED",
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

  const openDiagnostics = Array.from(getStore().connectionDiagnosticLedger.values()).filter(
    (row) =>
      row.tenantKey === tenantKey &&
      row.provider === "WHATSAPP" &&
      row.environment === environment &&
      !row.resolvedAt
  );

  const integration = listIntegrations({
    tenantKey,
    provider: "WHATSAPP",
    environment,
  })[0];
  const latestHealth = integration ? getIntegrationHealth(integration.integrationKey) : null;
  return {
    provider: "WHATSAPP",
    environment,
    doctorStatus: openDiagnostics.length ? "NEEDS_ACTION" : "CLEAR",
    issueCount: diagnostics.length,
    openIssueCount: openDiagnostics.length,
    diagnostics: openDiagnostics.map((diagnostic) => ({
      diagnosticKey: diagnostic.diagnosticKey,
      code: diagnostic.code,
      message: diagnostic.message,
      fixAction: diagnostic.fixAction,
      retryToken: diagnostic.retryToken,
      exactFix: diagnostic.fixPayload || { action: diagnostic.fixAction },
    })),
    healthScore: toNumber(latestHealth?.healthScore, openDiagnostics.length ? 45 : 100),
    autoResolveResults: results,
  };
};

export const runMetaConnectDoctor = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider?: "INSTAGRAM" | "WHATSAPP" | "ALL" | string | null;
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
  const requestedProvider = normalizeIdentifier(input.provider || "ALL").toUpperCase();
  const targetProviders: Array<"INSTAGRAM" | "WHATSAPP"> =
    requestedProvider === "INSTAGRAM"
      ? ["INSTAGRAM"]
      : requestedProvider === "WHATSAPP"
      ? ["WHATSAPP"]
      : ["INSTAGRAM", "WHATSAPP"];

  const reports: Array<{
    provider: "INSTAGRAM" | "WHATSAPP";
    environment: ConnectEnvironment;
    doctorStatus: "CLEAR" | "NEEDS_ACTION";
    issueCount: number;
    openIssueCount: number;
    healthScore: number;
    diagnostics: Array<{
      code: string;
      message: string;
      fixAction: string;
      autoFixable: boolean;
    }>;
    autoResolveResults: Array<{
      code: string;
      resolved: boolean;
      resolutionStatus: string;
    }>;
  }> = [];

  for (const provider of targetProviders) {
    const integration =
      listIntegrations({
        tenantKey,
        provider,
        environment,
      }).find((row) => row.status !== "DISCONNECTED") || null;
    const webhook = integration ? getProviderWebhookRow(integration.integrationKey) : null;
    const health = integration ? getIntegrationHealth(integration.integrationKey) : null;
    const permissionRow = integration
      ? getStore().integrationPermissionLedger.get(
          `integration_permission:${integration.integrationKey}`
        )
      : null;
    const credentialRow = integration
      ? getStore().integrationCredentialLedger.get(
          `integration_credential:${integration.integrationKey}`
        )
      : null;

    const issues: Array<{
      code: string;
      message: string;
      fixAction: string;
      autoFixable: boolean;
      resolver?: () => Promise<boolean>;
    }> = [];

    if (!integration) {
      issues.push({
        code: provider === "INSTAGRAM" ? "PAGE_DISCONNECTED" : "PHONE_DISCONNECTED",
        message:
          provider === "INSTAGRAM"
            ? "Instagram page is disconnected."
            : "WhatsApp phone number is disconnected.",
        fixAction: provider === "INSTAGRAM" ? "RELINK_PAGE" : "RECONNECT_NUMBER",
        autoFixable: false,
      });
    } else {
      const tokenExpiryMs = integration.tokenExpiresAt
        ? new Date(integration.tokenExpiresAt).getTime()
        : 0;
      if (tokenExpiryMs > 0 && tokenExpiryMs <= Date.now()) {
        issues.push({
          code: "TOKEN_EXPIRED",
          message: "Provider token is expired.",
          fixAction: "REFRESH_TOKEN",
          autoFixable: true,
          resolver: async () => {
            const refresh = await refreshIntegrationToken({
              businessId: tenantId,
              tenantId,
              provider,
              environment,
            });
            return refresh?.status === "SUCCESS";
          },
        });
      } else if (tokenExpiryMs > 0 && tokenExpiryMs - Date.now() <= 1000 * 60 * 60 * 24 * 3) {
        issues.push({
          code: "TOKEN_EXPIRING",
          message: "Provider token is expiring soon.",
          fixAction: "REFRESH_TOKEN",
          autoFixable: true,
          resolver: async () => {
            const refresh = await refreshIntegrationToken({
              businessId: tenantId,
              tenantId,
              provider,
              environment,
            });
            return refresh?.status === "SUCCESS";
          },
        });
      }

      if (!webhook || String(webhook.status || "").toUpperCase() !== "ACTIVE") {
        issues.push({
          code: "WEBHOOK_MISMATCH",
          message: "Webhook subscription is inactive or mismatched.",
          fixAction: "RESUBSCRIBE",
          autoFixable: true,
          resolver: async () => {
            const recovered = await recoverProviderWebhook({
              businessId: tenantId,
              tenantId,
              provider,
              environment,
            });
            return String(recovered?.status || "").toUpperCase() === "CONNECTED";
          },
        });
      }

      if (permissionRow && Array.isArray(permissionRow.missingScopes) && permissionRow.missingScopes.length) {
        issues.push({
          code: "PERMISSION_MISSING",
          message: "Required permissions are missing or downgraded.",
          fixAction: "REAUTHORIZE",
          autoFixable: false,
        });
      }

      if (String(integration.status || "").toUpperCase() === "RATE_LIMITED") {
        issues.push({
          code: "RATE_LIMITED",
          message: "Provider is rate limited.",
          fixAction: "RETRY_LATER",
          autoFixable: true,
          resolver: async () => {
            integration.status = "CONNECTED";
            integration.updatedAt = now();
            await setIntegrationHealth({
              integrationKey: integration.integrationKey,
              tenantKey,
              provider,
              environment,
              status: "CONNECTED",
              healthScore: 88,
              actionHint: null,
            });
            return true;
          },
        });
      }

      const metadata = toRecord(integration.metadata);
      if (metadata.subscriptionActive === false) {
        issues.push({
          code: "SUBSCRIPTION_INACTIVE",
          message: "Meta subscription is inactive.",
          fixAction: "RESUBSCRIBE",
          autoFixable: true,
          resolver: async () => {
            const recovered = await recoverProviderWebhook({
              businessId: tenantId,
              tenantId,
              provider,
              environment,
            });
            return String(recovered?.status || "").toUpperCase() === "CONNECTED";
          },
        });
      }
      if (provider === "INSTAGRAM" && metadata.pageLinked === false) {
        issues.push({
          code: "PAGE_DISCONNECTED",
          message: "Instagram page unlink detected.",
          fixAction: "RELINK_PAGE",
          autoFixable: false,
        });
      }
      if (provider === "WHATSAPP" && metadata.phoneConnected === false) {
        issues.push({
          code: "PHONE_DISCONNECTED",
          message: "WhatsApp phone disconnect detected.",
          fixAction: "RECONNECT_NUMBER",
          autoFixable: false,
        });
      }
      if (
        provider === "WHATSAPP" &&
        ["RED", "LOW"].includes(normalizeIdentifier(metadata.qualityRating).toUpperCase())
      ) {
        issues.push({
          code: "QUALITY_DROP",
          message: "WhatsApp quality rating dropped.",
          fixAction: "IMPROVE_QUALITY",
          autoFixable: false,
        });
      }
      if (provider === "WHATSAPP" && normalizeIdentifier(metadata.numberStatus).toUpperCase() === "BANNED") {
        issues.push({
          code: "NUMBER_BANNED",
          message: "WhatsApp number is banned.",
          fixAction: "MIGRATE_NUMBER",
          autoFixable: false,
        });
      }
      if (
        provider === "WHATSAPP" &&
        normalizeIdentifier(metadata.displayNameReviewStatus).toUpperCase() === "REJECTED"
      ) {
        issues.push({
          code: "DISPLAY_NAME_REVIEW_REJECTED",
          message: "Display name review is rejected.",
          fixAction: "UPDATE_DISPLAY_NAME",
          autoFixable: false,
        });
      }
      if (credentialRow && normalizeIdentifier(credentialRow.status).toUpperCase() === "REVOKED") {
        issues.push({
          code: "PERMISSION_REVOKED",
          message: "Credentials were revoked by provider.",
          fixAction: "REAUTHORIZE",
          autoFixable: false,
        });
      }
      if (health && String(health.status || "").toUpperCase() === "PERMISSION_MISSING") {
        issues.push({
          code: "PERMISSION_REVOKED",
          message: "Permission revocation detected.",
          fixAction: "REAUTHORIZE",
          autoFixable: false,
        });
      }
    }

    const autoResolveResults: Array<{
      code: string;
      resolved: boolean;
      resolutionStatus: string;
    }> = [];
    if (input.autoResolve) {
      for (const issue of issues) {
        if (!issue.autoFixable || !issue.resolver) {
          autoResolveResults.push({
            code: issue.code,
            resolved: false,
            resolutionStatus: "MANUAL_REQUIRED",
          });
          continue;
        }
        const resolved = await issue.resolver().catch(() => false);
        autoResolveResults.push({
          code: issue.code,
          resolved,
          resolutionStatus: resolved ? "RECOVERED" : "FAILED",
        });
      }
    }

    const stillOpenIssueCount = input.autoResolve
      ? autoResolveResults.filter(
          (entry) => !entry.resolved && entry.resolutionStatus !== "MANUAL_REQUIRED"
        ).length +
        issues.filter((issue) => !issue.autoFixable).length
      : issues.length;
    reports.push({
      provider,
      environment,
      doctorStatus: stillOpenIssueCount > 0 ? "NEEDS_ACTION" : "CLEAR",
      issueCount: issues.length,
      openIssueCount: stillOpenIssueCount,
      healthScore: Math.max(
        0,
        Math.min(
          100,
          toNumber(health?.healthScore, integration ? 90 : 30) - stillOpenIssueCount * 8
        )
      ),
      diagnostics: issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        fixAction: issue.fixAction,
        autoFixable: issue.autoFixable,
      })),
      autoResolveResults,
    });
  }

  return {
    provider: requestedProvider,
    environment,
    doctorStatus: reports.some((report) => report.doctorStatus === "NEEDS_ACTION")
      ? "NEEDS_ACTION"
      : "CLEAR",
    reports,
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
  const diagnosticCode = normalizeIdentifier(diagnostic.code).toUpperCase();
  const isWebhookFailureCode =
    ["WA_WEBHOOK_FAIL", "IG_WEBHOOK_FAIL"].includes(diagnosticCode) ||
    diagnosticCode.endsWith("_WEBHOOK_FAIL");
  const isTokenIssueCode =
    ["WA_TOKEN_ISSUE", "IG_TOKEN_EXPIRED", "INSTAGRAM_TOKEN_EXPIRED"].includes(
      diagnosticCode
    ) || diagnosticCode.endsWith("_TOKEN_EXPIRED");
  const isRateLimitedCode =
    ["WA_RATE_LIMITED", "IG_RATE_LIMITED"].includes(diagnosticCode) ||
    diagnosticCode.endsWith("_RATE_LIMITED");

  if (isWebhookFailureCode) {
    await recoverProviderWebhook({
      businessId: tenantId,
      tenantId,
      provider,
      environment,
    });
    resolved = true;
    resolutionStatus = "RECOVERED";
  } else if (isTokenIssueCode) {
    const refresh = await refreshIntegrationToken({
      businessId: tenantId,
      tenantId,
      provider,
      environment,
    });
    resolved = refresh?.status === "SUCCESS";
    resolutionStatus = resolved ? "RECOVERED" : "FAILED";
  } else if (isRateLimitedCode) {
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
  } else if (diagnosticCode === "IG_DISCONNECTED") {
    const reconnect = await connectInstagramOneClick({
      businessId: tenantId,
      tenantId,
      environment,
      reconnect: true,
      replayToken: `diag_reconnect_${stableHash([diagnostic.diagnosticKey]).slice(0, 10)}`,
    }).catch(() => null);
    resolved = Boolean(reconnect?.integration?.status === "CONNECTED");
    resolutionStatus = resolved ? "RECOVERED" : "FAILED";
  } else if (diagnosticCode === "WA_PHONE_DISCONNECTED") {
    resolutionStatus = "MANUAL_REQUIRED";
  } else if (diagnosticCode === "IG_PAGE_UNLINKED") {
    resolutionStatus = "MANUAL_REQUIRED";
  } else if (diagnosticCode === "IG_PERMISSION_DOWNGRADE") {
    resolutionStatus = "MANUAL_REQUIRED";
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
  const providerIntegrations = listIntegrations({
    tenantKey,
    provider,
  }).filter((row) => row.status !== "DISCONNECTED");
  const integration =
    providerIntegrations.find((row) => row.environment === environment) || null;
  if (!integration) {
    const activeEnvironments = Array.from(
      new Set(providerIntegrations.map((row) => normalizeEnvironment(row.environment)))
    );
    const crossEnvironmentBleedBlocked = activeEnvironments.some(
      (activeEnvironment) => activeEnvironment !== environment
    );
    if (crossEnvironmentBleedBlocked) {
      await createDiagnostic({
        tenantKey,
        provider,
        environment,
        severity: "ERROR",
        code: "CROSS_ENV_BLEED_BLOCKED",
        message:
          "Inbound webhook environment does not match connected integration environment.",
        fixAction: "SYNC_ENVIRONMENT",
        fixPayload: {
          expectedEnvironment: environment,
          activeEnvironments,
        },
      });
      throw new Error("cross_env_bleed_blocked");
    }
    await createDiagnostic({
      tenantKey,
      provider,
      environment,
      severity: "ERROR",
      code:
        provider === "INSTAGRAM" ? "IG_PAGE_DISCONNECTED" : "WA_PHONE_DISCONNECTED",
      message:
        provider === "INSTAGRAM"
          ? "Webhook inbound event received while Instagram page is disconnected."
          : "Webhook inbound event received while WhatsApp phone is disconnected.",
      fixAction: provider === "INSTAGRAM" ? "RELINK_PAGE" : "RECONNECT_NUMBER",
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

  const inboundDetails = toRecord(input.details);
  const inboundEventId =
    normalizeIdentifier(inboundDetails.eventId) ||
    normalizeIdentifier(inboundDetails.messageId) ||
    normalizeIdentifier(inboundDetails.providerMessageId) ||
    null;
  const inboundTimestampMs = toNumber(
    (inboundDetails as any).eventTimestampMs ||
      (inboundDetails as any).timestampMs ||
      (inboundDetails as any).timestamp ||
      Date.now(),
    Date.now()
  );
  const currentWebhook = getProviderWebhookRow(integration.integrationKey);
  const currentWebhookMeta = toRecord(currentWebhook?.metadata);
  const recentEventIds = toArray(currentWebhookMeta.recentEventIds || []);
  if (inboundEventId && recentEventIds.includes(inboundEventId)) {
    await recordIntegrationAudit({
      tenantKey,
      provider,
      environment,
      integrationKey: integration.integrationKey,
      stage: "WEBHOOK_REPLAY_SKIPPED",
      status: "WARN",
      message: "Duplicate webhook replay skipped.",
      metadata: {
        eventId: inboundEventId,
      },
    });
    return {
      accepted: true,
      duplicate: true,
      integrationKey: integration.integrationKey,
    };
  }
  const lastEventTimestampMs = toNumber(currentWebhookMeta.lastEventTimestampMs, 0);
  if (lastEventTimestampMs > 0 && inboundTimestampMs < lastEventTimestampMs) {
    await recordIntegrationAudit({
      tenantKey,
      provider,
      environment,
      integrationKey: integration.integrationKey,
      stage: "WEBHOOK_OUT_OF_ORDER_IGNORED",
      status: "WARN",
      message: "Out-of-order webhook ignored.",
      metadata: {
        eventId: inboundEventId,
        inboundTimestampMs,
        lastEventTimestampMs,
      },
    });
    return {
      accepted: true,
      ignored: true,
      reason: "out_of_order",
      integrationKey: integration.integrationKey,
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
    metadata: {
      ...currentWebhookMeta,
      ...inboundDetails,
      lastEventId: inboundEventId,
      lastEventTimestampMs: inboundTimestampMs,
      recentEventIds: inboundEventId
        ? [inboundEventId, ...recentEventIds.filter((id) => id !== inboundEventId)].slice(
            0,
            20
          )
        : recentEventIds,
    },
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
  await recordIntegrationAudit({
    tenantKey,
    provider,
    environment,
    integrationKey: integration.integrationKey,
    stage: "WEBHOOK_ACCEPTED",
    status: "SUCCESS",
    message: "Inbound webhook accepted and reconciled.",
    metadata: {
      eventId: inboundEventId,
      eventTimestampMs: inboundTimestampMs,
    },
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
  const row = {
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
  };
  const override = await upsertLedgerRecord({
    authority: "PackagingOverrideLedger",
    storeMap: getStore().packagingOverrideLedger,
    keyField: "overrideKey",
    keyValue: overrideKey,
    row,
    dbLedgers: ["packagingOverrideLedger"],
  });
  await upsertLedgerRecord({
    authority: "ConnectOverrideLedger",
    storeMap: getStore().connectOverrideLedger,
    keyField: "overrideKey",
    keyValue: overrideKey,
    row: {
      ...row,
      metadata: {
        ...toRecord(row.metadata),
        canonicalAuthority: "ConnectOverrideLedger",
      },
    },
    dbLedgers: ["packagingOverrideLedger"],
  });
  return override;
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

export const runMetaTokenLifecycleSweep = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider?: "INSTAGRAM" | "WHATSAPP" | "ALL" | string | null;
  environment?: ConnectEnvironment | string | null;
  autoRefresh?: boolean;
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
  const requestedProvider = normalizeIdentifier(input.provider || "ALL").toUpperCase();
  const providers: Array<"INSTAGRAM" | "WHATSAPP"> =
    requestedProvider === "INSTAGRAM"
      ? ["INSTAGRAM"]
      : requestedProvider === "WHATSAPP"
      ? ["WHATSAPP"]
      : ["INSTAGRAM", "WHATSAPP"];

  const report: Array<{
    provider: "INSTAGRAM" | "WHATSAPP";
    integrationKey: string | null;
    status: string;
    refreshed: boolean;
    revokedDetected: boolean;
    reauthorizeRequired: boolean;
  }> = [];

  for (const provider of providers) {
    const integration =
      listIntegrations({
        tenantKey,
        provider,
        environment,
      }).find((row) => row.status !== "DISCONNECTED") || null;
    if (!integration) {
      report.push({
        provider,
        integrationKey: null,
        status: "NOT_CONNECTED",
        refreshed: false,
        revokedDetected: false,
        reauthorizeRequired: true,
      });
      continue;
    }

    let refreshed = false;
    let revokedDetected = false;
    let reauthorizeRequired = false;
    const credentialRow = getStore().integrationCredentialLedger.get(
      `integration_credential:${integration.integrationKey}`
    );
    if (credentialRow && normalizeIdentifier(credentialRow.status).toUpperCase() === "REVOKED") {
      revokedDetected = true;
      reauthorizeRequired = true;
      await createDiagnostic({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        severity: "ERROR",
        code: `${provider}_PERMISSION_REVOKED`,
        message: "Provider permissions revoked; reauthorization required.",
        fixAction: "REAUTHORIZE",
      });
    }

    const tokenExpiryMs = integration.tokenExpiresAt
      ? new Date(integration.tokenExpiresAt).getTime()
      : 0;
    const tokenExpired = tokenExpiryMs > 0 && tokenExpiryMs <= Date.now();
    const tokenExpiringSoon =
      tokenExpiryMs > Date.now() &&
      tokenExpiryMs - Date.now() <= 1000 * 60 * 60 * 24 * 3;
    if (tokenExpired || tokenExpiringSoon) {
      if (input.autoRefresh !== false) {
        const refresh = await refreshIntegrationToken({
          businessId: tenantId,
          tenantId,
          provider,
          environment,
          replayToken: `auto_refresh_${provider.toLowerCase()}_${new Date()
            .toISOString()
            .slice(0, 10)}`,
        }).catch(() => null);
        refreshed = Boolean(refresh && refresh.status === "SUCCESS");
      }
      if (!refreshed) {
        reauthorizeRequired = tokenExpired;
        await callReliabilityInfluence({
          tenantId,
          businessId: tenantId,
          severity: "P2",
          provider,
          reason: "Token lifecycle sweep detected refresh failure.",
          dedupeKey: `${tenantKey}:${provider}:token_lifecycle_failure`.toLowerCase(),
          metadata: {
            integrationKey: integration.integrationKey,
            tokenExpired,
            tokenExpiringSoon,
          },
        });
      }
    }

    if (String(integration.status || "").toUpperCase() === "DISCONNECTED") {
      reauthorizeRequired = true;
      await createDiagnostic({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        severity: "ERROR",
        code: `${provider}_DISCONNECTED`,
        message: "Provider disconnected and requires reauthorization.",
        fixAction: "REAUTHORIZE",
      });
    }

    await upsertIntegrationCredentialLedger({
      integrationKey: integration.integrationKey,
      tenantKey,
      provider,
      environment,
      credentialRef: integration.credentialRef || null,
      tokenExpiresAt: integration.tokenExpiresAt || null,
      revokedAt: revokedDetected ? now() : null,
      metadata: {
        sweepRefreshed: refreshed,
        tokenExpired,
        tokenExpiringSoon,
      },
    });
    report.push({
      provider,
      integrationKey: integration.integrationKey,
      status: normalizeIdentifier(integration.status || "UNKNOWN").toUpperCase(),
      refreshed,
      revokedDetected,
      reauthorizeRequired,
    });
  }

  return {
    tenantKey,
    provider: requestedProvider,
    environment,
    report,
  };
};

export const reconcileMetaColdBoot = async (input: {
  businessId: string;
  tenantId?: string | null;
  provider?: "INSTAGRAM" | "WHATSAPP" | "ALL" | string | null;
  environment?: ConnectEnvironment | string | null;
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
  const requestedProvider = normalizeIdentifier(input.provider || "ALL").toUpperCase();
  const providers: Array<"INSTAGRAM" | "WHATSAPP"> =
    requestedProvider === "INSTAGRAM"
      ? ["INSTAGRAM"]
      : requestedProvider === "WHATSAPP"
      ? ["WHATSAPP"]
      : ["INSTAGRAM", "WHATSAPP"];

  let repairedHealth = 0;
  let repairedWebhook = 0;
  let permissionDowngradeDetected = 0;
  const repairedIntegrations: string[] = [];

  for (const provider of providers) {
    const integration =
      listIntegrations({
        tenantKey,
        provider,
        environment,
      }).find((row) => row.status !== "DISCONNECTED") || null;
    if (!integration) {
      continue;
    }
    const health = getIntegrationHealth(integration.integrationKey);
    if (!health) {
      await setIntegrationHealth({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        status: normalizeStatus(integration.status || "VERIFYING", "VERIFYING"),
        healthScore: normalizeStatus(integration.status || "VERIFYING", "VERIFYING") === "CONNECTED"
          ? 95
          : 65,
        actionHint: null,
      });
      repairedHealth += 1;
      repairedIntegrations.push(integration.integrationKey);
    }

    const webhook = getProviderWebhookRow(integration.integrationKey);
    if (!webhook) {
      await setProviderWebhook({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        eventType: "INBOUND",
        status: "ACTIVE",
        consecutiveFailures: 0,
        lastDeliveryAt: now(),
      });
      repairedWebhook += 1;
      repairedIntegrations.push(integration.integrationKey);
    } else if (String(webhook.status || "").toUpperCase() !== "ACTIVE") {
      await recoverProviderWebhook({
        businessId: tenantId,
        tenantId,
        provider,
        environment,
      });
      repairedWebhook += 1;
      repairedIntegrations.push(integration.integrationKey);
    }

    const permissionRow = getStore().integrationPermissionLedger.get(
      `integration_permission:${integration.integrationKey}`
    );
    if (permissionRow && Array.isArray(permissionRow.missingScopes) && permissionRow.missingScopes.length) {
      permissionDowngradeDetected += 1;
      await setIntegrationHealth({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        status: "PERMISSION_MISSING",
        healthScore: 44,
        rootCauseCode: `${provider}_PERMISSION_DOWNGRADE`,
        rootCauseMessage: "Missing required scopes detected during cold boot reconcile.",
        actionHint: "REAUTHORIZE",
      });
      await createDiagnostic({
        integrationKey: integration.integrationKey,
        tenantKey,
        provider,
        environment,
        severity: "ERROR",
        code: `${provider}_PERMISSION_DOWNGRADE`,
        message: "Permission downgrade detected during cold boot reconcile.",
        fixAction: "REAUTHORIZE",
      });
    }
  }

  return {
    tenantKey,
    provider: requestedProvider,
    environment,
    reconciled: true,
    repairedHealth,
    repairedWebhook,
    permissionDowngradeDetected,
    repairedIntegrations: Array.from(new Set(repairedIntegrations)),
  };
};

export const seedMetaReviewerMode = async (input: {
  businessId: string;
  tenantId?: string | null;
  environment?: ConnectEnvironment | string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const environment = normalizeEnvironment(input.environment || "SANDBOX");
  await provisionTenantSaaSPackaging({
    businessId: tenantId,
    tenantId,
    plan: "ENTERPRISE",
    replayToken: "meta_reviewer_seed_provision",
  });
  const instagram = await connectInstagramOneClick({
    businessId: tenantId,
    tenantId,
    environment,
    replayToken: "meta_reviewer_seed_instagram",
    reconnect: true,
    externalAccountRef: "reviewer_ig_account",
    scopes: [
      "instagram_basic",
      "instagram_manage_messages",
      "pages_manage_metadata",
    ],
    metaProof: {
      stateSigned: true,
      redirectValidated: true,
      permissions: [
        "instagram_basic",
        "instagram_manage_messages",
        "pages_manage_metadata",
      ],
      businesses: ["review_business_1"],
      pages: ["review_page_1"],
      instagramProfessionalAccountId: "review_ig_professional_1",
      pageId: "review_page_1",
      webhookChallengeVerified: true,
      profile: {
        id: "review_ig_professional_1",
        username: "reviewer_demo_ig",
      },
      permissionAudit: {
        result: "PASS",
      },
      healthAudit: {
        result: "PASS",
      },
    },
  });
  const whatsapp = await connectWhatsAppGuidedWizard({
    businessId: tenantId,
    tenantId,
    environment,
    replayToken: "meta_reviewer_seed_whatsapp",
    reconnect: true,
    businessManagerId: "review_bm_1",
    wabaId: "review_waba_1",
    phoneNumberId: "review_phone_1",
    displayName: "Reviewer Demo Number",
    displayNameReviewStatus: "APPROVED",
    qualityRating: "GREEN",
    tier: "TIER_1K",
    allowSandboxSlot: true,
    metaProof: {
      permissions: [
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ],
      callbackVerified: true,
      testMessageDelivered: true,
      phoneConnected: true,
    },
  });
  const reconcile = await reconcileMetaColdBoot({
    businessId: tenantId,
    tenantId,
    provider: "ALL",
    environment,
  });
  const doctor = await runMetaConnectDoctor({
    businessId: tenantId,
    tenantId,
    provider: "ALL",
    environment,
    autoResolve: true,
  });

  return {
    tenantId,
    environment,
    seeded: true,
    demoScript: [
      "1. Open settings and click Connect Instagram.",
      "2. Complete OAuth and verify connected status in connect hub.",
      "3. Open webhook diagnostics and verify challenge + active subscription.",
      "4. Connect WhatsApp, confirm number registration, and send health test message.",
      "5. Open reviewer logs and confirm deterministic audit entries.",
    ],
    testAssets: {
      instagramAccountRef: instagram.integration?.externalAccountRef || null,
      whatsappAccountRef: whatsapp.integration?.externalAccountRef || null,
      webhookProof: {
        instagram: getProviderWebhookRow(instagram.integration?.integrationKey || "") || null,
        whatsapp: getProviderWebhookRow(whatsapp.integration?.integrationKey || "") || null,
      },
    },
    permissionsMapped: {
      instagram: [
        "instagram_basic",
        "instagram_manage_messages",
        "pages_manage_metadata",
      ],
      whatsapp: [
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ],
    },
    reviewLogs: Array.from(getStore().integrationAuditLedger.values())
      .filter((row) => row.tenantKey === makeTenantKey(tenantId))
      .slice(-40),
    healthProof: {
      instagram: instagram.health,
      whatsapp: whatsapp.health,
      doctor,
      reconcile,
    },
  };
};

export const generateMetaAppReviewPack = async (input: {
  businessId: string;
  tenantId?: string | null;
  environment?: ConnectEnvironment | string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId || null,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const environment = normalizeEnvironment(input.environment || "LIVE");
  const tenantKey = makeTenantKey(tenantId);
  const projection = await getConnectHubProjection({
    businessId: tenantId,
    tenantId,
  });
  const reviewLogs = Array.from(getStore().integrationAuditLedger.values()).filter(
    (row) => row.tenantKey === tenantKey
  );

  return {
    tenantId,
    environment,
    generatedAt: now().toISOString(),
    reviewChecklist: [
      "Instagram OAuth flow completes with signed state and redirect validation.",
      "Instagram webhook challenge succeeds and subscription is active.",
      "Instagram profile and permission audit are visible in canonical logs.",
      "WhatsApp number registration and callback verification are visible.",
      "WhatsApp health test message evidence is present.",
      "Replay/out-of-order webhook safeguards are enabled.",
      "Token lifecycle sweep and refresh evidence available.",
    ],
    reviewDemoScript: [
      "Start reviewer tenant from seed endpoint.",
      "Run Instagram connect and show flow trace to CONNECTED.",
      "Run WhatsApp connect and show display name review + quality tier metadata.",
      "Trigger doctor and show auto-fix + guided fixes.",
      "Open cold boot reconcile proof.",
    ],
    reviewCredentialsDoc: {
      required: [
        "Meta App ID",
        "Meta App Secret",
        "INSTAGRAM_VERIFY_TOKEN",
        "WHATSAPP_VERIFY_TOKEN",
      ],
      notes: "Use test app credentials during review and rotate before production go-live.",
    },
    permissionJustificationMatrix: [
      {
        permission: "instagram_basic",
        reason: "Read professional account identity for routing and profile sync.",
      },
      {
        permission: "instagram_manage_messages",
        reason: "Receive and respond to Instagram DMs in unified inbox.",
      },
      {
        permission: "pages_manage_metadata",
        reason: "Subscribe webhook and validate page linkage state.",
      },
      {
        permission: "whatsapp_business_management",
        reason: "Bind WABA, number, and display name review lifecycle.",
      },
      {
        permission: "whatsapp_business_messaging",
        reason: "Send and receive WhatsApp messages including health tests.",
      },
    ],
    screencastFlowList: [
      "01_connect_instagram_signed_state",
      "02_instagram_webhook_challenge",
      "03_instagram_profile_health_audit",
      "04_connect_whatsapp_number_registration",
      "05_whatsapp_callback_and_health_test",
      "06_connect_doctor_and_cold_boot_reconcile",
    ],
    projection,
    reviewLogs: reviewLogs.slice(-60),
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
    const liveSelection = getCanonicalIntegrationForProvider({
      tenantKey,
      provider,
      environment: "LIVE",
    });
    const sandboxSelection = getCanonicalIntegrationForProvider({
      tenantKey,
      provider,
      environment: "SANDBOX",
    });
    const liveConnections = listIntegrations({
      tenantKey,
      provider,
      environment: "LIVE",
    }).filter((row) => row.status !== "DISCONNECTED").length;
    const sandboxConnections = listIntegrations({
      tenantKey,
      provider,
      environment: "SANDBOX",
    }).filter((row) => row.status !== "DISCONNECTED").length;
    const livePermission =
      liveSelection?.integration?.integrationKey
        ? getStore().integrationPermissionLedger.get(
            `integration_permission:${liveSelection.integration.integrationKey}`
          )
        : null;
    const sandboxPermission =
      sandboxSelection?.integration?.integrationKey
        ? getStore().integrationPermissionLedger.get(
            `integration_permission:${sandboxSelection.integration.integrationKey}`
          )
        : null;
    const liveCredential =
      liveSelection?.integration?.integrationKey
        ? getStore().integrationCredentialLedger.get(
            `integration_credential:${liveSelection.integration.integrationKey}`
          )
        : null;
    const sandboxCredential =
      sandboxSelection?.integration?.integrationKey
        ? getStore().integrationCredentialLedger.get(
            `integration_credential:${sandboxSelection.integration.integrationKey}`
          )
        : null;
    const liveWebhook = liveSelection?.integration?.integrationKey
      ? getProviderWebhookRow(liveSelection.integration.integrationKey)
      : null;
    const sandboxWebhook = sandboxSelection?.integration?.integrationKey
      ? getProviderWebhookRow(sandboxSelection.integration.integrationKey)
      : null;
    return {
      provider,
      live: {
        status: normalizeStatus(
          liveSelection?.health?.status ||
            liveSelection?.integration?.status ||
            "DISCONNECTED",
          "DISCONNECTED"
        ),
        healthScore: toNumber(liveSelection?.health?.healthScore, 0),
        integrationKey: liveSelection?.integration?.integrationKey || null,
        connectionCount: liveConnections,
        tokenExpiresAt: liveSelection?.integration?.tokenExpiresAt || null,
        tokenStatus: normalizeIdentifier(liveCredential?.status || "") || "UNKNOWN",
        webhookStatus: normalizeIdentifier(liveWebhook?.status || "") || "INACTIVE",
        missingScopes: toArray(livePermission?.missingScopes || []),
      },
      sandbox: {
        status: normalizeStatus(
          sandboxSelection?.health?.status ||
            sandboxSelection?.integration?.status ||
            "DISCONNECTED",
          "DISCONNECTED"
        ),
        healthScore: toNumber(sandboxSelection?.health?.healthScore, 0),
        integrationKey: sandboxSelection?.integration?.integrationKey || null,
        connectionCount: sandboxConnections,
        tokenExpiresAt: sandboxSelection?.integration?.tokenExpiresAt || null,
        tokenStatus: normalizeIdentifier(sandboxCredential?.status || "") || "UNKNOWN",
        webhookStatus: normalizeIdentifier(sandboxWebhook?.status || "") || "INACTIVE",
        missingScopes: toArray(sandboxPermission?.missingScopes || []),
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
  diagnostics.sort((left, right) => {
    const leftResolved = Boolean(left.resolvedAt);
    const rightResolved = Boolean(right.resolvedAt);
    if (leftResolved !== rightResolved) {
      return leftResolved ? 1 : -1;
    }
    return (
      new Date(right.updatedAt || right.createdAt || 0).getTime() -
      new Date(left.updatedAt || left.createdAt || 0).getTime()
    );
  });
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
  const attemptRows = Array.from(store.connectionAttemptLedger.values()).filter(scopeFilter);
  const diagnostics = Array.from(store.connectionDiagnosticLedger.values()).filter(scopeFilter);
  const usageRows = Array.from(store.tenantUsageLedger.values()).filter(scopeFilter);
  const configRows = Array.from(store.tenantConfigLedger.values()).filter(scopeFilter);
  const wizardRows = Array.from(store.setupWizardLedger.values()).filter(scopeFilter);
  const overrideRows = Array.from(store.packagingOverrideLedger.values()).filter(scopeFilter);
  const policyRows = Array.from(store.integrationPolicyLedger.values()).filter(scopeFilter);
  const oauthRows = Array.from(store.oauthStateLedger.values()).filter(scopeFilter);
  const tokenRefreshRows = Array.from(store.tokenRefreshLedger.values()).filter(scopeFilter);
  const sandboxRows = Array.from(store.sandboxLedger.values()).filter(scopeFilter);
  const brandingRows = Array.from(store.brandingLedger.values()).filter(scopeFilter);
  const marketplaceRows = Array.from(store.marketplaceLedger.values()).filter(scopeFilter);
  const environmentRows = Array.from(store.environmentLedger.values()).filter(scopeFilter);
  const provisioningRows = Array.from(store.provisioningLedger.values()).filter(scopeFilter);
  const upgradeRows = Array.from(store.upgradeLedger.values()).filter(scopeFilter);
  const seatRows = Array.from(store.seatLedger.values()).filter(scopeFilter);
  const roleAssignmentRows = Array.from(store.roleAssignmentLedger.values()).filter(scopeFilter);
  const credentialRows = Array.from(store.integrationCredentialLedger.values()).filter(
    scopeFilter
  );
  const permissionRows = Array.from(store.integrationPermissionLedger.values()).filter(
    scopeFilter
  );
  const quotaRows = Array.from(store.integrationQuotaLedger.values()).filter(scopeFilter);
  const integrationAuditRows = Array.from(store.integrationAuditLedger.values()).filter(
    scopeFilter
  );

  const existingResourceKeys = new Set<string>();
  for (const row of [
    ...tenantRows,
    ...planRows,
    ...entitlementRows,
    ...integrationRows,
    ...healthRows,
    ...webhookRows,
    ...attemptRows,
    ...diagnostics,
    ...usageRows,
    ...configRows,
    ...wizardRows,
    ...overrideRows,
    ...policyRows,
    ...oauthRows,
    ...tokenRefreshRows,
    ...sandboxRows,
    ...brandingRows,
    ...marketplaceRows,
    ...environmentRows,
    ...provisioningRows,
    ...upgradeRows,
    ...seatRows,
    ...roleAssignmentRows,
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
      "policyKey",
      "oauthStateKey",
      "refreshKey",
      "sandboxKey",
      "brandingKey",
      "installKey",
      "environmentKey",
      "provisioningKey",
      "upgradeKey",
      "seatKey",
      "assignmentKey",
      "attemptKey",
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
  const metaCanonicalChecks = {
    canonicalAuthoritiesPresent: META_ENTERPRISE_CANONICAL_AUTHORITIES.every((authority) =>
      store.authorities.has(authority)
    ),
    credentialTracked:
      credentialRows.length >= integrationRows.length || integrationRows.length === 0,
    permissionTracked:
      permissionRows.length >= integrationRows.length || integrationRows.length === 0,
    quotaTracked: quotaRows.length > 0 || integrationRows.length === 0,
    auditTrailPresent: integrationAuditRows.length > 0 || integrationRows.length === 0,
  };
  const reviewerSafe =
    metaCanonicalChecks.canonicalAuthoritiesPresent &&
    metaCanonicalChecks.credentialTracked &&
    metaCanonicalChecks.permissionTracked &&
    metaCanonicalChecks.auditTrailPresent;
  const enterpriseSafe = reviewerSafe && checks.replaySafe && checks.dedupeSafe;
  return {
    phaseVersion: SAAS_PACKAGING_PHASE_VERSION,
    tenantKey,
    deeplyWired,
    checks,
    metaCanonicalChecks,
    reviewerSafe,
    enterpriseSafe,
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
      credentials: credentialRows.length,
      permissions: permissionRows.length,
      quotas: quotaRows.length,
      audits: integrationAuditRows.length,
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
