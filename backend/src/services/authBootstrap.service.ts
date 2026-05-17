import prisma from "../config/prisma";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { buildLedgerKey } from "./commerce/shared";
import { resolveUserWorkspaceIdentity } from "./tenant.service";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

type ProfileSeed = {
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
};

type EnsureAuthBootstrapContextInput = {
  userId: string;
  preferredBusinessId?: string | null;
  profileSeed?: ProfileSeed | null;
};

type EnsureAuthBootstrapContextResult = {
  user: {
    id: string;
    role: string;
    tokenVersion: number;
    email: string;
    name: string;
    avatar: string | null;
    businessId: string;
  };
  identity: Awaited<ReturnType<typeof resolveUserWorkspaceIdentity>>;
  backfilledFields: string[];
};

export type AuthBootstrapProcessingState =
  | "READY"
  | "PROCESSING"
  | "RETRYING"
  | "FAILED_TERMINAL";

export type AuthBootstrapWaitResult = {
  state: AuthBootstrapProcessingState;
  context: EnsureAuthBootstrapContextResult | null;
  reason: string | null;
  reusedInFlight: boolean;
  elapsedMs: number;
};

const AUTH_BOOTSTRAP_BACKGROUND_TIMEOUT_MS = 1_900;
const AUTH_BOOTSTRAP_BACKGROUND_DELAY_MS = 35;
const AUTH_BOOTSTRAP_WAIT_TIMEOUT_MS = 1_250;

const authBootstrapPrimeInFlight = new Map<string, Promise<void>>();
const authBootstrapEnsureInFlight = new Map<
  string,
  Promise<EnsureAuthBootstrapContextResult>
>();

const normalizeText = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const normalizeEmail = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
};

const shouldBackfillField = (current?: string | null, incoming?: string | null) => {
  if (!incoming) {
    return false;
  }

  return normalizeText(current) !== normalizeText(incoming);
};

const buildAuthBootstrapKey = (input: EnsureAuthBootstrapContextInput) => {
  const userId = String(input.userId || "").trim();
  const businessId = String(input.preferredBusinessId || "").trim() || "none";
  return `${userId}:${businessId}`;
};

const ensureWorkspaceBootstrapRows = async (businessId: string) => {
  const normalizedBusinessId = String(businessId || "").trim();

  if (!normalizedBusinessId) {
    return {
      usageSeeded: false,
      addonSeeded: false,
      billingSeeded: false,
    };
  }

  const { month, year } = getCurrentMonthYear();
  let usageSeeded = false;
  let addonSeeded = false;
  let billingSeeded = false;

  await prisma.$transaction(async (tx) => {
    const existingUsage = await tx.usage.findUnique({
      where: {
        businessId_month_year: {
          businessId: normalizedBusinessId,
          month,
          year,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existingUsage) {
      await tx.usage.create({
        data: {
          businessId: normalizedBusinessId,
          month,
          year,
          aiCallsUsed: 0,
          messagesUsed: 0,
          followupsUsed: 0,
        },
      });
      usageSeeded = true;
    }

    const addonTypes = ["ai_credits", "contacts"];
    for (const type of addonTypes) {
      const existingAddon = await tx.addonBalance.findUnique({
        where: {
          businessId_type: {
            businessId: normalizedBusinessId,
            type,
          },
        },
        select: {
          id: true,
        },
      });

      if (!existingAddon) {
        await tx.addonBalance.create({
          data: {
            businessId: normalizedBusinessId,
            type,
            balance: 0,
          },
        });
        addonSeeded = true;
      }
    }

    const existingSubscription = await tx.subscriptionLedger.findFirst({
      where: {
        businessId: normalizedBusinessId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    if (!existingSubscription) {
      await tx.subscriptionLedger.create({
        data: {
          businessId: normalizedBusinessId,
          subscriptionKey: buildLedgerKey("subscription"),
          status: "PENDING",
          provider: "INTERNAL",
          planCode: "FREE_LOCKED",
          billingCycle: "monthly",
          currency: "INR",
          quantity: 1,
          unitPriceMinor: 0,
          amountMinor: 0,
          metadata: {
            source: "auth_bootstrap",
            seededAt: new Date().toISOString(),
          },
          idempotencyKey: `auth_bootstrap:${normalizedBusinessId}`,
        },
      });
      billingSeeded = true;
    }
  });

  return {
    usageSeeded,
    addonSeeded,
    billingSeeded,
  };
};

export const ensureAuthBootstrapContext = async (
  input: EnsureAuthBootstrapContextInput
): Promise<EnsureAuthBootstrapContextResult> => {
  const userId = String(input.userId || "").trim();

  if (!userId) {
    throw new Error("user_id_required");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      tokenVersion: true,
      businessId: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw new Error("user_not_active");
  }

  const nextName = normalizeText(input.profileSeed?.name);
  const nextEmail = normalizeEmail(input.profileSeed?.email);
  const nextAvatar = normalizeText(input.profileSeed?.avatar);

  const profileUpdateData: Record<string, string> = {};
  const backfilledFields: string[] = [];

  if (shouldBackfillField(user.name, nextName)) {
    profileUpdateData.name = String(nextName);
    backfilledFields.push("name");
  }

  if (shouldBackfillField(user.email, nextEmail)) {
    profileUpdateData.email = String(nextEmail);
    backfilledFields.push("email");
  }

  if (shouldBackfillField(user.avatar, nextAvatar)) {
    profileUpdateData.avatar = String(nextAvatar);
    backfilledFields.push("avatar");
  }

  if (backfilledFields.length > 0) {
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: profileUpdateData,
    });

    console.info("AUTH_PROFILE_BACKFILLED", {
      userId: user.id,
      fields: backfilledFields,
    });
  }

  const identity = await resolveUserWorkspaceIdentity({
    userId: user.id,
    preferredBusinessId: input.preferredBusinessId || user.businessId || null,
    persistResolvedBusinessId: true,
    bootstrapWorkspaceIfMissing: true,
  });

  if (!identity.businessId || !identity.workspace) {
    throw new Error("workspace_bootstrap_failed");
  }

  const bootstrapRows = await ensureWorkspaceBootstrapRows(identity.businessId);

  console.info("AUTH_WORKSPACE_READY", {
    userId: user.id,
    businessId: identity.businessId,
    source: identity.source,
    usageSeeded: bootstrapRows.usageSeeded,
    addonSeeded: bootstrapRows.addonSeeded,
    billingSeeded: bootstrapRows.billingSeeded,
  });

  return {
    user: {
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      email: nextEmail || user.email,
      name: nextName || user.name,
      avatar: nextAvatar || user.avatar,
      businessId: identity.businessId,
    },
    identity,
    backfilledFields,
  };
};

const withTimeout = async <T>(task: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("auth_bootstrap_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const resolveAuthBootstrapRun = (
  input: EnsureAuthBootstrapContextInput
) => {
  const key = buildAuthBootstrapKey(input);
  const existing = authBootstrapEnsureInFlight.get(key);

  if (existing) {
    return {
      key,
      promise: existing,
      reusedInFlight: true,
    };
  }

  const run = ensureAuthBootstrapContext(input).finally(() => {
    authBootstrapEnsureInFlight.delete(key);
  });
  authBootstrapEnsureInFlight.set(key, run);

  return {
    key,
    promise: run,
    reusedInFlight: false,
  };
};

const TERMINAL_BOOTSTRAP_ERRORS = new Set([
  "user_id_required",
  "user_not_active",
  "workspace_bootstrap_failed",
]);

const toBootstrapReason = (error: unknown) =>
  String((error as Error)?.message || "auth_bootstrap_failed");

const classifyBootstrapState = (
  reason: string
): AuthBootstrapProcessingState => {
  if (TERMINAL_BOOTSTRAP_ERRORS.has(reason)) {
    return "FAILED_TERMINAL";
  }

  if (
    reason.includes("timeout") ||
    reason.startsWith("request_aborted:") ||
    reason.includes("distributed_lock_acquire_timeout")
  ) {
    return "PROCESSING";
  }

  return "RETRYING";
};

export const waitForAuthBootstrapContext = async (
  input: EnsureAuthBootstrapContextInput,
  options?: {
    timeoutMs?: number;
    source?: string;
  }
): Promise<AuthBootstrapWaitResult> => {
  const userId = String(input.userId || "").trim();

  if (!userId) {
    return {
      state: "FAILED_TERMINAL",
      context: null,
      reason: "user_id_required",
      reusedInFlight: false,
      elapsedMs: 0,
    };
  }

  const startedAt = Date.now();
  const timeoutMs = Math.max(
    250,
    Math.floor(options?.timeoutMs || AUTH_BOOTSTRAP_WAIT_TIMEOUT_MS)
  );
  const shared = resolveAuthBootstrapRun(input);

  if (shared.reusedInFlight) {
    emitPerformanceMetric({
      name: "auth_inflight_reused",
      value: 1,
      businessId: String(input.preferredBusinessId || "").trim() || null,
      route: "auth.bootstrap",
      metadata: {
        source: options?.source || "unknown",
      },
    });
  }

  try {
    const context = await withTimeout(shared.promise, timeoutMs);
    const elapsedMs = Date.now() - startedAt;

    emitPerformanceMetric({
      name: "auth_bootstrap_ms",
      value: elapsedMs,
      businessId: context.user.businessId || null,
      route: "auth.bootstrap",
      metadata: {
        source: options?.source || "unknown",
        reusedInFlight: shared.reusedInFlight,
      },
    });

    return {
      state: "READY",
      context,
      reason: null,
      reusedInFlight: shared.reusedInFlight,
      elapsedMs,
    };
  } catch (error) {
    const reason = toBootstrapReason(error);
    const state = classifyBootstrapState(reason);
    const elapsedMs = Date.now() - startedAt;

    emitPerformanceMetric({
      name: "auth_processing_state",
      value: elapsedMs,
      businessId: String(input.preferredBusinessId || "").trim() || null,
      route: "auth.bootstrap",
      metadata: {
        source: options?.source || "unknown",
        state,
        reason,
        reusedInFlight: shared.reusedInFlight,
      },
    });

    if (state === "FAILED_TERMINAL") {
      emitPerformanceMetric({
        name: "auth_terminal_failure",
        value: 1,
        businessId: String(input.preferredBusinessId || "").trim() || null,
        route: "auth.bootstrap",
        metadata: {
          source: options?.source || "unknown",
          reason,
        },
      });
    }

    return {
      state,
      context: null,
      reason,
      reusedInFlight: shared.reusedInFlight,
      elapsedMs,
    };
  }
};

export const primeAuthBootstrapContext = (
  input: EnsureAuthBootstrapContextInput,
  options?: {
    timeoutMs?: number;
    shouldRun?: () => boolean;
  }
) => {
  const userId = String(input.userId || "").trim();
  if (!userId) {
    return;
  }

  if (options?.shouldRun && !options.shouldRun()) {
    return;
  }

  const timeoutMs = Math.max(
    500,
    Math.floor(options?.timeoutMs || AUTH_BOOTSTRAP_BACKGROUND_TIMEOUT_MS)
  );
  const primeKey = buildAuthBootstrapKey(input);

  if (authBootstrapPrimeInFlight.has(primeKey)) {
    return;
  }

  const run = new Promise<void>((resolve) => {
    setTimeout(() => {
      if (options?.shouldRun && !options.shouldRun()) {
        resolve();
        return;
      }

      const shared = resolveAuthBootstrapRun(input);

      void withTimeout(shared.promise, timeoutMs)
        .catch((error) => {
          console.warn("AUTH_BOOTSTRAP_DEFERRED_FAILED", {
            userId: input.userId,
            preferredBusinessId: input.preferredBusinessId || null,
            reason: toBootstrapReason(error),
          });
        })
        .finally(() => {
          resolve();
        });
    }, AUTH_BOOTSTRAP_BACKGROUND_DELAY_MS);
  }).finally(() => {
    authBootstrapPrimeInFlight.delete(primeKey);
  });

  authBootstrapPrimeInFlight.set(primeKey, run);
};
