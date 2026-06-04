import prisma from "../config/prisma";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { buildLedgerKey } from "./commerce/shared";
import { resolveUserWorkspaceIdentity } from "./tenant.service";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";
import { prewarmState } from "./prewarmState";
import { verifyStripeSubscriptionFallback } from "../middleware/subscription.middleware";


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

type AuthBootstrapReadyCacheEntry = {
  context: EnsureAuthBootstrapContextResult;
  expiresAt: number;
  cachedAt: number;
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

const AUTH_BOOTSTRAP_BACKGROUND_TIMEOUT_MS = 30_000;
const AUTH_BOOTSTRAP_BACKGROUND_DELAY_MS = 35;
const AUTH_BOOTSTRAP_WAIT_TIMEOUT_MS = 1_250;
const AUTH_BOOTSTRAP_READY_CACHE_TTL_MS = 30_000;

const authBootstrapPrimeInFlight = new Map<string, Promise<void>>();
const authBootstrapEnsureInFlight = new Map<
  string,
  Promise<EnsureAuthBootstrapContextResult>
>();
const authBootstrapReadyCache = new Map<string, AuthBootstrapReadyCacheEntry>();

const normalizeText = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const normalizeEmail = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
};

const cloneBootstrapContext = (
  context: EnsureAuthBootstrapContextResult
): EnsureAuthBootstrapContextResult => ({
  user: {
    ...context.user,
  },
  identity: {
    ...context.identity,
    workspace: context.identity.workspace
      ? {
          ...context.identity.workspace,
        }
      : null,
  },
  backfilledFields: context.backfilledFields.slice(),
});

const setReadyBootstrapCache = (
  key: string,
  context: EnsureAuthBootstrapContextResult
) => {
  authBootstrapReadyCache.set(key, {
    context: cloneBootstrapContext(context),
    cachedAt: Date.now(),
    expiresAt: Date.now() + AUTH_BOOTSTRAP_READY_CACHE_TTL_MS,
  });
};

const getReadyBootstrapCache = (
  key: string
): AuthBootstrapReadyCacheEntry | null => {
  const cached = authBootstrapReadyCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    authBootstrapReadyCache.delete(key);
    return null;
  }

  return cached;
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

const writeReadyBootstrapCache = (
  input: EnsureAuthBootstrapContextInput,
  context: EnsureAuthBootstrapContextResult
) => {
  const resolvedBusinessId = String(context.identity.businessId || "").trim() || null;
  if (!resolvedBusinessId) {
    return;
  }

  const resolvedKey = buildAuthBootstrapKey({
    userId: context.user.id,
    preferredBusinessId: resolvedBusinessId,
  });
  setReadyBootstrapCache(resolvedKey, context);

  if (
    String(input.preferredBusinessId || "").trim() !==
    String(resolvedBusinessId || "").trim()
  ) {
    setReadyBootstrapCache(
      buildAuthBootstrapKey({
        userId: context.user.id,
        preferredBusinessId: input.preferredBusinessId || null,
      }),
      context
    );
  }
};

const isTestEnv = () =>
  process.env.NODE_ENV === "test" ||
  process.env.NODE_ENV === "testing" ||
  (typeof process !== "undefined" &&
    process.argv &&
    process.argv.some(
      (arg) =>
        arg.includes("run-tests.js") ||
        arg.includes("test") ||
        arg.includes("jest") ||
        arg.includes("mocha")
    ));

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

  if (isTestEnv()) {
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
  }

  // 1. Critical lane subscription seeding (Production path):
  // Write the initial FREE_LOCKED row only if no Stripe session or ledger record exists.
  const existingSubscription = await prisma.subscriptionLedger.findFirst({
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
    let activeStripeSub = null;
    try {
      activeStripeSub = await verifyStripeSubscriptionFallback(normalizedBusinessId);
    } catch (err) {
      console.warn("verifyStripeSubscriptionFallback failed during bootstrap rows seeding:", err);
    }

    if (!activeStripeSub) {
      const recheckSub = await prisma.subscriptionLedger.findFirst({
        where: { businessId: normalizedBusinessId },
        select: { id: true }
      });
      if (!recheckSub) {
        await prisma.subscriptionLedger.create({
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
    }
  }

  // 2. Heavy usage/addon table initialization is deferred (runs background/decoupled).
  const runHeavyInitialization = async () => {
    try {
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
      });
    } catch (err) {
      console.error("Deferred heavy workspace seeding failed:", err);
    }
  };

  setImmediate(() => {
    runHeavyInitialization().catch((err) => {
      console.error("Deferred runHeavyInitialization failed:", err);
    });
  });

  return {
    usageSeeded,
    addonSeeded,
    billingSeeded,
  };
};

export const ensureAuthReadyMinimalContext = async (
  input: EnsureAuthBootstrapContextInput
): Promise<EnsureAuthBootstrapContextResult> => {
  const startedAt = Date.now();
  const userId = String(input.userId || "").trim();

  if (!userId) {
    throw new Error("user_id_required");
  }

  const stageStartedAt: Record<string, number> = {
    userLookup: Date.now(),
  };
  const stageDurationsMs: Record<string, number> = {};

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
  stageDurationsMs.userLookup = Date.now() - stageStartedAt.userLookup;

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
    stageStartedAt.profileBackfill = Date.now();
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: profileUpdateData,
    });
    stageDurationsMs.profileBackfill = Date.now() - stageStartedAt.profileBackfill;

    console.info("AUTH_PROFILE_BACKFILLED", {
      userId: user.id,
      fields: backfilledFields,
    });
  }

  stageStartedAt.identityResolve = Date.now();
  const identity = await resolveUserWorkspaceIdentity({
    userId: user.id,
    preferredBusinessId: input.preferredBusinessId || user.businessId || null,
    persistResolvedBusinessId: true,
    bootstrapWorkspaceIfMissing: true,
  });
  stageDurationsMs.identityResolve = Date.now() - stageStartedAt.identityResolve;

  if (!identity.businessId || !identity.workspace) {
    throw new Error("workspace_bootstrap_failed");
  }

  emitPerformanceMetric({
    name: "identity_resolve_ms",
    value: stageDurationsMs.identityResolve,
    businessId: identity.businessId,
    route: "auth.bootstrap",
    metadata: {
      source: "ready_minimal",
      identitySource: identity.source,
    },
  });

  const result = {
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

  writeReadyBootstrapCache(input, result);

  emitPerformanceMetric({
    name: "ready_minimal_ms",
    value: Date.now() - startedAt,
    businessId: identity.businessId,
    route: "auth.bootstrap",
    metadata: {
      source: "ready_minimal",
      backfilledFields,
      identitySource: identity.source,
    },
  });

  console.info("AUTH_READY_MINIMAL", {
    userId: user.id,
    businessId: identity.businessId,
    totalMs: Date.now() - startedAt,
    stageDurationsMs,
    backfilledFields,
    identitySource: identity.source,
  });

  return result;
};

export const ensureAuthBootstrapContext = async (
  input: EnsureAuthBootstrapContextInput
): Promise<EnsureAuthBootstrapContextResult> => {
  const startedAt = Date.now();
  const stageDurationsMs: Record<string, number> = {};

  const readyMinimalStartedAt = Date.now();
  const readyMinimal = await ensureAuthReadyMinimalContext(input);
  stageDurationsMs.readyMinimal = Date.now() - readyMinimalStartedAt;

  const runSeeding = async () => {
    const workspaceSeedStartedAt = Date.now();
    const bootstrapRows = await ensureWorkspaceBootstrapRows(
      readyMinimal.identity.businessId
    );
    stageDurationsMs.workspaceSeed = Date.now() - workspaceSeedStartedAt;

    emitPerformanceMetric({
      name: "workspace_seed_deferred_ms",
      value: stageDurationsMs.workspaceSeed,
      businessId: readyMinimal.identity.businessId,
      route: "auth.bootstrap",
      metadata: {
        source: "deferred_workspace_seed",
        usageSeeded: bootstrapRows.usageSeeded,
        addonSeeded: bootstrapRows.addonSeeded,
        billingSeeded: bootstrapRows.billingSeeded,
      },
    });

    console.info("AUTH_WORKSPACE_READY", {
      userId: readyMinimal.user.id,
      businessId: readyMinimal.identity.businessId,
      source: readyMinimal.identity.source,
      usageSeeded: bootstrapRows.usageSeeded,
      addonSeeded: bootstrapRows.addonSeeded,
      billingSeeded: bootstrapRows.billingSeeded,
    });

    console.info("AUTH_BOOTSTRAP_WATERFALL", {
      userId: readyMinimal.user.id,
      businessId: readyMinimal.identity.businessId,
      totalMs: Date.now() - startedAt,
      stageDurationsMs,
      backfilledFields: readyMinimal.backfilledFields,
      usageSeeded: bootstrapRows.usageSeeded,
      addonSeeded: bootstrapRows.addonSeeded,
      billingSeeded: bootstrapRows.billingSeeded,
    });
  };

  const isTest =
    process.env.NODE_ENV === "test" ||
    process.env.NODE_ENV === "testing" ||
    (typeof process !== "undefined" &&
      process.argv &&
      process.argv.some(
        (arg) =>
          arg.includes("run-tests.js") ||
          arg.includes("test") ||
          arg.includes("jest") ||
          arg.includes("mocha")
      ));

  if (isTest) {
    await runSeeding();
  } else {
    setImmediate(() => {
      runSeeding().catch((err) => {
        console.error("AUTH_WORKSPACE_SEED_BACKGROUND_FAILED", err);
      });
    });
  }

  return readyMinimal;
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

export const getAuthBootstrapFastLaneSnapshot = (
  input: EnsureAuthBootstrapContextInput
) => {
  const userId = String(input.userId || "").trim();
  if (!userId) {
    return {
      context: null as EnsureAuthBootstrapContextResult | null,
      cacheHit: false,
      inFlight: false,
      cacheAgeMs: null as number | null,
      cacheKey: null as string | null,
    };
  }

  const primaryKey = buildAuthBootstrapKey(input);
  let cached = getReadyBootstrapCache(primaryKey);
  let cacheKey: string | null = cached ? primaryKey : null;

  if (!cached) {
    const prefix = `${userId}:`;
    for (const [key, entry] of authBootstrapReadyCache.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const validEntry = getReadyBootstrapCache(key);
      if (!validEntry) {
        continue;
      }

      cached = validEntry;
      cacheKey = key;
      break;
    }
  }

  const prefix = `${userId}:`;
  const inFlight =
    authBootstrapEnsureInFlight.has(primaryKey) ||
    authBootstrapPrimeInFlight.has(primaryKey) ||
    Array.from(authBootstrapEnsureInFlight.keys()).some((key) => key.startsWith(prefix)) ||
    Array.from(authBootstrapPrimeInFlight.keys()).some((key) => key.startsWith(prefix));

  return {
    context: cached ? cloneBootstrapContext(cached.context) : null,
    cacheHit: Boolean(cached),
    inFlight,
    cacheAgeMs: cached ? Math.max(0, Date.now() - cached.cachedAt) : null,
    cacheKey,
  };
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

  // Serve stale-valid context during recovery or cold wakeup
  const recovering = prewarmState.isCold;
  if (recovering) {
    const fastLane = getAuthBootstrapFastLaneSnapshot(input);
    if (fastLane.context) {
      // Trigger background ensure so it warms up asynchronously
      primeAuthBootstrapContext(input);
      return {
        state: "READY",
        context: fastLane.context,
        reason: "recovering_stale_valid",
        reusedInFlight: false,
        elapsedMs: Date.now() - startedAt,
      };
    }
  }
  const defaultTimeout = options?.timeoutMs || AUTH_BOOTSTRAP_WAIT_TIMEOUT_MS;
  const timeoutMs = Math.max(
    250,
    Math.floor(prewarmState.isCold ? Math.max(3500, defaultTimeout + 2250) : defaultTimeout)
  );
  const cached = getReadyBootstrapCache(buildAuthBootstrapKey(input));
  if (cached) {
    const elapsedMs = Date.now() - startedAt;
    emitPerformanceMetric({
      name: "auth_bootstrap_ms",
      value: elapsedMs,
      businessId: cached.context.user.businessId || null,
      route: "auth.bootstrap",
      metadata: {
        source: options?.source || "unknown",
        reusedInFlight: false,
        cache: "ready_cache",
      },
    });
    return {
      state: "READY",
      context: cloneBootstrapContext(cached.context),
      reason: null,
      reusedInFlight: false,
      elapsedMs,
    };
  }
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

      const backgroundStartedAt = Date.now();
      const shared = resolveAuthBootstrapRun(input);

      void withTimeout(shared.promise, timeoutMs)
        .catch((error) => {
          const reason = toBootstrapReason(error);
          if (reason === "auth_bootstrap_timeout") {
            console.info("AUTH_BOOTSTRAP_DEFERRED_TIMEOUT", {
              userId: input.userId,
              preferredBusinessId: input.preferredBusinessId || null,
            });
          } else {
            console.warn("AUTH_BOOTSTRAP_DEFERRED_FAILED", {
              userId: input.userId,
              preferredBusinessId: input.preferredBusinessId || null,
              reason,
            });
          }
        })
        .finally(() => {
          emitPerformanceMetric({
            name: "auth_bootstrap_background_ms",
            value: Date.now() - backgroundStartedAt,
            businessId: String(input.preferredBusinessId || "").trim() || null,
            route: "auth.bootstrap",
            metadata: {
              source: "deferred_prime",
              reusedInFlight: shared.reusedInFlight,
            },
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
