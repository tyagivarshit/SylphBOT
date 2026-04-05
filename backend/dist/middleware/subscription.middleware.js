"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachBillingContext = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const ioredis_1 = __importDefault(require("ioredis"));
const plan_config_1 = require("../config/plan.config");
const redis = new ioredis_1.default(process.env.REDIS_URL);
const CACHE_TTL = 60 * 3;
const getKey = (businessId) => `sub:${businessId}`;
const attachBillingContext = async (req, res, next) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({
                code: "UNAUTHORIZED",
                message: "Unauthorized",
            });
        }
        let subscription = null;
        const cacheKey = getKey(businessId);
        const cached = await redis.get(cacheKey);
        if (cached) {
            subscription = JSON.parse(cached);
        }
        else {
            subscription = await prisma_1.default.subscription.findUnique({
                where: { businessId },
                include: { plan: true },
            });
            if (subscription) {
                await redis.set(cacheKey, JSON.stringify(subscription), "EX", CACHE_TTL);
            }
        }
        const now = new Date();
        let context = {
            subscription: null,
            plan: null,
            planKey: "FREE_LOCKED",
            status: "INACTIVE",
            isLimited: true,
            upgradeRequired: true,
            allowEarly: false,
            remainingEarly: 0,
        };
        if (subscription && subscription.plan) {
            const planKey = (0, plan_config_1.getPlanKey)(subscription.plan);
            context = {
                subscription,
                plan: subscription.plan,
                planKey,
                status: "ACTIVE",
                isLimited: false,
                upgradeRequired: false,
                allowEarly: false,
                remainingEarly: 0,
            };
            /* ============================= */
            /* TRIAL */
            /* ============================= */
            if (subscription.isTrial) {
                if (subscription.currentPeriodEnd &&
                    now <= new Date(subscription.currentPeriodEnd)) {
                    context.status = "TRIAL";
                }
                else {
                    context.status = "INACTIVE";
                    context.planKey = "FREE_LOCKED";
                    context.isLimited = true;
                    context.upgradeRequired = true;
                }
            }
            /* ============================= */
            /* GRACE PERIOD */
            /* ============================= */
            if (subscription.status === "PAST_DUE") {
                if (subscription.graceUntil &&
                    now <= new Date(subscription.graceUntil)) {
                    context.status = "ACTIVE";
                }
                else {
                    context.status = "INACTIVE";
                    context.planKey = "FREE_LOCKED";
                    context.isLimited = true;
                    context.upgradeRequired = true;
                }
            }
            /* ============================= */
            /* CANCELLED */
            /* ============================= */
            if (subscription.status === "CANCELLED") {
                context.status = "INACTIVE";
                context.planKey = "FREE_LOCKED";
                context.isLimited = true;
                context.upgradeRequired = true;
            }
        }
        /* ============================= */
        /* 🔥 EARLY PRICING LOGIC */
        /* ============================= */
        const planData = await prisma_1.default.plan.findMany({
            where: {
                type: { in: ["BASIC", "PRO", "ELITE"] },
            },
            select: {
                type: true,
                earlyUsed: true,
                earlyLimit: true,
            },
        });
        const totalEarlyUsed = planData.reduce((acc, p) => acc + (p.earlyUsed || 0), 0);
        const earlyLimit = 20;
        const hasPaidBefore = !!subscription?.stripeSubscriptionId;
        const allowEarly = totalEarlyUsed < earlyLimit && !hasPaidBefore;
        const remainingEarly = Math.max(earlyLimit - totalEarlyUsed, 0);
        context.allowEarly = allowEarly;
        context.remainingEarly = remainingEarly;
        /* ============================= */
        req.subscription = subscription;
        req.billing = context;
        next();
    }
    catch (error) {
        console.error("❌ Subscription Middleware Error:", error);
        return res.status(500).json({
            message: "Server error",
        });
    }
};
exports.attachBillingContext = attachBillingContext;
