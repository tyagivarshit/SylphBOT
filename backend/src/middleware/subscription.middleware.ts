import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import redis from "../config/redis";
import { getPlanKey } from "../config/plan.config";
import { env } from "../config/env";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { stripe } from "../services/stripe.service";
import { getPlanFromPrice } from "../config/stripe.price.map";
import { invalidateFeatureCache } from "../services/feature.service";
import { prewarmState } from "../services/prewarmState";
import { registerBillingPrewarmer } from "../services/prewarm.service";
import { requestStorage, getRequestRemainingMs, getRequestAbortSignal } from "../utils/requestLifecycle";
import { runProjectionComputeTask } from "../services/projectionCoordinator.service";
import {
  getAnalyticsDashboardCorrelationId,
  getAnalyticsDashboardLifecycleElapsedMs,
  isAnalyticsDashboardRequest,
  logAnalyticsDashboardLifecycle,
} from "../utils/analyticsDashboardLifecycleTrace";

registerBillingPrewarmer(async (businessId) => {
  await loadBillingContext(businessId).catch(() => null);
});
const CACHE_TTL = 60 * 60 * 12;
const SUBSCRIPTION_MEMORY_CACHE_TTL_MS = 15_000;
const EARLY_ACCESS_LIMIT = Number(env.EARLY_ACCESS_LIMIT || 50);
const EARLY_ACCESS_CACHE_TTL_MS = 30_000;
const EARLY_ACCESS_CACHE_KEY = "__global__";
const safeRedisGet = async (key: string) => {
  try {
    return await Promise.race([
      redis.get(key),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 120)
      ),
    ]);
  } catch {
    return null;
  }
};

const safeRedisSet = async (
  key: string,
  value: string,
  ttl?: number
) => {
  try {
    return await Promise.race([
      ttl
        ? redis.set(key, value, "EX", ttl)
        : redis.set(key, value),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 120)
      ),
    ]);
  } catch {
    return null;
  }
};

const safeRedisDel = async (key: string) => {
  try {
    return await Promise.race([
      redis.del(key),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 120)
      ),
    ]);
  } catch {
    return null;
  }
};

const earlyAccessCache = new Map<
  string,
  {
    value: {
      allowEarly: boolean;
      remainingEarly: number;
    };
    expiresAt: number;
  }
>();

const subscriptionMemoryCache = new Map<
  string,
  {
    value: any | null;
    expiresAt: number;
    promise?: Promise<any | null>;
  }
>();

export const getBillingCacheKey = (businessId: string) => `sub:${businessId}`;

export const invalidateBillingContextCache = async (businessId: string) => {
  const normalizedBusinessId = String(businessId || "").trim();

  if (!normalizedBusinessId) {
    return false;
  }

  subscriptionMemoryCache.delete(normalizedBusinessId);
  invalidateFeatureCache(normalizedBusinessId);
  await safeRedisDel(getBillingCacheKey(normalizedBusinessId)).catch(() => undefined);
  return true;
};

export type BillingContext = {
  subscription: any | null;
  plan: any | null;
  planKey: string;
  status: "INACTIVE" | "ACTIVE" | "TRIAL";
  isLimited: boolean;
  upgradeRequired: boolean;
  allowEarly?: boolean;
  remainingEarly?: number;
};

const getBaseContext = (): BillingContext => ({
  subscription: null,
  plan: null,
  planKey: "FREE_LOCKED",
  status: "INACTIVE",
  isLimited: true,
  upgradeRequired: true,
  allowEarly: false,
  remainingEarly: 0,
});

const lockContext = (
  context: BillingContext,
  status: BillingContext["status"] = "INACTIVE"
): BillingContext => ({
  ...context,
  planKey: "FREE_LOCKED",
  status,
  isLimited: true,
  upgradeRequired: true,
});

const mapCanonicalSubscription = (row: any) => ({
  id: row.id,
  businessId: row.businessId,
  status:
    row.status === "TRIALING"
      ? "TRIAL"
      : row.status === "ACTIVE"
      ? "ACTIVE"
      : row.status === "PAST_DUE"
      ? "PAST_DUE"
      : row.status === "PENDING"
      ? "INACTIVE"
      : "CANCELLED",
  graceUntil: row.status === "PAST_DUE" ? row.renewAt || row.currentPeriodEnd || null : null,
  currentPeriodEnd: row.currentPeriodEnd || row.renewAt || null,
  isTrial:
    row.status === "TRIALING" ||
    (row.trialEndsAt ? new Date(row.trialEndsAt).getTime() > Date.now() : false),
  stripeCustomerId: null,
  stripeSubscriptionId: row.providerSubscriptionId || null,
  currency: row.currency,
  billingCycle: row.billingCycle,
  plan: {
    name: row.planCode,
    type: row.planCode,
  },
  metadata: row.metadata || null,
  subscriptionKey: row.subscriptionKey || null,
  providerSubscriptionId: row.providerSubscriptionId || null,
});

export const evaluateBillingContext = (sub: any, now: Date = new Date()): BillingContext => {
  let ctx: BillingContext = {
    subscription: sub,
    plan: sub.plan,
    planKey: getPlanKey(sub.plan),
    status: "ACTIVE" as BillingContext["status"],
    isLimited: false,
    upgradeRequired: false,
    allowEarly: false,
    remainingEarly: 0,
  };

  if (sub.status === "INACTIVE" || sub.status === "CANCELLED") {
    ctx = lockContext(ctx);
  }

  if (sub.status === "PAST_DUE") {
    ctx =
      sub.graceUntil &&
      now <= new Date(sub.graceUntil)
        ? {
            ...ctx,
            status: "ACTIVE" as BillingContext["status"],
          }
        : lockContext(ctx);
  }

  if (sub.isTrial) {
    ctx =
      sub.currentPeriodEnd &&
      now <= new Date(sub.currentPeriodEnd)
        ? {
            ...ctx,
            status: "TRIAL" as BillingContext["status"],
          }
        : lockContext(ctx);
  }
  return ctx;
};

export const getAuthoritativeSubscriptionLKV = async (
  businessId: string,
  now: Date = new Date()
): Promise<{ subscription: any; context: BillingContext } | null> => {
  const normalizedBusinessId = String(businessId || "").trim();
  if (!normalizedBusinessId) return null;

  // 1. Existing valid entitlement snapshot (memory LKV)
  const lkvSub = prewarmState.lastKnownValidSubscription.get(normalizedBusinessId);
  const lkvBill = prewarmState.lastKnownValidBilling.get(normalizedBusinessId);
  if (
    lkvSub &&
    lkvBill &&
    lkvSub.plan?.name !== "FREE_LOCKED" &&
    lkvSub.plan?.name !== "LOCKED"
  ) {
    return { subscription: lkvSub, context: lkvBill };
  }

  // 2. Existing Redis subscription projection
  const cacheKey = getBillingCacheKey(normalizedBusinessId);
  const cached = await safeRedisGet(cacheKey).catch(() => null);
  if (cached && cached !== "null") {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.plan?.name !== "FREE_LOCKED" && parsed.plan?.name !== "LOCKED") {
        const context = evaluateBillingContext(parsed, now);
        prewarmState.lastKnownValidSubscription.set(normalizedBusinessId, parsed);
        prewarmState.lastKnownValidBilling.set(normalizedBusinessId, context);
        return { subscription: parsed, context };
      }
    } catch {}
  }

  // 3. Local DB subscription ledger
  const canonical = await prisma.subscriptionLedger.findFirst({
    where: { businessId: normalizedBusinessId },
    orderBy: { updatedAt: "desc" },
  }).catch(() => null);
  if (canonical && canonical.planCode !== "FREE_LOCKED" && canonical.planCode !== "LOCKED") {
    const parsed = mapCanonicalSubscription(canonical);
    const context = evaluateBillingContext(parsed, now);
    prewarmState.lastKnownValidSubscription.set(normalizedBusinessId, parsed);
    prewarmState.lastKnownValidBilling.set(normalizedBusinessId, context);
    return { subscription: parsed, context };
  }

  return null;
};

const makeAbortable = <T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> => {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new Error("request_aborted:stripe_query"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error("request_aborted:stripe_query"));
    };
    signal.addEventListener("abort", onAbort);
    promise.then(
      (res) => {
        signal.removeEventListener("abort", onAbort);
        resolve(res);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
};

export const verifyStripeSubscriptionFallback = async (
  businessId: string,
  requestSignal?: AbortSignal | null
): Promise<any | null> => {
  const startedAt = Date.now();
  const normalizedBusinessId = String(businessId || "").trim();
  if (!normalizedBusinessId) return null;

  const rateLimitKey = `fb_chk:${normalizedBusinessId}`;
  let outcome = "unknown";
  let customerLookupMs: number | null = null;
  
  try {
    const isRateLimited = await safeRedisGet(rateLimitKey).catch(() => null);
    if (isRateLimited) {
      outcome = "rate_limited";
      console.info("Stripe direct fallback skipped due to 30s rate-limit", { businessId: normalizedBusinessId });
      return null;
    }
    
    await safeRedisSet(rateLimitKey, "1", 30).catch(() => undefined);

    const store = requestStorage.getStore();
    const remainingMs = getRequestRemainingMs(null, 4000);
    const stripeTimeout = Math.max(200, Math.min(4000, remainingMs - 100));

    // Try to retrieve existing stripeCustomerId from DB (including PENDING rows)
    const ledgerRows = await prisma.subscriptionLedger.findMany({
      where: { businessId: normalizedBusinessId },
      select: { metadata: true },
      orderBy: { createdAt: "desc" },
    });

    let customerId: string | null = null;
    for (const r of ledgerRows) {
      const meta = r.metadata as Record<string, any> | null;
      if (meta && typeof meta === "object" && meta.stripeCustomerId) {
        customerId = String(meta.stripeCustomerId).trim();
        break;
      }
    }

    if (!customerId) {
      const business = await prisma.business.findUnique({
        where: { id: normalizedBusinessId },
        select: {
          owner: {
            select: {
              email: true,
            }
          }
        }
      });

      const email = business?.owner?.email;
      if (!email) {
        outcome = "missing_owner_email";
        console.info("Stripe direct fallback: No owner email found", { businessId: normalizedBusinessId });
        return null;
      }

      const customerLookupStartedAt = Date.now();
      let customers;
      try {
        customers = await makeAbortable(
          stripe.customers.list({
            email,
            limit: 1,
          }, { timeout: stripeTimeout }),
          requestSignal
        );
        customerLookupMs = Date.now() - customerLookupStartedAt;
        emitPerformanceMetric({
          name: "stripe_customers_list_ms",
          value: customerLookupMs,
          businessId: normalizedBusinessId,
          route: "auth.bootstrap",
          metadata: {
            source: "verify_stripe_subscription_fallback",
            outcome: "ok",
            stripeTimeout,
          },
        });
      } catch (error) {
        customerLookupMs = Date.now() - customerLookupStartedAt;
        emitPerformanceMetric({
          name: "stripe_customers_list_ms",
          value: customerLookupMs,
          businessId: normalizedBusinessId,
          route: "auth.bootstrap",
          metadata: {
            source: "verify_stripe_subscription_fallback",
            outcome: "error",
            stripeTimeout,
            reason: String((error as Error)?.message || "stripe_customers_list_failed"),
          },
        });
        throw error;
      }

      if (!customers.data || customers.data.length === 0) {
        outcome = "missing_customer";
        console.info("Stripe direct fallback: No Stripe customer found", { email });
        return null;
      }

      customerId = customers.data[0].id;
    }

    const stripeSubs = await makeAbortable(
      stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      }, { timeout: stripeTimeout }),
      requestSignal
    );

    if (!stripeSubs.data || stripeSubs.data.length === 0) {
      outcome = "missing_subscription";
      console.info("Stripe direct fallback: No subscriptions found for customer", { customerId });
      return null;
    }

    const activeSub: any = stripeSubs.data.find(sub => 
      ["active", "trialing", "past_due", "paused"].includes(sub.status)
    );

    if (!activeSub) {
      outcome = "missing_active_subscription";
      console.info("Stripe direct fallback: No active subscription in Stripe", { customerId });
      return null;
    }

    const item = activeSub.items.data[0];
    const priceId = item?.price?.id;
    if (!priceId) {
      outcome = "missing_price";
      console.warn("Stripe direct fallback: active subscription has no price ID", { activeSubId: activeSub.id });
      return null;
    }

    const planCode = getPlanFromPrice(priceId);
    if (!planCode) {
      outcome = "unknown_price";
      console.warn("Stripe direct fallback: could not map price ID to planCode", { priceId });
      return null;
    }

    const currentPeriodEnd = activeSub.current_period_end 
      ? new Date(activeSub.current_period_end * 1000).toISOString() 
      : null;

    const trialEndsAt = activeSub.trial_end 
      ? new Date(activeSub.trial_end * 1000).toISOString() 
      : null;

    const rowForMapping = {
      id: activeSub.id,
      businessId: normalizedBusinessId,
      status: activeSub.status.toUpperCase(),
      renewAt: currentPeriodEnd,
      currentPeriodEnd,
      trialEndsAt,
      providerSubscriptionId: activeSub.id,
      currency: activeSub.currency?.toUpperCase() || "USD",
      billingCycle: item.price.recurring?.interval === "year" ? "yearly" : "monthly",
      planCode,
      metadata: {
        ...(activeSub.metadata || {}),
        stripeCustomerId: customerId,
      },
      subscriptionKey: `sub_${activeSub.id}`,
    };

    const mappedSub = mapCanonicalSubscription(rowForMapping);

    const cacheKey = getBillingCacheKey(normalizedBusinessId);
    await safeRedisSet(cacheKey, JSON.stringify(mappedSub), 30).catch(() => undefined);

    subscriptionMemoryCache.set(normalizedBusinessId, {
      value: mappedSub,
      expiresAt: Date.now() + 30000,
    });

    console.info("Stripe direct fallback: successfully resolved subscription from Stripe", { 
      businessId: normalizedBusinessId,
      planCode,
      subId: activeSub.id 
    });

    outcome = "resolved";
    return mappedSub;
  } catch (error) {
    outcome = "error";
    console.error("Error in verifyStripeSubscriptionFallback:", error);
    return null;
  } finally {
    emitPerformanceMetric({
      name: "verify_stripe_subscription_fallback_ms",
      value: Date.now() - startedAt,
      businessId: normalizedBusinessId,
      route: "auth.bootstrap",
      metadata: {
        outcome,
        customerLookupMs,
      },
    });
  }
};

const getCachedSubscription = async (businessId: string, isCheckout?: boolean) => {
  const inMemory = subscriptionMemoryCache.get(businessId);
  if (inMemory && !inMemory.promise && inMemory.expiresAt > Date.now()) {
    emitPerformanceMetric({
      name: "CACHE_HIT",
      businessId,
      route: "subscription_context",
      metadata: {
        cache: "memory_subscription",
      },
    });
    return inMemory.value;
  }

  if (inMemory?.promise && !isCheckout) {
    return inMemory.promise;
  }

  const loadPromise = (async () => {
    const cacheKey = getBillingCacheKey(businessId);
    const cached = await safeRedisGet(cacheKey).catch(() => null);

    if (cached) {
      emitPerformanceMetric({
        name: "CACHE_HIT",
        businessId,
        route: "subscription_context",
        metadata: {
          cache: "redis_subscription",
        },
      });
      try {
        if (cached === "null") {
          subscriptionMemoryCache.set(businessId, {
            value: null,
            expiresAt: Date.now() + SUBSCRIPTION_MEMORY_CACHE_TTL_MS,
          });
          return null;
        }
        const parsed = JSON.parse(cached);
        subscriptionMemoryCache.set(businessId, {
          value: parsed,
          expiresAt: Date.now() + SUBSCRIPTION_MEMORY_CACHE_TTL_MS,
        });
        return parsed;
      } catch {
        await safeRedisDel(cacheKey).catch(() => undefined);
      }
    }

    emitPerformanceMetric({
      name: "CACHE_MISS",
      businessId,
      route: "subscription_context",
      metadata: {
        cache: "redis_subscription",
      },
    });

    const dbStart = Date.now();
    const canonical = await prisma.subscriptionLedger
      .findFirst({
        where: {
          businessId,
        },
        orderBy: {
          updatedAt: "desc",
        },
      })
      .catch(() => null);
    console.info("BILLING_STAGE_TIME", {
      stage: "getCachedSubscription.db",
      durationMs: Date.now() - dbStart,
      businessId,
    });

    const subscription = canonical
      ? mapCanonicalSubscription(canonical)
      : null;

    if (subscription) {
      await redis
        .set(
          cacheKey,
          JSON.stringify(subscription),
          "EX",
          CACHE_TTL
        )
        .catch(() => undefined);
      subscriptionMemoryCache.set(businessId, {
        value: subscription,
        expiresAt: Date.now() + SUBSCRIPTION_MEMORY_CACHE_TTL_MS,
      });
    } else {
      await redis
        .set(
          cacheKey,
          "null",
          "EX",
          CACHE_TTL
        )
        .catch(() => undefined);
      subscriptionMemoryCache.set(businessId, {
        value: null,
        expiresAt: Date.now() + SUBSCRIPTION_MEMORY_CACHE_TTL_MS,
      });
    }

    return subscription;
  })().finally(() => {
    const latest = subscriptionMemoryCache.get(businessId);
    if (latest?.promise) {
      subscriptionMemoryCache.set(businessId, {
        value: latest.value ?? null,
        expiresAt: latest.expiresAt || 0,
      });
    }
  });

  subscriptionMemoryCache.set(businessId, {
    value: inMemory?.value ?? null,
    expiresAt: inMemory?.expiresAt || 0,
    promise: loadPromise,
  });

  return loadPromise;
};

const getEarlyAccessSnapshot = async (subscription: any | null) => {
  const currentStore = requestStorage.getStore();
  const currentReq = currentStore?.req;
  const currentRes = currentStore?.res;
  const isAnalyticsDashboard =
    Boolean(currentReq) && isAnalyticsDashboardRequest(currentReq);
  if (isAnalyticsDashboard) {
    logAnalyticsDashboardLifecycle("EARLY_ACCESS_START", {
      correlationId: getAnalyticsDashboardCorrelationId({
        req: currentReq,
        res: currentRes,
      }),
      requestId: currentReq?.requestId || null,
      elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res: currentRes }),
      route: currentReq?.originalUrl || null,
      method: currentReq?.method || null,
      businessId: subscription?.businessId || null,
    });
  }
  const logEarlyAccessEnd = () => {
    if (!isAnalyticsDashboard) {
      return;
    }
    logAnalyticsDashboardLifecycle("EARLY_ACCESS_END", {
      correlationId: getAnalyticsDashboardCorrelationId({
        req: currentReq,
        res: currentRes,
      }),
      requestId: currentReq?.requestId || null,
      elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res: currentRes }),
      route: currentReq?.originalUrl || null,
      method: currentReq?.method || null,
      businessId: subscription?.businessId || null,
    });
  };
  const cacheKey = EARLY_ACCESS_CACHE_KEY;
  const cached = earlyAccessCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    emitPerformanceMetric({
      name: "CACHE_HIT",
      businessId: subscription?.businessId || null,
      route: "early_access_projection",
      metadata: {
        cache: "memory_early_access",
      },
    });
    logEarlyAccessEnd();
    return cached.value;
  }

  emitPerformanceMetric({
    name: "CACHE_MISS",
    businessId: subscription?.businessId || null,
    route: "early_access_projection",
    metadata: {
      cache: "memory_early_access",
    },
  });

  try {
    const dbStart = Date.now();
    const dbPromise = prisma.plan.findMany({
      where: {
        type: {
          in: ["BASIC", "PRO", "ELITE"],
        },
      },
      select: {
        earlyUsed: true,
      },
    });
    const plans = (await Promise.race([
      dbPromise,
      new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 200)),
    ]).catch(() => [])) as any[];
    console.info("BILLING_STAGE_TIME", {
      stage: "getEarlyAccessSnapshot.db",
      durationMs: Date.now() - dbStart,
      businessId: subscription?.businessId || null,
    });

    const totalEarlyUsed = plans.reduce(
      (acc, plan) => acc + (plan.earlyUsed || 0),
      0
    );

    const value = {
      allowEarly:
        totalEarlyUsed < EARLY_ACCESS_LIMIT &&
        !subscription?.stripeSubscriptionId,
      remainingEarly: Math.max(
        EARLY_ACCESS_LIMIT - totalEarlyUsed,
        0
      ),
    };

    earlyAccessCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + EARLY_ACCESS_CACHE_TTL_MS,
    });

    logEarlyAccessEnd();
    return value;
  } catch {
    logEarlyAccessEnd();
    return {
      allowEarly: false,
      remainingEarly: 0,
    };
  }
};

export const loadBillingContext = async (
  businessId: string,
  options?: { skipStripeFallback?: boolean; isCheckout?: boolean }
) => {
  const startedAt = Date.now();
  const now = new Date();

  const currentStore = requestStorage.getStore();
  const currentReq = currentStore?.req;
  const isCheckout =
    Boolean(options?.isCheckout) ||
    Boolean(currentReq && (
      String(currentReq.originalUrl || "").includes("/checkout") ||
      String(currentReq.originalUrl || "").includes("surface=checkout") ||
      String(currentReq.query?.surface || "").trim().toLowerCase() === "checkout"
    ));

  if (isCheckout) {
    const lkvSub = prewarmState.lastKnownValidSubscription.get(businessId);
    const lkvBill = prewarmState.lastKnownValidBilling.get(businessId);
    let subscription = lkvSub || null;
    let context = lkvBill ? { ...lkvBill } : getBaseContext();

    if (!lkvSub || !lkvBill) {
      const memoryEntry = subscriptionMemoryCache.get(businessId);
      if (memoryEntry?.value) {
        subscription = memoryEntry.value;
        context = evaluateBillingContext(memoryEntry.value, now);
      }
    }

    const earlyAccessCacheKey = EARLY_ACCESS_CACHE_KEY;
    const cachedEarly = earlyAccessCache.get(earlyAccessCacheKey);
    if (cachedEarly && cachedEarly.expiresAt > Date.now()) {
      context.allowEarly = cachedEarly.value.allowEarly;
      context.remainingEarly = cachedEarly.value.remainingEarly;
      emitPerformanceMetric({
        name: "CACHE_HIT",
        businessId,
        route: "early_access_projection",
        metadata: {
          cache: "memory_early_access",
        },
      });
    } else {
      context.allowEarly = false;
      context.remainingEarly = 0;
      emitPerformanceMetric({
        name: "CACHE_MISS",
        businessId,
        route: "early_access_projection",
        metadata: {
          cache: "memory_early_access",
        },
      });
    }

    // Spawn background projection/hydration repair asynchronously without awaiting
    const billingCacheKey = getBillingCacheKey(businessId);
    const memoryEntry = subscriptionMemoryCache.get(businessId);
    if (!memoryEntry?.promise) {
      void runProjectionComputeTask({
        cacheKey: billingCacheKey,
        label: "billing_projection",
        businessId,
        computeBudgetMs: 10000,
        bypassCoordination: true,
        task: async () => {
          const freshSub = await getCachedSubscription(businessId, true).catch(() => null);
          if (freshSub) {
            const freshCtx = evaluateBillingContext(freshSub, new Date());
            prewarmState.lastKnownValidSubscription.set(businessId, freshSub);
            prewarmState.lastKnownValidBilling.set(businessId, freshCtx);
          }
          return {};
        }
      }).catch(() => null);
    }

    emitPerformanceMetric({
      name: "PROJECTION_MS",
      value: Date.now() - startedAt,
      businessId,
      route: "billing_context",
      metadata: {
        planKey: context.planKey,
        status: context.status,
        checkoutHydrationMode: "stale_first_non_blocking",
      },
    });

    return {
      subscription,
      context,
    };
  }
  
  // 1. Check for authoritative LKV first (covers memory LKV, Redis cache, and DB ledger)
  const authoritativeLkv = await getAuthoritativeSubscriptionLKV(businessId, now);
  if (authoritativeLkv) {
    // Kicks off background fetch to refresh the projection and memory map
    getCachedSubscription(businessId).catch(() => null);
    
    // Serve early access snapshot check
    const earlyAccess = await getEarlyAccessSnapshot(authoritativeLkv.subscription).catch(() => ({
      allowEarly: false,
      remainingEarly: 0,
    }));
    authoritativeLkv.context.allowEarly = earlyAccess.allowEarly;
    authoritativeLkv.context.remainingEarly = earlyAccess.remainingEarly;
    
    emitPerformanceMetric({
      name: "PROJECTION_MS",
      value: Date.now() - startedAt,
      businessId,
      route: "billing_context",
      metadata: {
        planKey: authoritativeLkv.context.planKey,
        status: authoritativeLkv.context.status,
        recoverySource: "LKV",
      },
    });

    return authoritativeLkv;
  }

  // 2. No valid paid LKV history exists. Proceed to standard lookup and fallback to FREE_LOCKED/FREE_TRIAL.
  let context = getBaseContext();
  const hasFallback =
    prewarmState.lastKnownValidSubscription.has(businessId) ||
    subscriptionMemoryCache.get(businessId)?.value;
  let timeoutLimit = hasFallback ? 300 : (prewarmState.isCold ? 5500 : 1500);

  const store = requestStorage.getStore();
  const isRequestPath = Boolean(store);
  if (isRequestPath) {
    const remainingMs = getRequestRemainingMs(null, timeoutLimit);
    timeoutLimit = Math.max(100, Math.min(timeoutLimit, remainingMs - 150));
  }

  const cachedSubscription = await Promise.race([
    getCachedSubscription(businessId),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutLimit)),
  ]).catch(() => null);

  let subscription = cachedSubscription;

  if (subscription?.plan) {
    context = evaluateBillingContext(subscription, now);
  } else {
    // Attempt fallback to stale/last-known-valid
    const lkvSub = prewarmState.lastKnownValidSubscription.get(businessId);
    const lkvBill = prewarmState.lastKnownValidBilling.get(businessId);
    if (lkvSub && lkvBill) {
      subscription = lkvSub;
      context = lkvBill;
    } else {
      const memoryEntry = subscriptionMemoryCache.get(businessId);
      if (memoryEntry?.value) {
        subscription = memoryEntry.value;
        context = evaluateBillingContext(memoryEntry.value, now);
      }
    }
  }

  let stripeCheckTriggeredSync = false;
  const isFreeLockedOrMissing = !subscription || context.planKey === "FREE_LOCKED";
  const skipStripeFallback = Boolean(options?.skipStripeFallback);

  if (isFreeLockedOrMissing && isRequestPath && !skipStripeFallback) {
    const remainingMs = getRequestRemainingMs(null, 0);
    if (remainingMs >= 1500) {
      const requestSignal = getRequestAbortSignal({ req: store.req, res: store.res });
      try {
        stripeCheckTriggeredSync = true;
        const resolvedSub = await verifyStripeSubscriptionFallback(businessId, requestSignal);
        if (resolvedSub && resolvedSub.plan?.name !== "FREE_LOCKED") {
          subscription = resolvedSub;
          context = evaluateBillingContext(subscription, now);
        }
      } catch (err) {
        console.warn("Synchronous verifyStripeSubscriptionFallback failed:", err);
      }
    }
  }

  // Save successful load as last-known-valid
  if (subscription) {
    prewarmState.lastKnownValidSubscription.set(businessId, subscription);
    prewarmState.lastKnownValidBilling.set(businessId, context);
  }

  if (context.planKey === "FREE_LOCKED" && !stripeCheckTriggeredSync && !skipStripeFallback) {
    // Run direct Stripe fallback verification asynchronously to keep hot path latency low
    verifyStripeSubscriptionFallback(businessId).catch((err) => {
      console.warn("Async verifyStripeSubscriptionFallback error:", err);
    });
  }

  const earlyAccess = await getEarlyAccessSnapshot(subscription).catch(() => ({
    allowEarly: false,
    remainingEarly: 0,
  }));

  context.allowEarly = earlyAccess.allowEarly;
  context.remainingEarly = earlyAccess.remainingEarly;

  emitPerformanceMetric({
    name: "PROJECTION_MS",
    value: Date.now() - startedAt,
    businessId,
    route: "billing_context",
    metadata: {
      planKey: context.planKey,
      status: context.status,
    },
  });

  return {
    subscription,
    context,
  };
};

export const attachBillingContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isAnalyticsDashboard = isAnalyticsDashboardRequest(req);
  if (isAnalyticsDashboard) {
    logAnalyticsDashboardLifecycle("SUBSCRIPTION_CONTEXT_START", {
      correlationId: getAnalyticsDashboardCorrelationId({ req, res }),
      requestId: req.requestId || null,
      elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
      route: req.originalUrl,
      method: req.method,
      businessId: req.user?.businessId || null,
    });
  }
  let subscriptionContextEndLogged = false;
  const logSubscriptionContextEnd = () => {
    if (!isAnalyticsDashboard || subscriptionContextEndLogged) {
      return;
    }
    subscriptionContextEndLogged = true;
    logAnalyticsDashboardLifecycle("SUBSCRIPTION_CONTEXT_END", {
      correlationId: getAnalyticsDashboardCorrelationId({ req, res }),
      requestId: req.requestId || null,
      elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
      route: req.originalUrl,
      method: req.method,
    });
  };
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      logSubscriptionContextEnd();
      return res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    }

    const isCheckout =
      String(req.originalUrl || "").includes("/checkout") ||
      String(req.query?.surface || "").trim().toLowerCase() === "checkout";
    
    let subscription = null;
    let context = getBaseContext();

    try {
      const result = await loadBillingContext(
        businessId,
        { skipStripeFallback: isCheckout, isCheckout: isCheckout }
      );
      subscription = result.subscription;
      context = result.context;
    } catch (loadError) {
      console.warn("Non-critical loadBillingContext failed, continuing checkout in degraded mode:", loadError);
    } finally {
      logSubscriptionContextEnd();
    }

    (req as any).subscription = subscription;
    (req as any).billing = context;

    next();
  } catch (error) {
    console.error("Subscription middleware error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};
