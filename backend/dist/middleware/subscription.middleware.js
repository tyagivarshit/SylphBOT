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
const getCachedSubscription = async (businessId) => {
    const cacheKey = getKey(businessId);
    const cached = await redis_1.default.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }
    const subscription = await prisma_1.default.subscription.findUnique({
        where: { businessId },
        include: { plan: true },
    });
    if (subscription) {
        await redis_1.default.set(cacheKey, JSON.stringify(subscription), "EX", CACHE_TTL);
    }
    return subscription;
};
const getEarlyAccessSnapshot = async (subscription) => {
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
};
const loadBillingContext = async (businessId) => {
    const subscription = await getCachedSubscription(businessId);
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
    const earlyAccess = await getEarlyAccessSnapshot(subscription);
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
