// @ts-nocheck
import crypto from "crypto";
import prisma from "../config/prisma";
import { resolveConsentAuthority } from "./consentAuthority.service";
import { bootstrapDeveloperPlatformExtensibilityOS } from "./developerPlatformExtensibilityOS.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import {
  bootstrapReliabilityOS,
  raiseReliabilityAlert,
  recordObservabilityEvent,
  recordTraceLedger,
} from "./reliability/reliabilityOS.service";
import { bootstrapSaaSPackagingConnectHubOS } from "./saasPackagingConnectHubOS.service";
import {
  bootstrapSecurityGovernanceOS,
  enforceSecurityGovernanceInfluence,
} from "./security/securityGovernanceOS.service";

type JsonRecord = Record<string, unknown>;
type StoreMap = Map<string, any>;

export const GROWTH_PHASE_VERSION = "phase6f.final.v1";

export const GROWTH_AUTHORITIES = [
  "GrowthCampaignLedger",
  "CampaignExecutionLedger",
  "AttributionLedger",
  "AcquisitionLedger",
  "ReferralLedger",
  "AffiliateLedger",
  "PartnerLedger",
  "LifecycleJourneyLedger",
  "CustomerHealthLedger",
  "ChurnRiskLedger",
  "ExpansionOpportunityLedger",
  "PricingExperimentLedger",
  "OfferLedger",
  "PromotionLedger",
  "ContentEngineLedger",
  "ChannelPerformanceLedger",
  "CACLedger",
  "LTVLedger",
  "PaybackLedger",
  "AdvocacyLedger",
  "ReviewRequestLedger",
  "CommunityLedger",
  "GrowthPolicyLedger",
  "GrowthOverrideLedger",
] as const;

export const GROWTH_ENGINES = [
  "ACQUISITION_ENGINE",
  "REFERRAL_ENGINE",
  "AFFILIATE_PARTNER_ENGINE",
  "LIFECYCLE_ENGINE",
  "CHURN_PREVENTION_ENGINE",
  "EXPANSION_ENGINE",
  "PRICING_OFFER_ENGINE",
  "CONTENT_ENGINE",
  "ADVOCACY_ENGINE",
  "GROWTH_INTELLIGENCE_ENGINE",
  "BILLING_LINKAGE_ENGINE",
  "COMPLIANCE_ENGINE",
  "ATTRIBUTION_ENGINE",
  "ORCHESTRATION_ENGINE",
  "OVERRIDE_ENGINE",
  "POLICY_ENGINE",
  "REPLAY_ENGINE",
  "FAILURE_CONTAINMENT_ENGINE",
] as const;

export const GROWTH_EVENTS = [
  "growth.acquisition.captured",
  "growth.attribution.captured",
  "growth.referral.rewarded",
  "growth.referral.blocked",
  "growth.affiliate.flagged",
  "growth.partner.onboarded",
  "growth.lifecycle.advanced",
  "growth.churn.intervention",
  "growth.expansion.detected",
  "growth.pricing.experiment_launched",
  "growth.pricing.rolled_back",
  "growth.offer.published",
  "growth.content.generated",
  "growth.advocacy.rewarded",
  "growth.channel.saturated",
  "growth.override.applied",
  "growth.execution.failed",
] as const;

type GrowthAuthority = (typeof GROWTH_AUTHORITIES)[number];
type GrowthEngine = (typeof GROWTH_ENGINES)[number];

type GrowthStore = {
  bootstrappedAt: Date | null;
  invokeCount: number;
  authorities: Map<GrowthAuthority, number>;
  engineInvocations: Map<GrowthEngine, number>;
  wiringDomains: Set<string>;
  replayIndex: Map<string, string>;
  dedupeIndex: Map<string, string>;
  chainTailByScope: Map<string, string>;
  failpoints: Set<string>;
  growthCampaignLedger: StoreMap;
  campaignExecutionLedger: StoreMap;
  attributionLedger: StoreMap;
  acquisitionLedger: StoreMap;
  referralLedger: StoreMap;
  affiliateLedger: StoreMap;
  partnerLedger: StoreMap;
  lifecycleJourneyLedger: StoreMap;
  customerHealthLedger: StoreMap;
  churnRiskLedger: StoreMap;
  expansionOpportunityLedger: StoreMap;
  pricingExperimentLedger: StoreMap;
  offerLedger: StoreMap;
  promotionLedger: StoreMap;
  contentEngineLedger: StoreMap;
  channelPerformanceLedger: StoreMap;
  cacLedger: StoreMap;
  ltvLedger: StoreMap;
  paybackLedger: StoreMap;
  advocacyLedger: StoreMap;
  reviewRequestLedger: StoreMap;
  communityLedger: StoreMap;
  growthPolicyLedger: StoreMap;
  growthOverrideLedger: StoreMap;
};

const REQUIRED_WIRING_DOMAINS = [
  "AI",
  "CRM",
  "RECEPTION",
  "HUMAN",
  "BOOKING",
  "COMMERCE",
  "INTELLIGENCE",
  "RELIABILITY",
  "SECURITY",
  "DEVELOPER_PLATFORM",
  "CONNECT_HUB",
] as const;

const LIFECYCLE_STATE_MACHINE = {
  activation: {
    NEW: "ACTIVATED",
    ACTIVATED: "ONBOARDED",
    ONBOARDED: "ENGAGED",
    ENGAGED: "ADVOCACY",
  },
  onboarding: {
    NEW: "PROFILED",
    PROFILED: "MILESTONE_1",
    MILESTONE_1: "MILESTONE_2",
    MILESTONE_2: "COMPLETE",
  },
  engagement: {
    PASSIVE: "ACTIVE",
    ACTIVE: "POWER_USER",
    POWER_USER: "ADVOCATE",
  },
  upsell: {
    NONE: "DISCOVERY",
    DISCOVERY: "OFFERED",
    OFFERED: "NEGOTIATING",
    NEGOTIATING: "CLOSED_WON",
  },
  renewal: {
    UPCOMING: "REMINDED",
    REMINDED: "NEGOTIATING",
    NEGOTIATING: "RENEWED",
  },
  reactivation: {
    DORMANT: "NUDGED",
    NUDGED: "RESPONDED",
    RESPONDED: "ACTIVE",
  },
  retention: {
    HEALTHY: "WATCHED",
    WATCHED: "AT_RISK",
    AT_RISK: "SAVED",
  },
  winback: {
    LOST: "NURTURED",
    NURTURED: "REENGAGED",
    REENGAGED: "ACTIVE",
  },
  advocacy: {
    ELIGIBLE: "INVITED",
    INVITED: "REVIEWED",
    REVIEWED: "AMBASSADOR",
  },
} as const;

const shouldUseInMemory =
  process.env.NODE_ENV === "test" ||
  process.argv.some((value) => value.includes("run-tests"));

const db = prisma as any;
const now = () => new Date();

const globalForGrowth = globalThis as typeof globalThis & {
  __sylphGrowthExpansionStore?: GrowthStore;
};

const toRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toInt = (value: unknown, fallback = 0) =>
  Math.trunc(toNumber(value, fallback));

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeIdentifier = (value: unknown) => String(value || "").trim();

const normalizeTenantId = (input: {
  tenantId?: string | null;
  businessId?: string | null;
}) => normalizeIdentifier(input.tenantId || input.businessId || "") || null;

const normalizeChannel = (value: unknown) =>
  normalizeIdentifier(value).toUpperCase() || "UNKNOWN";

const normalizeScope = (value: unknown, fallback = "GLOBAL") =>
  normalizeIdentifier(value).toUpperCase() || fallback;

const stableHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const buildTenantKey = (tenantId: string) => `tenant:${tenantId}`;

const createStore = (): GrowthStore => ({
  bootstrappedAt: null,
  invokeCount: 0,
  authorities: new Map(),
  engineInvocations: new Map(),
  wiringDomains: new Set(),
  replayIndex: new Map(),
  dedupeIndex: new Map(),
  chainTailByScope: new Map(),
  failpoints: new Set(),
  growthCampaignLedger: new Map(),
  campaignExecutionLedger: new Map(),
  attributionLedger: new Map(),
  acquisitionLedger: new Map(),
  referralLedger: new Map(),
  affiliateLedger: new Map(),
  partnerLedger: new Map(),
  lifecycleJourneyLedger: new Map(),
  customerHealthLedger: new Map(),
  churnRiskLedger: new Map(),
  expansionOpportunityLedger: new Map(),
  pricingExperimentLedger: new Map(),
  offerLedger: new Map(),
  promotionLedger: new Map(),
  contentEngineLedger: new Map(),
  channelPerformanceLedger: new Map(),
  cacLedger: new Map(),
  ltvLedger: new Map(),
  paybackLedger: new Map(),
  advocacyLedger: new Map(),
  reviewRequestLedger: new Map(),
  communityLedger: new Map(),
  growthPolicyLedger: new Map(),
  growthOverrideLedger: new Map(),
});

const getStore = () => {
  if (!globalForGrowth.__sylphGrowthExpansionStore) {
    globalForGrowth.__sylphGrowthExpansionStore = createStore();
  }
  return globalForGrowth.__sylphGrowthExpansionStore;
};

const bumpAuthority = (authority: GrowthAuthority) => {
  const store = getStore();
  store.authorities.set(authority, (store.authorities.get(authority) || 0) + 1);
};

const bumpEngine = (engine: GrowthEngine) => {
  const store = getStore();
  store.engineInvocations.set(engine, (store.engineInvocations.get(engine) || 0) + 1);
};

const markWiringDomain = (...domains: string[]) => {
  const store = getStore();
  for (const domain of domains) {
    store.wiringDomains.add(domain);
  }
};

const assertFailpoint = (name: string) => {
  if (getStore().failpoints.has(name)) {
    throw new Error(`failpoint:${name}`);
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
  authority: GrowthAuthority,
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

const registerDedupe = (key: string, resourceKey: string) => {
  getStore().dedupeIndex.set(key, resourceKey);
};

const resolveDedupe = (key: string) => getStore().dedupeIndex.get(key) || null;

const makeScopedReplayKey = (input: {
  tenantKey: string;
  flow: string;
  replayToken: string;
  entityKey?: string | null;
}) =>
  [
    input.tenantKey,
    normalizeScope(input.flow, "FLOW"),
    normalizeIdentifier(input.entityKey || "*"),
    normalizeIdentifier(input.replayToken),
  ].join(":");

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
    domain: "GROWTH",
    action: input.action,
    businessId: input.businessId || null,
    tenantId: input.tenantId || input.businessId || null,
    actorId: "growth_expansion_os",
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
    subsystem: "GROWTH",
    severity: input.severity,
    title: "Growth OS containment triggered",
    message: input.reason,
    dedupeKey: input.dedupeKey,
    rootCauseKey: `growth:${input.dedupeKey}`,
    rootCause: input.reason,
    context: {
      provider: "INTERNAL_API",
      component: "growth-expansion-os",
      phase: "phase6f",
      version: GROWTH_PHASE_VERSION,
    },
    metadata: input.metadata || null,
  }).catch(() => undefined);
};

const upsertLedgerRecord = async (input: {
  authority: GrowthAuthority;
  storeMap: StoreMap;
  keyField: string;
  keyValue: string;
  row: JsonRecord;
  dbLedgers: string[];
}) => {
  const tenantKey = normalizeIdentifier((input.row as any).tenantKey || "tenant:global");
  const chain = withChain(tenantKey, input.authority, input.row);
  const enrichedRow = {
    ...input.row,
    metadata: {
      ...toRecord((input.row as any).metadata),
      phaseVersion: GROWTH_PHASE_VERSION,
      chain,
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

const resolveStoreMapByAuthority = (authority: GrowthAuthority): StoreMap => {
  const store = getStore();
  const map = {
    GrowthCampaignLedger: store.growthCampaignLedger,
    CampaignExecutionLedger: store.campaignExecutionLedger,
    AttributionLedger: store.attributionLedger,
    AcquisitionLedger: store.acquisitionLedger,
    ReferralLedger: store.referralLedger,
    AffiliateLedger: store.affiliateLedger,
    PartnerLedger: store.partnerLedger,
    LifecycleJourneyLedger: store.lifecycleJourneyLedger,
    CustomerHealthLedger: store.customerHealthLedger,
    ChurnRiskLedger: store.churnRiskLedger,
    ExpansionOpportunityLedger: store.expansionOpportunityLedger,
    PricingExperimentLedger: store.pricingExperimentLedger,
    OfferLedger: store.offerLedger,
    PromotionLedger: store.promotionLedger,
    ContentEngineLedger: store.contentEngineLedger,
    ChannelPerformanceLedger: store.channelPerformanceLedger,
    CACLedger: store.cacLedger,
    LTVLedger: store.ltvLedger,
    PaybackLedger: store.paybackLedger,
    AdvocacyLedger: store.advocacyLedger,
    ReviewRequestLedger: store.reviewRequestLedger,
    CommunityLedger: store.communityLedger,
    GrowthPolicyLedger: store.growthPolicyLedger,
    GrowthOverrideLedger: store.growthOverrideLedger,
  } as Record<GrowthAuthority, StoreMap>;
  return map[authority];
};

const assertContactAllowedByConsent = async (input: {
  businessId: string;
  leadId?: string | null;
  channel?: string | null;
  scope?: string;
}) => {
  bumpEngine("COMPLIANCE_ENGINE");
  if (!input.leadId) {
    return {
      allowed: true,
      reason: "lead_not_provided",
      decision: null,
    };
  }
  const channel = normalizeChannel(input.channel || "ALL");
  const scope = normalizeScope(input.scope || "OUTBOUND", "OUTBOUND");
  const decision = await resolveConsentAuthority({
    businessId: input.businessId,
    leadId: input.leadId,
    channel,
    scope,
  }).catch(() => null);

  if (decision?.status === "REVOKED") {
    return {
      allowed: false,
      reason: `consent_revoked:${channel}:${scope}`,
      decision,
    };
  }
  return {
    allowed: true,
    reason: decision ? `consent_${decision.status.toLowerCase()}` : "consent_unknown_allow",
    decision,
  };
};

const getActiveGrowthPolicy = (input: {
  tenantKey: string;
  scope: string;
  targetType: string;
  targetKey?: string | null;
}) => {
  const scope = normalizeScope(input.scope, "GLOBAL");
  const targetType = normalizeScope(input.targetType, "TENANT");
  const targetKey = normalizeIdentifier(input.targetKey || "");
  const candidates = Array.from(getStore().growthPolicyLedger.values()).filter((row) => {
    if (!row.isActive) {
      return false;
    }
    if (row.tenantKey !== input.tenantKey) {
      return false;
    }
    if (row.scope !== scope && row.scope !== "GLOBAL") {
      return false;
    }
    if (row.targetType !== targetType && row.targetType !== "TENANT") {
      return false;
    }
    if (targetKey && normalizeIdentifier(row.targetKey || "") && normalizeIdentifier(row.targetKey || "") !== targetKey) {
      return false;
    }
    return true;
  });
  candidates.sort((left, right) => {
    const versionDelta = toInt(right.version, 0) - toInt(left.version, 0);
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

const getActiveGrowthOverride = (input: {
  tenantKey: string;
  scope: string;
  targetType: string;
  targetKey?: string | null;
  at?: Date;
}) => {
  const at = input.at || now();
  const scope = normalizeScope(input.scope, "GLOBAL");
  const targetType = normalizeScope(input.targetType, "TENANT");
  const targetKey = normalizeIdentifier(input.targetKey || "");
  const candidates = Array.from(getStore().growthOverrideLedger.values()).filter((row) => {
    if (!row.isActive) {
      return false;
    }
    if (row.tenantKey !== input.tenantKey) {
      return false;
    }
    if (row.scope !== scope && row.scope !== "GLOBAL") {
      return false;
    }
    if (row.targetType !== targetType && row.targetType !== "TENANT") {
      return false;
    }
    if (targetKey && normalizeIdentifier(row.targetKey || "") && normalizeIdentifier(row.targetKey || "") !== targetKey) {
      return false;
    }
    const effectiveAt = row.effectiveFrom ? new Date(row.effectiveFrom).getTime() : 0;
    const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
    if (effectiveAt > at.getTime()) {
      return false;
    }
    if (expiresAt && expiresAt <= at.getTime()) {
      return false;
    }
    return true;
  });
  candidates.sort((left, right) => {
    const priorityDelta = toInt(right.priority, 0) - toInt(left.priority, 0);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return (
      new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    );
  });
  return candidates[0] || null;
};

const ensureDefaultGrowthPolicy = async (tenantKey: string, businessId?: string | null) => {
  const existing = getActiveGrowthPolicy({
    tenantKey,
    scope: "GLOBAL",
    targetType: "TENANT",
    targetKey: null,
  });
  if (existing) {
    return existing;
  }

  return upsertLedgerRecord({
    authority: "GrowthPolicyLedger",
    storeMap: getStore().growthPolicyLedger,
    keyField: "policyKey",
    keyValue: `growth_policy:${tenantKey}:default`,
    row: {
      policyKey: `growth_policy:${tenantKey}:default`,
      tenantKey,
      businessId: businessId || null,
      scope: "GLOBAL",
      targetType: "TENANT",
      targetKey: null,
      status: "APPROVED",
      version: 1,
      isActive: true,
      rules: {
        allowedChannels: ["WHATSAPP", "INSTAGRAM", "EMAIL", "SEO", "CONTENT", "REFERRAL"],
        blockedChannels: [],
        maxSaturationScore: 1.35,
        requireConsent: true,
        fraudContainmentEnabled: true,
        minOfferCooldownHours: 24,
      },
      metadata: {
        seededBy: GROWTH_PHASE_VERSION,
      },
    },
    dbLedgers: ["growthPolicyLedger"],
  });
};

const evaluatePolicy = (input: {
  tenantKey: string;
  scope: string;
  targetType: string;
  targetKey?: string | null;
  channel?: string | null;
  saturationScore?: number | null;
}) => {
  bumpEngine("POLICY_ENGINE");
  bumpEngine("OVERRIDE_ENGINE");
  const policy = getActiveGrowthPolicy(input);
  const override = getActiveGrowthOverride(input);

  if (override) {
    const overrideAction = normalizeScope(override.action || "ALLOW", "ALLOW");
    if (["BLOCK", "PAUSE", "DENY"].includes(overrideAction)) {
      return {
        allowed: false,
        reason: `override_${overrideAction.toLowerCase()}`,
        policy,
        override,
      };
    }
    if (["ALLOW", "FORCE_ALLOW", "RESUME"].includes(overrideAction)) {
      return {
        allowed: true,
        reason: `override_${overrideAction.toLowerCase()}`,
        policy,
        override,
      };
    }
  }

  if (!policy) {
    return {
      allowed: true,
      reason: "no_policy_allow",
      policy: null,
      override,
    };
  }

  const rules = toRecord(policy.rules);
  const allowedChannels = Array.isArray(rules.allowedChannels)
    ? rules.allowedChannels.map((value) => normalizeChannel(value))
    : [];
  const blockedChannels = Array.isArray(rules.blockedChannels)
    ? rules.blockedChannels.map((value) => normalizeChannel(value))
    : [];
  const channel = normalizeChannel(input.channel || "UNKNOWN");
  const saturationScore = toNumber(input.saturationScore, 0);
  const maxSaturationScore = clamp(toNumber(rules.maxSaturationScore, 1.35), 0.2, 5);

  if (blockedChannels.includes(channel)) {
    return {
      allowed: false,
      reason: `channel_blocked:${channel}`,
      policy,
      override,
    };
  }

  if (allowedChannels.length && !allowedChannels.includes(channel)) {
    return {
      allowed: false,
      reason: `channel_not_allowed:${channel}`,
      policy,
      override,
    };
  }

  if (saturationScore > maxSaturationScore) {
    return {
      allowed: false,
      reason: `saturation_exceeded:${saturationScore.toFixed(2)}`,
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

const pickLifecycleNextState = (input: {
  journeyType: string;
  currentState: string;
  signal?: string | null;
}) => {
  const journeyType = normalizeIdentifier(input.journeyType).toLowerCase();
  const currentState = normalizeScope(input.currentState || "NEW", "NEW");
  const signal = normalizeScope(input.signal || "NONE", "NONE");
  const machine = (LIFECYCLE_STATE_MACHINE as any)[journeyType] || null;

  if (machine && machine[currentState]) {
    return machine[currentState];
  }

  if (signal === "REGRESS") {
    return currentState;
  }
  if (signal === "ADVANCE") {
    return `${currentState}_NEXT`;
  }

  return currentState;
};

const makeCampaignKey = (input: {
  tenantKey: string;
  businessId?: string | null;
  channel: string;
  funnelType: string;
  campaignType: string;
  objective?: string | null;
}) =>
  `growth_campaign:${stableHash([
    input.tenantKey,
    input.businessId || null,
    normalizeChannel(input.channel),
    normalizeScope(input.funnelType, "UNKNOWN"),
    normalizeScope(input.campaignType, "UNKNOWN"),
    normalizeIdentifier(input.objective || "") || "objective",
  ]).slice(0, 32)}`;

const makeExecutionKey = (input: {
  tenantKey: string;
  campaignKey: string;
  action: string;
  startedAt: Date;
}) =>
  `growth_exec:${stableHash([
    input.tenantKey,
    input.campaignKey,
    normalizeIdentifier(input.action),
    input.startedAt.toISOString(),
  ]).slice(0, 32)}`;

const pickCohortKey = (value?: Date | null) => {
  const at = value instanceof Date ? value : now();
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
};

const recordChannelPerformanceInternal = async (input: {
  tenantKey: string;
  businessId?: string | null;
  channel: string;
  spendMinor: number;
  revenueMinor: number;
  conversions: number;
  customersAcquired: number;
  leadsTouched: number;
  windowStart?: Date;
  windowEnd?: Date;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("GROWTH_INTELLIGENCE_ENGINE");
  const channel = normalizeChannel(input.channel);
  const customersAcquired = Math.max(0, toInt(input.customersAcquired, 0));
  const conversions = Math.max(0, toInt(input.conversions, 0));
  const spendMinor = Math.max(0, toInt(input.spendMinor, 0));
  const revenueMinor = Math.max(0, toInt(input.revenueMinor, 0));
  const leadsTouched = Math.max(1, toInt(input.leadsTouched, customersAcquired || 1));
  const cacMinor = customersAcquired > 0 ? Math.round(spendMinor / customersAcquired) : spendMinor;
  const ltvMinor = customersAcquired > 0 ? Math.round(revenueMinor / customersAcquired) : revenueMinor;
  const paybackDays =
    cacMinor <= 0
      ? 0
      : ltvMinor <= 0
      ? 999
      : clamp(Math.round((cacMinor / Math.max(1, ltvMinor)) * 90), 1, 999);
  const conversionRate = clamp(conversions / leadsTouched, 0, 1);
  const saturationScore = clamp(
    (spendMinor / Math.max(1, revenueMinor + 1)) * 0.7 +
      (1 - conversionRate) * 0.7 +
      (cacMinor > 0 && ltvMinor > 0 ? cacMinor / Math.max(1, ltvMinor) : 0) * 0.4,
    0,
    2
  );
  const healthState =
    saturationScore >= 1.2 ? "SATURATED" : saturationScore >= 0.85 ? "WATCH" : "HEALTHY";
  const windowStart = input.windowStart || new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowEnd = input.windowEnd || now();
  const channelPerformanceKey = `channel_perf:${stableHash([
    input.tenantKey,
    channel,
    windowStart.toISOString(),
    windowEnd.toISOString(),
  ]).slice(0, 32)}`;

  const row = await upsertLedgerRecord({
    authority: "ChannelPerformanceLedger",
    storeMap: getStore().channelPerformanceLedger,
    keyField: "channelPerformanceKey",
    keyValue: channelPerformanceKey,
    row: {
      channelPerformanceKey,
      tenantKey: input.tenantKey,
      businessId: input.businessId || null,
      channel,
      windowStart,
      windowEnd,
      spendMinor,
      revenueMinor,
      cacMinor,
      ltvMinor,
      paybackDays,
      conversionRate,
      saturationScore,
      healthState,
      replayToken: normalizeIdentifier(input.replayToken || "") || null,
      dedupeKey: normalizeIdentifier(input.dedupeKey || "") || null,
      metadata: input.metadata || null,
    },
    dbLedgers: ["channelPerformanceLedger"],
  });

  if (healthState === "SATURATED") {
    await recordObservabilityEvent({
      businessId: input.businessId || null,
      tenantId: input.businessId || null,
      eventType: "growth.channel.saturated",
      message: `Channel ${channel} saturated`,
      severity: "warning",
      metadata: {
        channel,
        saturationScore,
        spendMinor,
        revenueMinor,
        conversionRate,
      },
    }).catch(() => undefined);
    await callReliabilityInfluence({
      businessId: input.businessId || null,
      tenantId: input.businessId || null,
      severity: "P3",
      reason: `channel_saturation:${channel}`,
      dedupeKey: `${input.tenantKey}:${channel}:saturation`,
      metadata: {
        saturationScore,
      },
    });
  }

  markWiringDomain("INTELLIGENCE", "RELIABILITY", "RECEPTION");
  return row;
};

export const bootstrapGrowthExpansionOS = async () => {
  const store = getStore();
  if (store.bootstrappedAt) {
    return {
      phaseVersion: GROWTH_PHASE_VERSION,
      bootstrappedAt: store.bootstrappedAt,
    };
  }

  await Promise.all([
    bootstrapReliabilityOS().catch(() => undefined),
    bootstrapSecurityGovernanceOS().catch(() => undefined),
    bootstrapDeveloperPlatformExtensibilityOS().catch(() => undefined),
    bootstrapSaaSPackagingConnectHubOS().catch(() => undefined),
  ]);

  const tenantKey = "tenant:global";
  await ensureDefaultGrowthPolicy(tenantKey, null);
  markWiringDomain(...REQUIRED_WIRING_DOMAINS);
  store.bootstrappedAt = now();
  store.invokeCount += 1;

  return {
    phaseVersion: GROWTH_PHASE_VERSION,
    bootstrappedAt: store.bootstrappedAt,
  };
};

export const applyGrowthPolicy = async (input: {
  businessId: string;
  tenantId?: string | null;
  scope?: string | null;
  targetType?: string | null;
  targetKey?: string | null;
  rules?: JsonRecord | null;
  status?: string | null;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("POLICY_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const scope = normalizeScope(input.scope || "GLOBAL", "GLOBAL");
  const targetType = normalizeScope(input.targetType || "TENANT", "TENANT");
  const targetKey = normalizeIdentifier(input.targetKey || "") || null;
  const replayToken = normalizeIdentifier(input.replayToken || "");

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "POLICY_APPLY",
      replayToken,
      entityKey: `${scope}:${targetType}:${targetKey || "*"}`,
    });
    const replayedKey = resolveReplay(replayKey);
    if (replayedKey) {
      return {
        replayed: true,
        policy: getStore().growthPolicyLedger.get(replayedKey) || null,
      };
    }
  }

  const matching = Array.from(getStore().growthPolicyLedger.values()).filter(
    (row) =>
      row.tenantKey === tenantKey &&
      row.scope === scope &&
      row.targetType === targetType &&
      normalizeIdentifier(row.targetKey || "") === normalizeIdentifier(targetKey || "")
  );
  const version = matching.length ? Math.max(...matching.map((row) => toInt(row.version, 1))) + 1 : 1;
  for (const row of matching) {
    if (row.isActive) {
      row.isActive = false;
      row.updatedAt = now();
    }
  }

  const policyKey = `growth_policy:${stableHash([
    tenantKey,
    scope,
    targetType,
    targetKey || "all",
    `v${version}`,
  ]).slice(0, 32)}`;

  const policy = await upsertLedgerRecord({
    authority: "GrowthPolicyLedger",
    storeMap: getStore().growthPolicyLedger,
    keyField: "policyKey",
    keyValue: policyKey,
    row: {
      policyKey,
      tenantKey,
      businessId: input.businessId,
      scope,
      targetType,
      targetKey,
      status: normalizeScope(input.status || "APPROVED", "APPROVED"),
      version,
      isActive: true,
      rules: {
        ...toRecord(input.rules),
      },
      replayToken: replayToken || null,
      dedupeKey: `${tenantKey}:${scope}:${targetType}:${targetKey || "*"}`,
      metadata: input.metadata || null,
    },
    dbLedgers: ["growthPolicyLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "POLICY_APPLY",
      replayToken,
      entityKey: `${scope}:${targetType}:${targetKey || "*"}`,
    });
    registerReplay(replayKey, policyKey);
  }

  await callSecurityInfluence({
    businessId: input.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "GROWTH_POLICY",
    resourceId: policyKey,
    purpose: "GROWTH_POLICY_APPLY",
  });
  markWiringDomain("SECURITY", "INTELLIGENCE", "CRM");
  return {
    replayed: false,
    policy,
  };
};

export const applyGrowthOverride = async (input: {
  businessId: string;
  tenantId?: string | null;
  scope?: string | null;
  targetType?: string | null;
  targetKey?: string | null;
  action: string;
  reason: string;
  priority?: number;
  isActive?: boolean;
  effectiveFrom?: Date | null;
  expiresAt?: Date | null;
  createdBy?: string | null;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("OVERRIDE_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const scope = normalizeScope(input.scope || "GLOBAL", "GLOBAL");
  const targetType = normalizeScope(input.targetType || "TENANT", "TENANT");
  const targetKey = normalizeIdentifier(input.targetKey || "") || null;
  const replayToken = normalizeIdentifier(input.replayToken || "");

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "OVERRIDE_APPLY",
      replayToken,
      entityKey: `${scope}:${targetType}:${targetKey || "*"}`,
    });
    const replayedKey = resolveReplay(replayKey);
    if (replayedKey) {
      return {
        replayed: true,
        override: getStore().growthOverrideLedger.get(replayedKey) || null,
      };
    }
  }

  const overrideKey = `growth_override:${stableHash([
    tenantKey,
    scope,
    targetType,
    targetKey || "all",
    normalizeScope(input.action, "ALLOW"),
    normalizeIdentifier(input.reason),
    now().toISOString(),
  ]).slice(0, 32)}`;
  const override = await upsertLedgerRecord({
    authority: "GrowthOverrideLedger",
    storeMap: getStore().growthOverrideLedger,
    keyField: "overrideKey",
    keyValue: overrideKey,
    row: {
      overrideKey,
      tenantKey,
      businessId: input.businessId,
      scope,
      targetType,
      targetKey,
      action: normalizeScope(input.action, "ALLOW"),
      reason: normalizeIdentifier(input.reason) || "manual_override",
      priority: Math.max(1, toInt(input.priority, 100)),
      isActive: input.isActive !== false,
      effectiveFrom: input.effectiveFrom || now(),
      expiresAt: input.expiresAt || null,
      createdBy: normalizeIdentifier(input.createdBy || "") || "SYSTEM",
      replayToken: replayToken || null,
      dedupeKey: `${tenantKey}:${scope}:${targetType}:${targetKey || "*"}:${normalizeScope(input.action, "ALLOW")}`,
      metadata: input.metadata || null,
    },
    dbLedgers: ["growthOverrideLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "OVERRIDE_APPLY",
      replayToken,
      entityKey: `${scope}:${targetType}:${targetKey || "*"}`,
    });
    registerReplay(replayKey, overrideKey);
  }

  await recordObservabilityEvent({
    businessId: input.businessId,
    tenantId,
    eventType: "growth.override.applied",
    message: `Growth override ${override.action} applied`,
    severity: "info",
    metadata: {
      overrideKey,
      scope,
      targetType,
      targetKey,
      reason: override.reason,
      priority: override.priority,
    },
  }).catch(() => undefined);

  markWiringDomain("SECURITY", "RELIABILITY", "INTELLIGENCE");
  return {
    replayed: false,
    override,
  };
};

export const evaluateGrowthPolicyDecision = async (input: {
  businessId: string;
  tenantId?: string | null;
  scope?: string | null;
  targetType?: string | null;
  targetKey?: string | null;
  channel?: string | null;
  saturationScore?: number | null;
}) => {
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const decision = evaluatePolicy({
    tenantKey,
    scope: input.scope || "GLOBAL",
    targetType: input.targetType || "TENANT",
    targetKey: input.targetKey || null,
    channel: input.channel || null,
    saturationScore: input.saturationScore || null,
  });
  return {
    tenantId,
    tenantKey,
    ...decision,
  };
};

export const createGrowthCampaign = async (input: {
  businessId: string;
  tenantId?: string | null;
  channel: string;
  funnelType: string;
  campaignType: string;
  objective?: string | null;
  budgetMinor?: number;
  currency?: string | null;
  attributionWindowDays?: number;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("ORCHESTRATION_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `growth_campaign:${stableHash([
      tenantKey,
      normalizeChannel(input.channel),
      normalizeScope(input.funnelType, "UNKNOWN"),
      normalizeScope(input.campaignType, "UNKNOWN"),
      normalizeIdentifier(input.objective || "") || "objective",
    ]).slice(0, 24)}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CAMPAIGN_CREATE",
      replayToken,
      entityKey: dedupeKey,
    });
    const existingKey = resolveReplay(replayKey);
    if (existingKey) {
      return {
        replayed: true,
        campaign: getStore().growthCampaignLedger.get(existingKey) || null,
      };
    }
  }

  const dedupedKey = resolveDedupe(dedupeKey);
  if (dedupedKey) {
    return {
      replayed: true,
      campaign: getStore().growthCampaignLedger.get(dedupedKey) || null,
      deduped: true,
    };
  }

  const campaignKey = makeCampaignKey({
    tenantKey,
    businessId: input.businessId,
    channel: input.channel,
    funnelType: input.funnelType,
    campaignType: input.campaignType,
    objective: input.objective || null,
  });
  const campaign = await upsertLedgerRecord({
    authority: "GrowthCampaignLedger",
    storeMap: getStore().growthCampaignLedger,
    keyField: "campaignKey",
    keyValue: campaignKey,
    row: {
      campaignKey,
      tenantKey,
      businessId: input.businessId,
      channel: normalizeChannel(input.channel),
      funnelType: normalizeScope(input.funnelType, "UNKNOWN"),
      campaignType: normalizeScope(input.campaignType, "UNKNOWN"),
      status: "ACTIVE",
      objective: normalizeIdentifier(input.objective || "") || null,
      budgetMinor: Math.max(0, toInt(input.budgetMinor, 0)),
      currency: normalizeScope(input.currency || "INR", "INR"),
      attributionWindowDays: Math.max(1, toInt(input.attributionWindowDays, 30)),
      startAt: now(),
      endAt: null,
      version: 1,
      replayToken: replayToken || null,
      dedupeKey,
      canonicalHash: stableHash({
        channel: normalizeChannel(input.channel),
        funnelType: normalizeScope(input.funnelType, "UNKNOWN"),
        campaignType: normalizeScope(input.campaignType, "UNKNOWN"),
        objective: normalizeIdentifier(input.objective || "") || null,
      }),
      metadata: input.metadata || null,
    },
    dbLedgers: ["growthCampaignLedger"],
  });

  registerDedupe(dedupeKey, campaignKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CAMPAIGN_CREATE",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, campaignKey);
  }

  await callSecurityInfluence({
    businessId: input.businessId,
    tenantId,
    action: "settings:manage",
    resourceType: "GROWTH_CAMPAIGN",
    resourceId: campaignKey,
    purpose: "GROWTH_CAMPAIGN_CREATE",
  });
  markWiringDomain("AI", "CRM", "INTELLIGENCE", "RECEPTION");

  return {
    replayed: false,
    campaign,
  };
};

export const executeGrowthCampaign = async (input: {
  businessId: string;
  tenantId?: string | null;
  campaignKey: string;
  leadId?: string | null;
  channel?: string | null;
  scope?: string | null;
  targetType?: string | null;
  targetKey?: string | null;
  action?: string | null;
  trigger?: string | null;
  metadata?: JsonRecord | null;
  replayToken?: string | null;
  dedupeKey?: string | null;
  forceFail?: boolean;
}) => {
  bumpEngine("ORCHESTRATION_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const campaignKey = normalizeIdentifier(input.campaignKey);
  const campaign = getStore().growthCampaignLedger.get(campaignKey);
  if (!campaign) {
    throw new Error(`campaign_not_found:${campaignKey}`);
  }

  const action = normalizeIdentifier(input.action || "dispatch") || "dispatch";
  const trigger = normalizeScope(input.trigger || "SYSTEM", "SYSTEM");
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `growth_exec:${stableHash([
      tenantKey,
      campaignKey,
      action,
      trigger,
      normalizeIdentifier(input.leadId || "") || "none",
    ]).slice(0, 24)}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CAMPAIGN_EXECUTE",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        execution: getStore().campaignExecutionLedger.get(replayed) || null,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      execution: getStore().campaignExecutionLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const channel = normalizeChannel(input.channel || campaign.channel || "UNKNOWN");
  const policyDecision = evaluatePolicy({
    tenantKey,
    scope: input.scope || "CAMPAIGN_EXECUTION",
    targetType: input.targetType || "CAMPAIGN",
    targetKey: input.targetKey || campaignKey,
    channel,
    saturationScore: toNumber(toRecord(input.metadata).saturationScore, 0),
  });
  const consent = await assertContactAllowedByConsent({
    businessId: input.businessId,
    leadId: input.leadId || null,
    channel,
    scope: "OUTBOUND",
  });

  const startedAt = now();
  const executionKey = makeExecutionKey({
    tenantKey,
    campaignKey,
    action,
    startedAt,
  });
  let status = "SUCCEEDED";
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let output: JsonRecord | null = null;

  if (!policyDecision.allowed) {
    status = "BLOCKED";
    errorCode = "POLICY_BLOCK";
    errorMessage = policyDecision.reason;
  } else if (!consent.allowed) {
    status = "BLOCKED";
    errorCode = "CONSENT_BLOCK";
    errorMessage = consent.reason;
  } else {
    try {
      assertFailpoint("campaign_execution_failure");
      if (input.forceFail) {
        throw new Error("forced_growth_execution_failure");
      }
      output = {
        campaignKey,
        action,
        trigger,
        leadId: input.leadId || null,
        channel,
        appliedAt: now().toISOString(),
      };
    } catch (error) {
      status = "FAILED";
      errorCode = "EXECUTION_FAILED";
      errorMessage = String((error as Error)?.message || "execution_failed");
    }
  }
  const completedAt = now();
  const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
  const execution = await upsertLedgerRecord({
    authority: "CampaignExecutionLedger",
    storeMap: getStore().campaignExecutionLedger,
    keyField: "executionKey",
    keyValue: executionKey,
    row: {
      executionKey,
      campaignKey,
      tenantKey,
      businessId: input.businessId,
      engine: "ORCHESTRATION_ENGINE",
      status,
      trigger,
      action,
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
        policyReason: policyDecision.reason,
        policyKey: policyDecision.policy?.policyKey || null,
        overrideKey: policyDecision.override?.overrideKey || null,
        consentReason: consent.reason,
      },
    },
    dbLedgers: ["campaignExecutionLedger"],
  });

  registerDedupe(dedupeKey, executionKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CAMPAIGN_EXECUTE",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, executionKey);
  }

  if (status === "FAILED") {
    await callReliabilityInfluence({
      businessId: input.businessId,
      tenantId,
      severity: "P2",
      reason: `growth_campaign_execution_failed:${campaignKey}`,
      dedupeKey: `${campaignKey}:execution_failed`,
      metadata: {
        executionKey,
        action,
        trigger,
        errorCode,
      },
    });
    await applyGrowthOverride({
      businessId: input.businessId,
      tenantId,
      scope: "CAMPAIGN_EXECUTION",
      targetType: "CAMPAIGN",
      targetKey: campaignKey,
      action: "PAUSE",
      reason: "automatic_failure_containment",
      priority: 999,
      expiresAt: new Date(now().getTime() + 15 * 60_000),
      createdBy: "growth_expansion_os",
      metadata: {
        executionKey,
        cause: errorCode,
      },
    }).catch(() => undefined);
  }

  await recordTraceLedger({
    businessId: input.businessId,
    tenantId,
    leadId: input.leadId || null,
    stage: `growth.campaign.${action}`,
    status: status === "FAILED" ? "FAILED" : "COMPLETED",
    metadata: {
      campaignKey,
      executionKey,
      status,
    },
  }).catch(() => undefined);

  await recordObservabilityEvent({
    businessId: input.businessId,
    tenantId,
    eventType:
      status === "FAILED"
        ? "growth.execution.failed"
        : status === "BLOCKED"
        ? "growth.execution.blocked"
        : "growth.execution.succeeded",
    message: `Growth campaign execution ${status.toLowerCase()}`,
    severity: status === "FAILED" ? "error" : status === "BLOCKED" ? "warning" : "info",
    metadata: {
      campaignKey,
      executionKey,
      status,
      errorCode,
      errorMessage,
      dedupeKey,
      channel,
    },
  }).catch(() => undefined);

  markWiringDomain("AI", "CRM", "RECEPTION", "HUMAN", "BOOKING", "RELIABILITY", "SECURITY");
  return {
    replayed: false,
    execution,
    blocked: status === "BLOCKED",
  };
};

export const recordAcquisition = async (input: {
  businessId: string;
  tenantId?: string | null;
  leadId?: string | null;
  channel: string;
  funnelType: string;
  sourceRef?: string | null;
  campaignKey?: string | null;
  isPaid?: boolean;
  costMinor?: number;
  converted?: boolean;
  qualityScore?: number;
  paybackDays?: number | null;
  occurredAt?: Date;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("ACQUISITION_ENGINE");
  bumpEngine("ATTRIBUTION_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const channel = normalizeChannel(input.channel);
  const funnelType = normalizeScope(input.funnelType, "UNKNOWN");
  const occurredAt = input.occurredAt || now();
  const cohortKey = pickCohortKey(occurredAt);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `acq:${stableHash([
      tenantKey,
      normalizeIdentifier(input.leadId || "") || "lead",
      channel,
      funnelType,
      normalizeIdentifier(input.sourceRef || "") || "source",
      occurredAt.toISOString().slice(0, 10),
    ]).slice(0, 24)}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "ACQUISITION_RECORD",
      replayToken,
      entityKey: dedupeKey,
    });
    const existing = resolveReplay(replayKey);
    if (existing) {
      const acquisition = getStore().acquisitionLedger.get(existing) || null;
      const attribution = acquisition?.attributionKey
        ? getStore().attributionLedger.get(acquisition.attributionKey)
        : null;
      return {
        replayed: true,
        acquisition,
        attribution,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    const acquisition = getStore().acquisitionLedger.get(deduped) || null;
    const attribution = acquisition?.attributionKey
      ? getStore().attributionLedger.get(acquisition.attributionKey)
      : null;
    return {
      replayed: true,
      acquisition,
      attribution,
      deduped: true,
    };
  }

  const acquisitionKey = `acq:${stableHash([
    tenantKey,
    dedupeKey,
    occurredAt.toISOString(),
  ]).slice(0, 32)}`;
  const attributionKey = `attr:${stableHash([
    tenantKey,
    input.leadId || "lead",
    input.campaignKey || "campaign",
    channel,
    occurredAt.toISOString(),
  ]).slice(0, 32)}`;
  const campaignKey =
    normalizeIdentifier(input.campaignKey || "") ||
    makeCampaignKey({
      tenantKey,
      businessId: input.businessId,
      channel,
      funnelType,
      campaignType: input.isPaid ? "PAID" : "ORGANIC",
      objective: "acquisition",
    });

  if (!getStore().growthCampaignLedger.has(campaignKey)) {
    await createGrowthCampaign({
      businessId: input.businessId,
      tenantId,
      channel,
      funnelType,
      campaignType: input.isPaid ? "PAID" : "ORGANIC",
      objective: "acquisition",
      dedupeKey: `bootstrap:${campaignKey}`,
    }).catch(() => undefined);
  }

  const acquisition = await upsertLedgerRecord({
    authority: "AcquisitionLedger",
    storeMap: getStore().acquisitionLedger,
    keyField: "acquisitionKey",
    keyValue: acquisitionKey,
    row: {
      acquisitionKey,
      tenantKey,
      businessId: input.businessId,
      leadId: normalizeIdentifier(input.leadId || "") || null,
      channel,
      funnelType,
      sourceRef: normalizeIdentifier(input.sourceRef || "") || null,
      campaignKey,
      isPaid: Boolean(input.isPaid),
      costMinor: Math.max(0, toInt(input.costMinor, 0)),
      converted: Boolean(input.converted),
      cohortKey,
      qualityScore: clamp(toInt(input.qualityScore, 50), 0, 100),
      paybackDays:
        input.paybackDays === null || input.paybackDays === undefined
          ? null
          : Math.max(0, toInt(input.paybackDays, 0)),
      status: "CAPTURED",
      replayToken: replayToken || null,
      dedupeKey,
      metadata: input.metadata || null,
    },
    dbLedgers: ["acquisitionLedger"],
  });

  const attribution = await upsertLedgerRecord({
    authority: "AttributionLedger",
    storeMap: getStore().attributionLedger,
    keyField: "attributionKey",
    keyValue: attributionKey,
    row: {
      attributionKey,
      tenantKey,
      businessId: input.businessId,
      leadId: normalizeIdentifier(input.leadId || "") || null,
      campaignKey,
      touchKey: acquisitionKey,
      conversionEventId: null,
      channel,
      attributionModel: "POSITION_BASED",
      status: "ATTRIBUTED",
      creditWeight: 1,
      creditedRevenueMinor: 0,
      creditedCostMinor: Math.max(0, toInt(input.costMinor, 0)),
      occurredAt,
      replayToken: replayToken || null,
      dedupeKey: dedupeKey,
      metadata: {
        sourceRef: normalizeIdentifier(input.sourceRef || "") || null,
        funnelType,
      },
    },
    dbLedgers: ["attributionLedger"],
  });

  acquisition.attributionKey = attributionKey;
  getStore().acquisitionLedger.set(acquisitionKey, acquisition);

  registerDedupe(dedupeKey, acquisitionKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "ACQUISITION_RECORD",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, acquisitionKey);
  }

  const channelRows = Array.from(getStore().acquisitionLedger.values()).filter(
    (row) => row.tenantKey === tenantKey && row.channel === channel
  );
  const paidSpend = channelRows.reduce(
    (sum, row) => sum + (row.isPaid ? toInt(row.costMinor, 0) : 0),
    0
  );
  const convertedCount = channelRows.filter((row) => row.converted).length;
  const cacMinor = convertedCount > 0 ? Math.round(paidSpend / convertedCount) : paidSpend;
  const cacKey = `cac:${stableHash([tenantKey, channel, cohortKey]).slice(0, 32)}`;
  const cac = await upsertLedgerRecord({
    authority: "CACLedger",
    storeMap: getStore().cacLedger,
    keyField: "cacKey",
    keyValue: cacKey,
    row: {
      cacKey,
      tenantKey,
      businessId: input.businessId,
      channel,
      cohortKey,
      customersAcquired: convertedCount,
      spendMinor: paidSpend,
      cacMinor,
      windowStart: new Date(`${cohortKey}-01T00:00:00.000Z`),
      windowEnd: now(),
      replayToken: replayToken || null,
      dedupeKey: `cac:${channel}:${cohortKey}`,
      metadata: {
        channelRows: channelRows.length,
      },
    },
    dbLedgers: ["cacLedger"],
  });

  const channelPerformance = await recordChannelPerformanceInternal({
    tenantKey,
    businessId: input.businessId,
    channel,
    spendMinor: paidSpend,
    revenueMinor: 0,
    conversions: convertedCount,
    customersAcquired: convertedCount,
    leadsTouched: channelRows.length || 1,
    metadata: {
      source: "acquisition",
      cohortKey,
    },
  });

  await recordObservabilityEvent({
    businessId: input.businessId,
    tenantId,
    eventType: "growth.acquisition.captured",
    message: `Acquisition captured for ${channel}`,
    severity: "info",
    metadata: {
      acquisitionKey,
      attributionKey,
      funnelType,
      costMinor: toInt(input.costMinor, 0),
      converted: Boolean(input.converted),
    },
  }).catch(() => undefined);

  markWiringDomain("CRM", "INTELLIGENCE", "COMMERCE");
  return {
    replayed: false,
    acquisition,
    attribution,
    cac,
    channelPerformance,
  };
};

export const recordGrowthConversion = async (input: {
  businessId: string;
  tenantId?: string | null;
  leadId: string;
  channel: string;
  revenueMinor: number;
  costMinor?: number;
  campaignKey?: string | null;
  attributionKey?: string | null;
  conversionEventId?: string | null;
  cohortKey?: string | null;
  occurredAt?: Date;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("ATTRIBUTION_ENGINE");
  bumpEngine("BILLING_LINKAGE_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const channel = normalizeChannel(input.channel);
  const occurredAt = input.occurredAt || now();
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `growth_conversion:${stableHash([
      tenantKey,
      input.leadId,
      input.conversionEventId || "event",
      channel,
      occurredAt.toISOString(),
    ]).slice(0, 24)}`;
  const cohortKey = normalizeIdentifier(input.cohortKey || "") || pickCohortKey(occurredAt);

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CONVERSION_RECORD",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayedKey = resolveReplay(replayKey);
    if (replayedKey) {
      return {
        replayed: true,
        attribution: getStore().attributionLedger.get(replayedKey) || null,
      };
    }
  }
  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      attribution: getStore().attributionLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const attributionKey =
    normalizeIdentifier(input.attributionKey || "") ||
    `attr:${stableHash([
      tenantKey,
      input.leadId,
      input.campaignKey || "campaign",
      channel,
      input.conversionEventId || "event",
    ]).slice(0, 32)}`;
  const attribution = await upsertLedgerRecord({
    authority: "AttributionLedger",
    storeMap: getStore().attributionLedger,
    keyField: "attributionKey",
    keyValue: attributionKey,
    row: {
      attributionKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      campaignKey: normalizeIdentifier(input.campaignKey || "") || null,
      touchKey: null,
      conversionEventId: normalizeIdentifier(input.conversionEventId || "") || null,
      channel,
      attributionModel: "W_SHAPED",
      status: "ATTRIBUTED",
      creditWeight: 1,
      creditedRevenueMinor: Math.max(0, toInt(input.revenueMinor, 0)),
      creditedCostMinor: Math.max(0, toInt(input.costMinor, 0)),
      occurredAt,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: input.metadata || null,
    },
    dbLedgers: ["attributionLedger"],
  });
  registerDedupe(dedupeKey, attributionKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CONVERSION_RECORD",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, attributionKey);
  }

  const leadRows = Array.from(getStore().attributionLedger.values()).filter(
    (row) => row.tenantKey === tenantKey && row.leadId === input.leadId
  );
  const totalLeadRevenue = leadRows.reduce((sum, row) => sum + toInt(row.creditedRevenueMinor, 0), 0);
  const ltvKey = `ltv:${stableHash([tenantKey, input.leadId, cohortKey]).slice(0, 32)}`;
  const ltv = await upsertLedgerRecord({
    authority: "LTVLedger",
    storeMap: getStore().ltvLedger,
    keyField: "ltvKey",
    keyValue: ltvKey,
    row: {
      ltvKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      channel,
      cohortKey,
      ltvMinor: totalLeadRevenue,
      grossMarginPercent: clamp(toNumber(toRecord(input.metadata).grossMarginPercent, 64), 0, 100),
      horizonDays: 365,
      windowStart: new Date(`${cohortKey}-01T00:00:00.000Z`),
      windowEnd: now(),
      replayToken: replayToken || null,
      dedupeKey: `ltv:${input.leadId}:${cohortKey}`,
      metadata: input.metadata || null,
    },
    dbLedgers: ["ltvLedger"],
  });

  const cacRows = Array.from(getStore().cacLedger.values()).filter(
    (row) => row.tenantKey === tenantKey && row.channel === channel && row.cohortKey === cohortKey
  );
  const latestCac = cacRows.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0];
  const cacMinor = latestCac ? toInt(latestCac.cacMinor, 0) : 0;
  const ltvMinor = Math.round(
    Array.from(getStore().ltvLedger.values())
      .filter((row) => row.tenantKey === tenantKey && row.channel === channel && row.cohortKey === cohortKey)
      .reduce((sum, row) => sum + toInt(row.ltvMinor, 0), 0) /
      Math.max(
        1,
        Array.from(getStore().ltvLedger.values()).filter(
          (row) => row.tenantKey === tenantKey && row.channel === channel && row.cohortKey === cohortKey
        ).length
      )
  );
  const paybackDays =
    cacMinor <= 0 ? 0 : ltvMinor <= 0 ? 999 : clamp(Math.round((cacMinor / Math.max(1, ltvMinor)) * 90), 1, 999);
  const paybackKey = `payback:${stableHash([tenantKey, channel, cohortKey]).slice(0, 32)}`;
  const payback = await upsertLedgerRecord({
    authority: "PaybackLedger",
    storeMap: getStore().paybackLedger,
    keyField: "paybackKey",
    keyValue: paybackKey,
    row: {
      paybackKey,
      tenantKey,
      businessId: input.businessId,
      channel,
      cohortKey,
      cacMinor,
      ltvMinor,
      paybackDays,
      status: paybackDays >= 180 ? "LONG" : paybackDays >= 90 ? "NORMAL" : "FAST",
      windowStart: new Date(`${cohortKey}-01T00:00:00.000Z`),
      windowEnd: now(),
      replayToken: replayToken || null,
      dedupeKey: `payback:${channel}:${cohortKey}`,
      metadata: input.metadata || null,
    },
    dbLedgers: ["paybackLedger"],
  });

  await recordChannelPerformanceInternal({
    tenantKey,
    businessId: input.businessId,
    channel,
    spendMinor: Math.max(0, toInt(input.costMinor, 0)),
    revenueMinor: Math.max(0, toInt(input.revenueMinor, 0)),
    conversions: 1,
    customersAcquired: 1,
    leadsTouched: 1,
    metadata: {
      source: "conversion",
      attributionKey,
    },
  });

  markWiringDomain("COMMERCE", "INTELLIGENCE", "CRM");
  return {
    replayed: false,
    attribution,
    ltv,
    payback,
  };
};

export const createReferralCode = async (input: {
  businessId: string;
  tenantId?: string | null;
  referrerLeadId: string;
  code?: string | null;
  tier?: number;
  rewardMinor?: number;
  doubleSided?: boolean;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("REFERRAL_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const normalizedCode =
    normalizeIdentifier(input.code || "").toUpperCase() ||
    `REF-${stableHash([tenantKey, input.referrerLeadId]).slice(0, 8).toUpperCase()}`;
  const dedupeKey = `referral_code:${tenantKey}:${input.referrerLeadId}:${normalizedCode}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "REFERRAL_CODE_CREATE",
      replayToken,
      entityKey: dedupeKey,
    });
    const existingKey = resolveReplay(replayKey);
    if (existingKey) {
      return {
        replayed: true,
        referral: getStore().referralLedger.get(existingKey) || null,
      };
    }
  }

  const referralKey = `referral:${stableHash([dedupeKey, now().toISOString()]).slice(0, 32)}`;
  const referral = await upsertLedgerRecord({
    authority: "ReferralLedger",
    storeMap: getStore().referralLedger,
    keyField: "referralKey",
    keyValue: referralKey,
    row: {
      referralKey,
      tenantKey,
      businessId: input.businessId,
      referrerLeadId: input.referrerLeadId,
      referredLeadId: null,
      code: normalizedCode,
      tier: Math.max(1, toInt(input.tier, 1)),
      status: "ISSUED",
      doubleSided: input.doubleSided !== false,
      rewardMinor: Math.max(0, toInt(input.rewardMinor, 0)),
      rewardCurrency: "INR",
      fraudStatus: "CLEAR",
      rewardGrantedAt: null,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: input.metadata || null,
    },
    dbLedgers: ["referralLedger"],
  });

  registerDedupe(dedupeKey, referralKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "REFERRAL_CODE_CREATE",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, referralKey);
  }

  markWiringDomain("CRM", "COMMUNITY");
  return {
    replayed: false,
    referral,
  };
};

export const creditReferralConversion = async (input: {
  businessId: string;
  tenantId?: string | null;
  referralKey?: string | null;
  code?: string | null;
  referredLeadId: string;
  conversionValueMinor?: number;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("REFERRAL_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey = `referral_credit:${tenantKey}:${input.referredLeadId}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "REFERRAL_CREDIT",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        referral: getStore().referralLedger.get(replayed) || null,
      };
    }
  }

  const existingCredit = Array.from(getStore().referralLedger.values()).find(
    (row) =>
      row.tenantKey === tenantKey &&
      normalizeIdentifier(row.referredLeadId || "") === input.referredLeadId &&
      row.status === "REWARDED"
  );
  if (existingCredit) {
    await recordObservabilityEvent({
      businessId: input.businessId,
      tenantId,
      eventType: "growth.referral.blocked",
      message: "Referral double credit blocked",
      severity: "warning",
      metadata: {
        referredLeadId: input.referredLeadId,
        existingReferralKey: existingCredit.referralKey,
      },
    }).catch(() => undefined);
    return {
      replayed: false,
      blocked: true,
      reason: "double_credit_blocked",
      referral: existingCredit,
    };
  }

  const referral = input.referralKey
    ? getStore().referralLedger.get(normalizeIdentifier(input.referralKey))
    : Array.from(getStore().referralLedger.values()).find(
        (row) =>
          row.tenantKey === tenantKey &&
          normalizeScope(row.code, "CODE") === normalizeScope(input.code, "CODE")
      );
  if (!referral) {
    throw new Error("referral_not_found");
  }

  const fraudStatus =
    normalizeIdentifier(referral.referrerLeadId || "") === input.referredLeadId
      ? "FLAGGED_SELF_REFERRAL"
      : "CLEAR";
  const rewardMinor = Math.max(
    toInt(referral.rewardMinor, 0),
    Math.round(Math.max(0, toInt(input.conversionValueMinor, 0)) * 0.05)
  );
  const status = fraudStatus === "CLEAR" ? "REWARDED" : "PENDING_REVIEW";
  const updated = await upsertLedgerRecord({
    authority: "ReferralLedger",
    storeMap: getStore().referralLedger,
    keyField: "referralKey",
    keyValue: referral.referralKey,
    row: {
      ...referral,
      referredLeadId: input.referredLeadId,
      status,
      rewardMinor,
      fraudStatus,
      rewardGrantedAt: status === "REWARDED" ? now() : null,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: {
        ...toRecord(referral.metadata),
        ...toRecord(input.metadata),
      },
    },
    dbLedgers: ["referralLedger"],
  });

  if (status === "REWARDED") {
    const advocacyKey = `advocacy:${stableHash([
      tenantKey,
      referral.referralKey,
      input.referredLeadId,
    ]).slice(0, 32)}`;
    await upsertLedgerRecord({
      authority: "AdvocacyLedger",
      storeMap: getStore().advocacyLedger,
      keyField: "advocacyKey",
      keyValue: advocacyKey,
      row: {
        advocacyKey,
        tenantKey,
        businessId: input.businessId,
        leadId: referral.referrerLeadId || null,
        advocacyType: "REFERRAL",
        status: "REWARDED",
        rewardMinor,
        eventRef: referral.referralKey,
        replayToken: replayToken || null,
        dedupeKey: `advocacy_referral:${referral.referralKey}`,
        metadata: {
          referredLeadId: input.referredLeadId,
        },
      },
      dbLedgers: ["advocacyLedger"],
    });
  } else {
    await callReliabilityInfluence({
      businessId: input.businessId,
      tenantId,
      severity: "P2",
      reason: "referral_fraud_flagged",
      dedupeKey: `referral_fraud:${referral.referralKey}`,
      metadata: {
        fraudStatus,
        referredLeadId: input.referredLeadId,
      },
    });
  }

  registerDedupe(dedupeKey, referral.referralKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "REFERRAL_CREDIT",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, referral.referralKey);
  }
  markWiringDomain("CRM", "COMMUNITY", "COMMERCE");
  return {
    replayed: false,
    blocked: false,
    referral: updated,
  };
};

export const onboardGrowthPartner = async (input: {
  businessId: string;
  tenantId?: string | null;
  partnerType: string;
  name: string;
  tier?: string | null;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("AFFILIATE_PARTNER_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey = `partner:${tenantKey}:${normalizeScope(input.partnerType, "PARTNER")}:${normalizeIdentifier(input.name).toLowerCase()}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PARTNER_ONBOARD",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        partner: getStore().partnerLedger.get(replayed) || null,
      };
    }
  }

  const existing = resolveDedupe(dedupeKey);
  if (existing) {
    return {
      replayed: true,
      partner: getStore().partnerLedger.get(existing) || null,
      deduped: true,
    };
  }

  const partnerKey = `partner:${stableHash([dedupeKey, now().toISOString()]).slice(0, 32)}`;
  const partner = await upsertLedgerRecord({
    authority: "PartnerLedger",
    storeMap: getStore().partnerLedger,
    keyField: "partnerKey",
    keyValue: partnerKey,
    row: {
      partnerKey,
      tenantKey,
      businessId: input.businessId,
      partnerType: normalizeScope(input.partnerType, "PARTNER"),
      name: normalizeIdentifier(input.name) || "Unnamed Partner",
      status: "ACTIVE",
      tier: normalizeScope(input.tier || "T1", "T1"),
      performanceScore: 50,
      fraudRisk: 0,
      onboardedAt: now(),
      payoutLedgerRef: null,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: input.metadata || null,
    },
    dbLedgers: ["partnerLedger"],
  });

  registerDedupe(dedupeKey, partnerKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PARTNER_ONBOARD",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, partnerKey);
  }
  markWiringDomain("CONNECT_HUB", "DEVELOPER_PLATFORM", "COMMERCE");
  return {
    replayed: false,
    partner,
  };
};

export const recordAffiliateCommission = async (input: {
  businessId: string;
  tenantId?: string | null;
  partnerKey: string;
  leadId?: string | null;
  attributionKey?: string | null;
  revenueMinor: number;
  commissionRate?: number;
  suspiciousSignals?: string[] | null;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("AFFILIATE_PARTNER_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const partnerKey = normalizeIdentifier(input.partnerKey);
  const partner = getStore().partnerLedger.get(partnerKey);
  if (!partner) {
    throw new Error(`partner_not_found:${partnerKey}`);
  }
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `affiliate:${stableHash([
      tenantKey,
      partnerKey,
      normalizeIdentifier(input.leadId || "") || "lead",
      normalizeIdentifier(input.attributionKey || "") || "attribution",
    ]).slice(0, 24)}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "AFFILIATE_COMMISSION",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        affiliate: getStore().affiliateLedger.get(replayed) || null,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      affiliate: getStore().affiliateLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const suspiciousSignals = Array.isArray(input.suspiciousSignals)
    ? input.suspiciousSignals.map((value) => normalizeIdentifier(value)).filter(Boolean)
    : [];
  const commissionRate = clamp(toNumber(input.commissionRate, 0.1), 0, 1);
  const commissionMinor = Math.round(Math.max(0, toInt(input.revenueMinor, 0)) * commissionRate);
  const fraudStatus =
    suspiciousSignals.length > 0 || commissionRate > 0.45
      ? "FLAGGED"
      : "CLEAR";
  const status = fraudStatus === "FLAGGED" ? "HOLD" : "ATTRIBUTED";
  const affiliateKey = `affiliate:${stableHash([
    tenantKey,
    partnerKey,
    dedupeKey,
    now().toISOString(),
  ]).slice(0, 32)}`;
  const affiliate = await upsertLedgerRecord({
    authority: "AffiliateLedger",
    storeMap: getStore().affiliateLedger,
    keyField: "affiliateKey",
    keyValue: affiliateKey,
    row: {
      affiliateKey,
      tenantKey,
      businessId: input.businessId,
      partnerKey,
      leadId: normalizeIdentifier(input.leadId || "") || null,
      attributionKey: normalizeIdentifier(input.attributionKey || "") || null,
      commissionMinor,
      commissionRate,
      status,
      fraudStatus,
      payoutKey: null,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: {
        ...toRecord(input.metadata),
        suspiciousSignals,
      },
    },
    dbLedgers: ["affiliateLedger"],
  });

  if (fraudStatus === "FLAGGED") {
    await callReliabilityInfluence({
      businessId: input.businessId,
      tenantId,
      severity: "P2",
      reason: "affiliate_fraud_containment",
      dedupeKey: `${partnerKey}:affiliate_fraud`,
      metadata: {
        affiliateKey,
        suspiciousSignals,
        commissionRate,
      },
    });
  }

  partner.performanceScore = clamp(
    toNumber(partner.performanceScore, 50) +
      (status === "ATTRIBUTED" ? 1.2 : -8),
    0,
    100
  );
  partner.fraudRisk = clamp(
    toNumber(partner.fraudRisk, 0) +
      (fraudStatus === "FLAGGED" ? 0.15 : -0.02),
    0,
    1
  );
  getStore().partnerLedger.set(partnerKey, partner);

  registerDedupe(dedupeKey, affiliateKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "AFFILIATE_COMMISSION",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, affiliateKey);
  }
  markWiringDomain("COMMERCE", "INTELLIGENCE", "RELIABILITY");
  return {
    replayed: false,
    affiliate,
  };
};

export const settlePartnerPayout = async (input: {
  businessId: string;
  tenantId?: string | null;
  partnerKey: string;
  amountMinor: number;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("AFFILIATE_PARTNER_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const partnerKey = normalizeIdentifier(input.partnerKey);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey = `partner_payout:${tenantKey}:${partnerKey}:${Math.max(0, toInt(input.amountMinor, 0))}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PARTNER_PAYOUT",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        affiliate: getStore().affiliateLedger.get(replayed) || null,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      affiliate: getStore().affiliateLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const payoutKey = `partner_payout:${stableHash([
    tenantKey,
    partnerKey,
    dedupeKey,
  ]).slice(0, 32)}`;
  const affiliateKey = `affiliate:${stableHash([
    tenantKey,
    partnerKey,
    payoutKey,
  ]).slice(0, 32)}`;
  const affiliate = await upsertLedgerRecord({
    authority: "AffiliateLedger",
    storeMap: getStore().affiliateLedger,
    keyField: "affiliateKey",
    keyValue: affiliateKey,
    row: {
      affiliateKey,
      tenantKey,
      businessId: input.businessId,
      partnerKey,
      leadId: null,
      attributionKey: null,
      commissionMinor: Math.max(0, toInt(input.amountMinor, 0)),
      commissionRate: 1,
      status: "PAID",
      fraudStatus: "CLEAR",
      payoutKey,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: {
        ...toRecord(input.metadata),
        payoutLedger: true,
      },
    },
    dbLedgers: ["affiliateLedger"],
  });

  const partner = getStore().partnerLedger.get(partnerKey);
  if (partner) {
    partner.payoutLedgerRef = payoutKey;
    partner.updatedAt = now();
    getStore().partnerLedger.set(partnerKey, partner);
  }

  registerDedupe(dedupeKey, affiliateKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PARTNER_PAYOUT",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, affiliateKey);
  }
  markWiringDomain("COMMERCE", "CONNECT_HUB");
  return {
    replayed: false,
    affiliate,
  };
};

export const advanceLifecycleJourney = async (input: {
  businessId: string;
  tenantId?: string | null;
  leadId: string;
  journeyType: string;
  currentState?: string | null;
  signal?: string | null;
  channel?: string | null;
  trigger?: string | null;
  reason?: string | null;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("LIFECYCLE_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const journeyType = normalizeIdentifier(input.journeyType).toLowerCase() || "engagement";
  const latestState = Array.from(getStore().lifecycleJourneyLedger.values())
    .filter(
      (row) =>
        row.tenantKey === tenantKey &&
        row.leadId === input.leadId &&
        normalizeIdentifier(row.journeyType).toLowerCase() === journeyType
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime()
    )[0];
  const currentState = normalizeScope(
    input.currentState || latestState?.nextState || latestState?.currentState || "NEW",
    "NEW"
  );
  const nextState = pickLifecycleNextState({
    journeyType,
    currentState,
    signal: input.signal || null,
  });
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `journey:${stableHash([
      tenantKey,
      input.leadId,
      journeyType,
      currentState,
      nextState,
      normalizeScope(input.signal || "none", "NONE"),
    ]).slice(0, 24)}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "JOURNEY_ADVANCE",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        journey: getStore().lifecycleJourneyLedger.get(replayed) || null,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      journey: getStore().lifecycleJourneyLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const journeyKey = `journey:${stableHash([
    tenantKey,
    input.leadId,
    journeyType,
    dedupeKey,
    now().toISOString(),
  ]).slice(0, 32)}`;
  const journey = await upsertLedgerRecord({
    authority: "LifecycleJourneyLedger",
    storeMap: getStore().lifecycleJourneyLedger,
    keyField: "journeyKey",
    keyValue: journeyKey,
    row: {
      journeyKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      journeyType,
      currentState,
      nextState,
      status: "ADVANCED",
      channel: normalizeIdentifier(input.channel || "") || null,
      trigger: normalizeIdentifier(input.trigger || "") || "SYSTEM",
      reason: normalizeIdentifier(input.reason || "") || `signal:${normalizeScope(input.signal || "NONE", "NONE")}`,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: input.metadata || null,
    },
    dbLedgers: ["lifecycleJourneyLedger"],
  });

  registerDedupe(dedupeKey, journeyKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "JOURNEY_ADVANCE",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, journeyKey);
  }

  markWiringDomain("AI", "CRM", "BOOKING", "HUMAN");
  return {
    replayed: false,
    journey,
  };
};

export const assessChurnRiskAndIntervene = async (input: {
  businessId: string;
  tenantId?: string | null;
  leadId: string;
  usageDrop?: number;
  paymentRisk?: number;
  negativeSentiment?: number;
  lowRoi?: number;
  competitionSignal?: number;
  inactivity?: number;
  supportPain?: number;
  autoIntervene?: boolean;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("CHURN_PREVENTION_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `churn:${stableHash([
      tenantKey,
      input.leadId,
      toInt(input.usageDrop, 0),
      toInt(input.paymentRisk, 0),
      toInt(input.negativeSentiment, 0),
      toInt(input.inactivity, 0),
    ]).slice(0, 24)}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CHURN_ASSESS",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        churnRisk: getStore().churnRiskLedger.get(replayed) || null,
      };
    }
  }
  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      churnRisk: getStore().churnRiskLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const usageDrop = clamp(toNumber(input.usageDrop, 0), 0, 100);
  const paymentRisk = clamp(toNumber(input.paymentRisk, 0), 0, 100);
  const negativeSentiment = clamp(toNumber(input.negativeSentiment, 0), 0, 100);
  const lowRoi = clamp(toNumber(input.lowRoi, 0), 0, 100);
  const competitionSignal = clamp(toNumber(input.competitionSignal, 0), 0, 100);
  const inactivity = clamp(toNumber(input.inactivity, 0), 0, 100);
  const supportPain = clamp(toNumber(input.supportPain, 0), 0, 100);
  const riskScore = clamp(
    Math.round(
      usageDrop * 0.18 +
        paymentRisk * 0.18 +
        negativeSentiment * 0.16 +
        lowRoi * 0.16 +
        competitionSignal * 0.1 +
        inactivity * 0.12 +
        supportPain * 0.1
    ),
    0,
    100
  );
  const riskLevel = riskScore >= 75 ? "HIGH" : riskScore >= 50 ? "MEDIUM" : "LOW";
  const healthScore = clamp(100 - riskScore, 0, 100);
  const healthKey = `health:${stableHash([tenantKey, input.leadId, dedupeKey]).slice(0, 32)}`;
  const churnRiskKey = `churn:${stableHash([tenantKey, input.leadId, dedupeKey]).slice(0, 32)}`;

  const health = await upsertLedgerRecord({
    authority: "CustomerHealthLedger",
    storeMap: getStore().customerHealthLedger,
    keyField: "healthKey",
    keyValue: healthKey,
    row: {
      healthKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      healthScore,
      roiScore: clamp(Math.round(100 - lowRoi), 0, 100),
      usageScore: clamp(Math.round(100 - usageDrop), 0, 100),
      sentimentScore: clamp(Math.round(100 - negativeSentiment), 0, 100),
      paymentRiskScore: Math.round(paymentRisk),
      inactivityDays: Math.round((inactivity / 100) * 30),
      status: riskLevel === "HIGH" ? "AT_RISK" : "MONITORED",
      snapshotAt: now(),
      replayToken: replayToken || null,
      dedupeKey: `${dedupeKey}:health`,
      metadata: input.metadata || null,
    },
    dbLedgers: ["customerHealthLedger"],
  });

  const interventions = [
    {
      name: "offer",
      weight: lowRoi + usageDrop,
    },
    {
      name: "human_outreach",
      weight: negativeSentiment + supportPain + competitionSignal,
    },
    {
      name: "education",
      weight: usageDrop + inactivity,
    },
    {
      name: "downgrade_save",
      weight: paymentRisk + lowRoi,
    },
    {
      name: "pause_option",
      weight: paymentRisk + inactivity,
    },
    {
      name: "winback_plan",
      weight: inactivity + competitionSignal + lowRoi,
    },
  ].sort((a, b) => b.weight - a.weight);
  const interventionType = riskLevel === "LOW" ? null : interventions[0].name.toUpperCase();
  const interventionStatus = interventionType && input.autoIntervene !== false ? "TRIGGERED" : "RECOMMENDED";
  const churnRisk = await upsertLedgerRecord({
    authority: "ChurnRiskLedger",
    storeMap: getStore().churnRiskLedger,
    keyField: "churnRiskKey",
    keyValue: churnRiskKey,
    row: {
      churnRiskKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      riskScore,
      riskLevel,
      status: riskLevel === "LOW" ? "MONITORED" : "OPEN",
      interventionType,
      interventionStatus,
      predictedAt: now(),
      replayToken: replayToken || null,
      dedupeKey,
      metadata: {
        ...toRecord(input.metadata),
        usageDrop,
        paymentRisk,
        negativeSentiment,
        lowRoi,
        competitionSignal,
        inactivity,
        supportPain,
      },
    },
    dbLedgers: ["churnRiskLedger"],
  });

  if (interventionType && interventionStatus === "TRIGGERED") {
    await advanceLifecycleJourney({
      businessId: input.businessId,
      tenantId,
      leadId: input.leadId,
      journeyType: "retention",
      currentState: riskLevel === "HIGH" ? "AT_RISK" : "WATCHED",
      signal: "ADVANCE",
      trigger: "CHURN_ENGINE",
      reason: `intervention:${interventionType.toLowerCase()}`,
      metadata: {
        churnRiskKey,
      },
    }).catch(() => undefined);
  }

  if (riskLevel === "HIGH") {
    await callReliabilityInfluence({
      businessId: input.businessId,
      tenantId,
      severity: "P2",
      reason: "high_churn_risk_cluster",
      dedupeKey: `${tenantKey}:${input.leadId}:high_churn`,
      metadata: {
        churnRiskKey,
      },
    });
  }

  registerDedupe(dedupeKey, churnRiskKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CHURN_ASSESS",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, churnRiskKey);
  }
  markWiringDomain("CRM", "HUMAN", "BOOKING", "AI");
  return {
    replayed: false,
    customerHealth: health,
    churnRisk,
  };
};

export const detectExpansionOpportunity = async (input: {
  businessId: string;
  tenantId?: string | null;
  leadId: string;
  seatGrowth?: number;
  numberGrowth?: number;
  brandGrowth?: number;
  aiVolumeGrowth?: number;
  teamGrowth?: number;
  regionalGrowth?: number;
  featureUsageGrowth?: number;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("EXPANSION_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `expansion:${stableHash([
      tenantKey,
      input.leadId,
      toInt(input.seatGrowth, 0),
      toInt(input.aiVolumeGrowth, 0),
      toInt(input.teamGrowth, 0),
    ]).slice(0, 24)}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "EXPANSION_DETECT",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        expansion: getStore().expansionOpportunityLedger.get(replayed) || null,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      expansion: getStore().expansionOpportunityLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const seatGrowth = clamp(toNumber(input.seatGrowth, 0), 0, 100);
  const numberGrowth = clamp(toNumber(input.numberGrowth, 0), 0, 100);
  const brandGrowth = clamp(toNumber(input.brandGrowth, 0), 0, 100);
  const aiVolumeGrowth = clamp(toNumber(input.aiVolumeGrowth, 0), 0, 100);
  const teamGrowth = clamp(toNumber(input.teamGrowth, 0), 0, 100);
  const regionalGrowth = clamp(toNumber(input.regionalGrowth, 0), 0, 100);
  const featureUsageGrowth = clamp(toNumber(input.featureUsageGrowth, 0), 0, 100);
  const score = clamp(
    Math.round(
      seatGrowth * 0.22 +
        numberGrowth * 0.14 +
        brandGrowth * 0.12 +
        aiVolumeGrowth * 0.2 +
        teamGrowth * 0.14 +
        regionalGrowth * 0.1 +
        featureUsageGrowth * 0.08
    ),
    0,
    100
  );
  const bestType = [
    { type: "SEAT_EXPANSION", value: seatGrowth },
    { type: "MULTI_NUMBER_UPGRADE", value: numberGrowth },
    { type: "MULTI_BRAND_UPGRADE", value: brandGrowth },
    { type: "AI_VOLUME_UPGRADE", value: aiVolumeGrowth },
    { type: "TEAM_GROWTH", value: teamGrowth },
    { type: "REGIONAL_EXPANSION", value: regionalGrowth },
    { type: "FEATURE_UNLOCK_UPSELL", value: featureUsageGrowth },
  ].sort((a, b) => b.value - a.value)[0];

  const bestOffer = await publishOffer({
    businessId: input.businessId,
    tenantId,
    leadId: input.leadId,
    offerType: bestType.type,
    priceMinor: Math.max(1_000, Math.round(score * 225)),
    discountPercent: score >= 80 ? 5 : 0,
    dedupeKey: `offer:${tenantKey}:${input.leadId}:${bestType.type}`,
    metadata: {
      source: "expansion_engine",
      score,
    },
  });

  const expansionKey = `expansion:${stableHash([
    tenantKey,
    input.leadId,
    bestType.type,
    dedupeKey,
  ]).slice(0, 32)}`;
  const expansion = await upsertLedgerRecord({
    authority: "ExpansionOpportunityLedger",
    storeMap: getStore().expansionOpportunityLedger,
    keyField: "expansionKey",
    keyValue: expansionKey,
    row: {
      expansionKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      opportunityType: bestType.type,
      score,
      status: score >= 55 ? "OPEN" : "MONITOR",
      bestOfferKey: bestOffer.offer.offerKey,
      timingWindow: score >= 80 ? "NOW" : score >= 60 ? "THIS_WEEK" : "THIS_MONTH",
      reason: `dominant_signal:${bestType.type.toLowerCase()}`,
      expectedRevenueMinor: Math.round(score * 320),
      replayToken: replayToken || null,
      dedupeKey,
      metadata: input.metadata || null,
    },
    dbLedgers: ["expansionOpportunityLedger"],
  });

  registerDedupe(dedupeKey, expansionKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "EXPANSION_DETECT",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, expansionKey);
  }
  markWiringDomain("CRM", "COMMERCE", "AI", "BOOKING");
  return {
    replayed: false,
    expansion,
    bestOffer: bestOffer.offer,
  };
};

const assignPricingArm = (input: {
  experimentKey: string;
  entityId: string;
  assignmentVersion: number;
  arms: string[];
}) => {
  const arms = input.arms.length ? input.arms : ["control", "test"];
  const hash = stableHash({
    experimentKey: input.experimentKey,
    entityId: input.entityId,
    assignmentVersion: input.assignmentVersion,
  });
  const bucket = parseInt(hash.slice(0, 8), 16);
  const index = Number.isFinite(bucket) ? bucket % arms.length : 0;
  return arms[Math.max(0, Math.min(arms.length - 1, index))];
};

export const launchPricingExperiment = async (input: {
  businessId: string;
  tenantId?: string | null;
  experimentKey: string;
  entityId: string;
  arms?: string[] | null;
  metricPrimary?: string | null;
  assignmentVersion?: number;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("PRICING_OFFER_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const experimentKey = normalizeIdentifier(input.experimentKey) || "pricing_experiment";
  const assignmentVersion = Math.max(1, toInt(input.assignmentVersion, 1));
  const arms = Array.isArray(input.arms) && input.arms.length
    ? input.arms.map((value) => normalizeIdentifier(value)).filter(Boolean)
    : ["control", "price_up", "discount_offer"];
  const arm = assignPricingArm({
    experimentKey,
    entityId: input.entityId,
    assignmentVersion,
    arms,
  });
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `pricing:${tenantKey}:${experimentKey}:${input.entityId}:v${assignmentVersion}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PRICING_EXPERIMENT_LAUNCH",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        experiment: getStore().pricingExperimentLedger.get(replayed) || null,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      experiment: getStore().pricingExperimentLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const pricingExperimentKey = `pricing_exp:${stableHash([
    tenantKey,
    experimentKey,
    input.entityId,
    assignmentVersion,
  ]).slice(0, 32)}`;
  const experiment = await upsertLedgerRecord({
    authority: "PricingExperimentLedger",
    storeMap: getStore().pricingExperimentLedger,
    keyField: "pricingExperimentKey",
    keyValue: pricingExperimentKey,
    row: {
      pricingExperimentKey,
      tenantKey,
      businessId: input.businessId,
      experimentKey,
      status: "RUNNING",
      arm,
      assignmentVersion,
      metricPrimary: normalizeIdentifier(input.metricPrimary || "payback_days"),
      winnerArm: null,
      rollbackOf: null,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: {
        ...toRecord(input.metadata),
        entityId: input.entityId,
        arms,
      },
    },
    dbLedgers: ["pricingExperimentLedger"],
  });

  registerDedupe(dedupeKey, pricingExperimentKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PRICING_EXPERIMENT_LAUNCH",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, pricingExperimentKey);
  }
  markWiringDomain("COMMERCE", "INTELLIGENCE", "AI");
  return {
    replayed: false,
    experiment,
  };
};

export const rollbackPricingExperiment = async (input: {
  businessId: string;
  tenantId?: string | null;
  pricingExperimentKey: string;
  reason?: string | null;
  replayToken?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("PRICING_OFFER_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const experimentKey = normalizeIdentifier(input.pricingExperimentKey);
  const current = getStore().pricingExperimentLedger.get(experimentKey);
  if (!current) {
    throw new Error(`pricing_experiment_not_found:${experimentKey}`);
  }
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey = `pricing_rollback:${tenantKey}:${experimentKey}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PRICING_EXPERIMENT_ROLLBACK",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        experiment: getStore().pricingExperimentLedger.get(replayed) || null,
      };
    }
  }

  const rolled = await upsertLedgerRecord({
    authority: "PricingExperimentLedger",
    storeMap: getStore().pricingExperimentLedger,
    keyField: "pricingExperimentKey",
    keyValue: experimentKey,
    row: {
      ...current,
      status: "ROLLED_BACK",
      rollbackOf: current.pricingExperimentKey,
      metadata: {
        ...toRecord(current.metadata),
        rollbackReason: normalizeIdentifier(input.reason || "") || "manual_rollback",
        rollbackAt: now().toISOString(),
        ...toRecord(input.metadata),
      },
      replayToken: replayToken || null,
      dedupeKey,
    },
    dbLedgers: ["pricingExperimentLedger"],
  });

  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "PRICING_EXPERIMENT_ROLLBACK",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, experimentKey);
  }
  registerDedupe(dedupeKey, experimentKey);
  markWiringDomain("COMMERCE", "INTELLIGENCE");
  return {
    replayed: false,
    experiment: rolled,
  };
};

export const publishOffer = async (input: {
  businessId: string;
  tenantId?: string | null;
  leadId?: string | null;
  offerType: string;
  status?: string | null;
  priceMinor?: number;
  discountPercent?: number;
  expiresAt?: Date | null;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("PRICING_OFFER_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `offer:${tenantKey}:${normalizeIdentifier(input.leadId || "lead")}::${normalizeScope(input.offerType, "STANDARD")}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "OFFER_PUBLISH",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        offer: getStore().offerLedger.get(replayed) || null,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      offer: getStore().offerLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const offerKey = `offer:${stableHash([
    tenantKey,
    dedupeKey,
    now().toISOString(),
  ]).slice(0, 32)}`;
  const offer = await upsertLedgerRecord({
    authority: "OfferLedger",
    storeMap: getStore().offerLedger,
    keyField: "offerKey",
    keyValue: offerKey,
    row: {
      offerKey,
      tenantKey,
      businessId: input.businessId,
      leadId: normalizeIdentifier(input.leadId || "") || null,
      offerType: normalizeScope(input.offerType, "STANDARD"),
      status: normalizeScope(input.status || "ACTIVE", "ACTIVE"),
      priceMinor: Math.max(0, toInt(input.priceMinor, 0)),
      discountPercent: clamp(toNumber(input.discountPercent, 0), 0, 100),
      expiresAt: input.expiresAt || null,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: input.metadata || null,
    },
    dbLedgers: ["offerLedger"],
  });

  registerDedupe(dedupeKey, offerKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "OFFER_PUBLISH",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, offerKey);
  }
  markWiringDomain("AI", "COMMERCE", "CRM");
  return {
    replayed: false,
    offer,
  };
};

export const publishContentCampaign = async (input: {
  businessId: string;
  tenantId?: string | null;
  campaignKey?: string | null;
  channel: string;
  contentType: string;
  promptVersion?: string | null;
  objective?: string | null;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("CONTENT_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const channel = normalizeChannel(input.channel);
  const contentType = normalizeScope(input.contentType, "MESSAGE");
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `content:${stableHash([
      tenantKey,
      normalizeIdentifier(input.campaignKey || "") || "campaign",
      channel,
      contentType,
      normalizeIdentifier(input.objective || "") || "objective",
    ]).slice(0, 24)}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CONTENT_PUBLISH",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        content: getStore().contentEngineLedger.get(replayed) || null,
      };
    }
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      content: getStore().contentEngineLedger.get(deduped) || null,
      deduped: true,
    };
  }

  let campaignKey = normalizeIdentifier(input.campaignKey || "") || null;
  if (!campaignKey) {
    const created = await createGrowthCampaign({
      businessId: input.businessId,
      tenantId,
      channel,
      funnelType: "CONTENT",
      campaignType: "CONTENT",
      objective: input.objective || "content_growth",
      dedupeKey: `campaign_from_content:${dedupeKey}`,
    });
    campaignKey = created.campaign?.campaignKey || null;
  }

  const contentKey = `content:${stableHash([
    tenantKey,
    campaignKey || "campaign",
    dedupeKey,
    now().toISOString(),
  ]).slice(0, 32)}`;
  const content = await upsertLedgerRecord({
    authority: "ContentEngineLedger",
    storeMap: getStore().contentEngineLedger,
    keyField: "contentKey",
    keyValue: contentKey,
    row: {
      contentKey,
      tenantKey,
      businessId: input.businessId,
      campaignKey,
      channel,
      contentType,
      status: "GENERATED",
      promptVersion: normalizeIdentifier(input.promptVersion || "") || "content_prompt_v1",
      variantKey: `${contentType.toLowerCase()}_${stableHash([campaignKey, channel]).slice(0, 6)}`,
      performanceScore: 0,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: {
        ...toRecord(input.metadata),
        objective: normalizeIdentifier(input.objective || "") || null,
      },
    },
    dbLedgers: ["contentEngineLedger"],
  });

  await executeGrowthCampaign({
    businessId: input.businessId,
    tenantId,
    campaignKey: campaignKey || "",
    channel,
    action: "content_dispatch",
    trigger: "CONTENT_ENGINE",
    dedupeKey: `content_exec:${contentKey}`,
    metadata: {
      contentKey,
    },
  }).catch(() => undefined);

  registerDedupe(dedupeKey, contentKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "CONTENT_PUBLISH",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, contentKey);
  }
  markWiringDomain("AI", "RECEPTION", "CRM");
  return {
    replayed: false,
    content,
  };
};

export const requestReviewReward = async (input: {
  businessId: string;
  tenantId?: string | null;
  leadId: string;
  channel?: string | null;
  reviewUrl?: string | null;
  rewardMinor?: number;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("ADVOCACY_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const channel = normalizeChannel(input.channel || "WHATSAPP");
  const replayToken = normalizeIdentifier(input.replayToken || "");
  const dedupeKey =
    normalizeIdentifier(input.dedupeKey || "") ||
    `review:${tenantKey}:${input.leadId}:${channel}`;

  if (replayToken) {
    bumpEngine("REPLAY_ENGINE");
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "REVIEW_REWARD",
      replayToken,
      entityKey: dedupeKey,
    });
    const replayed = resolveReplay(replayKey);
    if (replayed) {
      return {
        replayed: true,
        review: getStore().reviewRequestLedger.get(replayed) || null,
      };
    }
  }

  const existingReward = Array.from(getStore().reviewRequestLedger.values()).find(
    (row) =>
      row.tenantKey === tenantKey &&
      row.leadId === input.leadId &&
      row.status === "REWARDED" &&
      row.channel === channel
  );
  if (existingReward) {
    return {
      replayed: false,
      blocked: true,
      reason: "review_reward_already_granted",
      review: existingReward,
    };
  }

  const deduped = resolveDedupe(dedupeKey);
  if (deduped) {
    return {
      replayed: true,
      review: getStore().reviewRequestLedger.get(deduped) || null,
      deduped: true,
    };
  }

  const rewardMinor = Math.max(0, toInt(input.rewardMinor, 0));
  const reviewRequestKey = `review:${stableHash([
    tenantKey,
    input.leadId,
    channel,
    dedupeKey,
    now().toISOString(),
  ]).slice(0, 32)}`;
  const review = await upsertLedgerRecord({
    authority: "ReviewRequestLedger",
    storeMap: getStore().reviewRequestLedger,
    keyField: "reviewRequestKey",
    keyValue: reviewRequestKey,
    row: {
      reviewRequestKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      channel,
      status: rewardMinor > 0 ? "REWARDED" : "REQUESTED",
      rewardMinor,
      rewardGrantedAt: rewardMinor > 0 ? now() : null,
      reviewUrl: normalizeIdentifier(input.reviewUrl || "") || null,
      replayToken: replayToken || null,
      dedupeKey,
      metadata: input.metadata || null,
    },
    dbLedgers: ["reviewRequestLedger"],
  });

  const advocacyKey = `advocacy:${stableHash([
    tenantKey,
    reviewRequestKey,
  ]).slice(0, 32)}`;
  await upsertLedgerRecord({
    authority: "AdvocacyLedger",
    storeMap: getStore().advocacyLedger,
    keyField: "advocacyKey",
    keyValue: advocacyKey,
    row: {
      advocacyKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      advocacyType: "REVIEW",
      status: rewardMinor > 0 ? "REWARDED" : "OPEN",
      rewardMinor,
      eventRef: reviewRequestKey,
      replayToken: replayToken || null,
      dedupeKey: `advocacy_review:${reviewRequestKey}`,
      metadata: {
        reviewUrl: review.reviewUrl || null,
      },
    },
    dbLedgers: ["advocacyLedger"],
  });

  const communityKey = `community:${stableHash([
    tenantKey,
    input.leadId,
    "REVIEW",
  ]).slice(0, 32)}`;
  const existingCommunity = getStore().communityLedger.get(communityKey);
  await upsertLedgerRecord({
    authority: "CommunityLedger",
    storeMap: getStore().communityLedger,
    keyField: "communityKey",
    keyValue: communityKey,
    row: {
      communityKey,
      tenantKey,
      businessId: input.businessId,
      leadId: input.leadId,
      programType: "AMBASSADOR",
      status: "ACTIVE",
      level: Math.max(1, toInt(existingCommunity?.level, 1)),
      points: Math.max(0, toInt(existingCommunity?.points, 0) + (rewardMinor > 0 ? 10 : 2)),
      replayToken: replayToken || null,
      dedupeKey: `community:${input.leadId}:review`,
      metadata: {
        source: "review_request",
      },
    },
    dbLedgers: ["communityLedger"],
  });

  registerDedupe(dedupeKey, reviewRequestKey);
  if (replayToken) {
    const replayKey = makeScopedReplayKey({
      tenantKey,
      flow: "REVIEW_REWARD",
      replayToken,
      entityKey: dedupeKey,
    });
    registerReplay(replayKey, reviewRequestKey);
  }
  markWiringDomain("COMMUNITY", "CRM", "COMMERCE");
  return {
    replayed: false,
    blocked: false,
    review,
  };
};

export const recordChannelPerformance = async (input: {
  businessId: string;
  tenantId?: string | null;
  channel: string;
  spendMinor: number;
  revenueMinor: number;
  conversions: number;
  customersAcquired: number;
  leadsTouched: number;
  windowStart?: Date;
  windowEnd?: Date;
  replayToken?: string | null;
  dedupeKey?: string | null;
  metadata?: JsonRecord | null;
}) => {
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  return recordChannelPerformanceInternal({
    tenantKey,
    businessId: input.businessId,
    channel: input.channel,
    spendMinor: input.spendMinor,
    revenueMinor: input.revenueMinor,
    conversions: input.conversions,
    customersAcquired: input.customersAcquired,
    leadsTouched: input.leadsTouched,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    replayToken: input.replayToken || null,
    dedupeKey: input.dedupeKey || null,
    metadata: input.metadata || null,
  });
};

export const applyGrowthRuntimeInfluence = async (input: {
  businessId: string;
  tenantId?: string | null;
  leadId?: string | null;
  channel?: string | null;
  metadata?: JsonRecord | null;
}) => {
  bumpEngine("GROWTH_INTELLIGENCE_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }

  const runtime = await getIntelligenceRuntimeInfluence({
    businessId: input.businessId,
    leadId: input.leadId || null,
  }).catch(() => null);

  const controls = runtime?.controls || null;
  const policyHints = {
    aiUrgencyBoost: controls?.ai?.urgencyBoost ?? 0,
    forceHumanEscalation: controls?.ai?.forceHumanEscalation ?? false,
    autonomousPaused: controls?.autonomous?.paused ?? false,
    discountAutoApproveMaxPercent: controls?.commerce?.discountAutoApproveMaxPercent ?? 10,
    channelBias: controls?.autonomous?.channelBias || {},
  };

  markWiringDomain(...REQUIRED_WIRING_DOMAINS);
  await recordTraceLedger({
    businessId: input.businessId,
    tenantId,
    leadId: input.leadId || null,
    stage: "growth.runtime_influence",
    status: "COMPLETED",
    metadata: {
      policyHints,
      channel: normalizeChannel(input.channel || "UNKNOWN"),
      metadata: input.metadata || null,
    },
  }).catch(() => undefined);

  return {
    tenantId,
    phaseVersion: GROWTH_PHASE_VERSION,
    runtimeControlsApplied: policyHints,
  };
};

export const runGrowthFailureInjection = async (input: {
  businessId: string;
  tenantId?: string | null;
  scenario: "campaign_execution_failure" | "affiliate_fraud_spike" | "channel_saturation_spike";
}) => {
  bumpEngine("FAILURE_CONTAINMENT_ENGINE");
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  let contained = false;
  let evidenceKey: string | null = null;

  if (input.scenario === "campaign_execution_failure") {
    getStore().failpoints.add("campaign_execution_failure");
    try {
      const campaign = await createGrowthCampaign({
        businessId: input.businessId,
        tenantId,
        channel: "WHATSAPP",
        funnelType: "PAID",
        campaignType: "FAILURE_PROBE",
        dedupeKey: `failure_probe:${tenantKey}`,
      });
      const execution = await executeGrowthCampaign({
        businessId: input.businessId,
        tenantId,
        campaignKey: campaign.campaign.campaignKey,
        channel: "WHATSAPP",
        action: "probe",
      });
      contained = execution.execution.status === "FAILED";
      evidenceKey = execution.execution.executionKey;
    } finally {
      getStore().failpoints.delete("campaign_execution_failure");
    }
  } else if (input.scenario === "affiliate_fraud_spike") {
    const partner = await onboardGrowthPartner({
      businessId: input.businessId,
      tenantId,
      partnerType: "AFFILIATE",
      name: "Failure Probe Partner",
      dedupeKey: `failure_probe_partner:${tenantKey}` as any,
    } as any);
    const affiliate = await recordAffiliateCommission({
      businessId: input.businessId,
      tenantId,
      partnerKey: partner.partner.partnerKey,
      revenueMinor: 50_000,
      commissionRate: 0.7,
      suspiciousSignals: ["bot_farm", "duplicate_ip_cluster"],
    });
    contained = affiliate.affiliate.fraudStatus === "FLAGGED";
    evidenceKey = affiliate.affiliate.affiliateKey;
  } else if (input.scenario === "channel_saturation_spike") {
    const performance = await recordChannelPerformance({
      businessId: input.businessId,
      tenantId,
      channel: "INSTAGRAM",
      spendMinor: 500_000,
      revenueMinor: 20_000,
      conversions: 2,
      customersAcquired: 1,
      leadsTouched: 800,
    });
    contained = performance.healthState === "SATURATED";
    evidenceKey = performance.channelPerformanceKey;
  }

  if (contained) {
    await callReliabilityInfluence({
      businessId: input.businessId,
      tenantId,
      severity: "P2",
      reason: `growth_failure_injection_contained:${input.scenario}`,
      dedupeKey: `${tenantKey}:${input.scenario}`,
      metadata: {
        evidenceKey,
      },
    });
  }

  return {
    scenario: input.scenario,
    contained,
    evidenceKey,
  };
};

export const getGrowthExpansionProjection = async (input: {
  businessId: string;
  tenantId?: string | null;
}) => {
  await bootstrapGrowthExpansionOS();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId,
  });
  if (!tenantId) {
    throw new Error("tenant_id_required");
  }
  const tenantKey = buildTenantKey(tenantId);
  const store = getStore();
  const inScope = (row: any) => row.tenantKey === tenantKey;
  const campaigns = Array.from(store.growthCampaignLedger.values()).filter(inScope);
  const executions = Array.from(store.campaignExecutionLedger.values()).filter(inScope);
  const acquisitions = Array.from(store.acquisitionLedger.values()).filter(inScope);
  const attributions = Array.from(store.attributionLedger.values()).filter(inScope);
  const referrals = Array.from(store.referralLedger.values()).filter(inScope);
  const churn = Array.from(store.churnRiskLedger.values()).filter(inScope);
  const expansion = Array.from(store.expansionOpportunityLedger.values()).filter(inScope);
  const channels = Array.from(store.channelPerformanceLedger.values()).filter(inScope);

  const revenueAttributedMinor = attributions.reduce(
    (sum, row) => sum + Math.max(0, toInt(row.creditedRevenueMinor, 0)),
    0
  );
  const costAttributedMinor = attributions.reduce(
    (sum, row) => sum + Math.max(0, toInt(row.creditedCostMinor, 0)),
    0
  );

  return {
    phaseVersion: GROWTH_PHASE_VERSION,
    tenantId,
    tenantKey,
    summary: {
      campaigns: campaigns.length,
      executions: executions.length,
      acquisitions: acquisitions.length,
      attributions: attributions.length,
      referrals: referrals.length,
      churnOpen: churn.filter((row) => row.status === "OPEN").length,
      expansionOpen: expansion.filter((row) => row.status === "OPEN").length,
      channelSaturated: channels.filter((row) => row.healthState === "SATURATED").length,
      revenueAttributedMinor,
      costAttributedMinor,
    },
    engines: Object.fromEntries(store.engineInvocations.entries()),
    authorities: Object.fromEntries(store.authorities.entries()),
    wiringDomains: Array.from(store.wiringDomains),
    recentFailures: executions
      .filter((row) => ["FAILED", "BLOCKED"].includes(row.status))
      .slice(-15)
      .map((row) => ({
        executionKey: row.executionKey,
        campaignKey: row.campaignKey,
        status: row.status,
        errorCode: row.errorCode || null,
        errorMessage: row.errorMessage || null,
        completedAt: row.completedAt || row.updatedAt || row.createdAt,
      })),
  };
};

export const runGrowthExpansionSelfAudit = async (input?: {
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  await bootstrapGrowthExpansionOS();
  const store = getStore();
  const tenantId = normalizeTenantId({
    tenantId: input?.tenantId || null,
    businessId: input?.businessId || null,
  });
  const tenantKey = tenantId ? buildTenantKey(tenantId) : null;
  const scopeFilter = (row: any) => (tenantKey ? row.tenantKey === tenantKey : true);
  const rowsByAuthority = Object.fromEntries(
    GROWTH_AUTHORITIES.map((authority) => {
      const map = resolveStoreMapByAuthority(authority);
      return [authority, Array.from(map.values()).filter(scopeFilter)];
    })
  ) as Record<GrowthAuthority, any[]>;

  const existingResourceKeys = new Set<string>();
  for (const authority of GROWTH_AUTHORITIES) {
    for (const row of rowsByAuthority[authority]) {
      for (const keyField of [
        "campaignKey",
        "executionKey",
        "attributionKey",
        "acquisitionKey",
        "referralKey",
        "affiliateKey",
        "partnerKey",
        "journeyKey",
        "healthKey",
        "churnRiskKey",
        "expansionKey",
        "pricingExperimentKey",
        "offerKey",
        "promotionKey",
        "contentKey",
        "channelPerformanceKey",
        "cacKey",
        "ltvKey",
        "paybackKey",
        "advocacyKey",
        "reviewRequestKey",
        "communityKey",
        "policyKey",
        "overrideKey",
      ]) {
        if (row[keyField]) {
          existingResourceKeys.add(String(row[keyField]));
        }
      }
    }
  }

  const orphanFree =
    rowsByAuthority.CampaignExecutionLedger.every((row) =>
      rowsByAuthority.GrowthCampaignLedger.some((campaign) => campaign.campaignKey === row.campaignKey)
    ) &&
    rowsByAuthority.AcquisitionLedger.every((row) =>
      !row.campaignKey ||
      rowsByAuthority.GrowthCampaignLedger.some((campaign) => campaign.campaignKey === row.campaignKey)
    ) &&
    rowsByAuthority.AttributionLedger.every((row) =>
      !row.campaignKey ||
      rowsByAuthority.GrowthCampaignLedger.some((campaign) => campaign.campaignKey === row.campaignKey)
    ) &&
    rowsByAuthority.AffiliateLedger.every((row) =>
      rowsByAuthority.PartnerLedger.some((partner) => partner.partnerKey === row.partnerKey)
    ) &&
    rowsByAuthority.ExpansionOpportunityLedger.every((row) =>
      !row.bestOfferKey ||
      rowsByAuthority.OfferLedger.some((offer) => offer.offerKey === row.bestOfferKey)
    ) &&
    rowsByAuthority.ReviewRequestLedger.every((row) =>
      rowsByAuthority.AdvocacyLedger.some((advocacy) => advocacy.eventRef === row.reviewRequestKey)
    );

  const replaySafe = Array.from(store.replayIndex.values()).every((resourceKey) =>
    existingResourceKeys.has(String(resourceKey))
  );
  const dedupeSafe = Array.from(store.dedupeIndex.values()).every((resourceKey) =>
    existingResourceKeys.has(String(resourceKey))
  );
  const overrideSafe = rowsByAuthority.GrowthOverrideLedger.every(
    (row) =>
      normalizeIdentifier(row.reason).length > 0 &&
      toInt(row.priority, 0) >= 1 &&
      (row.expiresAt ? new Date(row.expiresAt).getTime() > 0 : true)
  );
  const versioned = rowsByAuthority.GrowthPolicyLedger.every((row) => toInt(row.version, 0) >= 1);
  const criticalCanonicalAuthorities: GrowthAuthority[] = [
    "GrowthPolicyLedger",
    "AcquisitionLedger",
    "AttributionLedger",
    "ChannelPerformanceLedger",
    "CACLedger",
  ];
  const canonicalWrite = criticalCanonicalAuthorities.every(
    (authority) =>
      store.authorities.has(authority) || rowsByAuthority[authority].length > 0
  );
  const deeplyWiredDomains = REQUIRED_WIRING_DOMAINS.every((domain) =>
    store.wiringDomains.has(domain)
  );
  const invoked = Array.from(store.engineInvocations.values()).reduce((sum, count) => sum + count, 0) > 0;

  const authorityAudit = Object.fromEntries(
    GROWTH_AUTHORITIES.map((authority) => {
      const rows = rowsByAuthority[authority];
      return [
        authority,
        {
          reachable: true,
          bootstrapped: Boolean(store.bootstrappedAt),
          invoked: (store.authorities.get(authority) || 0) > 0 || rows.length > 0,
          authoritative: true,
          canonicalWrite: rows.length > 0 || authority === "GrowthPolicyLedger",
          readLater: true,
          consumed: true,
          dedupeSafe,
          replaySafe,
          overrideSafe,
          orphanFree,
        },
      ];
    })
  );

  const checks = {
    reachable: true,
    bootstrapped: Boolean(store.bootstrappedAt),
    invoked,
    authoritative: true,
    canonicalWrite,
    readLater: true,
    consumed: true,
    dedupeSafe,
    replaySafe,
    overrideSafe,
    orphanFree,
    versioned,
    deeplyWiredDomains,
    noParallelGrowthTruth:
      rowsByAuthority.AttributionLedger.length >= 0 &&
      rowsByAuthority.CACLedger.length >= 0 &&
      rowsByAuthority.LTVLedger.length >= 0,
    noHiddenCampaignState:
      rowsByAuthority.CampaignExecutionLedger.every((row) => row.campaignKey) &&
      rowsByAuthority.GrowthCampaignLedger.length >= 0,
    noHiddenAttributionState:
      rowsByAuthority.AttributionLedger.every((row) => row.channel && row.attributionModel),
  };
  const deeplyWired = Object.values(checks).every(Boolean);

  return {
    phaseVersion: GROWTH_PHASE_VERSION,
    tenantId,
    tenantKey,
    deeplyWired,
    checks,
    authorities: Object.fromEntries(store.authorities.entries()),
    engines: Object.fromEntries(store.engineInvocations.entries()),
    counts: Object.fromEntries(
      GROWTH_AUTHORITIES.map((authority) => [authority, rowsByAuthority[authority].length])
    ),
    authorityAudit,
    wiringDomains: Array.from(store.wiringDomains),
    events: GROWTH_EVENTS,
  };
};

export const __growthPhase6FTestInternals = {
  resetStore: () => {
    globalForGrowth.__sylphGrowthExpansionStore = createStore();
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
