"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachBillingContext = exports.loadBillingContext = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = __importDefault(require("../config/redis"));
const plan_config_1 = require("../config/plan.config");
const env_1 = require("../config/env");
const CACHE_TTL = 60 * 3;
const EARLY_ACCESS_LIMIT = Number(env_1.env.EARLY_ACCESS_LIMIT || 50);
const getKey = (businessId) => `sub:${businessId}`;
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
});
const getCachedSubscription = async (businessId) => {
    const cacheKey = getKey(businessId);
    const cached = await redis_1.default.get(cacheKey).catch(() => null);
    if (cached) {
        try {
            return JSON.parse(cached);
        }
        catch {
            await redis_1.default.del(cacheKey).catch(() => undefined);
        }
    }
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
    const subscription = canonical
        ? mapCanonicalSubscription(canonical)
        : null;
    if (subscription) {
        await redis_1.default
            .set(cacheKey, JSON.stringify(subscription), "EX", CACHE_TTL)
            .catch(() => undefined);
    }
    return subscription;
};
const getEarlyAccessSnapshot = async (subscription) => {
    try {
        const plans = await prisma_1.default.plan.findMany({
            where: {
                type: {
                    in: ["BASIC", "PRO", "ELITE"],
                },
            },
            select: {
                earlyUsed: true,
            },
        });
        const totalEarlyUsed = plans.reduce((acc, plan) => acc + (plan.earlyUsed || 0), 0);
        return {
            allowEarly: totalEarlyUsed < EARLY_ACCESS_LIMIT &&
                !subscription?.stripeSubscriptionId,
            remainingEarly: Math.max(EARLY_ACCESS_LIMIT - totalEarlyUsed, 0),
        };
    }
    catch {
        return {
            allowEarly: false,
            remainingEarly: 0,
        };
    }
};
const loadBillingContext = async (businessId) => {
    const cachedSubscription = await getCachedSubscription(businessId).catch(() => null);
    const subscription = cachedSubscription;
    const now = new Date();
    let context = getBaseContext();
    if (subscription?.plan) {
        context = {
            subscription,
            plan: subscription.plan,
            planKey: (0, plan_config_1.getPlanKey)(subscription.plan),
            status: "ACTIVE",
            isLimited: false,
            upgradeRequired: false,
            allowEarly: false,
            remainingEarly: 0,
        };
        if (subscription.status === "INACTIVE") {
            context = lockContext(context);
        }
        if (subscription.status === "CANCELLED") {
            context = lockContext(context);
        }
        if (subscription.status === "PAST_DUE") {
            context =
                subscription.graceUntil &&
                    now <= new Date(subscription.graceUntil)
                    ? {
                        ...context,
                        status: "ACTIVE",
                    }
                    : lockContext(context);
        }
        if (subscription.isTrial) {
            context =
                subscription.currentPeriodEnd &&
                    now <= new Date(subscription.currentPeriodEnd)
                    ? {
                        ...context,
                        status: "TRIAL",
                    }
                    : lockContext(context);
        }
    }
    const earlyAccess = await getEarlyAccessSnapshot(subscription).catch(() => ({
        allowEarly: false,
        remainingEarly: 0,
    }));
    context.allowEarly = earlyAccess.allowEarly;
    context.remainingEarly = earlyAccess.remainingEarly;
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
