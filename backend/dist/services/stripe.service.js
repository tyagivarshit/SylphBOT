"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = exports.stripe = void 0;
const stripe_1 = __importDefault(require("stripe"));
const env_1 = require("../config/env");
const prisma_1 = __importDefault(require("../config/prisma"));
const coupon_service_1 = require("./coupon.service");
const tax_service_1 = require("./tax.service");
/* ============================= */
/* STRIPE INIT */
/* ============================= */
exports.stripe = new stripe_1.default(env_1.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
    timeout: 10000,
});
/* ============================= */
/* GEO DETECTION */
/* ============================= */
const detectCurrency = (req) => {
    const country = req.headers["x-country"] ||
        req.headers["cf-ipcountry"] ||
        req.headers["x-vercel-ip-country"];
    return country === "IN" ? "INR" : "USD";
};
/* ============================= */
/* VALIDATE PLAN */
/* ============================= */
const validatePlan = (plan) => {
    const allowed = ["BASIC", "PRO", "ELITE"];
    if (!allowed.includes(plan)) {
        throw new Error("Invalid plan selected");
    }
    return plan;
};
/* ============================= */
/* GET PRICE */
/* ============================= */
const getPriceId = async (plan, billing, currency) => {
    const key = `STRIPE_${plan}_${currency}_${billing.toUpperCase()}`;
    const price = env_1.env[key];
    if (!price) {
        throw new Error(`Missing Stripe price for ${key}`);
    }
    return price;
};
/* ============================= */
/* CREATE / UPGRADE SESSION */
/* ============================= */
const createCheckoutSession = async (email, businessId, planInput, billing, req, currency, couponCode) => {
    const plan = validatePlan(planInput);
    const detectedCurrency = detectCurrency(req);
    const existingSub = await prisma_1.default.subscription.findUnique({
        where: { businessId },
    });
    let finalCurrency = currency ||
        existingSub?.currency ||
        detectedCurrency;
    /* ============================= */
    /* CURRENCY LOCK */
    /* ============================= */
    if (existingSub?.stripeSubscriptionId &&
        existingSub.currency &&
        existingSub.currency !== finalCurrency) {
        throw new Error("Currency cannot be changed for active paid subscription");
    }
    /* ============================= */
    /* CUSTOMER */
    /* ============================= */
    let customerId;
    if (existingSub?.stripeCustomerId) {
        customerId = existingSub.stripeCustomerId;
    }
    else {
        const customer = await exports.stripe.customers.create({
            email,
            metadata: { businessId },
        });
        customerId = customer.id;
    }
    /* ============================= */
    /* 🔥 EARLY PRICING LOGIC */
    /* ============================= */
    const planData = await prisma_1.default.plan.findUnique({
        where: { type: plan },
    });
    if (!planData) {
        throw new Error("Plan not found");
    }
    const allPlans = await prisma_1.default.plan.findMany({
        select: { earlyUsed: true },
    });
    const totalEarlyUsed = allPlans.reduce((acc, p) => acc + (p.earlyUsed || 0), 0);
    const earlyLimit = 20;
    const hasPaidBefore = !!existingSub?.stripeSubscriptionId;
    const allowEarly = totalEarlyUsed < earlyLimit && !hasPaidBefore;
    let priceKey;
    if (billing === "monthly") {
        priceKey = allowEarly
            ? `STRIPE_${plan}_${finalCurrency}_MONTHLY_EARLY`
            : `STRIPE_${plan}_${finalCurrency}_MONTHLY`;
    }
    else {
        priceKey = allowEarly
            ? `STRIPE_${plan}_${finalCurrency}_YEARLY_EARLY`
            : `STRIPE_${plan}_${finalCurrency}_YEARLY`;
    }
    const priceId = env_1.env[priceKey];
    if (!priceId) {
        throw new Error(`Missing Stripe price for ${priceKey}`);
    }
    /* ============================= */
    /* 🔥 UPGRADE FIX (REAL SAAS) */
    /* ============================= */
    if (existingSub?.stripeSubscriptionId) {
        const stripeSub = await exports.stripe.subscriptions.retrieve(existingSub.stripeSubscriptionId);
        const itemId = stripeSub.items.data[0]?.id;
        if (itemId) {
            await exports.stripe.subscriptions.update(existingSub.stripeSubscriptionId, {
                items: [
                    {
                        id: itemId,
                        price: priceId,
                    },
                ],
                proration_behavior: "create_prorations",
            });
            return {
                url: `${env_1.env.FRONTEND_URL}/billing`,
            };
        }
    }
    /* ============================= */
    /* COUPON */
    /* ============================= */
    let discounts;
    if (couponCode) {
        try {
            const couponId = await (0, coupon_service_1.applyCoupon)(couponCode);
            discounts = [{ coupon: couponId }];
        }
        catch {
            throw new Error("Invalid coupon");
        }
    }
    /* ============================= */
    /* 🔥 TRIAL LOGIC */
    /* ============================= */
    const isTrialEligible = !existingSub || !existingSub.trialUsed;
    /* ============================= */
    /* CREATE CHECKOUT */
    /* ============================= */
    const session = await exports.stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        billing_address_collection: "required",
        ...(0, tax_service_1.getTaxConfig)(finalCurrency),
        ...(discounts ? { discounts } : {}),
        subscription_data: isTrialEligible
            ? { trial_period_days: 7 }
            : undefined,
        metadata: {
            businessId,
            plan,
            billing,
            currency: finalCurrency,
            // 🔥 SECURITY FLAGS
            usedEarly: allowEarly ? "true" : "false",
            usedTrial: isTrialEligible ? "true" : "false",
        },
        success_url: `${env_1.env.FRONTEND_URL}/billing/success`,
        cancel_url: `${env_1.env.FRONTEND_URL}/billing`,
    });
    return session;
};
exports.createCheckoutSession = createCheckoutSession;
