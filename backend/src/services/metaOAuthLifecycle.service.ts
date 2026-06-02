import crypto from "crypto";
import prisma from "../config/prisma";
import { recordObservabilityEvent } from "./reliability/reliabilityOS.service";

export type MetaOAuthLifecyclePlatform = "INSTAGRAM" | "WHATSAPP";
export type MetaOAuthLifecycleMode = "connect" | "reconnect";

export type MetaOAuthLifecycleStage =
  | "CALLBACK_ACCEPTED"
  | "CONTINUATION_SCHEDULED"
  | "OAUTH_AUTHENTICATED"
  | "META_ACCOUNT_CONNECTED"
  | "PAIR_SELECTION"
  | "PHONE_SELECTION"
  | "TOKEN_PERSISTENCE"
  | "WEBHOOK_ACTIVATION"
  | "CONNECTION_VERIFICATION"
  | "FINAL_ONBOARDING"
  | "COMPLETED"
  | "FAILED";

export type MetaOAuthLifecycleStatus =
  | "PROCESSING"
  | "NEEDS_ACTION"
  | "FAILED"
  | "COMPLETED";

export type MetaOAuthLifecycleContext = {
  attemptKey: string;
  replayToken: string;
  businessId: string;
  tenantKey: string;
  platform: MetaOAuthLifecyclePlatform;
  mode: MetaOAuthLifecycleMode;
  nonce: string;
  startedAtMs: number;
};

type LifecycleHistoryEntry = {
  at: string;
  stage: MetaOAuthLifecycleStage;
  status: MetaOAuthLifecycleStatus;
  detail: string | null;
};

const META_OAUTH_LIFECYCLE_VERSION = "phase_c1_meta_oauth_lifecycle_v1";
const META_OAUTH_LIFECYCLE_FLOW = "META_OAUTH_LIFECYCLE";
const HISTORY_WINDOW = 80;
const RECONCILIATION_LEASE_TTL_MS = Math.max(
  10_000,
  Number(process.env.META_OAUTH_RECONCILIATION_LEASE_TTL_MS || 90_000)
);

const LIFECYCLE_STAGE_RANK: Record<MetaOAuthLifecycleStage, number> = {
  CALLBACK_ACCEPTED: 10,
  CONTINUATION_SCHEDULED: 20,
  OAUTH_AUTHENTICATED: 30,
  META_ACCOUNT_CONNECTED: 40,
  PAIR_SELECTION: 45,
  PHONE_SELECTION: 45,
  WEBHOOK_ACTIVATION: 60,
  CONNECTION_VERIFICATION: 70,
  TOKEN_PERSISTENCE: 80,
  FINAL_ONBOARDING: 90,
  COMPLETED: 100,
  FAILED: 100,
};

const globalForMetaOAuthLifecycle = globalThis as typeof globalThis & {
  __sylphMetaOAuthReconciliationLeases?: Map<string, number>;
};

const getReconciliationLeases = () => {
  if (!globalForMetaOAuthLifecycle.__sylphMetaOAuthReconciliationLeases) {
    globalForMetaOAuthLifecycle.__sylphMetaOAuthReconciliationLeases = new Map();
  }
  return globalForMetaOAuthLifecycle.__sylphMetaOAuthReconciliationLeases;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableLifecycleWriteError = (error: unknown) => {
  const code = String((error as { code?: unknown })?.code || "")
    .trim()
    .toUpperCase();
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return (
    code === "P2034" ||
    message.includes("deadlock") ||
    message.includes("write conflict") ||
    message.includes("transaction conflict") ||
    message.includes("temporarily unavailable")
  );
};

const logOAuthReconciliation = (
  event:
    | "OAUTH_RECONCILIATION_RETRY"
    | "OAUTH_RECONCILIATION_IDEMPOTENT_HIT"
    | "OAUTH_RECONCILIATION_MUTEX_ACQUIRED"
    | "OAUTH_RECONCILIATION_MUTEX_SKIPPED"
    | "OAUTH_RECONCILIATION_DUPLICATE_IGNORED"
    | "OAUTH_RECONCILIATION_CONNECTED",
  metadata: Record<string, unknown>
) => {
  console.info(event, {
    component: "meta-oauth-lifecycle",
    ...metadata,
  });
};

const withLifecycleWriteRetry = async <T>(
  operation: () => Promise<T>,
  metadata: Record<string, unknown>
) => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableLifecycleWriteError(error) || attempt === 3) {
        throw error;
      }
      const delayMs = Math.min(
        1_500,
        50 * 2 ** attempt + Math.floor(Math.random() * 75)
      );
      logOAuthReconciliation("OAUTH_RECONCILIATION_RETRY", {
        ...metadata,
        attempt: attempt + 1,
        delayMs,
        reason: String((error as Error)?.message || error),
      });
      await sleep(delayMs);
    }
  }
  throw lastError;
};

const normalizeOptionalString = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const toLifecycleStatus = (value: unknown): MetaOAuthLifecycleStatus | null => {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "PROCESSING") {
    return "PROCESSING";
  }

  if (normalized === "NEEDS_ACTION") {
    return "NEEDS_ACTION";
  }

  if (normalized === "FAILED") {
    return "FAILED";
  }

  if (normalized === "COMPLETED") {
    return "COMPLETED";
  }

  return null;
};

const mapLifecycleStatusToAttemptStatus = (status: MetaOAuthLifecycleStatus) => {
  if (status === "PROCESSING") {
    return "VERIFYING";
  }

  if (status === "NEEDS_ACTION") {
    return "NEEDS_ACTION";
  }

  if (status === "COMPLETED") {
    return "CONNECTED";
  }

  return "LIMITED";
};

const mapAttemptStatusToLifecycleStatus = (
  attemptStatus: string | null | undefined
): MetaOAuthLifecycleStatus => {
  const normalized = String(attemptStatus || "").trim().toUpperCase();

  if (normalized === "CONNECTED") {
    return "COMPLETED";
  }

  if (normalized === "NEEDS_ACTION") {
    return "NEEDS_ACTION";
  }

  if (normalized === "VERIFYING") {
    return "PROCESSING";
  }

  return "FAILED";
};

const redactLifecycleMetadata = (metadata: Record<string, unknown>) => {
  const redacted = { ...metadata };
  for (const key of Object.keys(redacted)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("token") ||
      normalized.includes("secret") ||
      normalized.includes("credential")
    ) {
      delete redacted[key];
    }
  }
  return redacted;
};

const isTerminalLifecycleStatus = (status: MetaOAuthLifecycleStatus | null) =>
  status === "COMPLETED" || status === "FAILED" || status === "NEEDS_ACTION";

const shouldSkipLifecycleWrite = (input: {
  existingStatus: MetaOAuthLifecycleStatus | null;
  existingStage: MetaOAuthLifecycleStage | null;
  nextStatus: MetaOAuthLifecycleStatus;
  nextStage: MetaOAuthLifecycleStage;
}) => {
  if (input.existingStatus === "COMPLETED") {
    return true;
  }

  if (
    input.existingStatus === "NEEDS_ACTION" &&
    input.nextStatus === "PROCESSING" &&
    input.existingStage &&
    LIFECYCLE_STAGE_RANK[input.nextStage] <= LIFECYCLE_STAGE_RANK[input.existingStage]
  ) {
    return true;
  }

  if (
    input.existingStatus === "FAILED" &&
    input.nextStatus === "PROCESSING" &&
    input.existingStage &&
    LIFECYCLE_STAGE_RANK[input.nextStage] <= LIFECYCLE_STAGE_RANK[input.existingStage]
  ) {
    return true;
  }

  return (
    input.existingStatus === input.nextStatus &&
    input.existingStage === input.nextStage &&
    isTerminalLifecycleStatus(input.existingStatus)
  );
};

const mapFailureCodeToAttemptStatus = (code?: string | null) => {
  const normalized = String(code || "").trim().toUpperCase();

  if (normalized.includes("PERMISSION")) {
    return "PERMISSION_MISSING";
  }

  if (normalized.includes("WEBHOOK")) {
    return "WEBHOOK_FAILED";
  }

  if (normalized.includes("RATE_LIMIT")) {
    return "RATE_LIMITED";
  }

  if (normalized.includes("TOKEN")) {
    return "TOKEN_EXPIRED";
  }

  if (normalized.includes("DISCONNECT")) {
    return "DISCONNECTED";
  }

  return "LIMITED";
};

const pushHistory = (
  existing: unknown,
  nextEntry: LifecycleHistoryEntry
): LifecycleHistoryEntry[] => {
  const existingHistory = Array.isArray(existing) ? existing : [];
  const normalized = existingHistory
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        at: normalizeOptionalString(item.at) || new Date().toISOString(),
        stage:
          (normalizeOptionalString(item.stage) as MetaOAuthLifecycleStage) || "FAILED",
        status:
          toLifecycleStatus(item.status) ||
          mapAttemptStatusToLifecycleStatus(normalizeOptionalString(item.status)),
        detail: normalizeOptionalString(item.detail),
      } satisfies LifecycleHistoryEntry;
    });

  return [...normalized, nextEntry].slice(-HISTORY_WINDOW);
};

const emitMetaLifecycleEvent = async (input: {
  businessId: string;
  eventType: string;
  stage?: MetaOAuthLifecycleStage;
  status?: MetaOAuthLifecycleStatus;
  metadata?: Record<string, unknown>;
}) => {
  await recordObservabilityEvent({
    businessId: input.businessId,
    tenantId: input.businessId,
    eventType: input.eventType,
    message: input.stage
      ? `${input.eventType}:${input.stage}:${input.status || "UNKNOWN"}`
      : input.eventType,
    severity: input.status === "FAILED" ? "error" : "info",
    context: {
      component: "meta-oauth-lifecycle",
      phase: "onboarding",
      provider: "META",
    },
    metadata: {
      stage: input.stage || null,
      status: input.status || null,
      ...(input.metadata || {}),
    },
  }).catch(() => undefined);
};

const upsertMetaOAuthLifecycle = async (input: {
  context: MetaOAuthLifecycleContext;
  stage: MetaOAuthLifecycleStage;
  lifecycleStatus: MetaOAuthLifecycleStatus;
  attemptStatus?: string | null;
  statusDetail?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resolutionHint?: string | null;
  stageDurationMs?: number | null;
  metadata?: Record<string, unknown>;
}) => {
  const existing = await prisma.connectionAttemptLedger.findUnique({
    where: {
      attemptKey: input.context.attemptKey,
    },
    select: {
      metadata: true,
      createdAt: true,
      status: true,
      step: true,
    },
  });

  const previousMetadata = toObject(existing?.metadata);
  const existingStage =
    (normalizeOptionalString(previousMetadata.lifecycleStage) ||
      normalizeOptionalString(existing?.step)) as MetaOAuthLifecycleStage | null;
  const existingStatus =
    toLifecycleStatus(previousMetadata.lifecycleStatus) ||
    (existing
      ? mapAttemptStatusToLifecycleStatus(normalizeOptionalString(existing.status))
      : null);

  if (
    shouldSkipLifecycleWrite({
      existingStatus,
      existingStage,
      nextStatus: input.lifecycleStatus,
      nextStage: input.stage,
    })
  ) {
    logOAuthReconciliation("OAUTH_RECONCILIATION_IDEMPOTENT_HIT", {
      operationId: input.context.attemptKey,
      replayToken: input.context.replayToken,
      businessId: input.context.businessId,
      platform: input.context.platform,
      mode: input.context.mode,
      existingStage,
      existingStatus,
      skippedStage: input.stage,
      skippedStatus: input.lifecycleStatus,
    });
    return existing;
  }

  const stageDurations = toObject(previousMetadata.stageDurationsMs);
  if (
    Number.isFinite(Number(input.stageDurationMs)) &&
    Number(input.stageDurationMs) >= 0
  ) {
    stageDurations[input.stage] = Math.floor(Number(input.stageDurationMs));
  }

  const nowIso = new Date().toISOString();
  const history = pushHistory(previousMetadata.history, {
    at: nowIso,
    stage: input.stage,
    status: input.lifecycleStatus,
    detail: normalizeOptionalString(input.statusDetail),
  });

  const nextMetadata = {
    ...previousMetadata,
    ...(input.metadata || {}),
    lifecycleVersion: META_OAUTH_LIFECYCLE_VERSION,
    lifecycleStage: input.stage,
    lifecycleStatus: input.lifecycleStatus,
    operationId: input.context.attemptKey,
    replayToken: input.context.replayToken,
    oauthNonce: input.context.nonce,
    platform: input.context.platform,
    mode: input.context.mode,
    stageDurationsMs: stageDurations,
    history,
    startedAtIso:
      normalizeOptionalString(previousMetadata.startedAtIso) ||
      new Date(input.context.startedAtMs).toISOString(),
    updatedAtIso: nowIso,
  };

  return withLifecycleWriteRetry(
    () =>
      prisma.connectionAttemptLedger.upsert({
        where: {
          attemptKey: input.context.attemptKey,
        },
        update: {
          tenantKey: input.context.tenantKey,
          provider: input.context.platform,
          environment: "LIVE",
          flow: META_OAUTH_LIFECYCLE_FLOW,
          replayToken: input.context.replayToken,
          status: normalizeOptionalString(
            input.attemptStatus ||
              mapLifecycleStatusToAttemptStatus(input.lifecycleStatus)
          ),
          step: input.stage,
          statusDetail: normalizeOptionalString(input.statusDetail),
          errorCode: normalizeOptionalString(input.errorCode),
          errorMessage: normalizeOptionalString(input.errorMessage),
          resolutionHint: normalizeOptionalString(input.resolutionHint),
          metadata: nextMetadata as any,
        },
        create: {
          attemptKey: input.context.attemptKey,
          tenantKey: input.context.tenantKey,
          provider: input.context.platform,
          environment: "LIVE",
          flow: META_OAUTH_LIFECYCLE_FLOW,
          replayToken: input.context.replayToken,
          status: normalizeOptionalString(
            input.attemptStatus ||
              mapLifecycleStatusToAttemptStatus(input.lifecycleStatus)
          ) as string,
          step: input.stage,
          statusDetail: normalizeOptionalString(input.statusDetail),
          errorCode: normalizeOptionalString(input.errorCode),
          errorMessage: normalizeOptionalString(input.errorMessage),
          resolutionHint: normalizeOptionalString(input.resolutionHint),
          metadata: nextMetadata as any,
        },
      }),
    {
      operationId: input.context.attemptKey,
      replayToken: input.context.replayToken,
      businessId: input.context.businessId,
      platform: input.context.platform,
      mode: input.context.mode,
      stage: input.stage,
    }
  );
};

export const acquireMetaOAuthReconciliationLease = async (input: {
  operationId: string;
  replayToken: string;
  businessId: string;
  platform: MetaOAuthLifecyclePlatform;
  mode: MetaOAuthLifecycleMode;
  source?: string | null;
}) => {
  const operationId = normalizeOptionalString(input.operationId);
  if (!operationId) {
    return null;
  }

  const existing = await getMetaOAuthLifecycleSnapshot({
    attemptKey: operationId,
    replayToken: input.replayToken,
    platform: input.platform,
  }).catch(() => null);
  const existingMetadata = toObject(existing?.metadata);
  const existingStatus =
    toLifecycleStatus(existingMetadata.lifecycleStatus) ||
    (existing ? mapAttemptStatusToLifecycleStatus(existing.status) : null);

  if (existingStatus === "COMPLETED") {
    logOAuthReconciliation("OAUTH_RECONCILIATION_IDEMPOTENT_HIT", {
      operationId,
      replayToken: input.replayToken,
      businessId: input.businessId,
      platform: input.platform,
      mode: input.mode,
      source: input.source || null,
      existingStatus,
    });
    return {
      acquired: false as const,
      reason: "completed" as const,
      release: () => undefined,
    };
  }

  const leases = getReconciliationLeases();
  const nowMs = Date.now();
  const leasedUntilMs = leases.get(operationId) || 0;
  if (leasedUntilMs > nowMs) {
    logOAuthReconciliation("OAUTH_RECONCILIATION_MUTEX_SKIPPED", {
      operationId,
      replayToken: input.replayToken,
      businessId: input.businessId,
      platform: input.platform,
      mode: input.mode,
      source: input.source || null,
      leasedForMs: leasedUntilMs - nowMs,
    });
    return {
      acquired: false as const,
      reason: "locked" as const,
      release: () => undefined,
    };
  }

  const token = `${operationId}:${crypto.randomUUID()}`;
  leases.set(operationId, nowMs + RECONCILIATION_LEASE_TTL_MS);
  logOAuthReconciliation("OAUTH_RECONCILIATION_MUTEX_ACQUIRED", {
    operationId,
    replayToken: input.replayToken,
    businessId: input.businessId,
    platform: input.platform,
    mode: input.mode,
    source: input.source || null,
    ttlMs: RECONCILIATION_LEASE_TTL_MS,
  });

  return {
    acquired: true as const,
    token,
    release: () => {
      const currentLeaseUntilMs = leases.get(operationId) || 0;
      if (currentLeaseUntilMs > Date.now()) {
        leases.delete(operationId);
      }
    },
  };
};

export const buildMetaOAuthReplayToken = (nonce: string) =>
  `meta_oauth_${normalizeOptionalString(nonce) || "unknown"}`;

export const buildMetaOAuthLifecycleAttemptKey = (input: {
  businessId: string;
  platform: MetaOAuthLifecyclePlatform;
  nonce: string;
}) => {
  const businessId = normalizeOptionalString(input.businessId) || "unknown";
  const platform = normalizeOptionalString(input.platform)?.toLowerCase() || "meta";
  const nonce = normalizeOptionalString(input.nonce) || "unknown";
  return `meta_oauth_lifecycle:${businessId}:${platform}:${nonce}`;
};

export const createMetaOAuthLifecycleContext = (input: {
  businessId: string;
  platform: MetaOAuthLifecyclePlatform;
  mode: MetaOAuthLifecycleMode;
  nonce: string;
}) => {
  const businessId = normalizeOptionalString(input.businessId) || "";
  const platform = input.platform;
  const nonce = normalizeOptionalString(input.nonce) || "";
  const tenantKey = `tenant:${businessId}`;
  const replayToken = buildMetaOAuthReplayToken(nonce);
  const attemptKey = buildMetaOAuthLifecycleAttemptKey({
    businessId,
    platform,
    nonce,
  });

  return {
    attemptKey,
    replayToken,
    businessId,
    tenantKey,
    platform,
    mode: input.mode,
    nonce,
    startedAtMs: Date.now(),
  } satisfies MetaOAuthLifecycleContext;
};

export const markMetaOAuthLifecycleStage = async (input: {
  context: MetaOAuthLifecycleContext;
  stage: MetaOAuthLifecycleStage;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  stageStartedAtMs?: number;
}) => {
  const stageDurationMs =
    Number.isFinite(Number(input.stageStartedAtMs)) &&
    Number(input.stageStartedAtMs) > 0
      ? Math.max(0, Date.now() - Number(input.stageStartedAtMs))
      : null;

  await upsertMetaOAuthLifecycle({
    context: input.context,
    stage: input.stage,
    lifecycleStatus: "PROCESSING",
    statusDetail: input.detail || null,
    stageDurationMs,
    metadata: input.metadata,
  });

  await emitMetaLifecycleEvent({
    businessId: input.context.businessId,
    eventType: "onboarding_stage",
    stage: input.stage,
    status: "PROCESSING",
    metadata: {
      operationId: input.context.attemptKey,
      replayToken: input.context.replayToken,
      ...(input.metadata || {}),
    },
  });
  await emitMetaLifecycleEvent({
    businessId: input.context.businessId,
    eventType: "onboarding_processing",
    stage: input.stage,
    status: "PROCESSING",
    metadata: {
      operationId: input.context.attemptKey,
      replayToken: input.context.replayToken,
      ...(input.metadata || {}),
    },
  });

  if (stageDurationMs !== null) {
    await emitMetaLifecycleEvent({
      businessId: input.context.businessId,
      eventType: "oauth_stage_ms",
      stage: input.stage,
      status: "PROCESSING",
      metadata: {
        durationMs: stageDurationMs,
        operationId: input.context.attemptKey,
      },
    });
  }

  if (input.stage === "WEBHOOK_ACTIVATION" && stageDurationMs !== null) {
    await emitMetaLifecycleEvent({
      businessId: input.context.businessId,
      eventType: "webhook_activation_ms",
      stage: input.stage,
      status: "PROCESSING",
      metadata: {
        durationMs: stageDurationMs,
        operationId: input.context.attemptKey,
      },
    });
  }
};

export const markMetaOAuthLifecycleNeedsAction = async (input: {
  context: MetaOAuthLifecycleContext;
  stage: Extract<MetaOAuthLifecycleStage, "PAIR_SELECTION" | "PHONE_SELECTION">;
  detail: string;
  metadata?: Record<string, unknown>;
}) => {
  await upsertMetaOAuthLifecycle({
    context: input.context,
    stage: input.stage,
    lifecycleStatus: "NEEDS_ACTION",
    attemptStatus: "NEEDS_ACTION",
    statusDetail: input.detail,
    metadata: input.metadata,
  });

  await emitMetaLifecycleEvent({
    businessId: input.context.businessId,
    eventType:
      input.stage === "PAIR_SELECTION"
        ? "pair_selection_required"
        : "phone_selection_required",
    stage: input.stage,
    status: "NEEDS_ACTION",
    metadata: {
      operationId: input.context.attemptKey,
      replayToken: input.context.replayToken,
      ...(input.metadata || {}),
    },
  });
  await emitMetaLifecycleEvent({
    businessId: input.context.businessId,
    eventType: "onboarding_stage",
    stage: input.stage,
    status: "NEEDS_ACTION",
    metadata: {
      operationId: input.context.attemptKey,
      replayToken: input.context.replayToken,
      ...(input.metadata || {}),
    },
  });
};

export const markMetaOAuthLifecycleFailure = async (input: {
  context: MetaOAuthLifecycleContext;
  stage: MetaOAuthLifecycleStage;
  code: string;
  reason: string;
  resolutionHint?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  await upsertMetaOAuthLifecycle({
    context: input.context,
    stage: input.stage,
    lifecycleStatus: "FAILED",
    attemptStatus: mapFailureCodeToAttemptStatus(input.code),
    statusDetail: input.reason,
    errorCode: input.code,
    errorMessage: input.reason,
    resolutionHint: input.resolutionHint || null,
    metadata: input.metadata,
  });

  await emitMetaLifecycleEvent({
    businessId: input.context.businessId,
    eventType: "onboarding_terminal_failure",
    stage: input.stage,
    status: "FAILED",
    metadata: {
      code: input.code,
      reason: input.reason,
      operationId: input.context.attemptKey,
      replayToken: input.context.replayToken,
      ...(input.metadata || {}),
    },
  });
};

export const markMetaOAuthLifecycleCompleted = async (input: {
  context: MetaOAuthLifecycleContext;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  reconcileMs?: number | null;
  timeoutRecovered?: boolean;
  eventualSuccess?: boolean;
}) => {
  await upsertMetaOAuthLifecycle({
    context: input.context,
    stage: "COMPLETED",
    lifecycleStatus: "COMPLETED",
    attemptStatus: "CONNECTED",
    statusDetail: input.detail || "Connection completed",
    metadata: input.metadata,
  });

  logOAuthReconciliation("OAUTH_RECONCILIATION_CONNECTED", {
    operationId: input.context.attemptKey,
    replayToken: input.context.replayToken,
    businessId: input.context.businessId,
    platform: input.context.platform,
    mode: input.context.mode,
  });

  await emitMetaLifecycleEvent({
    businessId: input.context.businessId,
    eventType: "onboarding_stage",
    stage: "COMPLETED",
    status: "COMPLETED",
    metadata: {
      operationId: input.context.attemptKey,
      replayToken: input.context.replayToken,
      ...(input.metadata || {}),
    },
  });

  if (Number.isFinite(Number(input.reconcileMs)) && Number(input.reconcileMs) >= 0) {
    await emitMetaLifecycleEvent({
      businessId: input.context.businessId,
      eventType: "onboarding_reconcile_ms",
      stage: "COMPLETED",
      status: "COMPLETED",
      metadata: {
        durationMs: Math.floor(Number(input.reconcileMs)),
        operationId: input.context.attemptKey,
      },
    });
  }

  if (input.timeoutRecovered) {
    await emitMetaLifecycleEvent({
      businessId: input.context.businessId,
      eventType: "onboarding_timeout_recovered",
      stage: "COMPLETED",
      status: "COMPLETED",
      metadata: {
        operationId: input.context.attemptKey,
      },
    });
  }

  if (input.eventualSuccess) {
    await emitMetaLifecycleEvent({
      businessId: input.context.businessId,
      eventType: "onboarding_eventual_success",
      stage: "COMPLETED",
      status: "COMPLETED",
      metadata: {
        operationId: input.context.attemptKey,
      },
    });
  }
};

export const getMetaOAuthLifecycleSnapshot = async (input: {
  attemptKey?: string | null;
  replayToken?: string | null;
  platform?: MetaOAuthLifecyclePlatform | null;
}) => {
  const attemptKey = normalizeOptionalString(input.attemptKey);
  if (attemptKey) {
    const row = await prisma.connectionAttemptLedger.findUnique({
      where: {
        attemptKey,
      },
    });
    if (row) {
      return row;
    }
  }

  const replayToken = normalizeOptionalString(input.replayToken);
  if (!replayToken) {
    return null;
  }

  const rows = await prisma.connectionAttemptLedger.findMany({
    where: {
      replayToken,
      ...(input.platform ? { provider: input.platform } : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 5,
  });

  if (!rows.length) {
    return null;
  }

  const canonical = rows.find(
    (row) =>
      String(row.flow || "").toUpperCase() === META_OAUTH_LIFECYCLE_FLOW ||
      String(toObject(row.metadata).lifecycleVersion || "") ===
        META_OAUTH_LIFECYCLE_VERSION
  );
  return canonical || rows[0];
};

export const toMetaOAuthLifecycleResponse = (row: {
  attemptKey: string;
  replayToken: string | null;
  provider: string;
  status: string;
  step: string;
  statusDetail: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  resolutionHint: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) => {
  const metadata = toObject(row.metadata);
  const responseMetadata = redactLifecycleMetadata(metadata);
  const explicitLifecycleStatus = toLifecycleStatus(metadata.lifecycleStatus);
  const lifecycleStatus =
    explicitLifecycleStatus || mapAttemptStatusToLifecycleStatus(row.status);
  const lifecycleStage =
    normalizeOptionalString(metadata.lifecycleStage) ||
    normalizeOptionalString(row.step) ||
    "UNKNOWN";

  return {
    operationId: row.attemptKey,
    replayToken: row.replayToken,
    platform: normalizeOptionalString(metadata.platform) || row.provider,
    mode: normalizeOptionalString(metadata.mode) || null,
    status: lifecycleStatus,
    stage: lifecycleStage,
    statusDetail: normalizeOptionalString(row.statusDetail),
    errorCode: normalizeOptionalString(row.errorCode),
    errorMessage: normalizeOptionalString(row.errorMessage),
    resolutionHint: normalizeOptionalString(row.resolutionHint),
    metadata: responseMetadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};
