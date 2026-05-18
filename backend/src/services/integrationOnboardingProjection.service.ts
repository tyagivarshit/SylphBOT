import redis from "../config/redis";
import { TRIAL_DAYS } from "../config/pricing.config";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { getIntegrationOnboardingProjectionQueue } from "../queues/integrationOnboardingProjection.queue";
import { getOnboardingSnapshot } from "./onboarding.service";
import {
  getConnectHubProjection,
  reconcileMetaColdBoot,
  runMetaTokenLifecycleSweep,
} from "./saasPackagingConnectHubOS.service";
import { TimeoutExceededError, withTimeout } from "../utils/boundedTimeout";

type BaseOnboardingSnapshot = Awaited<ReturnType<typeof getOnboardingSnapshot>>;
type ConnectHubProjection = Awaited<ReturnType<typeof getConnectHubProjection>>;

export type IntegrationProjectionProcessingState =
  | "READY"
  | "PROCESSING"
  | "VERIFYING"
  | "RECONCILING"
  | "STALE_VERIFIED"
  | "PROVIDER_DELAYED"
  | "ACTION_REQUIRED";

type IntegrationProjectionVerificationState =
  | "VERIFIED"
  | "VERIFYING"
  | "UNVERIFIED"
  | "DEGRADED";

type IntegrationProviderEnvironmentProjection = {
  status: string;
  active: boolean;
  integrationKey: string | null;
  tokenStatus: string;
  tokenExpiresAt: string | null;
  webhookStatus: string;
  verificationState: IntegrationProjectionVerificationState;
  reconnect: boolean;
  accountMapping: {
    externalAccountRef: string | null;
    pageId: string | null;
    instagramProfessionalAccountId: string | null;
    businessManagerId: string | null;
    wabaId: string | null;
    phoneNumberId: string | null;
    displayNameReviewStatus: string | null;
    qualityRating: string | null;
    tier: string | null;
    pairSelectionState: string | null;
    phoneSelectionState: string | null;
  };
  missingScopes: string[];
  lastVerifiedAt: string | null;
};

type IntegrationProviderProjection = {
  provider: string;
  processingState: IntegrationProjectionProcessingState;
  verificationState: IntegrationProjectionVerificationState;
  actionRequired: boolean;
  reconnectRequired: boolean;
  accountMappingReady: boolean;
  live: IntegrationProviderEnvironmentProjection;
  sandbox: IntegrationProviderEnvironmentProjection;
  diagnostics: Array<{
    code: string;
    message: string;
    fixAction: string;
    retryToken: string | null;
  }>;
};

type IntegrationProjectionEnvelope = {
  processingState: IntegrationProjectionProcessingState;
  verificationState: IntegrationProjectionVerificationState;
  providers: IntegrationProviderProjection[];
  providerStateSummary: {
    total: number;
    active: number;
    verifying: number;
    reconciling: number;
    delayed: number;
    actionRequired: number;
  };
  accountMappingReady: boolean;
  reconnectRequired: boolean;
  stale: boolean;
  staleAgeMs: number;
  staleReason: string | null;
  reconcileInFlight: boolean;
  lastSuccessfulReconcileAt: string | null;
  refreshedAt: string;
  degradedRuntime?: {
    deferred: boolean;
    queueUnavailable: boolean;
    recoveryKey: string | null;
    retryAttempt: number | null;
    recoveryQueueDepth: number | null;
    reason: string | null;
    lastQueueError: string | null;
  } | null;
};

export type IntegrationOnboardingProjectionSnapshot = BaseOnboardingSnapshot & {
  integrationProjection: IntegrationProjectionEnvelope;
};

type ProjectionCacheEntry = {
  cacheKey: string;
  businessId: string;
  tenantId: string;
  snapshot: IntegrationOnboardingProjectionSnapshot;
  refreshedAtMs: number;
  staleAtMs: number;
  expiresAtMs: number;
  lastSuccessfulReconcileAt: string | null;
  rebuildCount: number;
};

type ReconcileTracker = {
  inFlight: boolean;
  lastQueuedAtMs: number;
  startedAtMs: number | null;
  lastFinishedAtMs: number | null;
  lastDurationMs: number | null;
  lastReason: string | null;
  lastError: string | null;
};

export type IntegrationOnboardingFastLaneResult = {
  snapshot: IntegrationOnboardingProjectionSnapshot;
  cache: "memory_cache" | "redis_cache" | "fallback";
  cacheHit: boolean;
  stale: boolean;
  staleAgeMs: number;
  degraded: boolean;
  processingState: IntegrationProjectionProcessingState;
  verificationState: IntegrationProjectionVerificationState;
  recommendReconcile: boolean;
  reconcileReason: string;
  reconcileInFlight: boolean;
  lastSuccessfulReconcileAt: string | null;
  lastReconcileError: string | null;
};

const ONBOARDING_PROJECTION_CACHE_PREFIX = "integrations:onboarding_projection:v1:";
const ONBOARDING_PROJECTION_FRESH_TTL_MS = 20_000;
const ONBOARDING_PROJECTION_HARD_EXPIRY_MS = 20 * 60_000;
const ONBOARDING_PROJECTION_QUEUE_COOLDOWN_MS = 1_500;
const ONBOARDING_PROJECTION_REDIS_TTL_SECONDS = Math.ceil(
  (ONBOARDING_PROJECTION_HARD_EXPIRY_MS + 120_000) / 1000
);
const INTEGRATION_RECONCILE_RUNTIME_BUDGET_MS = Math.max(
  1_000,
  Number(process.env.INTEGRATION_RECONCILE_RUNTIME_BUDGET_MS || 6_500)
);
const INTEGRATION_RECONCILE_PROVIDER_BUDGET_MS = Math.max(
  800,
  Number(process.env.INTEGRATION_RECONCILE_PROVIDER_BUDGET_MS || 4_500)
);
const INTEGRATION_RECONCILE_QUEUE_DEPTH_LIMIT = Math.max(
  1,
  Number(process.env.INTEGRATION_RECONCILE_QUEUE_DEPTH_LIMIT || 120)
);
const INTEGRATION_RECONCILE_QUEUE_DEPTH_TIMEOUT_MS = Math.max(
  120,
  Number(process.env.INTEGRATION_RECONCILE_QUEUE_DEPTH_TIMEOUT_MS || 450)
);

const projectionMemoryCache = new Map<string, ProjectionCacheEntry>();
const projectionReconcileInFlight = new Map<string, Promise<ProjectionCacheEntry>>();
const projectionReconcileTracker = new Map<string, ReconcileTracker>();

class ReconcileCircuitBreakerError extends Error {
  readonly reason: string;
  readonly metadata: Record<string, unknown>;

  constructor(reason: string, metadata?: Record<string, unknown>) {
    super(`reconcile_circuit_breaker:${reason}`);
    this.name = "ReconcileCircuitBreakerError";
    this.reason = reason;
    this.metadata = metadata || {};
  }
}

const normalizeIdentifier = (value: unknown) => String(value || "").trim();

const normalizeTenantId = (input: {
  businessId: string;
  tenantId?: string | null;
}) => normalizeIdentifier(input.tenantId || input.businessId) || normalizeIdentifier(input.businessId);

const buildProjectionCacheKey = (input: { businessId: string; tenantId?: string | null }) => {
  const businessId = normalizeIdentifier(input.businessId);
  const tenantId = normalizeTenantId({
    businessId,
    tenantId: input.tenantId || null,
  });
  return {
    businessId,
    tenantId,
    cacheKey: `${businessId}:${tenantId}`,
  };
};

const buildRedisProjectionKey = (cacheKey: string) =>
  `${ONBOARDING_PROJECTION_CACHE_PREFIX}${cacheKey}`;

const getOrCreateTracker = (cacheKey: string): ReconcileTracker => {
  const existing = projectionReconcileTracker.get(cacheKey);
  if (existing) {
    return existing;
  }
  const tracker: ReconcileTracker = {
    inFlight: false,
    lastQueuedAtMs: 0,
    startedAtMs: null,
    lastFinishedAtMs: null,
    lastDurationMs: null,
    lastReason: null,
    lastError: null,
  };
  projectionReconcileTracker.set(cacheKey, tracker);
  return tracker;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => normalizeIdentifier(item))
        .filter((item) => item.length > 0)
    )
  );
};

const toBoolean = (value: unknown) => value === true;

const buildFallbackBaseSnapshot = (): BaseOnboardingSnapshot => ({
  onboardingCompleted: false,
  onboardingStep: 1,
  demoCompleted: false,
  connectedPlatforms: [],
  primaryPlatform: null,
  checklist: {
    connectedAccount: false,
    demoReplyReady: false,
    sendTestPromptReady: false,
    realReplyReady: false,
  },
  demo: {
    label: "This is how AI replies automatically",
    prompt: "Hi, I want to know more about your service",
    leadId: null,
    userMessage: null,
    aiMessage: null,
  },
  realReply: {
    leadId: null,
    userMessage: null,
    aiMessage: null,
  },
  trial: {
    active: false,
    totalDays: TRIAL_DAYS,
    daysLeft: 0,
    nearEnd: false,
  },
  usage: {
    aiUsedToday: 0,
    aiLimit: 0,
    aiRemaining: null,
    aiUsagePercent: 0,
    warning: false,
    warningMessage: null,
  },
  upgrade: {
    show: false,
    reasons: [],
    headline: "You're getting great results",
    message: "Upgrade to keep automation running",
    ctaHref: "/billing",
  },
});

const normalizeStatus = (value: unknown, fallback = "UNKNOWN") =>
  normalizeIdentifier(value).toUpperCase() || fallback;

const mapEnvironmentProjection = (env: any): IntegrationProviderEnvironmentProjection => {
  const status = normalizeStatus(env?.status, "DISCONNECTED");
  const missingScopes = normalizeStringArray(env?.missingScopes);
  const webhookStatus = normalizeStatus(env?.webhookStatus, "INACTIVE");
  const tokenStatus = normalizeStatus(env?.tokenStatus, "UNKNOWN");
  const accountMapping = env?.accountMapping || {};
  const reconnect = toBoolean(env?.reconnect) || toBoolean(accountMapping?.reconnect);
  const verificationState: IntegrationProjectionVerificationState =
    status === "VERIFYING"
      ? "VERIFYING"
      : status === "CONNECTED" && webhookStatus === "ACTIVE" && missingScopes.length === 0
      ? "VERIFIED"
      : status === "DISCONNECTED"
      ? "UNVERIFIED"
      : "DEGRADED";

  return {
    status,
    active: status !== "DISCONNECTED",
    integrationKey: normalizeIdentifier(env?.integrationKey) || null,
    tokenStatus,
    tokenExpiresAt: env?.tokenExpiresAt ? new Date(env.tokenExpiresAt).toISOString() : null,
    webhookStatus,
    verificationState,
    reconnect,
    accountMapping: {
      externalAccountRef: normalizeIdentifier(accountMapping?.externalAccountRef) || null,
      pageId: normalizeIdentifier(accountMapping?.pageId) || null,
      instagramProfessionalAccountId:
        normalizeIdentifier(accountMapping?.instagramProfessionalAccountId) || null,
      businessManagerId: normalizeIdentifier(accountMapping?.businessManagerId) || null,
      wabaId: normalizeIdentifier(accountMapping?.wabaId) || null,
      phoneNumberId: normalizeIdentifier(accountMapping?.phoneNumberId) || null,
      displayNameReviewStatus:
        normalizeIdentifier(accountMapping?.displayNameReviewStatus) || null,
      qualityRating: normalizeIdentifier(accountMapping?.qualityRating) || null,
      tier: normalizeIdentifier(accountMapping?.tier) || null,
      pairSelectionState: normalizeIdentifier(accountMapping?.pairSelectionState) || null,
      phoneSelectionState: normalizeIdentifier(accountMapping?.phoneSelectionState) || null,
    },
    missingScopes,
    lastVerifiedAt: env?.lastVerifiedAt ? new Date(env.lastVerifiedAt).toISOString() : null,
  };
};

const deriveProviderProcessingState = (input: {
  live: IntegrationProviderEnvironmentProjection;
  sandbox: IntegrationProviderEnvironmentProjection;
  diagnostics: Array<{ code: string; message: string; fixAction: string; retryToken: string | null }>;
}) => {
  const activeEnv =
    input.live.active || input.live.integrationKey
      ? input.live
      : input.sandbox.active || input.sandbox.integrationKey
      ? input.sandbox
      : input.live;

  if (activeEnv.status === "VERIFYING") {
    return "VERIFYING" as const;
  }

  if (activeEnv.status === "RATE_LIMITED") {
    return "PROVIDER_DELAYED" as const;
  }

  if (
    input.diagnostics.length > 0 ||
    activeEnv.missingScopes.length > 0 ||
    activeEnv.status === "NEEDS_ACTION" ||
    activeEnv.status === "PERMISSION_MISSING" ||
    activeEnv.status === "WEBHOOK_FAILED" ||
    activeEnv.status === "TOKEN_EXPIRED"
  ) {
    return "ACTION_REQUIRED" as const;
  }

  if (activeEnv.status === "DISCONNECTED") {
    return "PROCESSING" as const;
  }

  return "READY" as const;
};

const toDiagnosticRows = (value: any): Array<{
  code: string;
  message: string;
  fixAction: string;
  retryToken: string | null;
}> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => ({
    code: normalizeIdentifier(row?.code) || "UNKNOWN",
    message: normalizeIdentifier(row?.message) || "Diagnostic pending",
    fixAction: normalizeIdentifier(row?.fixAction) || "RETRY",
    retryToken: normalizeIdentifier(row?.retryToken) || null,
  }));
};

const buildProviderProjection = (providerRow: any): IntegrationProviderProjection => {
  const live = mapEnvironmentProjection(providerRow?.live);
  const sandbox = mapEnvironmentProjection(providerRow?.sandbox);
  const diagnostics = toDiagnosticRows(providerRow?.diagnostics);
  const processingState = deriveProviderProcessingState({
    live,
    sandbox,
    diagnostics,
  });
  const actionRequired = processingState === "ACTION_REQUIRED";
  const reconnectRequired =
    live.reconnect ||
    sandbox.reconnect ||
    live.status === "TOKEN_EXPIRED" ||
    live.status === "WEBHOOK_FAILED" ||
    live.status === "DISCONNECTED" ||
    sandbox.status === "TOKEN_EXPIRED" ||
    sandbox.status === "WEBHOOK_FAILED" ||
    sandbox.status === "DISCONNECTED";
  const accountMappingReady = Boolean(
    live.accountMapping.pageId ||
      live.accountMapping.instagramProfessionalAccountId ||
      live.accountMapping.phoneNumberId ||
      sandbox.accountMapping.pageId ||
      sandbox.accountMapping.instagramProfessionalAccountId ||
      sandbox.accountMapping.phoneNumberId
  );

  const verificationState: IntegrationProjectionVerificationState =
    live.verificationState === "VERIFIED" || sandbox.verificationState === "VERIFIED"
      ? "VERIFIED"
      : live.verificationState === "VERIFYING" || sandbox.verificationState === "VERIFYING"
      ? "VERIFYING"
      : actionRequired
      ? "DEGRADED"
      : "UNVERIFIED";

  return {
    provider: normalizeIdentifier(providerRow?.provider) || "UNKNOWN",
    processingState,
    verificationState,
    actionRequired,
    reconnectRequired,
    accountMappingReady,
    live,
    sandbox,
    diagnostics,
  };
};

const deriveEnvelopeState = (input: {
  providers: IntegrationProviderProjection[];
  stale: boolean;
  staleAgeMs: number;
  staleReason: string | null;
  reconcileInFlight: boolean;
  lastSuccessfulReconcileAt: string | null;
  refreshedAt: string;
}): IntegrationProjectionEnvelope => {
  const summary = {
    total: input.providers.length,
    active: 0,
    verifying: 0,
    reconciling: 0,
    delayed: 0,
    actionRequired: 0,
  };

  for (const provider of input.providers) {
    if (provider.live.active || provider.sandbox.active) {
      summary.active += 1;
    }
    if (provider.processingState === "VERIFYING") {
      summary.verifying += 1;
    }
    if (provider.processingState === "RECONCILING") {
      summary.reconciling += 1;
    }
    if (provider.processingState === "PROVIDER_DELAYED") {
      summary.delayed += 1;
    }
    if (provider.processingState === "ACTION_REQUIRED") {
      summary.actionRequired += 1;
    }
  }

  let processingState: IntegrationProjectionProcessingState = "READY";
  if (input.reconcileInFlight) {
    processingState = "RECONCILING";
  } else if (summary.actionRequired > 0) {
    processingState = "ACTION_REQUIRED";
  } else if (summary.verifying > 0) {
    processingState = "VERIFYING";
  } else if (summary.delayed > 0) {
    processingState = "PROVIDER_DELAYED";
  } else if (input.stale) {
    processingState = "STALE_VERIFIED";
  } else if (summary.active === 0) {
    processingState = "PROCESSING";
  }

  const verificationState: IntegrationProjectionVerificationState =
    summary.active === 0
      ? "UNVERIFIED"
      : summary.actionRequired > 0
      ? "DEGRADED"
      : summary.verifying > 0 || input.reconcileInFlight
      ? "VERIFYING"
      : "VERIFIED";

  return {
    processingState,
    verificationState,
    providers: input.providers,
    providerStateSummary: summary,
    accountMappingReady:
      input.providers.length > 0 &&
      input.providers.every((provider) => provider.accountMappingReady || !provider.live.active),
    reconnectRequired: input.providers.some((provider) => provider.reconnectRequired),
    stale: input.stale,
    staleAgeMs: Math.max(0, Math.floor(input.staleAgeMs)),
    staleReason: input.staleReason,
    reconcileInFlight: input.reconcileInFlight,
    lastSuccessfulReconcileAt: input.lastSuccessfulReconcileAt,
    refreshedAt: input.refreshedAt,
  };
};

const buildSnapshotFromProjections = (input: {
  onboarding: BaseOnboardingSnapshot;
  connectHub: ConnectHubProjection;
  stale: boolean;
  staleAgeMs: number;
  staleReason: string | null;
  reconcileInFlight: boolean;
  lastSuccessfulReconcileAt: string | null;
  refreshedAt: string;
}): IntegrationOnboardingProjectionSnapshot => {
  const providers = Array.isArray((input.connectHub as any)?.byProvider)
    ? (input.connectHub as any).byProvider.map((row: any) => buildProviderProjection(row))
    : [];

  return {
    ...input.onboarding,
    integrationProjection: deriveEnvelopeState({
      providers,
      stale: input.stale,
      staleAgeMs: input.staleAgeMs,
      staleReason: input.staleReason,
      reconcileInFlight: input.reconcileInFlight,
      lastSuccessfulReconcileAt: input.lastSuccessfulReconcileAt,
      refreshedAt: input.refreshedAt,
    }),
  };
};

const buildFallbackSnapshot = (input: {
  stale: boolean;
  staleAgeMs: number;
  staleReason: string | null;
  reconcileInFlight: boolean;
  lastSuccessfulReconcileAt: string | null;
  refreshedAt: string;
}) =>
  buildSnapshotFromProjections({
    onboarding: buildFallbackBaseSnapshot(),
    connectHub: {
      byProvider: [],
    } as ConnectHubProjection,
    stale: input.stale,
    staleAgeMs: input.staleAgeMs,
    staleReason: input.staleReason,
    reconcileInFlight: input.reconcileInFlight,
    lastSuccessfulReconcileAt: input.lastSuccessfulReconcileAt,
    refreshedAt: input.refreshedAt,
  });

const cloneEntry = (entry: ProjectionCacheEntry): ProjectionCacheEntry => ({
  ...entry,
  snapshot: JSON.parse(JSON.stringify(entry.snapshot)),
});

const setMemoryEntry = (entry: ProjectionCacheEntry) => {
  projectionMemoryCache.set(entry.cacheKey, cloneEntry(entry));
};

const getMemoryEntry = (cacheKey: string) => {
  const cached = projectionMemoryCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAtMs <= Date.now()) {
    projectionMemoryCache.delete(cacheKey);
    return null;
  }

  return cloneEntry(cached);
};

const persistRedisEntry = async (entry: ProjectionCacheEntry) => {
  const payload = JSON.stringify(entry);
  await redis.set(
    buildRedisProjectionKey(entry.cacheKey),
    payload,
    "EX",
    ONBOARDING_PROJECTION_REDIS_TTL_SECONDS
  );
};

const parseRedisEntry = (raw: string): ProjectionCacheEntry | null => {
  try {
    const parsed = JSON.parse(raw) as ProjectionCacheEntry;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (!parsed.cacheKey || !parsed.snapshot || !parsed.expiresAtMs) {
      return null;
    }
    if (parsed.expiresAtMs <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const withEnvelopeState = (input: {
  snapshot: IntegrationOnboardingProjectionSnapshot;
  stale: boolean;
  staleAgeMs: number;
  staleReason: string | null;
  reconcileInFlight: boolean;
  lastSuccessfulReconcileAt: string | null;
  refreshedAt: string;
}) => {
  const providers = Array.isArray(input.snapshot?.integrationProjection?.providers)
    ? input.snapshot.integrationProjection.providers
    : [];

  return {
    ...input.snapshot,
    integrationProjection: deriveEnvelopeState({
      providers,
      stale: input.stale,
      staleAgeMs: input.staleAgeMs,
      staleReason: input.staleReason,
      reconcileInFlight: input.reconcileInFlight,
      lastSuccessfulReconcileAt: input.lastSuccessfulReconcileAt,
      refreshedAt: input.refreshedAt,
    }),
  };
};

const getRedisEntry = async (cacheKey: string): Promise<ProjectionCacheEntry | null> => {
  const raw = await redis.get(buildRedisProjectionKey(cacheKey));
  if (!raw) {
    return null;
  }
  const parsed = parseRedisEntry(raw);
  if (!parsed) {
    return null;
  }
  return cloneEntry(parsed);
};

const markEntryStaleState = (input: {
  entry: ProjectionCacheEntry;
  stale: boolean;
  staleAgeMs: number;
  staleReason: string | null;
  reconcileInFlight: boolean;
  tracker: ReconcileTracker;
}) => {
  const refreshedAt = new Date(input.entry.refreshedAtMs).toISOString();
  const candidateLastSuccessfulReconcileAt =
    input.entry.lastSuccessfulReconcileAt ||
    (input.tracker.lastFinishedAtMs
      ? new Date(input.tracker.lastFinishedAtMs).toISOString()
      : null);
  const parsedLastSuccessfulReconcileAt = candidateLastSuccessfulReconcileAt
    ? Date.parse(candidateLastSuccessfulReconcileAt)
    : Number.NaN;
  const lastSuccessfulReconcileAt = Number.isFinite(parsedLastSuccessfulReconcileAt)
    ? new Date(parsedLastSuccessfulReconcileAt).toISOString()
    : null;

  return withEnvelopeState({
    snapshot: input.entry.snapshot,
    stale: input.stale,
    staleAgeMs: input.staleAgeMs,
    staleReason: input.staleReason,
    reconcileInFlight: input.reconcileInFlight,
    lastSuccessfulReconcileAt,
    refreshedAt,
  });
};

const emitFastLaneMetrics = (input: {
  startedAtMs: number;
  businessId: string;
  cacheHit: boolean;
  stale: boolean;
  staleAgeMs: number;
  processingState: IntegrationProjectionProcessingState;
  source: "memory_cache" | "redis_cache" | "fallback";
}) => {
  const elapsedMs = Date.now() - input.startedAtMs;
  emitPerformanceMetric({
    name: "onboarding_fast_lane_ms",
    value: elapsedMs,
    businessId: input.businessId,
    route: "integrations_onboarding_fast_lane",
    metadata: {
      source: input.source,
      state: input.processingState,
      stale: input.stale,
    },
  });
  emitPerformanceMetric({
    name: "projection_cache_hit_rate",
    value: input.cacheHit ? 1 : 0,
    businessId: input.businessId,
    route: "integrations_onboarding_fast_lane",
    metadata: {
      source: input.source,
    },
  });
  emitPerformanceMetric({
    name: "onboarding_projection_stale_age",
    value: input.staleAgeMs,
    businessId: input.businessId,
    route: "integrations_onboarding_fast_lane",
    metadata: {
      stale: input.stale,
      source: input.source,
    },
  });
  emitPerformanceMetric({
    name: "stale_projection_age_ms",
    value: input.staleAgeMs,
    businessId: input.businessId,
    route: "integrations_onboarding_fast_lane",
    metadata: {
      stale: input.stale,
      source: input.source,
    },
  });
  if (input.stale) {
    emitPerformanceMetric({
      name: "stale_projection_served",
      value: 1,
      businessId: input.businessId,
      route: "integrations_onboarding_fast_lane",
      metadata: {
        source: input.source,
        staleAgeMs: input.staleAgeMs,
      },
    });
    emitPerformanceMetric({
      name: "projection_stale_served_count",
      value: 1,
      businessId: input.businessId,
      route: "integrations_onboarding_fast_lane",
      metadata: {
        source: input.source,
        staleAgeMs: input.staleAgeMs,
      },
    });
    emitPerformanceMetric({
      name: "degraded_projection_state_count",
      value: 1,
      businessId: input.businessId,
      route: "integrations_onboarding_fast_lane",
      metadata: {
        source: input.source,
        state: input.processingState,
      },
    });
  }
};

export const readIntegrationOnboardingFastLaneSnapshot = async (input: {
  businessId: string;
  tenantId?: string | null;
}): Promise<IntegrationOnboardingFastLaneResult> => {
  const startedAtMs = Date.now();
  const key = buildProjectionCacheKey(input);
  const tracker = getOrCreateTracker(key.cacheKey);
  const now = Date.now();

  const buildResult = (params: {
    entry: ProjectionCacheEntry | null;
    source: "memory_cache" | "redis_cache" | "fallback";
    snapshot: IntegrationOnboardingProjectionSnapshot;
  }): IntegrationOnboardingFastLaneResult => {
    const staleAgeMs = params.entry ? Math.max(0, now - params.entry.staleAtMs) : 0;
    const stale = params.entry ? now > params.entry.staleAtMs : true;
    const degradeReason =
      stale && params.source !== "fallback"
        ? "projection_stale"
        : params.source === "fallback"
        ? "projection_cache_unavailable"
        : null;
    const recommendReconcile =
      params.source === "fallback" ||
      stale ||
      params.snapshot.integrationProjection.processingState === "VERIFYING" ||
      params.snapshot.integrationProjection.processingState === "RECONCILING";
    const reconcileReason = params.source === "fallback" ? "projection_bootstrap" : stale ? "projection_stale" : "projection_verification_followup";
    const result: IntegrationOnboardingFastLaneResult = {
      snapshot: params.snapshot,
      cache: params.source,
      cacheHit: params.source !== "fallback",
      stale,
      staleAgeMs,
      degraded: params.source === "fallback" || stale,
      processingState: params.snapshot.integrationProjection.processingState,
      verificationState: params.snapshot.integrationProjection.verificationState,
      recommendReconcile,
      reconcileReason,
      reconcileInFlight: tracker.inFlight,
      lastSuccessfulReconcileAt:
        params.entry?.lastSuccessfulReconcileAt ||
        (tracker.lastFinishedAtMs ? new Date(tracker.lastFinishedAtMs).toISOString() : null),
      lastReconcileError: tracker.lastError,
    };

    emitFastLaneMetrics({
      startedAtMs,
      businessId: key.businessId,
      cacheHit: result.cacheHit,
      stale: result.stale,
      staleAgeMs: result.staleAgeMs,
      processingState: result.processingState,
      source: params.source,
    });

    if (degradeReason) {
      emitPerformanceMetric({
        name: "integration_projection_ms",
        value: Date.now() - startedAtMs,
        businessId: key.businessId,
        route: "integrations_onboarding_fast_lane",
        metadata: {
          degraded: true,
          reason: degradeReason,
          source: params.source,
        },
      });
    }

    return result;
  };

  const memoryEntry = getMemoryEntry(key.cacheKey);
  if (memoryEntry) {
    const stale = now > memoryEntry.staleAtMs;
    const staleAgeMs = stale ? now - memoryEntry.staleAtMs : 0;
    const snapshot = markEntryStaleState({
      entry: memoryEntry,
      stale,
      staleAgeMs,
      staleReason: stale ? "projection_stale" : null,
      reconcileInFlight: tracker.inFlight,
      tracker,
    });
    return buildResult({
      entry: memoryEntry,
      source: "memory_cache",
      snapshot,
    });
  }

  const redisEntry = await getRedisEntry(key.cacheKey);
  if (redisEntry) {
    const stale = now > redisEntry.staleAtMs;
    const staleAgeMs = stale ? now - redisEntry.staleAtMs : 0;
    setMemoryEntry(redisEntry);
    const snapshot = markEntryStaleState({
      entry: redisEntry,
      stale,
      staleAgeMs,
      staleReason: stale ? "projection_stale" : null,
      reconcileInFlight: tracker.inFlight,
      tracker,
    });
    return buildResult({
      entry: redisEntry,
      source: "redis_cache",
      snapshot,
    });
  }

  const fallbackSnapshot = buildFallbackSnapshot({
    stale: true,
    staleAgeMs: ONBOARDING_PROJECTION_HARD_EXPIRY_MS,
    staleReason: "projection_missing",
    reconcileInFlight: tracker.inFlight,
    lastSuccessfulReconcileAt: tracker.lastFinishedAtMs
      ? new Date(tracker.lastFinishedAtMs).toISOString()
      : null,
    refreshedAt: new Date().toISOString(),
  });

  return buildResult({
    entry: null,
    source: "fallback",
    snapshot: fallbackSnapshot,
  });
};

export const noteIntegrationOnboardingReconcileIntent = (input: {
  businessId: string;
  tenantId?: string | null;
}) => {
  const key = buildProjectionCacheKey(input);
  const tracker = getOrCreateTracker(key.cacheKey);
  const now = Date.now();

  if (tracker.inFlight) {
    return {
      shouldQueue: false,
      reason: "reconcile_inflight",
      cacheKey: key.cacheKey,
    };
  }

  if (now - tracker.lastQueuedAtMs < ONBOARDING_PROJECTION_QUEUE_COOLDOWN_MS) {
    return {
      shouldQueue: false,
      reason: "queue_cooldown",
      cacheKey: key.cacheKey,
    };
  }

  tracker.lastQueuedAtMs = now;

  return {
    shouldQueue: true,
    reason: "queued",
    cacheKey: key.cacheKey,
  };
};

const readProjectionQueueDepth = async () => {
  try {
    const queueDepth = await withTimeout({
      label: "integration_projection_queue_depth",
      timeoutMs: INTEGRATION_RECONCILE_QUEUE_DEPTH_TIMEOUT_MS,
      task: getIntegrationOnboardingProjectionQueue().count() as Promise<number>,
    });
    return Number.isFinite(Number(queueDepth)) ? Math.max(0, Number(queueDepth)) : null;
  } catch {
    return null;
  }
};

const runProviderReconcilePass = async (input: {
  businessId: string;
  tenantId: string;
  reason: string;
}) => {
  const startedAtMs = Date.now();
  const failures: string[] = [];

  const runGuarded = async (label: string, task: () => Promise<unknown>) => {
    const taskStartedAt = Date.now();
    try {
      await task();
      if (label.includes("cold_boot")) {
        emitPerformanceMetric({
          name: "webhook_verification_ms",
          value: Date.now() - taskStartedAt,
          businessId: input.businessId,
          route: "integrations_onboarding_reconcile",
          metadata: {
            stage: label,
            reason: input.reason,
          },
        });
      }
    } catch (error) {
      failures.push(`${label}:${String((error as Error)?.message || "failed")}`);
      emitPerformanceMetric({
        name: "provider_reconcile_failures",
        value: 1,
        businessId: input.businessId,
        route: "integrations_onboarding_reconcile",
        metadata: {
          stage: label,
          reason: input.reason,
          error: String((error as Error)?.message || "failed"),
        },
      });
    }
  };

  await runGuarded("cold_boot_live", () =>
    reconcileMetaColdBoot({
      businessId: input.businessId,
      tenantId: input.tenantId,
      provider: "ALL",
      environment: "LIVE",
    })
  );
  await runGuarded("cold_boot_sandbox", () =>
    reconcileMetaColdBoot({
      businessId: input.businessId,
      tenantId: input.tenantId,
      provider: "ALL",
      environment: "SANDBOX",
    })
  );
  await runGuarded("token_validation_live", () =>
    runMetaTokenLifecycleSweep({
      businessId: input.businessId,
      tenantId: input.tenantId,
      provider: "ALL",
      environment: "LIVE",
      autoRefresh: false,
    })
  );

  return {
    failures,
    durationMs: Date.now() - startedAtMs,
  };
};

export const runIntegrationOnboardingProjectionReconcile = async (input: {
  businessId: string;
  tenantId?: string | null;
  reason?: string | null;
  source?: string | null;
}): Promise<ProjectionCacheEntry> => {
  const key = buildProjectionCacheKey(input);
  const tracker = getOrCreateTracker(key.cacheKey);
  const existing = projectionReconcileInFlight.get(key.cacheKey);
  if (existing) {
    return existing;
  }

  const reason = normalizeIdentifier(input.reason) || "projection_refresh";
  const startedAtMs = Date.now();

  const run = (async () => {
    tracker.inFlight = true;
    tracker.startedAtMs = Date.now();
    tracker.lastReason = reason;
    tracker.lastError = null;

    emitPerformanceMetric({
      name: "projection_rebuild_count",
      value: 1,
      businessId: key.businessId,
      route: "integrations_onboarding_reconcile",
      metadata: {
        source: normalizeIdentifier(input.source) || "unknown",
        reason,
      },
    });

    const queueDepth = await readProjectionQueueDepth();
    if (queueDepth !== null) {
      emitPerformanceMetric({
        name: "projection_recovery_queue_depth",
        value: queueDepth,
        businessId: key.businessId,
        route: "integrations_onboarding_reconcile",
        metadata: {
          reason,
          source: normalizeIdentifier(input.source) || "unknown",
        },
      });
    }
    if (
      queueDepth !== null &&
      queueDepth >= INTEGRATION_RECONCILE_QUEUE_DEPTH_LIMIT
    ) {
      throw new ReconcileCircuitBreakerError("worker_pressure_high", {
        queueDepth,
        queueDepthLimit: INTEGRATION_RECONCILE_QUEUE_DEPTH_LIMIT,
      });
    }

    const reconcilePass = await withTimeout({
      label: "integrations_onboarding_reconcile_budget",
      timeoutMs: INTEGRATION_RECONCILE_RUNTIME_BUDGET_MS,
      task: runProviderReconcilePass({
        businessId: key.businessId,
        tenantId: key.tenantId,
        reason,
      }),
    }).catch((error) => {
      if (error instanceof TimeoutExceededError) {
        throw new ReconcileCircuitBreakerError("runtime_budget_exceeded", {
          budgetMs: INTEGRATION_RECONCILE_RUNTIME_BUDGET_MS,
        });
      }
      throw error;
    });
    if (reconcilePass.durationMs > INTEGRATION_RECONCILE_PROVIDER_BUDGET_MS) {
      throw new ReconcileCircuitBreakerError("provider_latency_high", {
        providerDurationMs: reconcilePass.durationMs,
        providerBudgetMs: INTEGRATION_RECONCILE_PROVIDER_BUDGET_MS,
      });
    }

    const projectionStartedAtMs = Date.now();
    const [onboardingSnapshot, connectHubProjection] = await withTimeout({
      label: "integrations_onboarding_projection_budget",
      timeoutMs: INTEGRATION_RECONCILE_RUNTIME_BUDGET_MS,
      task: Promise.all([
        getOnboardingSnapshot(key.businessId),
        getConnectHubProjection({
          businessId: key.businessId,
          tenantId: key.tenantId,
        }),
      ]),
    }).catch((error) => {
      if (error instanceof TimeoutExceededError) {
        throw new ReconcileCircuitBreakerError("projection_budget_exceeded", {
          budgetMs: INTEGRATION_RECONCILE_RUNTIME_BUDGET_MS,
        });
      }
      throw error;
    });
    const projectionDurationMs = Date.now() - projectionStartedAtMs;
    emitPerformanceMetric({
      name: "integration_projection_ms",
      value: projectionDurationMs,
      businessId: key.businessId,
      route: "integrations_onboarding_reconcile",
      metadata: {
        reason,
        source: normalizeIdentifier(input.source) || "unknown",
      },
    });

    const nowMs = Date.now();
    const staleAgeMs = 0;
    const snapshot = buildSnapshotFromProjections({
      onboarding: onboardingSnapshot,
      connectHub: connectHubProjection,
      stale: false,
      staleAgeMs,
      staleReason: null,
      reconcileInFlight: false,
      lastSuccessfulReconcileAt: new Date(nowMs).toISOString(),
      refreshedAt: new Date(nowMs).toISOString(),
    });

    const previous = projectionMemoryCache.get(key.cacheKey);
    const entry: ProjectionCacheEntry = {
      cacheKey: key.cacheKey,
      businessId: key.businessId,
      tenantId: key.tenantId,
      snapshot,
      refreshedAtMs: nowMs,
      staleAtMs: nowMs + ONBOARDING_PROJECTION_FRESH_TTL_MS,
      expiresAtMs: nowMs + ONBOARDING_PROJECTION_HARD_EXPIRY_MS,
      lastSuccessfulReconcileAt: new Date(nowMs).toISOString(),
      rebuildCount: Math.max(0, Number(previous?.rebuildCount || 0)) + 1,
    };

    setMemoryEntry(entry);
    await persistRedisEntry(entry).catch(() => undefined);

    tracker.inFlight = false;
    tracker.lastFinishedAtMs = Date.now();
    tracker.lastDurationMs = Date.now() - startedAtMs;
    tracker.lastError = reconcilePass.failures.length
      ? reconcilePass.failures.slice(0, 3).join(";")
      : null;

    emitPerformanceMetric({
      name: "reconciliation_duration_ms",
      value: tracker.lastDurationMs,
      businessId: key.businessId,
      route: "integrations_onboarding_reconcile",
      metadata: {
        reason,
        source: normalizeIdentifier(input.source) || "unknown",
        providerFailures: reconcilePass.failures.length,
        reconcilePassMs: reconcilePass.durationMs,
      },
    });

    return cloneEntry(entry);
  })()
    .catch((error) => {
      tracker.inFlight = false;
      tracker.lastFinishedAtMs = Date.now();
      tracker.lastDurationMs = Date.now() - startedAtMs;
      tracker.lastError = String((error as Error)?.message || "reconcile_failed");
      const source = normalizeIdentifier(input.source) || "unknown";
      if (error instanceof ReconcileCircuitBreakerError) {
        emitPerformanceMetric({
          name: "reconcile_circuit_breaker_triggered",
          value: 1,
          businessId: key.businessId,
          route: "integrations_onboarding_reconcile",
          metadata: {
            reason,
            source,
            breakerReason: error.reason,
            ...error.metadata,
          },
        });
      } else {
        emitPerformanceMetric({
          name: "provider_reconcile_failures",
          value: 1,
          businessId: key.businessId,
          route: "integrations_onboarding_reconcile",
          metadata: {
            reason,
            source,
            error: tracker.lastError,
          },
        });
      }
      emitPerformanceMetric({
        name: "deferred_reconcile_retry_count",
        value: 1,
        businessId: key.businessId,
        route: "integrations_onboarding_reconcile",
        metadata: {
          reason,
          source,
          circuitBreaker: error instanceof ReconcileCircuitBreakerError,
          error: tracker.lastError,
        },
      });
      throw error;
    })
    .finally(() => {
      const current = projectionReconcileInFlight.get(key.cacheKey);
      if (current === run) {
        projectionReconcileInFlight.delete(key.cacheKey);
      }
    });

  projectionReconcileInFlight.set(key.cacheKey, run);
  return run;
};
