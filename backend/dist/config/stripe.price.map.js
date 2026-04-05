"use strict";
/* ======================================
🔥 STRIPE PRICE → PLAN MAPPING
(SINGLE SOURCE OF TRUTH)
====================================== */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlanFromPrice = exports.PRICE_TO_PLAN = void 0;
/* ======================================
🔥 PRICE → PLAN MAP
====================================== */
exports.PRICE_TO_PLAN = {
    /* ======================
    BASIC
    ====================== */
    [process.env.STRIPE_BASIC_INR_MONTHLY]: "BASIC",
    [process.env.STRIPE_BASIC_INR_YEARLY]: "BASIC",
    [process.env.STRIPE_BASIC_INR_MONTHLY_EARLY]: "BASIC",
    [process.env.STRIPE_BASIC_INR_YEARLY_EARLY]: "BASIC",
    [process.env.STRIPE_BASIC_USD_MONTHLY]: "BASIC",
    [process.env.STRIPE_BASIC_USD_YEARLY]: "BASIC",
    [process.env.STRIPE_BASIC_USD_MONTHLY_EARLY]: "BASIC",
    [process.env.STRIPE_BASIC_USD_YEARLY_EARLY]: "BASIC",
    /* ======================
    PRO
    ====================== */
    [process.env.STRIPE_PRO_INR_MONTHLY]: "PRO",
    [process.env.STRIPE_PRO_INR_YEARLY]: "PRO",
    [process.env.STRIPE_PRO_INR_MONTHLY_EARLY]: "PRO",
    [process.env.STRIPE_PRO_INR_YEARLY_EARLY]: "PRO",
    [process.env.STRIPE_PRO_USD_MONTHLY]: "PRO",
    [process.env.STRIPE_PRO_USD_YEARLY]: "PRO",
    [process.env.STRIPE_PRO_USD_MONTHLY_EARLY]: "PRO",
    [process.env.STRIPE_PRO_USD_YEARLY_EARLY]: "PRO",
    /* ======================
    ELITE
    ====================== */
    [process.env.STRIPE_ELITE_INR_MONTHLY]: "ELITE",
    [process.env.STRIPE_ELITE_INR_YEARLY]: "ELITE",
    [process.env.STRIPE_ELITE_INR_MONTHLY_EARLY]: "ELITE",
    [process.env.STRIPE_ELITE_INR_YEARLY_EARLY]: "ELITE",
    [process.env.STRIPE_ELITE_USD_MONTHLY]: "ELITE",
    [process.env.STRIPE_ELITE_USD_YEARLY]: "ELITE",
    [process.env.STRIPE_ELITE_USD_MONTHLY_EARLY]: "ELITE",
    [process.env.STRIPE_ELITE_USD_YEARLY_EARLY]: "ELITE",
};
/* ======================================
🔥 SAFE GETTER (VERY IMPORTANT)
====================================== */
const getPlanFromPrice = (priceId) => {
    if (!priceId)
        return null;
    const plan = exports.PRICE_TO_PLAN[priceId];
    if (!plan) {
        console.error("❌ Unknown Stripe priceId:", priceId);
        return null;
    }
    return plan;
};
exports.getPlanFromPrice = getPlanFromPrice;
