import Stripe from "stripe";
import { env } from "../config/env";
import prisma from "../config/prisma";
import { Request } from "express";
import { applyCoupon } from "./coupon.service";
import { getTaxConfig } from "./tax.service";

/* ============================= */
/* STRIPE INIT */
/* ============================= */

export const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16" as any,
  timeout: 10000,
});

/* ============================= */
/* TYPES */
/* ============================= */

type Currency = "INR" | "USD";
type Billing = "monthly" | "yearly";
type Plan = "BASIC" | "PRO" | "ELITE";

/* ============================= */
/* GEO DETECTION */
/* ============================= */

const detectCurrency = (req: Request): Currency => {
  const country =
    req.headers["x-country"] ||
    req.headers["cf-ipcountry"] ||
    req.headers["x-vercel-ip-country"];

  return country === "IN" ? "INR" : "USD";
};

/* ============================= */
/* VALIDATE PLAN */
/* ============================= */

const validatePlan = (plan: string): Plan => {
  const allowed: Plan[] = ["BASIC", "PRO", "ELITE"];

  if (!allowed.includes(plan as Plan)) {
    throw new Error("Invalid plan selected");
  }

  return plan as Plan;
};

/* ============================= */
/* GET PRICE */
/* ============================= */

const getPriceId = async (
  plan: Plan,
  billing: Billing,
  currency: Currency
): Promise<string> => {
  const key = `STRIPE_${plan}_${currency}_${billing.toUpperCase()}`;
  const price = process.env[key];

  if (!price) {
    throw new Error(`Missing Stripe price for ${key}`);
  }

  return price;
};

/* ============================= */
/* CREATE / UPGRADE SESSION */
/* ============================= */

export const createCheckoutSession = async (
  email: string,
  businessId: string,
  planInput: string,
  billing: Billing,
  req: Request,
  currency?: Currency,
  couponCode?: string
) => {
  const plan = validatePlan(planInput);

  const detectedCurrency = detectCurrency(req);

  const existingSub = await prisma.subscription.findUnique({
    where: { businessId },
  });

  let finalCurrency: Currency =
    currency ||
    (existingSub?.currency as Currency) ||
    detectedCurrency;

  /* ============================= */
  /* CURRENCY LOCK */
  /* ============================= */

  if (
    existingSub?.stripeSubscriptionId &&
    existingSub.currency &&
    existingSub.currency !== finalCurrency
  ) {
    throw new Error(
      "Currency cannot be changed for active paid subscription"
    );
  }

  /* ============================= */
  /* CUSTOMER */
  /* ============================= */

  let customerId: string;

  if (existingSub?.stripeCustomerId) {
    customerId = existingSub.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email,
      metadata: { businessId },
    });

    customerId = customer.id;
  }

  /* ============================= */
  /* 🔥 EARLY PRICING LOGIC */
  /* ============================= */

  const planData = await prisma.plan.findUnique({
    where: { type: plan },
  });

  if (!planData) {
    throw new Error("Plan not found");
  }

  const allPlans = await prisma.plan.findMany({
    select: { earlyUsed: true },
  });

  const totalEarlyUsed = allPlans.reduce(
    (acc, p) => acc + (p.earlyUsed || 0),
    0
  );

  const earlyLimit = 20;

  const hasPaidBefore = !!existingSub?.stripeSubscriptionId;

  const allowEarly = totalEarlyUsed < earlyLimit && !hasPaidBefore;

  let priceKey: string;

  if (billing === "monthly") {
    priceKey = allowEarly
      ? `STRIPE_${plan}_${finalCurrency}_MONTHLY_EARLY`
      : `STRIPE_${plan}_${finalCurrency}_MONTHLY`;
  } else {
    priceKey = allowEarly
      ? `STRIPE_${plan}_${finalCurrency}_YEARLY_EARLY`
      : `STRIPE_${plan}_${finalCurrency}_YEARLY`;
  }

  const priceId = process.env[priceKey];

  if (!priceId) {
    throw new Error(`Missing Stripe price for ${priceKey}`);
  }

  /* ============================= */
  /* 🔥 UPGRADE FIX (REAL SAAS) */
  /* ============================= */

  if (existingSub?.stripeSubscriptionId) {
    const stripeSub = await stripe.subscriptions.retrieve(
      existingSub.stripeSubscriptionId
    );

    const itemId = stripeSub.items.data[0]?.id;

    if (itemId) {
      await stripe.subscriptions.update(existingSub.stripeSubscriptionId, {
        items: [
          {
            id: itemId,
            price: priceId,
          },
        ],
        proration_behavior: "create_prorations",
      });

      return {
        url: `${env.FRONTEND_URL}/billing`,
      };
    }
  }

  /* ============================= */
  /* COUPON */
  /* ============================= */

  let discounts;

  if (couponCode) {
    try {
      const couponId = await applyCoupon(couponCode);
      discounts = [{ coupon: couponId }];
    } catch {
      throw new Error("Invalid coupon");
    }
  }

  /* ============================= */
  /* 🔥 TRIAL LOGIC */
  /* ============================= */

  const isTrialEligible =
    !existingSub || !existingSub.trialUsed;

  /* ============================= */
  /* CREATE CHECKOUT */
  /* ============================= */

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      billing_address_collection: "required",

      ...getTaxConfig(finalCurrency),

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

      success_url: `${env.FRONTEND_URL}/billing/success`,
      cancel_url: `${env.FRONTEND_URL}/billing`,
    } as Stripe.Checkout.SessionCreateParams
  );

  return session;
};