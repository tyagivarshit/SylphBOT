"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachBillingContext = exports.loadBillingContext = exports.verifyStripeSubscriptionFallback = exports.invalidateBillingContextCache = exports.getBillingCacheKey = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = __importDefault(require("../config/redis"));
const plan_config_1 = require("../config/plan.config");
const env_1 = require("../config/env");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const stripe_service_1 = require("../services/stripe.service");
const stripe_price_map_1 = require("../config/stripe.price.map");
const feature_service_1 = require("../services/feature.service");
const prewarmState_1 = require("../services/prewarmState");
const prewarm_service_1 = require("../services/prewarm.service");
const requestLifecycle_1 = require("../utils/requestLifecycle");
(0, prewarm_service_1.registerBillingPrewarmer)(async (businessId) => {
    await (0, exports.loadBillingContext)(businessId).catch(() => null);
});
const CACHE_TTL = 60 * 60 * 12;
const SUBSCRIPTION_MEMORY_CACHE_TTL_MS = 15000;
const EARLY_ACCESS_LIMIT = Number(env_1.env.EARLY_ACCESS_LIMIT || 50);
const EARLY_ACCESS_CACHE_TTL_MS = 30000;
const EARLY_ACCESS_CACHE_KEY = "__global__";
const safeRedisGet = async (key) => {
    try {
        return await Promise.race([
            redis_1.default.get(key),
            new Promise((resolve) => setTimeout(() => resolve(null), 120)),
        ]);
    }
    catch {
        return null;
    }
};
const safeRedisSet = async (key, value, ttl) => {
    try {
        return await Promise.race([
            ttl
                ? redis_1.default.set(key, value, "EX", ttl)
                : redis_1.default.set(key, value),
            new Promise((resolve) => setTimeout(() => resolve(null), 120)),
        ]);
    }
    catch {
        return null;
    }
};
const safeRedisDel = async (key) => {
    try {
        return await Promise.race([
            redis_1.default.del(key),
            new Promise((resolve) => setTimeout(() => resolve(null), 120)),
        ]);
    }
    catch {
        return null;
    }
};
const earlyAccessCache = new Map();
const subscriptionMemoryCache = new Map();
const getBillingCacheKey = (businessId) => `sub:${businessId}`;
exports.getBillingCacheKey = getBillingCacheKey;
const invalidateBillingContextCache = async (businessId) => {
    const normalizedBusinessId = String(businessId || "").trim();
    if (!normalizedBusinessId) {
        return false;
    }
    subscriptionMemoryCache.delete(normalizedBusinessId);
    (0, feature_service_1.invalidateFeatureCache)(normalizedBusinessId);
    await safeRedisDel((0, exports.getBillingCacheKey)(normalizedBusinessId)).catch(() => undefined);
    return true;
};
exports.invalidateBillingContextCache = invalidateBillingContextCache;
const getBaseContext = () => ({
    subscription: null,
    plan: null,
    planKey: "FREE_LOCKED",
    status: "INACTIVE",
    isLimited: true,
    upgradeRequired: true,
    allowEarly: false,
    remainingEarly: 0,
});
const lockContext = (context, status = "INACTIVE") => ({
    ...context,
    planKey: "FREE_LOCKED",
    status,
    isLimited: true,
    upgradeRequired: true,
});
const mapCanonicalSubscription = (row) => ({
    id: row.id,
    businessId: row.businessId,
    status: row.status === "TRIALING"
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
    isTrial: row.status === "TRIALING" ||
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
const makeAbortable = (promise, signal) => {
    if (!signal)
        return promise;
    if (signal.aborted) {
        return Promise.reject(new Error("request_aborted:stripe_query"));
    }
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            reject(new Error("request_aborted:stripe_query"));
        };
        signal.addEventListener("abort", onAbort);
        promise.then((res) => {
            signal.removeEventListener("abort", onAbort);
            resolve(res);
        }, (err) => {
            signal.removeEventListener("abort", onAbort);
            reject(err);
        });
    });
};
const verifyStripeSubscriptionFallback = async (businessId, requestSignal) => {
    const normalizedBusinessId = String(businessId || "").trim();
    if (!normalizedBusinessId)
        return null;
    const rateLimitKey = `fb_chk:${normalizedBusinessId}`;
    try {
        const isRateLimited = await safeRedisGet(rateLimitKey).catch(() => null);
        if (isRateLimited) {
            console.info("Stripe direct fallback skipped due to 30s rate-limit", { businessId: normalizedBusinessId });
            return null;
        }
        await safeRedisSet(rateLimitKey, "1", 30).catch(() => undefined);
        const store = requestLifecycle_1.requestStorage.getStore();
        const remainingMs = (0, requestLifecycle_1.getRequestRemainingMs)(null, 4000);
        const stripeTimeout = Math.max(200, Math.min(4000, remainingMs - 100));
        // Try to retrieve existing stripeCustomerId from DB (including PENDING rows)
        const ledgerRows = await prisma_1.default.subscriptionLedger.findMany({
            where: { businessId: normalizedBusinessId },
            select: { metadata: true },
            orderBy: { createdAt: "desc" },
        });
        let customerId = null;
        for (const r of ledgerRows) {
            const meta = r.metadata;
            if (meta && typeof meta === "object" && meta.stripeCustomerId) {
                customerId = String(meta.stripeCustomerId).trim();
                break;
            }
        }
        if (!customerId) {
            const business = await prisma_1.default.business.findUnique({
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
                console.info("Stripe direct fallback: No owner email found", { businessId: normalizedBusinessId });
                return null;
            }
            const customers = await makeAbortable(stripe_service_1.stripe.customers.list({
                email,
                limit: 1,
            }, { timeout: stripeTimeout }), requestSignal);
            if (!customers.data || customers.data.length === 0) {
                console.info("Stripe direct fallback: No Stripe customer found", { email });
                return null;
            }
            customerId = customers.data[0].id;
        }
        const stripeSubs = await makeAbortable(stripe_service_1.stripe.subscriptions.list({
            customer: customerId,
            status: "all",
            limit: 10,
        }, { timeout: stripeTimeout }), requestSignal);
        if (!stripeSubs.data || stripeSubs.data.length === 0) {
            console.info("Stripe direct fallback: No subscriptions found for customer", { customerId });
            return null;
        }
        const activeSub = stripeSubs.data.find(sub => ["active", "trialing", "past_due", "paused"].includes(sub.status));
        if (!activeSub) {
            console.info("Stripe direct fallback: No active subscription in Stripe", { customerId });
            return null;
        }
        const item = activeSub.items.data[0];
        const priceId = item?.price?.id;
        if (!priceId) {
            console.warn("Stripe direct fallback: active subscription has no price ID", { activeSubId: activeSub.id });
            return null;
        }
        const planCode = (0, stripe_price_map_1.getPlanFromPrice)(priceId);
        if (!planCode) {
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
        const cacheKey = (0, exports.getBillingCacheKey)(normalizedBusinessId);
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
        return mappedSub;
    }
    catch (error) {
        console.error("Error in verifyStripeSubscriptionFallback:", error);
        return null;
    }
};
exports.verifyStripeSubscriptionFallback = verifyStripeSubscriptionFallback;
const getCachedSubscription = async (businessId) => {
    const inMemory = subscriptionMemoryCache.get(businessId);
    if (inMemory && !inMemory.promise && inMemory.expiresAt > Date.now()) {
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "CACHE_HIT",
            businessId,
            route: "subscription_context",
            metadata: {
                cache: "memory_subscription",
            },
        });
        return inMemory.value;
    }
    if (inMemory?.promise) {
        return inMemory.promise;
    }
    const loadPromise = (async () => {
        const cacheKey = (0, exports.getBillingCacheKey)(businessId);
        const cached = await safeRedisGet(cacheKey).catch(() => null);
        if (cached) {
            (0, performanceMetrics_1.emitPerformanceMetric)({
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
            }
            catch {
                await safeRedisDel(cacheKey).catch(() => undefined);
            }
        }
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "CACHE_MISS",
            businessId,
            route: "subscription_context",
            metadata: {
                cache: "redis_subscription",
            },
        });
        const dbStart = Date.now();
        const canonical = await prisma_1.default.subscriptionLedger
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
            await redis_1.default
                .set(cacheKey, JSON.stringify(subscription), "EX", CACHE_TTL)
                .catch(() => undefined);
            subscriptionMemoryCache.set(businessId, {
                value: subscription,
                expiresAt: Date.now() + SUBSCRIPTION_MEMORY_CACHE_TTL_MS,
            });
        }
        else {
            await redis_1.default
                .set(cacheKey, "null", "EX", CACHE_TTL)
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
const getEarlyAccessSnapshot = async (subscription) => {
    const cacheKey = EARLY_ACCESS_CACHE_KEY;
    const cached = earlyAccessCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "CACHE_HIT",
            businessId: subscription?.businessId || null,
            route: "early_access_projection",
            metadata: {
                cache: "memory_early_access",
            },
        });
        return cached.value;
    }
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "CACHE_MISS",
        businessId: subscription?.businessId || null,
        route: "early_access_projection",
        metadata: {
            cache: "memory_early_access",
        },
    });
    try {
        const dbStart = Date.now();
        const dbPromise = prisma_1.default.plan.findMany({
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
            new Promise((resolve) => setTimeout(() => resolve([]), 200)),
        ]).catch(() => []));
        console.info("BILLING_STAGE_TIME", {
            stage: "getEarlyAccessSnapshot.db",
            durationMs: Date.now() - dbStart,
            businessId: subscription?.businessId || null,
        });
        const totalEarlyUsed = plans.reduce((acc, plan) => acc + (plan.earlyUsed || 0), 0);
        const value = {
            allowEarly: totalEarlyUsed < EARLY_ACCESS_LIMIT &&
                !subscription?.stripeSubscriptionId,
            remainingEarly: Math.max(EARLY_ACCESS_LIMIT - totalEarlyUsed, 0),
        };
        earlyAccessCache.set(cacheKey, {
            value,
            expiresAt: Date.now() + EARLY_ACCESS_CACHE_TTL_MS,
        });
        return value;
    }
    catch {
        return {
            allowEarly: false,
            remainingEarly: 0,
        };
    }
};
const loadBillingContext = async (businessId) => {
    const startedAt = Date.now();
    const now = new Date();
    let context = getBaseContext();
    const evaluateContext = (sub) => {
        let ctx = {
            subscription: sub,
            plan: sub.plan,
            planKey: (0, plan_config_1.getPlanKey)(sub.plan),
            status: "ACTIVE",
            isLimited: false,
            upgradeRequired: false,
            allowEarly: false,
            remainingEarly: 0,
        };
        if (sub.status === "INACTIVE") {
            ctx = lockContext(ctx);
        }
        if (sub.status === "CANCELLED") {
            ctx = lockContext(ctx);
        }
        if (sub.status === "PAST_DUE") {
            ctx =
                sub.graceUntil &&
                    now <= new Date(sub.graceUntil)
                    ? {
                        ...ctx,
                        status: "ACTIVE",
                    }
                    : lockContext(ctx);
        }
        if (sub.isTrial) {
            ctx =
                sub.currentPeriodEnd &&
                    now <= new Date(sub.currentPeriodEnd)
                    ? {
                        ...ctx,
                        status: "TRIAL",
                    }
                    : lockContext(ctx);
        }
        return ctx;
    };
    // If recovering/cold, serve stale-valid immediately
    const recovering = prewarmState_1.prewarmState.isCold;
    if (recovering) {
        const lkvSub = prewarmState_1.prewarmState.lastKnownValidSubscription.get(businessId);
        const lkvBill = prewarmState_1.prewarmState.lastKnownValidBilling.get(businessId);
        if (lkvSub && lkvBill) {
            // Trigger background reload
            getCachedSubscription(businessId).catch(() => null);
            return {
                subscription: lkvSub,
                context: lkvBill,
            };
        }
    }
    const hasFallback = prewarmState_1.prewarmState.lastKnownValidSubscription.has(businessId) ||
        subscriptionMemoryCache.get(businessId)?.value;
    let timeoutLimit = hasFallback ? 300 : (prewarmState_1.prewarmState.isCold ? 5500 : 1500);
    const store = requestLifecycle_1.requestStorage.getStore();
    const isRequestPath = Boolean(store);
    if (isRequestPath) {
        const remainingMs = (0, requestLifecycle_1.getRequestRemainingMs)(null, timeoutLimit);
        timeoutLimit = Math.max(100, Math.min(timeoutLimit, remainingMs - 150));
    }
    const cachedSubscription = await Promise.race([
        getCachedSubscription(businessId),
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutLimit)),
    ]).catch(() => null);
    let subscription = cachedSubscription;
    if (subscription?.plan) {
        context = evaluateContext(subscription);
    }
    else {
        // Attempt fallback to stale/last-known-valid
        const lkvSub = prewarmState_1.prewarmState.lastKnownValidSubscription.get(businessId);
        const lkvBill = prewarmState_1.prewarmState.lastKnownValidBilling.get(businessId);
        if (lkvSub && lkvBill) {
            subscription = lkvSub;
            context = lkvBill;
        }
        else {
            const memoryEntry = subscriptionMemoryCache.get(businessId);
            if (memoryEntry?.value) {
                subscription = memoryEntry.value;
                context = evaluateContext(memoryEntry.value);
            }
        }
    }
    let stripeCheckTriggeredSync = false;
    const isFreeLockedOrMissing = !subscription || context.planKey === "FREE_LOCKED";
    const lkvSub = prewarmState_1.prewarmState.lastKnownValidSubscription.get(businessId);
    const hasValidLkv = lkvSub && lkvSub.plan?.name !== "FREE_LOCKED";
    if (isFreeLockedOrMissing && isRequestPath && !hasValidLkv) {
        const remainingMs = (0, requestLifecycle_1.getRequestRemainingMs)(null, 0);
        if (remainingMs >= 1500) {
            const requestSignal = (0, requestLifecycle_1.getRequestAbortSignal)({ req: store.req, res: store.res });
            try {
                stripeCheckTriggeredSync = true;
                const resolvedSub = await (0, exports.verifyStripeSubscriptionFallback)(businessId, requestSignal);
                if (resolvedSub && resolvedSub.plan?.name !== "FREE_LOCKED") {
                    subscription = resolvedSub;
                    context = evaluateContext(subscription);
                }
            }
            catch (err) {
                console.warn("Synchronous verifyStripeSubscriptionFallback failed:", err);
            }
        }
    }
    // Save successful load as last-known-valid
    if (subscription) {
        prewarmState_1.prewarmState.lastKnownValidSubscription.set(businessId, subscription);
        prewarmState_1.prewarmState.lastKnownValidBilling.set(businessId, context);
    }
    if (context.planKey === "FREE_LOCKED" && !stripeCheckTriggeredSync) {
        // Run direct Stripe fallback verification asynchronously to keep hot path latency low
        (0, exports.verifyStripeSubscriptionFallback)(businessId).catch((err) => {
            console.warn("Async verifyStripeSubscriptionFallback error:", err);
        });
    }
    const earlyAccess = await getEarlyAccessSnapshot(subscription).catch(() => ({
        allowEarly: false,
        remainingEarly: 0,
    }));
    context.allowEarly = earlyAccess.allowEarly;
    context.remainingEarly = earlyAccess.remainingEarly;
    (0, performanceMetrics_1.emitPerformanceMetric)({
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
exports.loadBillingContext = loadBillingContext;
const attachBillingContext = async (req, res, next) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({
                code: "UNAUTHORIZED",
                message: "Unauthorized",
            });
        }
        const { subscription, context } = await (0, exports.loadBillingContext)(businessId);
        req.subscription = subscription;
        req.billing = context;
        next();
    }
    catch (error) {
        console.error("Subscription middleware error:", error);
        return res.status(500).json({
            message: "Server error",
        });
    }
};
exports.attachBillingContext = attachBillingContext;
