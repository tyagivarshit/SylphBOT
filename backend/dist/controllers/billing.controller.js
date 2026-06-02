"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingController = void 0;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = __importDefault(require("../config/redis"));
const env_1 = require("../config/env");
const billingGeo_service_1 = require("../services/billingGeo.service");
const prewarmState_1 = require("../services/prewarmState");
const subscription_middleware_1 = require("../middleware/subscription.middleware");
const commerceProjection_service_1 = require("../services/commerceProjection.service");
const paymentIntent_service_1 = require("../services/paymentIntent.service");
const proposalEngine_service_1 = require("../services/proposalEngine.service");
const subscriptionEngine_service_1 = require("../services/subscriptionEngine.service");
const pricing_config_1 = require("../config/pricing.config");
const stripe_price_map_1 = require("../config/stripe.price.map");
const usage_service_1 = require("../services/usage.service");
const tenant_service_1 = require("../services/tenant.service");
const stripe_service_1 = require("../services/stripe.service");
const stripeConfig_service_1 = require("../services/commerce/providers/stripeConfig.service");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const projectionCoordinator_service_1 = require("../services/projectionCoordinator.service");
const requestLifecycle_1 = require("../utils/requestLifecycle");
const plan_config_1 = require("../config/plan.config");
const shared_1 = require("../services/commerce/shared");
const EMPTY_USAGE_SUMMARY = {
    aiCallsUsed: 0,
    messagesUsed: 0,
    followupsUsed: 0,
    summary: {
        plan: "LOCKED",
        planLabel: "Locked",
        trialActive: false,
        daysLeft: 0,
        warning: false,
        warningMessage: null,
        addonCredits: 0,
        ai: {
            usedToday: 0,
            limit: 0,
            remaining: 0,
        },
        usage: {
            ai: {
                used: 0,
                dailyLimit: 0,
                monthlyUsed: 0,
                monthlyLimit: 0,
                dailyRemaining: 0,
                monthlyRemaining: 0,
                warning: false,
            },
            contacts: {
                used: 0,
                limit: 0,
                remaining: 0,
            },
            messages: {
                used: 0,
                limit: 0,
                remaining: 0,
            },
            automation: {
                used: 0,
                limit: 0,
                remaining: 0,
            },
        },
        addons: {
            aiCredits: 0,
            contacts: 0,
        },
    },
};
const EMPTY_BILLING_CONTEXT = {
    subscription: null,
    plan: null,
    planKey: "FREE_LOCKED",
    status: "INACTIVE",
    isLimited: true,
    upgradeRequired: true,
    allowEarly: false,
    remainingEarly: 0,
};
const BILLING_CONFIRM_DUPLICATE_WINDOW_MS = 60000;
const BILLING_PROJECTION_CACHE_TTL_MS = 12000;
const BILLING_PROJECTION_MAX_WAIT_MS = 2200;
const BILLING_PROJECTION_TIMEOUT_BUFFER_MS = 350;
const BILLING_PROJECTION_REDIS_CACHE_PREFIX = "billing:projection:v2:";
const BILLING_PROJECTION_REDIS_CACHE_TTL_SECONDS = 45;
const BILLING_PROJECTION_STALE_MAX_AGE_MS = 90000;
const BILLING_PROJECTION_COMPUTE_BUDGET_MS = 6500;
const RESPONSE_FINAL_WRITE_LOCAL_KEY = "__runtimeFinalWriteInvoked";
const CHECKOUT_IN_FLIGHT_WINDOW_MS = 20000;
const CHECKOUT_CONFIRM_IN_FLIGHT_WINDOW_MS = 30000;
const INSTANT_CHECKOUT_IN_FLIGHT_WINDOW_MS = 10000;
const INSTANT_CHECKOUT_ENTITLEMENT_DB_BUDGET_MS = 120;
const INSTANT_CHECKOUT_ENTITLEMENT_ACTIVE_TTL_MS = 15000;
const INSTANT_CHECKOUT_ENTITLEMENT_EMPTY_TTL_MS = 3000;
const BILLING_CHECKOUT_WARMUP_TTL_MS = 30000;
const BILLING_CHECKOUT_WARMUP_JOIN_BUDGET_MS = 350;
const billingProjectionCache = new Map();
const checkoutInFlight = new Map();
const checkoutConfirmInFlight = new Map();
const instantCheckoutInFlight = new Map();
const instantCheckoutEntitlementCache = new Map();
const billingCheckoutWarmupCache = new Map();
const billingCheckoutWarmupInFlight = new Map();
const getBillingCheckoutWarmupKey = (businessId, userId) => `${String(businessId || "").trim()}:${String(userId || "").trim()}`;
const readBillingCheckoutWarmup = (businessId, userId) => {
    const key = getBillingCheckoutWarmupKey(businessId, userId);
    const snapshot = billingCheckoutWarmupCache.get(key);
    if (!snapshot) {
        return null;
    }
    if (snapshot.expiresAt <= Date.now()) {
        billingCheckoutWarmupCache.delete(key);
        return null;
    }
    return snapshot;
};
const buildStandardCheckoutPriceIds = (currency) => {
    const allowedPlans = ["BASIC", "PRO", "ELITE"];
    const allowedBilling = ["monthly", "yearly"];
    const priceIds = {};
    for (const plan of allowedPlans) {
        priceIds[plan] = {};
        for (const billing of allowedBilling) {
            const priceId = (0, stripe_price_map_1.getStripePriceId)({
                plan,
                currency,
                billing,
                early: false,
            });
            if (priceId) {
                priceIds[plan][billing] = priceId;
            }
        }
    }
    return {
        allowedPlans,
        allowedBilling,
        priceIds,
    };
};
const readStripeCustomerIdFromWarmupSources = (businessId, entitlementStripeCustomerId) => {
    const normalizedBusinessId = String(businessId || "").trim();
    const fromEntitlement = String(entitlementStripeCustomerId || "").trim();
    if (fromEntitlement) {
        return fromEntitlement;
    }
    const lkvSubscription = prewarmState_1.prewarmState.lastKnownValidSubscription.get(normalizedBusinessId);
    const metadata = toRecord(lkvSubscription?.metadata);
    return (String(metadata.stripeCustomerId || metadata.customerId || "").trim() ||
        String(lkvSubscription?.stripeCustomerId || "").trim() ||
        null);
};
const runBillingCheckoutWarmup = async (input) => {
    const startedAt = Date.now();
    const warmupKey = getBillingCheckoutWarmupKey(input.businessId, input.userId);
    if (!input.businessId || !input.userId) {
        console.info("BILLING_CHECKOUT_WARMUP_SKIPPED", {
            requestId: input.requestId,
            reason: "missing_context",
            businessId: input.businessId || null,
            userId: input.userId || null,
        });
        return null;
    }
    const existing = readBillingCheckoutWarmup(input.businessId, input.userId);
    if (existing) {
        console.info("BILLING_CHECKOUT_WARMUP_SKIPPED", {
            requestId: input.requestId,
            reason: "cache_ready",
            businessId: input.businessId,
            userId: input.userId,
            ageMs: Date.now() - existing.createdAt,
        });
        return existing;
    }
    const inFlight = billingCheckoutWarmupInFlight.get(warmupKey);
    if (inFlight) {
        console.info("BILLING_CHECKOUT_WARMUP_SKIPPED", {
            requestId: input.requestId,
            reason: "in_flight",
            businessId: input.businessId,
            userId: input.userId,
        });
        return inFlight;
    }
    const promise = (async () => {
        console.info("BILLING_CHECKOUT_WARMUP_STARTED", {
            requestId: input.requestId,
            businessId: input.businessId,
            userId: input.userId,
        });
        try {
            const currency = (0, billingGeo_service_1.resolveBillingCurrency)(input.req);
            const pricing = buildStandardCheckoutPriceIds(currency);
            const entitlement = await readInstantCheckoutEntitlementSnapshot(input.businessId);
            let checkoutReady = true;
            let checkoutReadyReason = null;
            try {
                (0, stripeConfig_service_1.assertStripeConfigReady)({
                    requireWebhookSecret: true,
                });
            }
            catch (error) {
                checkoutReady = false;
                checkoutReadyReason = String(error?.message || "stripe_config_invalid");
            }
            const createdAt = Date.now();
            const snapshot = {
                businessId: input.businessId,
                userId: input.userId,
                email: input.email,
                currency,
                allowedPlans: pricing.allowedPlans,
                allowedBilling: pricing.allowedBilling,
                priceIds: pricing.priceIds,
                entitlement: {
                    activePlanCode: entitlement.activePlanCode,
                    status: entitlement.status,
                    source: entitlement.source,
                    stale: entitlement.stale,
                    timedOut: entitlement.timedOut,
                },
                stripeCustomerId: readStripeCustomerIdFromWarmupSources(input.businessId, entitlement.stripeCustomerId || null),
                checkoutReady,
                checkoutReadyReason,
                createdAt,
                expiresAt: createdAt + BILLING_CHECKOUT_WARMUP_TTL_MS,
            };
            billingCheckoutWarmupCache.set(warmupKey, snapshot);
            console.info("BILLING_CHECKOUT_WARMUP_READY", {
                requestId: input.requestId,
                businessId: input.businessId,
                userId: input.userId,
                currency,
                checkoutReady,
                checkoutReadyReason,
                entitlementSource: entitlement.source,
                entitlementStale: entitlement.stale,
                entitlementTimedOut: entitlement.timedOut,
                hasStripeCustomerId: Boolean(snapshot.stripeCustomerId),
                durationMs: Date.now() - startedAt,
            });
            return snapshot;
        }
        catch (error) {
            console.info("BILLING_CHECKOUT_WARMUP_SKIPPED", {
                requestId: input.requestId,
                reason: String(error?.message || "warmup_failed"),
                businessId: input.businessId,
                userId: input.userId,
                durationMs: Date.now() - startedAt,
            });
            return null;
        }
        finally {
            billingCheckoutWarmupInFlight.delete(warmupKey);
        }
    })();
    billingCheckoutWarmupInFlight.set(warmupKey, promise);
    return promise;
};
const resolveBillingCheckoutWarmupForCheckout = async (input) => {
    const existing = readBillingCheckoutWarmup(input.businessId, input.userId);
    if (existing) {
        return {
            snapshot: existing,
            source: "cache",
            waitedMs: 0,
        };
    }
    const startedAt = Date.now();
    const warmupKey = getBillingCheckoutWarmupKey(input.businessId, input.userId);
    const inFlight = billingCheckoutWarmupInFlight.get(warmupKey) ||
        runBillingCheckoutWarmup({
            req: input.req,
            businessId: input.businessId,
            userId: input.userId,
            email: input.email,
            requestId: input.requestId,
        });
    const joined = await withInstantCheckoutBudget(inFlight, BILLING_CHECKOUT_WARMUP_JOIN_BUDGET_MS).catch(() => null);
    if (joined && !joined.timedOut && joined.value) {
        return {
            snapshot: joined.value,
            source: "joined",
            waitedMs: Date.now() - startedAt,
        };
    }
    return {
        snapshot: readBillingCheckoutWarmup(input.businessId, input.userId),
        source: "miss",
        waitedMs: Date.now() - startedAt,
    };
};
const triggerBillingCheckoutWarmupAfterResponse = (input) => {
    const businessId = String(input.businessId || "").trim();
    const userId = String(input.userId || "").trim();
    if (!businessId || !userId) {
        console.info("BILLING_CHECKOUT_WARMUP_SKIPPED", {
            requestId: input.requestId,
            reason: "missing_context",
            businessId: businessId || null,
            userId: userId || null,
        });
        return;
    }
    const start = () => {
        void runBillingCheckoutWarmup({
            req: input.req,
            businessId,
            userId,
            email: input.email,
            requestId: input.requestId,
        });
    };
    if (input.res.writableEnded || input.res.headersSent) {
        setImmediate(start);
        return;
    }
    input.res.once("finish", () => {
        setImmediate(start);
    });
};
const withInstantCheckoutBudget = async (promise, timeoutMs) => Promise.race([
    promise.then((value) => ({
        timedOut: false,
        value,
    })),
    new Promise((resolve) => setTimeout(() => resolve({
        timedOut: true,
        value: null,
    }), Math.max(1, Math.floor(timeoutMs)))),
]);
const readInstantCheckoutEntitlementSnapshot = async (businessId) => {
    const normalizedBusinessId = String(businessId || "").trim();
    const cached = instantCheckoutEntitlementCache.get(normalizedBusinessId);
    if (cached && cached.expiresAt > Date.now()) {
        return {
            activePlanCode: cached.activePlanCode,
            status: cached.status,
            stripeCustomerId: cached.stripeCustomerId,
            source: "memory",
            stale: false,
            timedOut: false,
            ageMs: Date.now() - cached.updatedAt,
        };
    }
    const lkvSubscription = prewarmState_1.prewarmState.lastKnownValidSubscription.get(normalizedBusinessId);
    const lkvStatus = String(lkvSubscription?.status || "").trim().toUpperCase();
    if (lkvSubscription && ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"].includes(lkvStatus)) {
        const activePlanCode = String(lkvSubscription.planCode || lkvSubscription.plan?.name || lkvSubscription.plan?.type || "")
            .trim()
            .toUpperCase() || null;
        const stripeCustomerId = readStripeCustomerIdFromWarmupSources(normalizedBusinessId);
        instantCheckoutEntitlementCache.set(normalizedBusinessId, {
            activePlanCode,
            status: lkvStatus,
            stripeCustomerId,
            expiresAt: Date.now() + INSTANT_CHECKOUT_ENTITLEMENT_ACTIVE_TTL_MS,
            updatedAt: Date.now(),
        });
        return {
            activePlanCode,
            status: lkvStatus,
            stripeCustomerId,
            source: "last_known_valid",
            stale: false,
            timedOut: false,
            ageMs: 0,
        };
    }
    const dbResult = await withInstantCheckoutBudget(prisma_1.default.subscriptionLedger.findFirst({
        where: {
            businessId: normalizedBusinessId,
            status: {
                in: ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"],
            },
        },
        select: {
            planCode: true,
            status: true,
            metadata: true,
        },
        orderBy: {
            updatedAt: "desc",
        },
    }), INSTANT_CHECKOUT_ENTITLEMENT_DB_BUDGET_MS).catch(() => null);
    if (!dbResult || dbResult.timedOut) {
        const fallback = cached || null;
        if (fallback) {
            return {
                activePlanCode: fallback.activePlanCode,
                status: fallback.status,
                stripeCustomerId: fallback.stripeCustomerId,
                source: "memory_stale",
                stale: true,
                timedOut: true,
                ageMs: Date.now() - fallback.updatedAt,
            };
        }
        return {
            activePlanCode: null,
            status: null,
            stripeCustomerId: null,
            source: "fail_open",
            stale: true,
            timedOut: true,
            ageMs: null,
        };
    }
    const row = dbResult.value;
    if (!row) {
        instantCheckoutEntitlementCache.set(normalizedBusinessId, {
            activePlanCode: null,
            status: null,
            stripeCustomerId: null,
            expiresAt: Date.now() + INSTANT_CHECKOUT_ENTITLEMENT_EMPTY_TTL_MS,
            updatedAt: Date.now(),
        });
        return {
            activePlanCode: null,
            status: null,
            stripeCustomerId: null,
            source: "db_budgeted",
            stale: false,
            timedOut: false,
            ageMs: 0,
        };
    }
    const activePlanCode = String(row.planCode || "").trim().toUpperCase() || null;
    const rowMetadata = toRecord(row.metadata);
    const stripeCustomerId = String(rowMetadata.stripeCustomerId || rowMetadata.customerId || "").trim() || null;
    instantCheckoutEntitlementCache.set(normalizedBusinessId, {
        activePlanCode,
        status: String(row.status || "").trim().toUpperCase() || null,
        stripeCustomerId,
        expiresAt: Date.now() +
            (activePlanCode
                ? INSTANT_CHECKOUT_ENTITLEMENT_ACTIVE_TTL_MS
                : INSTANT_CHECKOUT_ENTITLEMENT_EMPTY_TTL_MS),
        updatedAt: Date.now(),
    });
    return {
        activePlanCode,
        status: String(row.status || "").trim().toUpperCase() || null,
        stripeCustomerId,
        source: "db_budgeted",
        stale: false,
        timedOut: false,
        ageMs: 0,
    };
};
const getBillingProjectionCacheKey = (businessId, currencyHint) => `${businessId}:${currencyHint}`;
const getBillingProjectionRedisKey = (cacheKey) => `${BILLING_PROJECTION_REDIS_CACHE_PREFIX}${cacheKey}`;
const emitProjectionTelemetry = (input) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: input.name,
        value: input.value,
        businessId: input.businessId || null,
        route: "billing_projection",
        metadata: input.metadata || null,
    });
};
const readRedisBillingProjectionSnapshot = async (cacheKey) => {
    const raw = await redis_1.default
        .get(getBillingProjectionRedisKey(cacheKey))
        .catch(() => null);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            await redis_1.default
                .del(getBillingProjectionRedisKey(cacheKey))
                .catch(() => undefined);
            return null;
        }
        const payload = parsed;
        const updatedAt = Number(payload.updatedAt || 0);
        const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
            ? payload.data
            : null;
        if (!data || !Number.isFinite(updatedAt) || updatedAt <= 0) {
            await redis_1.default
                .del(getBillingProjectionRedisKey(cacheKey))
                .catch(() => undefined);
            return null;
        }
        return {
            data,
            updatedAt,
        };
    }
    catch {
        await redis_1.default.del(getBillingProjectionRedisKey(cacheKey)).catch(() => undefined);
        return null;
    }
};
const writeRedisBillingProjectionSnapshot = async (cacheKey, value) => {
    const payload = {
        updatedAt: Date.now(),
        data: value,
    };
    await redis_1.default
        .set(getBillingProjectionRedisKey(cacheKey), JSON.stringify(payload), "EX", BILLING_PROJECTION_REDIS_CACHE_TTL_SECONDS)
        .catch(() => undefined);
};
const markBillingSnapshotAsStale = (value, reason) => {
    const meta = value.meta && typeof value.meta === "object" && !Array.isArray(value.meta)
        ? value.meta
        : {};
    return {
        ...value,
        meta: {
            ...meta,
            degraded: true,
            reason,
        },
    };
};
const hasExplicitFinalResponseWrite = (res) => Boolean(res.locals?.[RESPONSE_FINAL_WRITE_LOCAL_KEY]);
const isResponseCommitted = (res) => res.headersSent || res.writableEnded || hasExplicitFinalResponseWrite(res);
const isRequestLifecycleClosed = (req, res) => Boolean(res.locals?.requestTimedOut) ||
    req.aborted ||
    isResponseCommitted(res);
const resolveBillingProjectionWaitBudgetMs = (res) => {
    const locals = (res.locals || {});
    const deadlineAt = Number(locals.requestDeadlineAt || 0);
    const maxWait = prewarmState_1.prewarmState.isCold ? 5500 : BILLING_PROJECTION_MAX_WAIT_MS;
    if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) {
        return maxWait;
    }
    const remainingBudgetMs = Math.floor(deadlineAt - Date.now() - BILLING_PROJECTION_TIMEOUT_BUFFER_MS);
    return Math.max(1, Math.min(maxWait, remainingBudgetMs));
};
const waitForBillingProjection = async (promise, timeoutMs, requestSignal) => new Promise((resolve, reject) => {
    let settled = false;
    const boundedTimeoutMs = Math.max(1, Math.floor(timeoutMs));
    const signal = requestSignal || null;
    const cleanup = () => {
        if (signal) {
            signal.removeEventListener("abort", onAbort);
        }
        clearTimeout(timeoutHandle);
    };
    const settle = (value) => {
        if (settled) {
            return;
        }
        settled = true;
        cleanup();
        resolve(value);
    };
    const onAbort = () => {
        settle({
            timedOut: false,
            cancelled: true,
        });
    };
    const timeoutHandle = setTimeout(() => {
        settle({
            timedOut: true,
            cancelled: false,
        });
    }, boundedTimeoutMs);
    if (signal?.aborted) {
        settle({
            timedOut: false,
            cancelled: true,
        });
        return;
    }
    if (signal) {
        signal.addEventListener("abort", onAbort, {
            once: true,
        });
    }
    promise
        .then((value) => {
        settle({
            timedOut: false,
            cancelled: false,
            value,
        });
    })
        .catch((error) => {
        if (settled) {
            return;
        }
        settled = true;
        cleanup();
        reject(error);
    });
});
const hasProjectionValue = (result) => !result.timedOut && !result.cancelled;
const mapPublicPlans = (plans = []) => {
    const planMap = new Map(plans.map((plan) => [String(plan.type || plan.name).toUpperCase(), plan]));
    return (0, pricing_config_1.getPublicPricingPlans)().map((plan) => {
        const existing = planMap.get(plan.key) || planMap.get(plan.label.toUpperCase());
        return {
            id: existing?.id || plan.key,
            name: plan.label,
            type: existing?.type || plan.key,
            priceIdINR: existing?.priceIdINR || null,
            priceIdUSD: existing?.priceIdUSD || null,
            description: plan.description,
            popular: Boolean(plan.popular),
            monthlyPrice: plan.monthlyPrice,
            yearlyPrice: plan.yearlyPrice,
            limits: plan.limits,
            features: plan.features,
        };
    });
};
const buildPlansPayload = (input) => ({
    success: true,
    trialDays: pricing_config_1.TRIAL_DAYS,
    addons: (0, pricing_config_1.getAddonCatalog)(),
    plans: mapPublicPlans(input?.plans || []),
    meta: {
        degraded: Boolean(input?.degraded),
        reason: String(input?.reason || "").trim() || null,
    },
});
const toRecord = (value) => value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
const mapInvoiceForClient = (invoice) => ({
    ...(toRecord(invoice.metadata).providerInvoiceId
        ? {
            providerInvoiceId: String(toRecord(invoice.metadata).providerInvoiceId || "")
                .trim()
                .toLowerCase(),
        }
        : {}),
    id: invoice.invoiceKey,
    invoiceKey: invoice.invoiceKey,
    status: String(invoice.status || "").toLowerCase(),
    currency: invoice.currency,
    amount: invoice.totalMinor,
    subtotal: invoice.subtotalMinor,
    taxAmount: invoice.taxMinor,
    paidAmount: invoice.paidMinor,
    created: Math.floor(invoice.createdAt.getTime() / 1000),
    createdAt: invoice.createdAt,
    dueAt: invoice.dueAt,
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
    externalInvoiceId: invoice.externalInvoiceId,
    hosted_invoice_url: String(toRecord(invoice.metadata).hostedInvoiceUrl ||
        toRecord(invoice.metadata).hosted_invoice_url ||
        "").trim() || null,
    invoice_pdf: String(toRecord(invoice.metadata).invoicePdf ||
        toRecord(invoice.metadata).invoice_pdf ||
        "").trim() || null,
});
const TERMINAL_PAYMENT_INTENT_STATUSES = new Set([
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
]);
const getCheckoutConfirmMetadata = (value) => toRecord(toRecord(value).checkoutConfirm);
const getCheckoutConfirmState = (value) => String(getCheckoutConfirmMetadata(value).state || "")
    .trim()
    .toUpperCase();
const isCheckoutConfirmStillProcessing = (value) => {
    const checkoutConfirm = getCheckoutConfirmMetadata(value);
    const state = String(checkoutConfirm.state || "")
        .trim()
        .toUpperCase();
    const startedAt = new Date(String(checkoutConfirm.startedAt || ""));
    const startedAtMs = startedAt.getTime();
    if (state !== "PROCESSING" || Number.isNaN(startedAtMs)) {
        return false;
    }
    return Date.now() - startedAtMs <= BILLING_CONFIRM_DUPLICATE_WINDOW_MS;
};
const userContextCache = new Map();
async function getUserContext(req) {
    const userId = req.user?.id;
    if (!userId) {
        throw new Error("Unauthorized");
    }
    const businessIdFromRequest = String(req?.tenant?.businessId || req.user?.businessId || "").trim() ||
        null;
    const emailFromRequest = String(req.user?.email || "").trim().toLowerCase() || null;
    if (businessIdFromRequest && emailFromRequest) {
        return {
            userId,
            businessId: businessIdFromRequest,
            email: emailFromRequest,
        };
    }
    const cacheKey = `${userId}:${businessIdFromRequest || ""}:${emailFromRequest || ""}`;
    const cached = userContextCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            businessId: true,
        },
    });
    if (!user) {
        throw new Error("Unauthorized");
    }
    const businessIdHint = String(businessIdFromRequest || user.businessId || "").trim() || null;
    const identity = businessIdHint
        ? {
            businessId: businessIdHint,
            workspace: null,
            source: "request",
        }
        : await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
            userId,
            preferredBusinessId: req.user?.businessId || user.businessId || businessIdFromRequest || null,
        });
    const resolvedEmail = emailFromRequest || String(user.email || "").trim().toLowerCase();
    const value = {
        userId,
        businessId: identity.businessId,
        email: resolvedEmail,
    };
    userContextCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + 10000,
    });
    return value;
}
class BillingController {
    static getBusinessIdFromRequest(req) {
        const tenantBusinessId = String(req?.tenant?.businessId || "").trim();
        const userBusinessId = String(req.user?.businessId || "").trim();
        return tenantBusinessId || userBusinessId || null;
    }
    static async findCheckoutIntentForSession(input) {
        const select = {
            id: true,
            businessId: true,
            paymentIntentKey: true,
            providerPaymentIntentId: true,
            status: true,
            metadata: true,
            proposal: {
                select: {
                    proposalKey: true,
                },
            },
        };
        const normalizedSessionId = String(input.sessionId || "").trim();
        if (!normalizedSessionId) {
            return null;
        }
        const byProviderPaymentIntentId = await prisma_1.default.paymentIntentLedger.findFirst({
            where: {
                businessId: input.businessId,
                provider: "STRIPE",
                providerPaymentIntentId: normalizedSessionId,
            },
            select,
        });
        if (byProviderPaymentIntentId) {
            return byProviderPaymentIntentId;
        }
        const byPaymentIntentKey = await prisma_1.default.paymentIntentLedger.findUnique({
            where: {
                paymentIntentKey: normalizedSessionId,
            },
            select,
        });
        if (byPaymentIntentKey && byPaymentIntentKey.businessId === input.businessId) {
            return byPaymentIntentKey;
        }
        const boundedMetadataFallback = await prisma_1.default.paymentIntentLedger.findMany({
            where: {
                businessId: input.businessId,
                provider: "STRIPE",
            },
            orderBy: {
                updatedAt: "desc",
            },
            take: 40,
            select,
        });
        const byMetadataSession = boundedMetadataFallback.find((row) => {
            const metadata = toRecord(row.metadata);
            const providerMetadata = toRecord(metadata.providerMetadata);
            const checkoutConfirmMetadata = getCheckoutConfirmMetadata(metadata);
            const metadataSessionId = String(row.providerPaymentIntentId ||
                metadata.stripeSessionId ||
                providerMetadata.stripeSessionId ||
                checkoutConfirmMetadata.sessionId ||
                "").trim() || null;
            return metadataSessionId === normalizedSessionId;
        });
        if (byMetadataSession) {
            return byMetadataSession;
        }
        return null;
    }
    static async updateCheckoutConfirmMetadata(input) {
        const metadata = toRecord(input.paymentIntent.metadata);
        const previous = getCheckoutConfirmMetadata(metadata);
        const nowIso = new Date().toISOString();
        const nextCheckoutConfirm = {
            ...previous,
            state: input.state,
            sessionId: input.sessionId,
            reason: String(input.reason || "").trim() || null,
            updatedAt: nowIso,
            ...(input.state === "PROCESSING"
                ? {
                    startedAt: nowIso,
                }
                : {}),
            ...(input.state === "SUCCESS" || input.state === "FAILED"
                ? {
                    completedAt: nowIso,
                }
                : {}),
        };
        await prisma_1.default.paymentIntentLedger
            .update({
            where: {
                id: input.paymentIntent.id,
            },
            data: {
                metadata: {
                    ...metadata,
                    checkoutConfirm: nextCheckoutConfirm,
                },
            },
        })
            .catch(() => undefined);
    }
    static async finalizeCheckoutConfirmationAsync(input) {
        const paidLikeStatuses = new Set(["paid", "no_payment_required"]);
        try {
            (0, stripeConfig_service_1.assertStripeConfigReady)();
        }
        catch (error) {
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent: input.paymentIntent,
                sessionId: input.sessionId,
                state: "FAILED",
                reason: "stripe_config_invalid",
            });
            console.error("BILLING_STAGE_FAIL", {
                stage: "checkout_confirm.stripe_config",
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                reason: String(error?.message || "stripe_config_invalid"),
            });
            return;
        }
        let session = null;
        try {
            session = await stripe_service_1.stripe.checkout.sessions.retrieve(input.sessionId);
        }
        catch {
            session = null;
        }
        const paymentStatus = String(session?.payment_status || "")
            .trim()
            .toLowerCase();
        if (!session) {
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent: input.paymentIntent,
                sessionId: input.sessionId,
                state: "PENDING",
                reason: "stripe_session_pending",
            });
            console.info("BILLING_STAGE_OK", {
                stage: "checkout_confirm.pending",
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                reason: "stripe_session_pending",
            });
            return;
        }
        if (!paidLikeStatuses.has(paymentStatus)) {
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent: input.paymentIntent,
                sessionId: input.sessionId,
                state: "PENDING",
                reason: `payment_status_${paymentStatus || "unknown"}`,
            });
            console.info("BILLING_STAGE_OK", {
                stage: "checkout_confirm.pending",
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                reason: `payment_status_${paymentStatus || "unknown"}`,
            });
            return;
        }
        try {
            const reconcileResult = await commerceProjection_service_1.commerceProjectionService.reconcileProviderWebhook({
                provider: "STRIPE",
                headers: {
                    "x-commerce-manual-reconcile": "true",
                },
                strictBusinessId: input.businessId,
                body: {
                    id: `manual_confirm_${input.paymentIntent.providerPaymentIntentId || input.sessionId}`,
                    type: "checkout.session.completed",
                    created: Math.floor(Date.now() / 1000),
                    data: {
                        object: {
                            id: input.paymentIntent.providerPaymentIntentId || input.sessionId,
                            payment_status: session.payment_status || "paid",
                            amount_total: session.amount_total || null,
                            currency: session.currency || null,
                            subscription: typeof session.subscription === "string"
                                ? session.subscription
                                : session.subscription?.id || null,
                            metadata: {
                                businessId: input.businessId,
                                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                                proposalKey: input.paymentIntent.proposal?.proposalKey || null,
                            },
                        },
                    },
                },
            });
            if (reconcileResult?.idempotency === "failed") {
                throw new Error("reconcile_failed");
            }
        }
        catch (error) {
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent: input.paymentIntent,
                sessionId: input.sessionId,
                state: "PENDING",
                reason: "reconcile_retry_required",
            });
            console.info("BILLING_STAGE_OK", {
                stage: "checkout_confirm.pending",
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                reason: "reconcile_retry_required",
            });
            console.error("BILLING_STAGE_FAIL", {
                stage: "checkout_confirm.reconcile",
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                reason: String(error?.message || "reconcile_retry_required"),
            });
            return;
        }
        await BillingController.updateCheckoutConfirmMetadata({
            paymentIntent: input.paymentIntent,
            sessionId: input.sessionId,
            state: "SUCCESS",
            reason: "projection_reconciled",
        });
        console.info("BILLING_STAGE_OK", {
            stage: "checkout_confirm.success",
            businessId: input.businessId,
            sessionId: input.sessionId,
            paymentIntentKey: input.paymentIntent.paymentIntentKey,
        });
        console.info("RECONCILE_OK", {
            businessId: input.businessId,
            sessionId: input.sessionId,
            paymentIntentKey: input.paymentIntent.paymentIntentKey,
        });
    }
    static buildConfirmPayload(input) {
        const normalizedLifecycleState = input.lifecycleState ||
            (input.state === "SUCCESS" || input.state === "ALREADY_PROCESSED"
                ? "CONFIRMED"
                : input.state === "FAILED" && !input.shouldPoll
                    ? "FAILED_TERMINAL"
                    : input.state === "PENDING"
                        ? "PROCESSING"
                        : "PROCESSING");
        const terminal = normalizedLifecycleState === "FAILED_TERMINAL";
        return {
            state: input.state,
            lifecycleState: normalizedLifecycleState,
            terminal,
            sessionId: input.sessionId,
            message: input.message,
            shouldPoll: input.shouldPoll,
            retryAfterMs: input.shouldPoll && Number.isFinite(Number(input.retryAfterMs))
                ? Math.max(500, Math.floor(Number(input.retryAfterMs)))
                : null,
            reason: String(input.reason || "").trim() || null,
            code: String(input.code || "").trim() || null,
        };
    }
    static async reconcileRecentPortalState(businessId) {
        const latestSubscription = await prisma_1.default.subscriptionLedger.findFirst({
            where: {
                businessId,
                provider: "STRIPE",
                providerSubscriptionId: {
                    not: null,
                },
            },
            orderBy: {
                updatedAt: "desc",
            },
            select: {
                id: true,
                providerSubscriptionId: true,
                metadata: true,
            },
        });
        if (!latestSubscription?.providerSubscriptionId) {
            return {
                attempted: false,
                reason: "subscription_missing",
            };
        }
        const metadata = toRecord(latestSubscription.metadata);
        const portalLastOpenedAt = new Date(String(metadata.portalLastOpenedAt || ""));
        const hasRecentPortalActivity = !Number.isNaN(portalLastOpenedAt.getTime()) &&
            Date.now() - portalLastOpenedAt.getTime() <= 2 * 60 * 60 * 1000;
        if (!hasRecentPortalActivity) {
            return {
                attempted: false,
                reason: "portal_inactive",
            };
        }
        (0, stripeConfig_service_1.assertStripeConfigReady)();
        const stripeSubscription = await stripe_service_1.stripe.subscriptions
            .retrieve(latestSubscription.providerSubscriptionId)
            .catch(() => null);
        if (!stripeSubscription) {
            return {
                attempted: true,
                reconciled: false,
                reason: "provider_subscription_unavailable",
            };
        }
        const firstItem = Array.isArray(stripeSubscription.items?.data)
            ? stripeSubscription.items.data[0]
            : null;
        const replayToken = crypto_1.default
            .createHash("sha256")
            .update(JSON.stringify({
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            quantity: firstItem?.quantity || 1,
            current_period_start: stripeSubscription.current_period_start || null,
            current_period_end: stripeSubscription.current_period_end || null,
            cancel_at: stripeSubscription.cancel_at || null,
            cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
            trial_end: stripeSubscription.trial_end || null,
        }))
            .digest("hex")
            .slice(0, 16);
        const created = Math.floor(Date.now() / 1000);
        await commerceProjection_service_1.commerceProjectionService.reconcileProviderWebhook({
            provider: "STRIPE",
            strictBusinessId: businessId,
            body: {
                id: `manual_portal_sync_${stripeSubscription.id}_${replayToken}`,
                type: "customer.subscription.updated",
                created,
                data: {
                    object: {
                        id: stripeSubscription.id,
                        status: stripeSubscription.status,
                        currency: stripeSubscription.currency,
                        metadata: stripeSubscription.metadata || {},
                        quantity: firstItem?.quantity || 1,
                        current_period_start: stripeSubscription.current_period_start || null,
                        current_period_end: stripeSubscription.current_period_end || null,
                        cancel_at: stripeSubscription.cancel_at || null,
                        cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
                        trial_end: stripeSubscription.trial_end || null,
                        items: {
                            data: firstItem
                                ? [
                                    {
                                        id: firstItem.id,
                                        quantity: firstItem.quantity,
                                        price: {
                                            id: typeof firstItem.price === "string"
                                                ? firstItem.price
                                                : firstItem.price?.id || null,
                                        },
                                    },
                                ]
                                : [],
                        },
                    },
                },
            },
        });
        return {
            attempted: true,
            reconciled: true,
            subscriptionId: stripeSubscription.id,
        };
    }
    static async resolveStripeCustomerIdForPortal(input) {
        const normalizedBusinessId = String(input.businessId || "").trim();
        const normalizedEmail = String(input.email || "").trim().toLowerCase();
        if (!normalizedBusinessId || !normalizedEmail) {
            return null;
        }
        const customers = await stripe_service_1.stripe.customers
            .list({
            email: normalizedEmail,
            limit: 10,
        })
            .then((response) => (Array.isArray(response.data) ? response.data : []))
            .catch(() => []);
        if (!customers.length) {
            return null;
        }
        const customerWithBusinessId = customers.find((customer) => {
            const metadata = toRecord(customer.metadata);
            const customerBusinessId = String(metadata.businessId || "").trim();
            return customerBusinessId && customerBusinessId === normalizedBusinessId;
        }) || null;
        if (customerWithBusinessId?.id) {
            return customerWithBusinessId.id;
        }
        const customerWithSubscription = input.subscriptionProviderId &&
            (await Promise.all(customers.map(async (customer) => {
                if (!customer.id || !input.subscriptionProviderId) {
                    return false;
                }
                const subscriptions = await stripe_service_1.stripe.subscriptions
                    .list({
                    customer: customer.id,
                    status: "all",
                    limit: 10,
                })
                    .catch(() => ({ data: [] }));
                return subscriptions.data.some((subscription) => String(subscription.id || "").trim() === input.subscriptionProviderId);
            })).then((matches) => {
                const index = matches.findIndex(Boolean);
                return index >= 0 ? customers[index] : null;
            }));
        if (customerWithSubscription?.id) {
            return customerWithSubscription.id;
        }
        return customers[0]?.id || null;
    }
    static async buildBillingResponse(businessId, req, options) {
        const startedAt = Date.now();
        const lightweight = Boolean(options?.lightweight);
        const isCheckout = Boolean(options?.isCheckout);
        if (!businessId) {
            return {
                success: true,
                subscription: null,
                billing: EMPTY_BILLING_CONTEXT,
                usage: EMPTY_USAGE_SUMMARY,
                currency: (0, billingGeo_service_1.resolveBillingCurrency)(req),
                invoices: [],
                meta: {
                    degraded: false,
                    reason: null,
                },
            };
        }
        const [billingContext, usage, invoicesRaw] = await Promise.all([
            (0, subscription_middleware_1.loadBillingContext)(businessId, { skipStripeFallback: lightweight || isCheckout, isCheckout }),
            lightweight ? Promise.resolve(null) : (0, usage_service_1.getUsageOverview)(businessId),
            prisma_1.default.invoiceLedger.findMany({
                where: {
                    businessId,
                },
                orderBy: {
                    createdAt: "desc",
                },
                take: lightweight ? 12 : 20,
                select: {
                    invoiceKey: true,
                    status: true,
                    currency: true,
                    subtotalMinor: true,
                    taxMinor: true,
                    totalMinor: true,
                    paidMinor: true,
                    dueAt: true,
                    issuedAt: true,
                    paidAt: true,
                    externalInvoiceId: true,
                    createdAt: true,
                    metadata: true,
                },
            }),
        ]);
        const invoices = invoicesRaw.map(mapInvoiceForClient);
        const effectiveCurrency = billingContext.subscription?.currency || (0, billingGeo_service_1.resolveBillingCurrency)(req);
        const durationMs = Date.now() - startedAt;
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "PROJECTION_MS",
            value: durationMs,
            businessId,
            route: "billing_projection",
            metadata: null,
        });
        emitProjectionTelemetry({
            name: "projection_compute_ms",
            value: durationMs,
            businessId,
            metadata: {
                source: "billing_build_projection",
                lightweight,
            },
        });
        if (durationMs >= 900) {
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "DB_SLOW",
                value: durationMs,
                businessId,
                route: "billing_projection",
            });
        }
        return {
            success: true,
            subscription: billingContext.subscription,
            billing: billingContext.context,
            usage: usage
                ? {
                    aiCallsUsed: usage.usage.ai.monthlyUsed,
                    messagesUsed: usage.usage.messages.used,
                    followupsUsed: usage.usage.automation.used,
                    summary: usage,
                }
                : EMPTY_USAGE_SUMMARY,
            currency: effectiveCurrency,
            invoices,
            meta: {
                degraded: false,
                reason: null,
            },
        };
    }
    static async buildDegradedBillingResponse(input) {
        const normalizedReason = String(input.reason || "").trim() || "projection_timeout";
        const fallbackRecord = input.fallbackValue &&
            typeof input.fallbackValue === "object" &&
            !Array.isArray(input.fallbackValue)
            ? input.fallbackValue
            : null;
        if (fallbackRecord) {
            const fallbackMeta = toRecord(fallbackRecord.meta);
            return {
                ...fallbackRecord,
                success: true,
                meta: {
                    ...fallbackMeta,
                    degraded: true,
                    reason: normalizedReason,
                },
            };
        }
        const businessId = BillingController.getBusinessIdFromRequest(input.req);
        if (businessId) {
            try {
                const ledger = await prisma_1.default.subscriptionLedger.findFirst({
                    where: { businessId },
                    orderBy: { updatedAt: "desc" },
                });
                if (ledger) {
                    const isTrial = ledger.status === "TRIALING" ||
                        (ledger.trialEndsAt && new Date(ledger.trialEndsAt).getTime() > Date.now());
                    const sub = {
                        id: ledger.id,
                        status: ledger.status,
                        plan: ledger.planCode
                            ? {
                                name: ledger.planCode,
                                type: ledger.planCode,
                            }
                            : null,
                        currency: ledger.currency,
                        currentPeriodEnd: ledger.currentPeriodEnd || ledger.renewAt || ledger.trialEndsAt || null,
                        isTrial,
                        provider: ledger.provider,
                        providerSubscriptionId: ledger.providerSubscriptionId || null,
                        billingCycle: ledger.billingCycle,
                    };
                    const planKey = (0, plan_config_1.getPlanKey)(sub.plan);
                    const isActive = ledger.status === "ACTIVE" ||
                        ledger.status === "TRIALING" ||
                        ledger.status === "PAST_DUE";
                    const billingContext = {
                        subscription: sub,
                        plan: sub.plan,
                        planKey,
                        status: (isActive ? (isTrial ? "TRIAL" : "ACTIVE") : "INACTIVE"),
                        isLimited: planKey === "FREE_LOCKED",
                        upgradeRequired: planKey === "FREE_LOCKED",
                        allowEarly: false,
                        remainingEarly: 0,
                    };
                    return {
                        success: true,
                        subscription: sub,
                        billing: billingContext,
                        usage: EMPTY_USAGE_SUMMARY,
                        currency: ledger.currency || (0, billingGeo_service_1.resolveBillingCurrency)(input.req),
                        invoices: [],
                        meta: {
                            degraded: true,
                            reason: `${normalizedReason}_lkv_ledger`,
                        },
                    };
                }
            }
            catch (err) {
                console.error("Failed to query LKV subscription ledger:", err);
            }
        }
        return {
            success: true,
            subscription: null,
            billing: EMPTY_BILLING_CONTEXT,
            usage: EMPTY_USAGE_SUMMARY,
            currency: (0, billingGeo_service_1.resolveBillingCurrency)(input.req),
            invoices: [],
            meta: {
                degraded: true,
                reason: normalizedReason,
            },
        };
    }
    static buildCheckoutFailureRedirect(reason) {
        const normalizedReason = String(reason || "").trim() || "checkout_failed";
        const appBaseUrl = String(env_1.env.FRONTEND_URL || "").replace(/\/$/, "");
        const query = new URLSearchParams({
            checkout: "failed",
            reason: normalizedReason,
        });
        return `${appBaseUrl}/billing?${query.toString()}`;
    }
    static async activateInstantCheckoutSession(input) {
        const metadata = toRecord(input.session.metadata);
        const sessionBusinessId = String(metadata.businessId || "").trim();
        const checkoutMode = String(metadata.checkoutMode || "").trim().toLowerCase();
        if (checkoutMode !== "instant" || sessionBusinessId !== input.businessId) {
            return {
                activated: false,
                terminal: true,
                reason: "instant_session_metadata_mismatch",
            };
        }
        const paymentStatus = String(input.session.payment_status || "")
            .trim()
            .toLowerCase();
        if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
            return {
                activated: false,
                terminal: false,
                reason: `payment_status_${paymentStatus || "unknown"}`,
            };
        }
        const planCode = String(metadata.planCode || "")
            .trim()
            .toUpperCase();
        const billingCycle = String(metadata.billingCycle || "").trim().toLowerCase() === "yearly"
            ? "yearly"
            : "monthly";
        if (!["BASIC", "PRO", "ELITE"].includes(planCode)) {
            return {
                activated: false,
                terminal: true,
                reason: "instant_plan_missing",
            };
        }
        const providerSubscriptionId = typeof input.session.subscription === "string"
            ? input.session.subscription
            : input.session.subscription?.id || null;
        let stripeSubscription = null;
        if (providerSubscriptionId) {
            stripeSubscription = await stripe_service_1.stripe.subscriptions
                .retrieve(providerSubscriptionId)
                .catch(() => null);
        }
        const firstItem = Array.isArray(stripeSubscription?.items?.data)
            ? stripeSubscription.items.data[0]
            : null;
        const quantity = Math.max(1, Math.floor(Number(metadata.quantity || firstItem?.quantity || 1)));
        const amountMinor = Math.max(0, Math.floor(Number(input.session.amount_total || firstItem?.price?.unit_amount || 0)));
        const unitPriceMinor = Math.max(0, Math.floor(Number(firstItem?.price?.unit_amount || Math.floor(amountMinor / quantity) || 0)));
        const currency = String(input.session.currency || stripeSubscription?.currency || metadata.currency || "INR")
            .trim()
            .toUpperCase();
        const status = String(stripeSubscription?.status || "").trim().toLowerCase() === "trialing"
            ? "TRIALING"
            : "ACTIVE";
        const toDate = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed * 1000) : null;
        };
        const currentPeriodStart = toDate(stripeSubscription?.current_period_start);
        const currentPeriodEnd = toDate(stripeSubscription?.current_period_end);
        const trialEndsAt = toDate(stripeSubscription?.trial_end);
        const idempotencyKey = `instant:subscription:${input.session.id}`;
        const existing = (providerSubscriptionId
            ? await prisma_1.default.subscriptionLedger.findFirst({
                where: {
                    businessId: input.businessId,
                    provider: "STRIPE",
                    providerSubscriptionId,
                },
            })
            : null) ||
            (await prisma_1.default.subscriptionLedger.findFirst({
                where: {
                    businessId: input.businessId,
                    idempotencyKey,
                },
            }));
        const subscriptionMetadata = {
            ...(existing ? toRecord(existing.metadata) : {}),
            source: "instant_checkout_confirm",
            stripeSessionId: input.session.id,
            stripeCustomerId: typeof input.session.customer === "string"
                ? input.session.customer
                : input.session.customer?.id || null,
            stripeSubscriptionId: providerSubscriptionId,
            checkoutAttempt: String(metadata.checkoutAttempt || "").trim() || null,
            checkoutStartRequestId: String(metadata.checkoutStartRequestId || "").trim() || null,
            checkoutMode: "instant",
            activatedAt: new Date().toISOString(),
        };
        const data = {
            status: status,
            provider: "STRIPE",
            providerSubscriptionId,
            planCode,
            billingCycle: billingCycle,
            currency: currency,
            quantity,
            unitPriceMinor,
            amountMinor: Math.max(amountMinor, unitPriceMinor * quantity),
            currentPeriodStart,
            currentPeriodEnd,
            renewAt: currentPeriodEnd,
            trialEndsAt,
            metadata: subscriptionMetadata,
            version: existing
                ? {
                    increment: 1,
                }
                : undefined,
        };
        const subscription = existing
            ? await prisma_1.default.subscriptionLedger.update({
                where: {
                    id: existing.id,
                },
                data,
            })
            : await prisma_1.default.subscriptionLedger.create({
                data: {
                    businessId: input.businessId,
                    subscriptionKey: (0, shared_1.buildLedgerKey)("subscription"),
                    idempotencyKey,
                    ...data,
                },
            });
        await (0, subscription_middleware_1.invalidateBillingContextCache)(input.businessId).catch(() => undefined);
        return {
            activated: true,
            terminal: false,
            reason: "instant_checkout_activated",
            subscriptionId: subscription.id,
            planCode: subscription.planCode,
        };
    }
    static async instantCheckout(req, res) {
        const startedAt = Date.now();
        const requestId = String(req.requestId || "").trim() || null;
        const stageTimings = [];
        let lastStageAt = startedAt;
        let inFlightKey = null;
        let checkoutWarmupStatus = "miss";
        let checkoutWarmupAgeMs = null;
        const normalizeStage = (value) => String(value || "stage")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 48) || "stage";
        const markStage = (stage, details) => {
            const now = Date.now();
            const timing = {
                stage,
                stageMs: now - lastStageAt,
                elapsedMs: now - startedAt,
            };
            lastStageAt = now;
            stageTimings.push(timing);
            console.info("INSTANT_CHECKOUT_STAGE_OK", {
                requestId,
                stage,
                stageMs: timing.stageMs,
                elapsedMs: timing.elapsedMs,
                ...(details || {}),
            });
        };
        const setTimingHeaders = (outcome) => {
            if (res.headersSent || res.writableEnded) {
                return;
            }
            const totalMs = Date.now() - startedAt;
            const slowestStage = stageTimings.reduce((slowest, stage) => {
                if (!slowest || stage.stageMs > slowest.stageMs) {
                    return stage;
                }
                return slowest;
            }, null) || null;
            res.setHeader("X-Checkout-Mode", "instant");
            res.setHeader("X-Checkout-Outcome", outcome);
            res.setHeader("X-Checkout-Request-Id", requestId || "");
            res.setHeader("X-Checkout-Total-Ms", String(Math.max(0, Math.floor(totalMs))));
            res.setHeader("X-Checkout-Warmup", checkoutWarmupStatus);
            res.setHeader("X-Checkout-Warmup-Age-Ms", checkoutWarmupAgeMs === null ? "" : String(Math.max(0, Math.floor(checkoutWarmupAgeMs))));
            res.setHeader("X-Checkout-Stage-Timings", stageTimings
                .map((timing) => `${normalizeStage(timing.stage)}=${Math.max(0, Math.floor(timing.stageMs))};e=${Math.max(0, Math.floor(timing.elapsedMs))}`)
                .join(",")
                .slice(0, 3500));
            if (slowestStage) {
                res.setHeader("X-Checkout-Slowest-Stage", `${normalizeStage(slowestStage.stage)}:${Math.max(0, Math.floor(slowestStage.stageMs))}`);
            }
            res.setHeader("Server-Timing", [
                `instant_checkout_total;dur=${Math.max(0, Math.floor(totalMs))}`,
                ...stageTimings.map((timing) => `instant_${normalizeStage(timing.stage)};dur=${Math.max(0, Math.floor(timing.stageMs))}`),
            ]
                .join(", ")
                .slice(0, 3500));
            console.info("CHECKOUT_TOTAL_MS", {
                requestId,
                mode: "instant",
                outcome,
                totalMs,
                warmup: checkoutWarmupStatus,
                warmupAgeMs: checkoutWarmupAgeMs,
            });
        };
        const fail = (status, reason, message) => {
            setTimingHeaders("failed");
            console.error("INSTANT_CHECKOUT_FAIL", {
                requestId,
                status,
                reason,
                elapsedMs: Date.now() - startedAt,
                stages: stageTimings,
            });
            if (String(req.method || "").toUpperCase() === "GET") {
                return res.redirect(303, BillingController.buildCheckoutFailureRedirect(reason));
            }
            return res.status(status).json({
                success: false,
                message,
                reason,
            });
        };
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        const requestBody = req.body && typeof req.body === "object" && !Array.isArray(req.body)
            ? req.body
            : {};
        const requestQuery = req.query && typeof req.query === "object" && !Array.isArray(req.query)
            ? req.query
            : {};
        const readInput = (key) => {
            const bodyValue = requestBody[key];
            if (bodyValue !== undefined && bodyValue !== null && bodyValue !== "") {
                return bodyValue;
            }
            const queryValue = requestQuery[key];
            if (Array.isArray(queryValue)) {
                return queryValue[0];
            }
            return queryValue;
        };
        try {
            const businessId = BillingController.getBusinessIdFromRequest(req);
            const userId = String(req.user?.id || "").trim();
            const email = String(req.user?.email || "").trim().toLowerCase();
            markStage("context.resolved", {
                businessId: businessId || null,
                userId: userId || null,
            });
            if (!businessId || !userId) {
                return fail(403, "business_context_required", "Business context is required");
            }
            const warmupResolution = await resolveBillingCheckoutWarmupForCheckout({
                req,
                businessId,
                userId,
                email,
                requestId,
            });
            const warmupSnapshot = warmupResolution.snapshot;
            checkoutWarmupStatus = warmupSnapshot ? "hit" : "miss";
            checkoutWarmupAgeMs = warmupSnapshot ? Date.now() - warmupSnapshot.createdAt : null;
            if (!res.headersSent && !res.writableEnded) {
                res.setHeader("X-Checkout-Warmup", checkoutWarmupStatus);
                res.setHeader("X-Checkout-Warmup-Age-Ms", checkoutWarmupAgeMs === null
                    ? ""
                    : String(Math.max(0, Math.floor(checkoutWarmupAgeMs))));
            }
            console.info(warmupSnapshot ? "CHECKOUT_WARMUP_HIT" : "CHECKOUT_WARMUP_MISS", {
                requestId,
                businessId,
                userId,
                mode: "instant",
                ageMs: checkoutWarmupAgeMs,
                source: warmupResolution.source,
                waitedMs: warmupResolution.waitedMs,
            });
            console.info("CHECKOUT_AUTH_OK", {
                requestId,
                businessId,
                userId,
                mode: "instant",
                elapsedMs: Date.now() - startedAt,
            });
            const normalizedPlan = String(readInput("plan") || "")
                .trim()
                .toUpperCase();
            const normalizedBilling = String(readInput("billing") || "monthly")
                .trim()
                .toLowerCase();
            const requestedQuantity = Number(readInput("seats") || readInput("quantity") || 1);
            const quantity = Math.max(1, Math.min(500, Math.floor(Number.isFinite(requestedQuantity) ? requestedQuantity : 1)));
            const allowedPlans = new Set(warmupSnapshot?.allowedPlans?.length
                ? warmupSnapshot.allowedPlans
                : ["BASIC", "PRO", "ELITE"]);
            const allowedBilling = new Set(warmupSnapshot?.allowedBilling?.length
                ? warmupSnapshot.allowedBilling
                : ["monthly", "yearly"]);
            if (!allowedPlans.has(normalizedPlan)) {
                return fail(400, "invalid_plan", "Invalid plan selected");
            }
            if (!allowedBilling.has(normalizedBilling)) {
                return fail(400, "invalid_billing", "Invalid billing cycle");
            }
            const currency = (warmupSnapshot?.currency || (0, billingGeo_service_1.resolveBillingCurrency)(req));
            const priceId = warmupSnapshot?.priceIds?.[normalizedPlan]?.[normalizedBilling] ||
                (0, stripe_price_map_1.getStripePriceId)({
                    plan: normalizedPlan,
                    currency,
                    billing: normalizedBilling,
                    early: false,
                });
            markStage("pricing.resolved", {
                businessId,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                currency,
                priceIdConfigured: Boolean(priceId),
                source: warmupSnapshot ? "warmup" : "inline",
            });
            if (!priceId) {
                return fail(503, "stripe_price_mapping_missing", "Stripe price is not configured");
            }
            const entitlementStartedAt = Date.now();
            const entitlementSnapshot = warmupSnapshot
                ? {
                    ...warmupSnapshot.entitlement,
                    source: `warmup:${warmupSnapshot.entitlement.source}`,
                    ageMs: Date.now() - warmupSnapshot.createdAt,
                }
                : await readInstantCheckoutEntitlementSnapshot(businessId);
            const entitlementMs = Date.now() - entitlementStartedAt;
            if (!res.headersSent && !res.writableEnded) {
                res.setHeader("X-Checkout-Entitlement-Ms", String(Math.max(0, Math.floor(entitlementMs))));
            }
            markStage("subscription.checked", {
                businessId,
                activePlanCode: entitlementSnapshot.activePlanCode || null,
                entitlementSource: entitlementSnapshot.source,
                entitlementStale: entitlementSnapshot.stale,
                entitlementTimedOut: entitlementSnapshot.timedOut,
            });
            console.info(entitlementSnapshot.source === "memory" ||
                entitlementSnapshot.source === "last_known_valid" ||
                String(entitlementSnapshot.source || "").startsWith("warmup:")
                ? "CHECKOUT_ENTITLEMENT_SNAPSHOT_HIT"
                : "CHECKOUT_ENTITLEMENT_SNAPSHOT_FALLBACK", {
                requestId,
                businessId,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                activePlanCode: entitlementSnapshot.activePlanCode || null,
                source: entitlementSnapshot.source,
                stale: entitlementSnapshot.stale,
                timedOut: entitlementSnapshot.timedOut,
                ageMs: entitlementSnapshot.ageMs,
                entitlementMs,
                mode: "instant",
            });
            if (entitlementSnapshot.activePlanCode &&
                String(entitlementSnapshot.activePlanCode || "").trim().toUpperCase() === normalizedPlan) {
                return fail(409, "already_subscribed", "You are already subscribed to this plan");
            }
            console.info("CHECKOUT_ENTITLEMENT_OK", {
                requestId,
                businessId,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                activePlanCode: entitlementSnapshot.activePlanCode || null,
                entitlementSource: entitlementSnapshot.source,
                mode: "instant",
                elapsedMs: Date.now() - startedAt,
            });
            if (warmupSnapshot) {
                if (!warmupSnapshot.checkoutReady) {
                    return fail(503, "provider_unavailable", "Billing provider is temporarily unavailable. Please retry shortly.");
                }
            }
            else {
                (0, stripeConfig_service_1.assertStripeConfigReady)({
                    requireWebhookSecret: true,
                });
            }
            markStage("stripe.config_ready", {
                businessId,
                source: warmupSnapshot ? "warmup" : "inline",
            });
            const checkoutAttemptRaw = String(readInput("attempt") || readInput("checkoutAttempt") || "").trim();
            const checkoutAttempt = checkoutAttemptRaw
                .replace(/[^a-zA-Z0-9._-]/g, "")
                .slice(0, 80) || crypto_1.default.randomUUID().replace(/-/g, "");
            inFlightKey = `${businessId}:${normalizedPlan}:${normalizedBilling}:instant`;
            const currentInFlight = instantCheckoutInFlight.get(inFlightKey);
            if (currentInFlight &&
                Date.now() - currentInFlight.startedAt <= INSTANT_CHECKOUT_IN_FLIGHT_WINDOW_MS) {
                return fail(409, "checkout_in_progress", "Another checkout is already in progress");
            }
            instantCheckoutInFlight.set(inFlightKey, {
                startedAt: Date.now(),
                requestId,
            });
            const successUrl = `${env_1.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}` +
                `&plan=${encodeURIComponent(normalizedPlan)}` +
                `&billing=${encodeURIComponent(normalizedBilling)}` +
                `&mode=instant&attempt=${encodeURIComponent(checkoutAttempt)}`;
            const cancelUrl = `${env_1.env.FRONTEND_URL}/billing/cancel?plan=${encodeURIComponent(normalizedPlan)}` +
                `&billing=${encodeURIComponent(normalizedBilling)}&mode=instant`;
            const metadata = {
                businessId,
                userId,
                checkoutMode: "instant",
                checkoutAttempt,
                checkoutStartRequestId: requestId || "",
                planCode: normalizedPlan,
                billingCycle: normalizedBilling,
                quantity: String(quantity),
                currency,
            };
            const stripeStartedAt = Date.now();
            const session = await stripe_service_1.stripe.checkout.sessions.create({
                mode: "subscription",
                client_reference_id: checkoutAttempt,
                ...(warmupSnapshot?.stripeCustomerId
                    ? { customer: warmupSnapshot.stripeCustomerId }
                    : { customer_email: email || warmupSnapshot?.email || undefined }),
                allow_promotion_codes: true,
                metadata,
                subscription_data: {
                    metadata,
                },
                line_items: [
                    {
                        price: priceId,
                        quantity,
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                after_expiration: {
                    recovery: {
                        enabled: true,
                        allow_promotion_codes: true,
                    },
                },
                expires_at: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
            }, {
                idempotencyKey: `instant_checkout:${businessId}:${normalizedPlan}:${normalizedBilling}:${checkoutAttempt}`,
            });
            markStage("stripe.session_created", {
                businessId,
                sessionId: session.id,
                stripeMs: Date.now() - stripeStartedAt,
            });
            if (!res.headersSent && !res.writableEnded) {
                res.setHeader("X-Checkout-Stripe-Ms", String(Math.max(0, Math.floor(Date.now() - stripeStartedAt))));
            }
            console.info("CHECKOUT_STRIPE_SESSION_CREATED", {
                requestId,
                businessId,
                sessionId: session.id,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                stripeMs: Date.now() - stripeStartedAt,
                mode: "instant",
                elapsedMs: Date.now() - startedAt,
            });
            const checkoutUrl = String(session.url || "").trim();
            if (!checkoutUrl) {
                return fail(503, "checkout_url_missing", "Stripe checkout link is temporarily unavailable");
            }
            setTimingHeaders("success");
            console.info("INSTANT_CHECKOUT_SUCCESS", {
                requestId,
                businessId,
                sessionId: session.id,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                elapsedMs: Date.now() - startedAt,
                stages: stageTimings,
            });
            const redirectStartedAt = Date.now();
            if (!res.headersSent && !res.writableEnded) {
                res.setHeader("X-Checkout-Redirect-Ms", "0");
                res.setHeader("X-Checkout-Total-Ms", String(Math.max(0, Math.floor(Date.now() - startedAt))));
            }
            console.info("CHECKOUT_REDIRECT_SENT", {
                requestId,
                businessId,
                sessionId: session.id,
                status: 303,
                mode: "instant",
                redirectMs: Date.now() - redirectStartedAt,
                elapsedMs: Date.now() - startedAt,
            });
            return res.redirect(303, checkoutUrl);
        }
        catch (error) {
            const reason = String(error?.message || "instant_checkout_failed");
            return fail(reason.includes("stripe_config_invalid") ? 503 : 500, reason.includes("stripe_config_invalid") ? "provider_unavailable" : "instant_checkout_failed", reason.includes("stripe_config_invalid")
                ? "Billing provider is temporarily unavailable. Please retry shortly."
                : "Instant checkout failed");
        }
        finally {
            if (inFlightKey) {
                instantCheckoutInFlight.delete(inFlightKey);
            }
        }
    }
    static async handleCheckout(req, res, options) {
        const redirectOnSuccess = Boolean(options?.redirectOnSuccess);
        const checkoutStartedAt = Date.now();
        let checkoutLastStageAt = checkoutStartedAt;
        const checkoutStageTimings = [];
        let checkoutTimingReported = false;
        const checkoutRequestId = String(req?.requestId || "").trim() || null;
        const emitCheckoutMetric = (name, value, metadata) => {
            setImmediate(() => {
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name,
                    value,
                    businessId: BillingController.getBusinessIdFromRequest(req),
                    route: "billing_checkout",
                    metadata: {
                        requestId: checkoutRequestId,
                        redirectOnSuccess,
                        ...(metadata || {}),
                    },
                });
            });
        };
        const hasExplicitFinalResponseWrite = () => Boolean(res.locals?.[RESPONSE_FINAL_WRITE_LOCAL_KEY]);
        const isResponseCommitted = () => res.headersSent || res.writableEnded || hasExplicitFinalResponseWrite();
        const pushCheckoutStageTiming = (stage) => {
            const now = Date.now();
            const timing = {
                stage,
                stageMs: now - checkoutLastStageAt,
                elapsedMs: now - checkoutStartedAt,
            };
            checkoutLastStageAt = now;
            checkoutStageTimings.push(timing);
            return timing;
        };
        const normalizeTimingHeaderName = (value) => String(value || "stage")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 48) || "stage";
        const getCheckoutTimingSnapshot = () => {
            const totalCheckoutMs = Date.now() - checkoutStartedAt;
            const requestStartedAt = Number(res.locals?.requestTimeoutStartedAt ||
                0);
            const totalRequestMs = Number.isFinite(requestStartedAt) && requestStartedAt > 0
                ? Date.now() - requestStartedAt
                : totalCheckoutMs;
            const stages = checkoutStageTimings.map((timing) => ({
                stage: timing.stage,
                stageMs: Math.max(0, Math.floor(timing.stageMs)),
                elapsedMs: Math.max(0, Math.floor(timing.elapsedMs)),
            }));
            const slowestStage = stages.reduce((slowest, stage) => {
                if (!slowest || stage.stageMs > slowest.stageMs) {
                    return stage;
                }
                return slowest;
            }, null) || null;
            return {
                totalCheckoutMs,
                totalRequestMs,
                stages,
                slowestStage,
            };
        };
        const setCheckoutTimingHeaders = (outcome) => {
            if (isResponseCommitted()) {
                return;
            }
            const snapshot = getCheckoutTimingSnapshot();
            const stageHeader = snapshot.stages
                .map((timing) => `${normalizeTimingHeaderName(timing.stage)}=${timing.stageMs};e=${timing.elapsedMs}`)
                .join(",");
            const serverTiming = [
                `checkout_total;dur=${Math.max(0, Math.floor(snapshot.totalCheckoutMs))}`,
                `request_total;dur=${Math.max(0, Math.floor(snapshot.totalRequestMs))}`,
                ...snapshot.stages.map((timing) => `checkout_${normalizeTimingHeaderName(timing.stage)};dur=${timing.stageMs}`),
            ].join(", ");
            res.setHeader("X-Checkout-Outcome", outcome);
            res.setHeader("X-Checkout-Request-Id", checkoutRequestId || "");
            res.setHeader("X-Checkout-Total-Ms", String(Math.max(0, Math.floor(snapshot.totalCheckoutMs))));
            res.setHeader("X-Checkout-Request-Total-Ms", String(Math.max(0, Math.floor(snapshot.totalRequestMs))));
            res.setHeader("X-Checkout-Stage-Timings", stageHeader.slice(0, 3500));
            if (snapshot.slowestStage) {
                res.setHeader("X-Checkout-Slowest-Stage", `${normalizeTimingHeaderName(snapshot.slowestStage.stage)}:${snapshot.slowestStage.stageMs}`);
            }
            res.setHeader("Server-Timing", serverTiming.slice(0, 3500));
        };
        const reportCheckoutTiming = (outcome, details) => {
            if (checkoutTimingReported) {
                return;
            }
            checkoutTimingReported = true;
            const timingSnapshot = getCheckoutTimingSnapshot();
            setImmediate(() => {
                emitCheckoutMetric("total_checkout_ms", timingSnapshot.totalCheckoutMs, {
                    outcome,
                    ...(details || {}),
                });
                console.info("CHECKOUT_TIMING_BREAKDOWN", {
                    requestId: checkoutRequestId,
                    route: req.originalUrl,
                    method: req.method,
                    outcome,
                    totalMs: timingSnapshot.totalCheckoutMs,
                    requestTotalMs: timingSnapshot.totalRequestMs,
                    slowestStage: timingSnapshot.slowestStage,
                    stages: timingSnapshot.stages,
                    ...(details || {}),
                });
            });
        };
        const logStageOk = (stage, details) => {
            const timing = pushCheckoutStageTiming(stage);
            setImmediate(() => {
                console.info("BILLING_STAGE_OK", {
                    stage,
                    requestId: checkoutRequestId,
                    route: req.originalUrl,
                    method: req.method,
                    elapsedMs: timing.elapsedMs,
                    stageMs: timing.stageMs,
                    ...(details || {}),
                });
                console.info("CHECKOUT_STAGE_OK", {
                    stage,
                    requestId: checkoutRequestId,
                    elapsedMs: timing.elapsedMs,
                    stageMs: timing.stageMs,
                    ...(details || {}),
                });
            });
        };
        const logStageFail = (stage, reason, details) => {
            const timing = pushCheckoutStageTiming(stage);
            setImmediate(() => {
                console.error("CHECKOUT_STAGE_FAIL", {
                    stage,
                    reason,
                    requestId: checkoutRequestId,
                    route: req.originalUrl,
                    method: req.method,
                    elapsedMs: timing.elapsedMs,
                    stageMs: timing.stageMs,
                    ...(details || {}),
                });
            });
        };
        setImmediate(() => {
            console.info("BILLING_START", {
                requestId: checkoutRequestId,
                route: req.originalUrl,
                method: req.method,
                redirectOnSuccess,
            });
            console.info("CHECKOUT_START", {
                requestId: checkoutRequestId,
                route: req.originalUrl,
                method: req.method,
                redirectOnSuccess,
                remainingMs: (0, requestLifecycle_1.getRequestRemainingMs)({ req, res }, 0),
            });
        });
        if (redirectOnSuccess) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
        }
        const requestBody = req.body && typeof req.body === "object" && !Array.isArray(req.body)
            ? req.body
            : {};
        const requestQuery = req.query && typeof req.query === "object" && !Array.isArray(req.query)
            ? req.query
            : {};
        const readInput = (key) => {
            const bodyValue = requestBody[key];
            if (bodyValue !== undefined && bodyValue !== null && bodyValue !== "") {
                return bodyValue;
            }
            const queryValue = requestQuery[key];
            if (Array.isArray(queryValue)) {
                return queryValue[0];
            }
            return queryValue;
        };
        const sendCheckoutError = (input) => {
            logStageFail("checkout.response", input.reason, {
                status: input.status,
                code: input.code || null,
                redirectOnSuccess,
            });
            setImmediate(() => {
                console.error("BILLING_STAGE_FAIL", {
                    stage: "checkout.response",
                    reason: input.reason,
                    status: input.status,
                    code: input.code || null,
                    requestId: checkoutRequestId,
                    route: req.originalUrl,
                    method: req.method,
                    elapsedMs: Date.now() - checkoutStartedAt,
                    redirectOnSuccess,
                });
            });
            reportCheckoutTiming("failed", {
                status: input.status,
                reason: input.reason,
                code: input.code || null,
            });
            if (isResponseCommitted()) {
                logStageOk("checkout.response.skipped", {
                    success: false,
                    status: input.status,
                    reason: input.reason,
                    code: input.code || null,
                    skipped: "response_already_committed",
                    redirectOnSuccess,
                });
                return res;
            }
            if (redirectOnSuccess) {
                setCheckoutTimingHeaders("failed");
                return res.redirect(303, BillingController.buildCheckoutFailureRedirect(input.reason));
            }
            setCheckoutTimingHeaders("failed");
            return res.status(input.status).json({
                success: false,
                ...(input.code ? { code: input.code } : {}),
                message: input.message,
            });
        };
        try {
            (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                req,
                res,
                stage: "checkout.entry",
            });
            const requestAbortSignal = (0, requestLifecycle_1.getRequestAbortSignal)({ req, res });
            const plan = readInput("plan");
            const coupon = readInput("coupon");
            const requestedQuantity = Number(readInput("seats") || readInput("quantity") || 1);
            const quantity = Math.max(1, Math.floor(Number.isFinite(requestedQuantity) ? requestedQuantity : 1));
            const billing = String(readInput("billing") || "monthly");
            const checkoutTypeInput = String(readInput("checkoutType") || readInput("action") || (coupon ? "coupon" : "subscription"))
                .trim()
                .toLowerCase();
            const checkoutAttemptRaw = String(readInput("attempt") || readInput("checkoutAttempt") || "").trim();
            const checkoutAttempt = checkoutAttemptRaw
                .replace(/[^a-zA-Z0-9._-]/g, "")
                .slice(0, 80) || crypto_1.default.randomUUID().replace(/-/g, "");
            const checkoutType = new Set([
                "subscription",
                "one_time",
                "trial",
                "coupon",
                "upgrade",
                "downgrade",
                "addon",
            ]).has(checkoutTypeInput)
                ? checkoutTypeInput
                : "subscription";
            const trialDays = checkoutType === "trial"
                ? Math.max(1, Math.min(30, Math.floor(Number(readInput("trialDays") || pricing_config_1.TRIAL_DAYS))))
                : 0;
            const addonLineItems = Array.isArray(requestBody.lineItems)
                ? requestBody.lineItems
                : Array.isArray(requestBody.addons)
                    ? requestBody.addons.map((item, index) => ({
                        type: String(item?.type || item?.addonType || "").trim().toLowerCase(),
                        credits: Math.max(0, Math.floor(Number(item?.credits || item?.quantity || 0))),
                        label: String(item?.label || `addon_${index + 1}`).trim(),
                    }))
                    : [];
            const couponCode = String(coupon || readInput("couponId") || "").trim() || null;
            const normalizedPlan = String(plan || "").trim().toUpperCase();
            const normalizedBilling = billing === "yearly"
                ? "yearly"
                : billing === "monthly"
                    ? "monthly"
                    : null;
            const allowedPlans = new Set(["BASIC", "PRO", "ELITE"]);
            if (!normalizedPlan) {
                return sendCheckoutError({
                    status: 400,
                    message: "Plan is required",
                    reason: "plan_required",
                });
            }
            if (!allowedPlans.has(normalizedPlan)) {
                return sendCheckoutError({
                    status: 400,
                    message: "Invalid plan selected",
                    reason: "invalid_plan",
                });
            }
            if (!normalizedBilling) {
                return sendCheckoutError({
                    status: 400,
                    message: "Invalid billing cycle",
                    reason: "invalid_billing",
                });
            }
            const authStartedAt = Date.now();
            let businessId = BillingController.getBusinessIdFromRequest(req);
            let email = String(req.user?.email || "").trim().toLowerCase();
            const hasFastPathContext = Boolean(businessId && email);
            if (!hasFastPathContext) {
                const userContext = await getUserContext(req);
                businessId = businessId || userContext.businessId;
                email = email || userContext.email;
            }
            emitCheckoutMetric("auth_ms", Date.now() - authStartedAt, {
                stage: "auth_resolved",
                source: hasFastPathContext ? "request_context_fast_path" : "user_context_lookup",
            });
            (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                req,
                res,
                stage: "checkout.auth_resolved",
            });
            logStageOk("auth.resolved", {
                userId: String(req.user?.id || "").trim() || null,
                businessId: businessId || null,
            });
            if (!businessId) {
                return sendCheckoutError({
                    status: 403,
                    message: "Business context is required",
                    reason: "business_context_required",
                });
            }
            const billingContextStartedAt = Date.now();
            logStageOk("checkout.context.validated", {
                businessId,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                checkoutType,
                quantity,
            });
            (0, stripeConfig_service_1.assertStripeConfigReady)();
            (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                req,
                res,
                stage: "checkout.stripe_config",
            });
            emitCheckoutMetric("billing_context_ms", Date.now() - billingContextStartedAt, {
                businessId,
                stage: "context_validated",
            });
            const pricingStartedAt = Date.now();
            const currency = (0, billingGeo_service_1.resolveBillingCurrency)(req);
            const pricingPlan = (0, pricing_config_1.getPricingPlanConfig)(normalizedPlan);
            const unitPrice = normalizedBilling === "yearly"
                ? pricingPlan.yearlyPrice[currency]
                : pricingPlan.monthlyPrice[currency];
            if (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) <= 0) {
                return sendCheckoutError({
                    status: 400,
                    message: `Pricing is not configured for ${normalizedPlan} (${currency}, ${normalizedBilling})`,
                    reason: "pricing_unavailable",
                });
            }
            const explicitUnitAmountMinor = Number(readInput("unitAmountMinor") || readInput("amountMinor") || 0);
            const customUnitPriceMinor = Number.isFinite(explicitUnitAmountMinor) && explicitUnitAmountMinor > 0
                ? Math.floor(explicitUnitAmountMinor)
                : Math.round(Number(unitPrice || 0) * 100);
            logStageOk("pricing.resolved", {
                businessId,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                currency,
                quantity,
                unitPrice,
                customUnitPriceMinor,
            });
            const preloadedSubscription = req.subscription;
            // Active-plan protection check (prevent duplicate checkouts on active plan)
            let activePlanCode = null;
            let activeSubscription = preloadedSubscription && ["ACTIVE", "TRIAL", "TRIALING", "PAST_DUE", "PAUSED"].includes(preloadedSubscription.status)
                ? {
                    metadata: preloadedSubscription.metadata || {},
                    subscriptionKey: preloadedSubscription.subscriptionKey || `sub_${preloadedSubscription.stripeSubscriptionId || preloadedSubscription.id}`,
                    providerSubscriptionId: preloadedSubscription.providerSubscriptionId || preloadedSubscription.stripeSubscriptionId || null,
                }
                : null;
            if (preloadedSubscription && ["ACTIVE", "TRIAL", "TRIALING", "PAST_DUE", "PAUSED"].includes(preloadedSubscription.status)) {
                activePlanCode = preloadedSubscription.plan?.name || preloadedSubscription.plan?.type || null;
            }
            if (!activePlanCode || !activeSubscription) {
                const foundActive = await prisma_1.default.subscriptionLedger.findFirst({
                    where: {
                        businessId,
                        status: {
                            in: ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"],
                        },
                    },
                    select: {
                        planCode: true,
                        metadata: true,
                        subscriptionKey: true,
                        providerSubscriptionId: true,
                    },
                    orderBy: {
                        updatedAt: "desc",
                    },
                });
                if (foundActive) {
                    activePlanCode = activePlanCode || foundActive.planCode;
                    activeSubscription = activeSubscription || {
                        metadata: foundActive.metadata || {},
                        subscriptionKey: foundActive.subscriptionKey,
                        providerSubscriptionId: foundActive.providerSubscriptionId,
                    };
                }
                else {
                    // Fall back to checking PENDING subscriptions if no ACTIVE/TRIAL subscription is found.
                    const foundPending = await prisma_1.default.subscriptionLedger.findFirst({
                        where: {
                            businessId,
                            status: "PENDING",
                        },
                        select: {
                            metadata: true,
                            subscriptionKey: true,
                            providerSubscriptionId: true,
                        },
                        orderBy: {
                            updatedAt: "desc",
                        },
                    });
                    if (foundPending) {
                        activeSubscription = {
                            metadata: foundPending.metadata || {},
                            subscriptionKey: foundPending.subscriptionKey,
                            providerSubscriptionId: foundPending.providerSubscriptionId,
                        };
                    }
                }
            }
            if (activePlanCode && String(activePlanCode).trim().toUpperCase() === normalizedPlan) {
                return sendCheckoutError({
                    status: 409,
                    message: `You are already subscribed to the ${normalizedPlan.charAt(0) + normalizedPlan.slice(1).toLowerCase()} plan.`,
                    reason: "already_subscribed",
                    code: "ALREADY_SUBSCRIBED",
                });
            }
            (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                req,
                res,
                stage: "checkout.subscription_lookup",
            });
            emitCheckoutMetric("pricing_ms", Date.now() - pricingStartedAt, {
                businessId,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                currency,
            });
            const subscriptionMeta = (activeSubscription?.metadata || {});
            const checkoutProposalFingerprint = crypto_1.default
                .createHash("sha256")
                .update(JSON.stringify({
                businessId,
                normalizedPlan,
                normalizedBilling,
                currency,
                quantity,
                checkoutType,
                trialDays,
                couponCode,
                addonLineItems,
                activeSubscriptionKey: activeSubscription?.subscriptionKey || null,
                prorationBehavior: readInput("prorationBehavior") || null,
            }))
                .digest("hex")
                .slice(0, 24);
            const inFlightKey = `${businessId}:${normalizedPlan}:${normalizedBilling}:${checkoutType}`;
            const currentInFlight = checkoutInFlight.get(inFlightKey);
            if (currentInFlight &&
                Date.now() - currentInFlight.startedAt <= CHECKOUT_IN_FLIGHT_WINDOW_MS) {
                return sendCheckoutError({
                    status: 409,
                    message: "Another checkout is already in progress. Please wait a moment and retry.",
                    reason: "checkout_in_progress",
                    code: "CHECKOUT_IN_PROGRESS",
                });
            }
            checkoutInFlight.set(inFlightKey, {
                startedAt: Date.now(),
                requestId: checkoutRequestId,
            });
            try {
                (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                    req,
                    res,
                    stage: "checkout.proposal_start",
                });
                const proposalStartedAt = Date.now();
                const proposal = await proposalEngine_service_1.proposalEngineService.createProposal({
                    businessId,
                    planCode: normalizedPlan,
                    billingCycle: normalizedBilling,
                    currency,
                    quantity,
                    customUnitPriceMinor,
                    lineItems: addonLineItems,
                    source: "SELF",
                    requestedBy: "SELF",
                    metadata: {
                        checkoutSource: "billing_controller",
                        checkoutType,
                        trialDays,
                        coupon: couponCode,
                        prorationBehavior: String(readInput("prorationBehavior") || "").trim().toLowerCase() || null,
                        providerSubscriptionId: String(readInput("providerSubscriptionId") || activeSubscription?.providerSubscriptionId || "").trim() ||
                            null,
                        stripeCustomerId: String(readInput("stripeCustomerId") || subscriptionMeta.stripeCustomerId || "").trim() ||
                            null,
                        seatBased: quantity > 1,
                    },
                    idempotencyKey: `checkout:proposal:${businessId}:${checkoutProposalFingerprint}`,
                    requestSignal: requestAbortSignal,
                    deferNonCriticalWork: true,
                });
                (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                    req,
                    res,
                    stage: "checkout.proposal_created",
                });
                const readyProposal = proposal.status === "APPROVED" || proposal.status === "SENT"
                    ? proposal
                    : await proposalEngine_service_1.proposalEngineService.sendProposal({
                        businessId,
                        proposalKey: proposal.proposalKey,
                    });
                (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                    req,
                    res,
                    stage: "checkout.proposal_ready",
                });
                emitCheckoutMetric("proposal_ms", Date.now() - proposalStartedAt, {
                    businessId,
                    plan: normalizedPlan,
                    billingCycle: normalizedBilling,
                    checkoutType,
                });
                logStageOk("proposal.created", {
                    businessId,
                    proposalKey: readyProposal.proposalKey,
                    proposalStatus: readyProposal.status,
                });
                const paymentIntentStartedAt = Date.now();
                let paymentIntent;
                try {
                    (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                        req,
                        res,
                        stage: "checkout.payment_intent_start",
                    });
                    paymentIntent = await paymentIntent_service_1.paymentIntentService.createCheckout({
                        businessId,
                        proposalKey: readyProposal.proposalKey,
                        proposalPreloaded: readyProposal,
                        provider: "STRIPE",
                        source: "SELF",
                        description: `${normalizedPlan} ${normalizedBilling} plan checkout`,
                        successUrl: `${env_1.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${normalizedPlan}&billing=${normalizedBilling}&proposal=${readyProposal.proposalKey}`,
                        cancelUrl: `${env_1.env.FRONTEND_URL}/billing/cancel?plan=${normalizedPlan}&billing=${normalizedBilling}&proposal=${readyProposal.proposalKey}`,
                        metadata: {
                            coupon: couponCode,
                            origin: "billing_controller",
                            planCode: normalizedPlan,
                            billingCycle: normalizedBilling,
                            quantity,
                            checkoutType,
                            trialDays,
                            providerSubscriptionId: String(readInput("providerSubscriptionId") || activeSubscription?.providerSubscriptionId || "").trim() ||
                                null,
                            stripeCustomerId: String(readInput("stripeCustomerId") || subscriptionMeta.stripeCustomerId || "").trim() ||
                                null,
                            customerEmail: email,
                            checkoutAttempt,
                            checkoutStartRequestId: checkoutRequestId,
                            checkoutStartPath: req.originalUrl,
                            prorationBehavior: String(readInput("prorationBehavior") || "").trim().toLowerCase() || null,
                            seatBased: quantity > 1,
                        },
                        idempotencyKey: `checkout:payment_intent:${businessId}:${readyProposal.proposalKey}:${checkoutAttempt}`,
                        requestSignal: requestAbortSignal,
                        deferNonCriticalWork: true,
                    });
                }
                finally {
                    emitCheckoutMetric("payment_intent_ms", Date.now() - paymentIntentStartedAt, {
                        businessId,
                        proposalKey: readyProposal.proposalKey,
                    });
                }
                (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                    req,
                    res,
                    stage: "checkout.payment_intent_created",
                });
                logStageOk("payment_intent.created", {
                    businessId,
                    proposalKey: readyProposal.proposalKey,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    provider: paymentIntent.provider,
                    paymentIntentStatus: paymentIntent.status,
                });
                const checkoutUrl = String(paymentIntent.checkoutUrl || "").trim();
                logStageOk("checkout_url.evaluated", {
                    businessId,
                    proposalKey: readyProposal.proposalKey,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    hasCheckoutUrl: Boolean(checkoutUrl),
                });
                if (!checkoutUrl) {
                    return sendCheckoutError({
                        status: 503,
                        message: "Stripe checkout link is temporarily unavailable. Please retry shortly.",
                        reason: "checkout_url_missing",
                    });
                }
                (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                    req,
                    res,
                    stage: "checkout.response_finalize",
                });
                if (isResponseCommitted()) {
                    logStageOk("checkout.response.skipped", {
                        success: true,
                        businessId,
                        proposalKey: readyProposal.proposalKey,
                        paymentIntentKey: paymentIntent.paymentIntentKey,
                        skipped: "response_already_committed",
                        redirectOnSuccess,
                    });
                    return;
                }
                if (redirectOnSuccess) {
                    console.info("CHECKOUT_SUCCESS", {
                        requestId: checkoutRequestId,
                        businessId,
                        proposalKey: readyProposal.proposalKey,
                        paymentIntentKey: paymentIntent.paymentIntentKey,
                        elapsedMs: Date.now() - checkoutStartedAt,
                        action: "redirect",
                    });
                    logStageOk("checkout.response.redirect", {
                        success: true,
                        status: 303,
                        businessId,
                        proposalKey: readyProposal.proposalKey,
                        paymentIntentKey: paymentIntent.paymentIntentKey,
                        redirectOnSuccess,
                    });
                    console.info("CHECKOUT_REDIRECT_SENT", {
                        requestId: checkoutRequestId,
                        status: 303,
                        checkoutUrl,
                        elapsedMs: Date.now() - checkoutStartedAt,
                    });
                    reportCheckoutTiming("success", {
                        status: 303,
                        businessId,
                        proposalKey: readyProposal.proposalKey,
                        paymentIntentKey: paymentIntent.paymentIntentKey,
                    });
                    setCheckoutTimingHeaders("success");
                    return res.redirect(303, checkoutUrl);
                }
                console.info("CHECKOUT_SUCCESS", {
                    requestId: checkoutRequestId,
                    businessId,
                    proposalKey: readyProposal.proposalKey,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    elapsedMs: Date.now() - checkoutStartedAt,
                    action: "json",
                });
                logStageOk("checkout.response.json", {
                    success: true,
                    status: 200,
                    businessId,
                    proposalKey: readyProposal.proposalKey,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    redirectOnSuccess,
                });
                reportCheckoutTiming("success", {
                    status: 200,
                    businessId,
                    proposalKey: readyProposal.proposalKey,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                });
                setCheckoutTimingHeaders("success");
                return res.json({
                    success: true,
                    url: checkoutUrl,
                    proposalKey: readyProposal.proposalKey,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                });
            }
            finally {
                checkoutInFlight.delete(inFlightKey);
            }
        }
        catch (error) {
            if ((0, requestLifecycle_1.isRequestLifecycleAborted)({ req, res }) || isResponseCommitted()) {
                return;
            }
            const stripeCode = String(error?.code || "").trim().toLowerCase();
            const stripeType = String(error?.type || "").trim().toLowerCase();
            if (error.message === "Unauthorized") {
                return sendCheckoutError({
                    status: 401,
                    message: "Unauthorized",
                    reason: "unauthorized",
                });
            }
            if (error.message?.includes("Currency cannot be changed") ||
                error.message?.includes("Invalid plan") ||
                error.message?.includes("Invalid billing") ||
                error.message?.includes("proposal_not_checkout_ready") ||
                error.message?.includes("stripe_subscription_amount_invalid") ||
                error.message?.includes("stripe_price_mapping_missing") ||
                error.message?.includes("unknown parameter") ||
                error.message?.includes("parameter_unknown") ||
                error.message?.includes("invalid_request_error") ||
                stripeCode === "parameter_unknown" ||
                stripeType === "invalid_request_error") {
                return sendCheckoutError({
                    status: 400,
                    message: "Checkout configuration is invalid. Please contact support if this persists.",
                    reason: "checkout_invalid",
                });
            }
            if (error.message?.includes("checkout_manual_review_required")) {
                return sendCheckoutError({
                    status: 409,
                    code: "CHECKOUT_MANUAL_REVIEW_REQUIRED",
                    message: "Checkout is temporarily paused for risk review. Please contact support.",
                    reason: "manual_review_required",
                });
            }
            if (error.message?.includes("provider_timeout")) {
                return sendCheckoutError({
                    status: 504,
                    code: "BILLING_PROVIDER_TIMEOUT",
                    message: "Stripe took too long to respond. Please retry in a few seconds.",
                    reason: "provider_timeout",
                });
            }
            if (error.message?.includes("provider_credential_")) {
                return sendCheckoutError({
                    status: 503,
                    code: "BILLING_PROVIDER_UNAVAILABLE",
                    message: "Billing provider is temporarily unavailable. Please retry shortly.",
                    reason: "provider_unavailable",
                });
            }
            if (error.message?.includes("stripe_config_invalid")) {
                return sendCheckoutError({
                    status: 503,
                    code: "BILLING_PROVIDER_UNAVAILABLE",
                    message: "Billing provider is temporarily unavailable. Please retry shortly.",
                    reason: "provider_unavailable",
                });
            }
            console.error("BILLING_STAGE_FAIL", {
                stage: "checkout.exception",
                reason: String(error?.message || "checkout_failed"),
            });
            console.error("CHECKOUT_FAIL", {
                requestId: checkoutRequestId,
                reason: String(error?.message || "checkout_failed"),
                elapsedMs: Date.now() - checkoutStartedAt,
            });
            return sendCheckoutError({
                status: 500,
                message: error.message || "Checkout failed",
                reason: "checkout_failed",
            });
        }
    }
    static async getPlans(req, res) {
        try {
            const plans = await prisma_1.default.plan.findMany({
                where: {
                    type: {
                        in: ["BASIC", "PRO", "ELITE"],
                    },
                },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    priceIdINR: true,
                    priceIdUSD: true,
                },
            });
            return res.json(buildPlansPayload({
                plans: plans.map((plan) => ({
                    id: plan.id,
                    name: plan.name,
                    type: String(plan.type || "").trim(),
                    priceIdINR: plan.priceIdINR,
                    priceIdUSD: plan.priceIdUSD,
                })),
                degraded: false,
                reason: null,
            }));
        }
        catch (error) {
            console.error("BILLING_STAGE_FAIL", {
                stage: "plans.fetch",
                reason: String(error?.message || "plans_unavailable"),
            });
            return res.status(503).json({
                success: false,
                message: "Billing plans are temporarily unavailable.",
            });
        }
    }
    static async getBilling(req, res) {
        try {
            const surface = String(req.query.surface || "").trim().toLowerCase();
            const lightweight = surface === "checkout" || surface === "billing";
            let businessId = BillingController.getBusinessIdFromRequest(req);
            if (!businessId) {
                const context = await getUserContext(req);
                businessId = context.businessId;
            }
            res.setHeader("Cache-Control", "no-store");
            const currencyHint = (0, billingGeo_service_1.resolveBillingCurrency)(req);
            const cacheKey = businessId
                ? getBillingProjectionCacheKey(businessId, currencyHint)
                : null;
            const isCheckoutSurface = surface === "checkout" ||
                String(req.originalUrl || "").includes("/checkout") ||
                String(req.originalUrl || "").includes("surface=checkout");
            const sendBillingSurfaceResponse = (status, body) => {
                if (surface === "billing" && status >= 200 && status < 300) {
                    triggerBillingCheckoutWarmupAfterResponse({
                        req,
                        res,
                        businessId,
                        userId: String(req.user?.id || "").trim() || null,
                        email: String(req.user?.email || "").trim().toLowerCase() || null,
                        requestId: String(req.requestId || "").trim() || null,
                    });
                }
                return res.status(status).json(body);
            };
            if (isCheckoutSurface) {
                let cachedVal = null;
                if (cacheKey) {
                    const cached = billingProjectionCache.get(cacheKey);
                    if (cached?.value) {
                        cachedVal = cached.value;
                    }
                }
                if (cachedVal) {
                    // Spawn background projection repair if not already computing
                    if (cacheKey) {
                        const activeCached = billingProjectionCache.get(cacheKey);
                        if (!activeCached?.promise) {
                            const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                                cacheKey,
                                label: "billing_projection",
                                businessId,
                                computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                                bypassCoordination: true,
                                task: () => BillingController.buildBillingResponse(businessId, req, { lightweight: true, isCheckout: true }),
                            });
                            const sharedProjectionPromise = computeProjection
                                .then((value) => {
                                const updatedAt = Date.now();
                                billingProjectionCache.set(cacheKey, {
                                    value,
                                    updatedAt,
                                    expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                                });
                                void writeRedisBillingProjectionSnapshot(cacheKey, value);
                                return value;
                            })
                                .catch((error) => {
                                billingProjectionCache.delete(cacheKey);
                                throw error;
                            });
                            billingProjectionCache.set(cacheKey, {
                                expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                                value: cachedVal,
                                updatedAt: Date.now(),
                                promise: sharedProjectionPromise,
                            });
                        }
                    }
                    const isStale = (billingProjectionCache.get(cacheKey)?.expiresAt || 0) <= Date.now();
                    return res.status(200).json(isStale ? markBillingSnapshotAsStale(cachedVal, "stale_revalidate") : cachedVal);
                }
                // LKV fallback
                const lkvSub = prewarmState_1.prewarmState.lastKnownValidSubscription.get(businessId);
                const lkvBill = prewarmState_1.prewarmState.lastKnownValidBilling.get(businessId);
                if (lkvSub && lkvBill) {
                    const prewarmFallback = {
                        success: true,
                        subscription: lkvSub,
                        billing: lkvBill,
                        usage: EMPTY_USAGE_SUMMARY,
                        currency: lkvSub.currency || (0, billingGeo_service_1.resolveBillingCurrency)(req),
                        invoices: [],
                        meta: {
                            degraded: true,
                            reason: "lightweight_prewarm_lkv",
                        },
                    };
                    // Spawn background projection repair if not already computing
                    if (cacheKey) {
                        const activeCached = billingProjectionCache.get(cacheKey);
                        if (!activeCached?.promise) {
                            const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                                cacheKey,
                                label: "billing_projection",
                                businessId,
                                computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                                bypassCoordination: true,
                                task: () => BillingController.buildBillingResponse(businessId, req, { lightweight: true, isCheckout: true }),
                            });
                            const sharedProjectionPromise = computeProjection
                                .then((value) => {
                                const updatedAt = Date.now();
                                billingProjectionCache.set(cacheKey, {
                                    value,
                                    updatedAt,
                                    expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                                });
                                void writeRedisBillingProjectionSnapshot(cacheKey, value);
                                return value;
                            })
                                .catch((error) => {
                                billingProjectionCache.delete(cacheKey);
                                throw error;
                            });
                            billingProjectionCache.set(cacheKey, {
                                expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                                value: undefined,
                                updatedAt: Date.now(),
                                promise: sharedProjectionPromise,
                            });
                        }
                    }
                    return res.status(200).json(prewarmFallback);
                }
                // Default degraded response
                const defaultResponse = {
                    success: true,
                    subscription: null,
                    billing: EMPTY_BILLING_CONTEXT,
                    usage: EMPTY_USAGE_SUMMARY,
                    currency: (0, billingGeo_service_1.resolveBillingCurrency)(req),
                    invoices: [],
                    meta: {
                        degraded: true,
                        reason: "lightweight_degraded_sync",
                    },
                };
                // Spawn background projection repair if not already computing
                if (cacheKey) {
                    const activeCached = billingProjectionCache.get(cacheKey);
                    if (!activeCached?.promise) {
                        const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                            cacheKey,
                            label: "billing_projection",
                            businessId,
                            computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                            bypassCoordination: true,
                            task: () => BillingController.buildBillingResponse(businessId, req, { lightweight: true, isCheckout: true }),
                        });
                        const sharedProjectionPromise = computeProjection
                            .then((value) => {
                            const updatedAt = Date.now();
                            billingProjectionCache.set(cacheKey, {
                                value,
                                updatedAt,
                                expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                            });
                            void writeRedisBillingProjectionSnapshot(cacheKey, value);
                            return value;
                        })
                            .catch((error) => {
                            billingProjectionCache.delete(cacheKey);
                            throw error;
                        });
                        billingProjectionCache.set(cacheKey, {
                            expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                            value: undefined,
                            updatedAt: Date.now(),
                            promise: sharedProjectionPromise,
                        });
                    }
                }
                return res.status(200).json(defaultResponse);
            }
            if (lightweight) {
                if (cacheKey) {
                    // 1. Memory Cache check
                    const cached = billingProjectionCache.get(cacheKey);
                    if (cached?.value) {
                        const isStale = cached.expiresAt <= Date.now();
                        // Kick off background computation if stale and not already computing
                        if (isStale && !cached.promise) {
                            const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                                cacheKey,
                                label: "billing_projection",
                                businessId,
                                computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                                task: () => BillingController.buildBillingResponse(businessId, req, { lightweight }),
                            });
                            const sharedProjectionPromise = computeProjection
                                .then((value) => {
                                const updatedAt = Date.now();
                                billingProjectionCache.set(cacheKey, {
                                    value,
                                    updatedAt,
                                    expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                                });
                                void writeRedisBillingProjectionSnapshot(cacheKey, value);
                                return value;
                            })
                                .catch((error) => {
                                billingProjectionCache.delete(cacheKey);
                                throw error;
                            });
                            billingProjectionCache.set(cacheKey, {
                                expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                                value: cached.value,
                                updatedAt: cached.updatedAt,
                                promise: sharedProjectionPromise,
                            });
                        }
                        return sendBillingSurfaceResponse(200, isStale ? markBillingSnapshotAsStale(cached.value, "stale_revalidate") : cached.value);
                    }
                    // 2. Redis Cache check (non-blocking for checkout!)
                    const redisSnapshot = await readRedisBillingProjectionSnapshot(cacheKey).catch(() => null);
                    if (redisSnapshot?.data) {
                        billingProjectionCache.set(cacheKey, {
                            value: redisSnapshot.data,
                            updatedAt: redisSnapshot.updatedAt,
                            expiresAt: Date.now() + Math.floor(BILLING_PROJECTION_CACHE_TTL_MS / 2),
                        });
                        // Trigger background compute task if not already computing
                        const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                            cacheKey,
                            label: "billing_projection",
                            businessId,
                            computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                            task: () => BillingController.buildBillingResponse(businessId, req, { lightweight }),
                        });
                        const sharedProjectionPromise = computeProjection
                            .then((value) => {
                            const updatedAt = Date.now();
                            billingProjectionCache.set(cacheKey, {
                                value,
                                updatedAt,
                                expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                            });
                            void writeRedisBillingProjectionSnapshot(cacheKey, value);
                            return value;
                        })
                            .catch((error) => {
                            billingProjectionCache.delete(cacheKey);
                            throw error;
                        });
                        billingProjectionCache.set(cacheKey, {
                            expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                            value: redisSnapshot.data,
                            updatedAt: redisSnapshot.updatedAt,
                            promise: sharedProjectionPromise,
                        });
                        return sendBillingSurfaceResponse(200, markBillingSnapshotAsStale(redisSnapshot.data, "stale_revalidate"));
                    }
                    // 3. Prewarm LKV check (instant, memory-only)
                    const lkvSub = prewarmState_1.prewarmState.lastKnownValidSubscription.get(businessId);
                    const lkvBill = prewarmState_1.prewarmState.lastKnownValidBilling.get(businessId);
                    if (lkvSub && lkvBill) {
                        // Kick off background computation in background
                        const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                            cacheKey,
                            label: "billing_projection",
                            businessId,
                            computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                            task: () => BillingController.buildBillingResponse(businessId, req, { lightweight }),
                        });
                        const sharedProjectionPromise = computeProjection
                            .then((value) => {
                            const updatedAt = Date.now();
                            billingProjectionCache.set(cacheKey, {
                                value,
                                updatedAt,
                                expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                            });
                            void writeRedisBillingProjectionSnapshot(cacheKey, value);
                            return value;
                        })
                            .catch((error) => {
                            billingProjectionCache.delete(cacheKey);
                            throw error;
                        });
                        billingProjectionCache.set(cacheKey, {
                            expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                            value: undefined,
                            updatedAt: Date.now(),
                            promise: sharedProjectionPromise,
                        });
                        const prewarmFallback = {
                            success: true,
                            subscription: lkvSub,
                            billing: lkvBill,
                            usage: EMPTY_USAGE_SUMMARY,
                            currency: lkvSub.currency || (0, billingGeo_service_1.resolveBillingCurrency)(req),
                            invoices: [],
                            meta: {
                                degraded: true,
                                reason: "lightweight_prewarm_lkv",
                            },
                        };
                        return sendBillingSurfaceResponse(200, prewarmFallback);
                    }
                    // 4. Memory/Redis/LKV Cache Miss: serve default degraded immediately without blocking DB/Stripe calls!
                    // Kick off the background hydration to populate cache for subsequent requests
                    const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                        cacheKey,
                        label: "billing_projection",
                        businessId,
                        computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                        task: () => BillingController.buildBillingResponse(businessId, req, { lightweight }),
                    });
                    const sharedProjectionPromise = computeProjection
                        .then((value) => {
                        const updatedAt = Date.now();
                        billingProjectionCache.set(cacheKey, {
                            value,
                            updatedAt,
                            expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                        });
                        void writeRedisBillingProjectionSnapshot(cacheKey, value);
                        return value;
                    })
                        .catch((error) => {
                        billingProjectionCache.delete(cacheKey);
                        throw error;
                    });
                    billingProjectionCache.set(cacheKey, {
                        expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                        value: undefined,
                        updatedAt: Date.now(),
                        promise: sharedProjectionPromise,
                    });
                    // Serve degraded response instantly
                    const defaultResponse = {
                        success: true,
                        subscription: null,
                        billing: EMPTY_BILLING_CONTEXT,
                        usage: EMPTY_USAGE_SUMMARY,
                        currency: (0, billingGeo_service_1.resolveBillingCurrency)(req),
                        invoices: [],
                        meta: {
                            degraded: true,
                            reason: "lightweight_degraded_sync",
                        },
                    };
                    return sendBillingSurfaceResponse(200, defaultResponse);
                }
                else {
                    return sendBillingSurfaceResponse(200, {
                        success: true,
                        subscription: null,
                        billing: EMPTY_BILLING_CONTEXT,
                        usage: EMPTY_USAGE_SUMMARY,
                        currency: (0, billingGeo_service_1.resolveBillingCurrency)(req),
                        invoices: [],
                        meta: {
                            degraded: false,
                            reason: null,
                        },
                    });
                }
            }
            const waitBudgetMs = resolveBillingProjectionWaitBudgetMs(res);
            let staleCacheValue;
            let staleCacheUpdatedAt = 0;
            let projectionPromise = null;
            if (cacheKey) {
                const cached = billingProjectionCache.get(cacheKey);
                staleCacheValue = cached?.value;
                staleCacheUpdatedAt = Number(cached?.updatedAt || 0);
                if (cached?.value && (cached.expiresAt > Date.now() || lightweight)) {
                    const isStale = cached.expiresAt <= Date.now();
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "CACHE_HIT",
                        businessId,
                        route: "billing_projection",
                        metadata: {
                            cache: "memory_billing_projection",
                            stale: isStale,
                        },
                    });
                    emitProjectionTelemetry({
                        name: "projection_cache_hit",
                        value: 1,
                        businessId,
                        metadata: {
                            cache: "memory_billing_projection",
                            stale: isStale,
                        },
                    });
                    console.info("BILLING_STAGE_OK", {
                        stage: "billing_projection.ready",
                        businessId,
                        invoiceCount: Array.isArray(cached.value.invoices)
                            ? cached.value.invoices.length
                            : 0,
                        hasSubscription: Boolean(cached.value.subscription),
                        source: isStale ? "stale_cache_hit" : "cache_hit",
                    });
                    // Kick off background computation if stale and not already computing
                    if (isStale && !cached.promise) {
                        const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                            cacheKey,
                            label: "billing_projection",
                            businessId,
                            computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                            task: () => BillingController.buildBillingResponse(businessId, req, { lightweight }),
                        });
                        const sharedProjectionPromise = computeProjection
                            .then((value) => {
                            const updatedAt = Date.now();
                            billingProjectionCache.set(cacheKey, {
                                value,
                                updatedAt,
                                expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                            });
                            void writeRedisBillingProjectionSnapshot(cacheKey, value);
                            return value;
                        })
                            .catch((error) => {
                            billingProjectionCache.delete(cacheKey);
                            throw error;
                        });
                        billingProjectionCache.set(cacheKey, {
                            expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                            value: cached.value,
                            updatedAt: cached.updatedAt,
                            promise: sharedProjectionPromise,
                        });
                    }
                    return res.json(isStale ? markBillingSnapshotAsStale(cached.value, "stale_revalidate") : cached.value);
                }
                if (!staleCacheValue) {
                    const redisSnapshot = await readRedisBillingProjectionSnapshot(cacheKey);
                    if (redisSnapshot?.data) {
                        staleCacheValue = redisSnapshot.data;
                        staleCacheUpdatedAt = redisSnapshot.updatedAt;
                        billingProjectionCache.set(cacheKey, {
                            value: redisSnapshot.data,
                            updatedAt: redisSnapshot.updatedAt,
                            expiresAt: Date.now() + Math.floor(BILLING_PROJECTION_CACHE_TTL_MS / 2),
                        });
                        (0, performanceMetrics_1.emitPerformanceMetric)({
                            name: "CACHE_HIT",
                            businessId,
                            route: "billing_projection",
                            metadata: {
                                cache: "redis_billing_projection",
                            },
                        });
                        emitProjectionTelemetry({
                            name: "projection_cache_hit",
                            value: 1,
                            businessId,
                            metadata: {
                                cache: "redis_billing_projection",
                                stale: true,
                            },
                        });
                        if (lightweight) {
                            console.info("BILLING_STAGE_OK", {
                                stage: "billing_projection.ready",
                                businessId,
                                source: "redis_stale_cache_hit",
                            });
                            // Trigger background compute task if not already computing
                            const activeCached = billingProjectionCache.get(cacheKey);
                            if (!activeCached?.promise) {
                                const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                                    cacheKey,
                                    label: "billing_projection",
                                    businessId,
                                    computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                                    task: () => BillingController.buildBillingResponse(businessId, req, { lightweight }),
                                });
                                const sharedProjectionPromise = computeProjection
                                    .then((value) => {
                                    const updatedAt = Date.now();
                                    billingProjectionCache.set(cacheKey, {
                                        value,
                                        updatedAt,
                                        expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                                    });
                                    void writeRedisBillingProjectionSnapshot(cacheKey, value);
                                    return value;
                                })
                                    .catch((error) => {
                                    billingProjectionCache.delete(cacheKey);
                                    throw error;
                                });
                                billingProjectionCache.set(cacheKey, {
                                    expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                                    value: redisSnapshot.data,
                                    updatedAt: redisSnapshot.updatedAt,
                                    promise: sharedProjectionPromise,
                                });
                            }
                            return res.json(markBillingSnapshotAsStale(redisSnapshot.data, "stale_revalidate"));
                        }
                    }
                }
                const activeCached = billingProjectionCache.get(cacheKey);
                if (activeCached?.promise) {
                    projectionPromise = activeCached.promise;
                    emitProjectionTelemetry({
                        name: "projection_deduped",
                        value: 1,
                        businessId,
                        metadata: {
                            cache: "memory_billing_projection",
                        },
                    });
                }
                else {
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "CACHE_MISS",
                        businessId,
                        route: "billing_projection",
                        metadata: {
                            cache: "memory_billing_projection",
                        },
                    });
                    const computeProjection = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                        cacheKey,
                        label: "billing_projection",
                        businessId,
                        computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                        task: () => BillingController.buildBillingResponse(businessId, req, { lightweight }),
                    });
                    const sharedProjectionPromise = computeProjection
                        .then((value) => {
                        const updatedAt = Date.now();
                        billingProjectionCache.set(cacheKey, {
                            value,
                            updatedAt,
                            expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                        });
                        void writeRedisBillingProjectionSnapshot(cacheKey, value);
                        return value;
                    })
                        .catch((error) => {
                        billingProjectionCache.delete(cacheKey);
                        throw error;
                    });
                    billingProjectionCache.set(cacheKey, {
                        expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                        value: staleCacheValue,
                        updatedAt: staleCacheUpdatedAt || Date.now(),
                        promise: sharedProjectionPromise,
                    });
                    projectionPromise = sharedProjectionPromise;
                }
                if (lightweight && staleCacheValue) {
                    return res.status(200).json(markBillingSnapshotAsStale(staleCacheValue, "stale_revalidate"));
                }
                const staleAgeMs = staleCacheUpdatedAt > 0 ? Date.now() - staleCacheUpdatedAt : Number.POSITIVE_INFINITY;
                if (staleCacheValue &&
                    staleAgeMs <= BILLING_PROJECTION_STALE_MAX_AGE_MS &&
                    waitBudgetMs < 1400) {
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "TIMEOUT_PREVENTED",
                        value: waitBudgetMs,
                        businessId,
                        route: "billing_projection",
                        metadata: {
                            reason: "stale_snapshot_served",
                            staleAgeMs,
                        },
                    });
                    emitProjectionTelemetry({
                        name: "projection_cache_hit",
                        value: 1,
                        businessId,
                        metadata: {
                            cache: "stale_billing_projection",
                            stale: true,
                            staleAgeMs,
                        },
                    });
                    return res.status(200).json(markBillingSnapshotAsStale(staleCacheValue, "stale_revalidate"));
                }
            }
            if (lightweight) {
                if (cacheKey) {
                    const lkvSub = prewarmState_1.prewarmState.lastKnownValidSubscription.get(businessId);
                    const lkvBill = prewarmState_1.prewarmState.lastKnownValidBilling.get(businessId);
                    if (lkvSub && lkvBill) {
                        const prewarmFallback = {
                            success: true,
                            subscription: lkvSub,
                            billing: lkvBill,
                            usage: EMPTY_USAGE_SUMMARY,
                            currency: lkvSub.currency || (0, billingGeo_service_1.resolveBillingCurrency)(req),
                            invoices: [],
                            meta: {
                                degraded: true,
                                reason: "lightweight_prewarm_lkv",
                            },
                        };
                        return res.status(200).json(prewarmFallback);
                    }
                    const degradedResponse = await BillingController.buildDegradedBillingResponse({
                        req,
                        fallbackValue: undefined,
                        reason: "lightweight_degraded_sync",
                    });
                    return res.status(200).json(degradedResponse);
                }
                else {
                    return res.status(200).json({
                        success: true,
                        subscription: null,
                        billing: EMPTY_BILLING_CONTEXT,
                        usage: EMPTY_USAGE_SUMMARY,
                        currency: (0, billingGeo_service_1.resolveBillingCurrency)(req),
                        invoices: [],
                        meta: {
                            degraded: false,
                            reason: null,
                        },
                    });
                }
            }
            if (!projectionPromise) {
                projectionPromise = (0, projectionCoordinator_service_1.runProjectionComputeTask)({
                    cacheKey: cacheKey || `billing:anon:${String(req.requestId || "unknown")}`,
                    label: "billing_projection",
                    businessId,
                    computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                    task: () => BillingController.buildBillingResponse(businessId, req, { lightweight }),
                });
            }
            const projection = await waitForBillingProjection(projectionPromise, waitBudgetMs, (0, requestLifecycle_1.getRequestAbortSignal)({ req, res }));
            if (projection.cancelled) {
                emitProjectionTelemetry({
                    name: "projection_cancelled",
                    value: 1,
                    businessId,
                    metadata: {
                        reason: "request_aborted",
                    },
                });
                if (staleCacheValue && !isResponseCommitted(res)) {
                    return res.status(200).json(markBillingSnapshotAsStale(staleCacheValue, "projection_request_cancelled"));
                }
                return;
            }
            if (!hasProjectionValue(projection)) {
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "TIMEOUT_PREVENTED",
                    value: waitBudgetMs,
                    businessId,
                    route: "billing_projection",
                    metadata: {
                        timeoutMs: waitBudgetMs,
                        reason: "projection_wait_budget_exceeded",
                    },
                });
                emitProjectionTelemetry({
                    name: "projection_budget_exceeded",
                    value: 1,
                    businessId,
                    metadata: {
                        timeoutMs: waitBudgetMs,
                        reason: "projection_wait_budget_exceeded",
                    },
                });
                if (isResponseCommitted(res)) {
                    return;
                }
                if (staleCacheValue) {
                    return res.status(200).json(markBillingSnapshotAsStale(staleCacheValue, "projection_timeout_stale"));
                }
                const degradedResponse = await BillingController.buildDegradedBillingResponse({
                    req,
                    fallbackValue: staleCacheValue,
                    reason: "projection_timeout",
                });
                return res.status(200).json(degradedResponse);
            }
            if (isRequestLifecycleClosed(req, res)) {
                return;
            }
            const value = projection.value;
            console.info("BILLING_STAGE_OK", {
                stage: "billing_projection.ready",
                businessId,
                invoiceCount: Array.isArray(value.invoices)
                    ? value.invoices.length
                    : 0,
                hasSubscription: Boolean(value.subscription),
                source: "projection",
            });
            if (isResponseCommitted(res)) {
                return;
            }
            return res.json(value);
        }
        catch (error) {
            if (isRequestLifecycleClosed(req, res) || isResponseCommitted(res)) {
                return;
            }
            if (String(error?.message || "").includes("projection_budget_exceeded")) {
                emitProjectionTelemetry({
                    name: "projection_budget_exceeded",
                    value: 1,
                    businessId: BillingController.getBusinessIdFromRequest(req),
                    metadata: {
                        reason: String(error?.message || "projection_budget_exceeded"),
                    },
                });
            }
            if (error?.message === "Unauthorized") {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }
            console.error("BILLING_STAGE_FAIL", {
                stage: "billing.fetch",
                reason: String(error?.message || "billing_unavailable"),
            });
            res.setHeader("Cache-Control", "no-store");
            return res.status(503).json({
                success: false,
                message: "Billing projection is temporarily unavailable.",
            });
        }
    }
    static async checkout(req, res) {
        return BillingController.handleCheckout(req, res);
    }
    static async createCheckoutSession(req, res) {
        return BillingController.handleCheckout(req, res);
    }
    static async startCheckoutRedirect(req, res) {
        return BillingController.handleCheckout(req, res, {
            redirectOnSuccess: true,
        });
    }
    static async confirmCheckout(req, res) {
        const sessionId = String(req.query.session_id || req.body?.session_id || "").trim();
        const businessId = BillingController.getBusinessIdFromRequest(req);
        const respond = (payload) => {
            res.setHeader("Cache-Control", "no-store");
            return res.status(200).json({
                success: true,
                data: payload,
            });
        };
        console.info("BILLING_START", {
            stage: "checkout_confirm",
            businessId,
            sessionId: sessionId || null,
        });
        if (!sessionId) {
            console.error("BILLING_STAGE_FAIL", {
                stage: "checkout_confirm.validate",
                businessId,
                sessionId: null,
                reason: "session_id_missing",
            });
            return respond(BillingController.buildConfirmPayload({
                state: "FAILED",
                lifecycleState: "FAILED_TERMINAL",
                sessionId: "",
                message: "session_id is required",
                shouldPoll: false,
                reason: "session_id_missing",
                code: "SESSION_ID_MISSING",
            }));
        }
        if (!businessId) {
            console.error("BILLING_STAGE_FAIL", {
                stage: "checkout_confirm.validate",
                businessId: null,
                sessionId,
                reason: "business_context_missing",
            });
            return respond(BillingController.buildConfirmPayload({
                state: "FAILED",
                lifecycleState: "FAILED_TERMINAL",
                sessionId,
                message: "Business context is required",
                shouldPoll: false,
                reason: "business_context_missing",
                code: "BUSINESS_CONTEXT_MISSING",
            }));
        }
        try {
            const paymentIntent = await BillingController.findCheckoutIntentForSession({
                businessId,
                sessionId,
            });
            if (!paymentIntent) {
                let instantSession = null;
                try {
                    (0, stripeConfig_service_1.assertStripeConfigReady)();
                    instantSession = await stripe_service_1.stripe.checkout.sessions.retrieve(sessionId);
                }
                catch (error) {
                    console.error("BILLING_STAGE_FAIL", {
                        stage: "checkout_confirm.instant_session_retrieve",
                        businessId,
                        sessionId,
                        reason: String(error?.message || "instant_session_unavailable"),
                    });
                }
                if (instantSession) {
                    const instantActivation = await BillingController.activateInstantCheckoutSession({
                        businessId,
                        session: instantSession,
                    });
                    if (instantActivation.activated) {
                        console.info("BILLING_STAGE_OK", {
                            stage: "checkout_confirm.instant_activated",
                            businessId,
                            sessionId,
                            subscriptionId: instantActivation.subscriptionId || null,
                            planCode: instantActivation.planCode || null,
                        });
                        return respond(BillingController.buildConfirmPayload({
                            state: "SUCCESS",
                            lifecycleState: "CONFIRMED",
                            sessionId,
                            message: "Payment confirmed and your subscription is active.",
                            shouldPoll: false,
                            reason: "instant_checkout_activated",
                            code: "INSTANT_CHECKOUT_ACTIVATED",
                        }));
                    }
                    if (!instantActivation.terminal) {
                        console.info("BILLING_STAGE_OK", {
                            stage: "checkout_confirm.instant_pending",
                            businessId,
                            sessionId,
                            reason: instantActivation.reason,
                        });
                        return respond(BillingController.buildConfirmPayload({
                            state: "PENDING",
                            lifecycleState: "PROCESSING",
                            sessionId,
                            message: "Payment is still being confirmed by Stripe.",
                            shouldPoll: true,
                            retryAfterMs: 1200,
                            reason: instantActivation.reason,
                            code: "INSTANT_CHECKOUT_PENDING",
                        }));
                    }
                }
                console.error("BILLING_STAGE_FAIL", {
                    stage: "checkout_confirm.lookup",
                    businessId,
                    sessionId,
                    reason: "checkout_session_not_found",
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "FAILED",
                    lifecycleState: "FAILED_TERMINAL",
                    sessionId,
                    message: "Checkout session could not be matched with your workspace.",
                    shouldPoll: false,
                    reason: "checkout_session_not_found",
                    code: "CHECKOUT_SESSION_NOT_FOUND",
                }));
            }
            const status = String(paymentIntent.status || "")
                .trim()
                .toUpperCase();
            const confirmState = getCheckoutConfirmState(paymentIntent.metadata);
            const alreadyProcessed = status === "SUCCEEDED" ||
                confirmState === "SUCCESS" ||
                confirmState === "ALREADY_PROCESSED";
            if (alreadyProcessed) {
                console.info("BILLING_STAGE_OK", {
                    stage: "checkout_confirm.already_processed",
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    status,
                    confirmState,
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "ALREADY_PROCESSED",
                    lifecycleState: "CONFIRMED",
                    sessionId,
                    message: "Payment confirmation is already complete.",
                    shouldPoll: false,
                    reason: "already_processed",
                    code: "ALREADY_PROCESSED",
                }));
            }
            if (TERMINAL_PAYMENT_INTENT_STATUSES.has(status)) {
                console.error("BILLING_STAGE_FAIL", {
                    stage: "checkout_confirm.terminal",
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    status,
                    reason: "payment_intent_terminal_non_success",
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "FAILED",
                    lifecycleState: "FAILED_TERMINAL",
                    sessionId,
                    message: "Checkout confirmation cannot continue for this session.",
                    shouldPoll: false,
                    reason: "payment_intent_terminal_non_success",
                    code: "PAYMENT_INTENT_TERMINAL",
                }));
            }
            const confirmInFlightKey = `${businessId}:${sessionId}`;
            const activeConfirmInFlight = checkoutConfirmInFlight.get(confirmInFlightKey);
            if (activeConfirmInFlight &&
                Date.now() - activeConfirmInFlight.startedAt <=
                    CHECKOUT_CONFIRM_IN_FLIGHT_WINDOW_MS) {
                console.info("BILLING_STAGE_OK", {
                    stage: "checkout_confirm.pending",
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    reason: "confirm_inflight_deduped",
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "PENDING",
                    lifecycleState: "PROCESSING",
                    sessionId,
                    message: "Payment verification is already in progress.",
                    shouldPoll: true,
                    retryAfterMs: 900,
                    reason: "confirm_inflight_deduped",
                    code: "CONFIRM_INFLIGHT_DEDUPED",
                }));
            }
            if (isCheckoutConfirmStillProcessing(paymentIntent.metadata)) {
                console.info("BILLING_STAGE_OK", {
                    stage: "checkout_confirm.pending",
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    reason: "duplicate_confirm",
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "PENDING",
                    lifecycleState: "PROCESSING",
                    sessionId,
                    message: "Payment is already being verified.",
                    shouldPoll: true,
                    retryAfterMs: 1000,
                    reason: "duplicate_confirm",
                    code: "DUPLICATE_CONFIRM",
                }));
            }
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent,
                sessionId,
                state: "PROCESSING",
                reason: "queued_for_async_confirmation",
            });
            if (status === "CREATED" || status === "REQUIRES_ACTION") {
                await paymentIntent_service_1.paymentIntentService
                    .transitionPaymentIntentStatus({
                    paymentIntentId: paymentIntent.id,
                    nextStatus: "PROCESSING",
                    metadata: {
                        manualConfirmSessionId: sessionId,
                        manualConfirmQueuedAt: new Date().toISOString(),
                    },
                })
                    .catch(() => undefined);
            }
            const inFlightPromise = BillingController.finalizeCheckoutConfirmationAsync({
                businessId,
                sessionId,
                paymentIntent,
            })
                .catch((error) => {
                console.error("BILLING_STAGE_FAIL", {
                    stage: "checkout_confirm.async",
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    reason: String(error?.message || "confirm_async_failed"),
                });
            })
                .finally(() => {
                const active = checkoutConfirmInFlight.get(confirmInFlightKey);
                if (active?.promise === inFlightPromise) {
                    checkoutConfirmInFlight.delete(confirmInFlightKey);
                }
            });
            checkoutConfirmInFlight.set(confirmInFlightKey, {
                startedAt: Date.now(),
                promise: inFlightPromise,
            });
            void inFlightPromise;
            console.info("BILLING_STAGE_OK", {
                stage: "checkout_confirm.pending",
                businessId,
                sessionId,
                paymentIntentKey: paymentIntent.paymentIntentKey,
                reason: "queued_for_async_confirmation",
            });
            return respond(BillingController.buildConfirmPayload({
                state: "PENDING",
                lifecycleState: "PROCESSING",
                sessionId,
                message: "Payment is being verified. We will activate your plan shortly.",
                shouldPoll: true,
                retryAfterMs: 1200,
                reason: "queued_for_async_confirmation",
                code: "CONFIRM_QUEUED",
            }));
        }
        catch (error) {
            console.error("BILLING_STAGE_FAIL", {
                stage: "checkout_confirm.exception",
                businessId,
                sessionId,
                reason: String(error?.message || "confirm_failed"),
            });
            return respond(BillingController.buildConfirmPayload({
                state: "FAILED",
                lifecycleState: "PROCESSING",
                sessionId,
                message: "Checkout confirmation is temporarily unavailable. Please retry.",
                shouldPoll: true,
                retryAfterMs: 1200,
                reason: String(error?.message || "confirm_failed"),
                code: "CONFIRM_FAILED",
            }));
        }
    }
    static async createPortal(req, res) {
        try {
            const { businessId, email } = await getUserContext(req);
            if (!businessId) {
                return res.status(403).json({
                    success: false,
                    message: "Business context is required",
                });
            }
            const subscription = await prisma_1.default.subscriptionLedger.findFirst({
                where: {
                    businessId,
                    provider: "STRIPE",
                    status: {
                        in: ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"],
                    },
                },
                orderBy: {
                    updatedAt: "desc",
                },
            });
            if (!subscription) {
                return res.status(400).json({
                    success: false,
                    message: "No Stripe subscription found",
                });
            }
            (0, stripeConfig_service_1.assertStripeConfigReady)();
            const subscriptionMetadata = subscription.metadata &&
                typeof subscription.metadata === "object" &&
                !Array.isArray(subscription.metadata)
                ? subscription.metadata
                : {};
            let stripeCustomerId = String(req.body?.customerId || subscriptionMetadata.stripeCustomerId || "").trim() ||
                null;
            if (!stripeCustomerId) {
                const recentPaymentIntent = await prisma_1.default.paymentIntentLedger.findFirst({
                    where: {
                        businessId,
                        provider: "STRIPE",
                        status: "SUCCEEDED",
                    },
                    orderBy: {
                        updatedAt: "desc",
                    },
                    select: {
                        metadata: true,
                    },
                });
                const metadata = recentPaymentIntent?.metadata &&
                    typeof recentPaymentIntent.metadata === "object" &&
                    !Array.isArray(recentPaymentIntent.metadata)
                    ? recentPaymentIntent.metadata
                    : {};
                const providerMetadata = metadata.providerMetadata &&
                    typeof metadata.providerMetadata === "object" &&
                    !Array.isArray(metadata.providerMetadata)
                    ? metadata.providerMetadata
                    : {};
                stripeCustomerId =
                    String(metadata.stripeCustomerId ||
                        providerMetadata.stripeCustomerId ||
                        "").trim() || null;
            }
            if (!stripeCustomerId && subscription.providerSubscriptionId) {
                const stripeSubscription = await stripe_service_1.stripe.subscriptions
                    .retrieve(subscription.providerSubscriptionId)
                    .catch(() => null);
                stripeCustomerId =
                    typeof stripeSubscription?.customer === "string"
                        ? stripeSubscription.customer
                        : null;
            }
            if (!stripeCustomerId) {
                stripeCustomerId = await BillingController.resolveStripeCustomerIdForPortal({
                    businessId,
                    email,
                    subscriptionProviderId: subscription.providerSubscriptionId,
                });
            }
            if (!stripeCustomerId) {
                return res.status(409).json({
                    success: false,
                    message: "stripe_customer_missing_for_portal",
                });
            }
            await prisma_1.default.subscriptionLedger
                .update({
                where: {
                    id: subscription.id,
                },
                data: {
                    metadata: {
                        ...subscriptionMetadata,
                        stripeCustomerId,
                        portalLastOpenedAt: new Date().toISOString(),
                    },
                },
            })
                .catch(() => undefined);
            const returnUrl = String(req.body?.returnUrl || "").trim() ||
                env_1.env.STRIPE_BILLING_PORTAL_RETURN_URL ||
                `${env_1.env.FRONTEND_URL}/billing`;
            const session = await stripe_service_1.stripe.billingPortal.sessions.create({
                customer: stripeCustomerId,
                return_url: returnUrl,
            }, {
                idempotencyKey: `portal:${businessId}:${stripeCustomerId}`,
            });
            return res.json({
                success: true,
                url: session.url,
            });
        }
        catch (error) {
            console.error("BILLING_STAGE_FAIL", {
                stage: "portal.create",
                reason: String(error?.message || "portal_create_failed"),
            });
            if (error?.message?.includes("stripe_config_invalid")) {
                return res.status(503).json({
                    success: false,
                    code: "BILLING_PROVIDER_UNAVAILABLE",
                    message: "Billing portal is temporarily unavailable. Please retry shortly.",
                });
            }
            return res.status(500).json({
                success: false,
                message: error?.message || "billing_portal_failed",
            });
        }
    }
    static async cancelSubscription(req, res) {
        try {
            const { businessId } = await getUserContext(req);
            if (!businessId) {
                return res.status(403).json({
                    success: false,
                    message: "Business context is required",
                });
            }
            const subscription = await prisma_1.default.subscriptionLedger.findFirst({
                where: {
                    businessId,
                },
                orderBy: {
                    updatedAt: "desc",
                },
            });
            if (!subscription) {
                return res.status(400).json({
                    success: false,
                    message: "No active subscription found",
                });
            }
            await subscriptionEngine_service_1.subscriptionEngineService.applyLifecycleAction({
                businessId,
                subscriptionKey: subscription.subscriptionKey,
                action: "cancel",
                metadata: {
                    source: "billing_controller",
                    requestedBy: "SELF",
                },
            });
            await (0, subscription_middleware_1.invalidateBillingContextCache)(businessId);
            return res.json({
                success: true,
                message: "Subscription cancellation submitted",
            });
        }
        catch (error) {
            console.error("BILLING_STAGE_FAIL", {
                stage: "subscription.cancel",
                reason: String(error?.message || "subscription_cancel_failed"),
            });
            return res.status(500).json({
                success: false,
                message: "Cancel failed",
            });
        }
    }
    static async upgradePlan(req, res) {
        return BillingController.handleCheckout(req, res);
    }
}
exports.BillingController = BillingController;
