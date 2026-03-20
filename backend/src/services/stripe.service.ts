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
});

/* ============================= */
/* TYPES */
/* ============================= */

type Currency = "INR" | "USD";
type Billing = "monthly" | "yearly";
type Plan = "BASIC" | "PRO" | "ELITE";

/* ============================= */
/* PRICE MAP */
/* ============================= */

const PRICE_MAP = {
  BASIC: { /* same as yours */ },
  PRO: { /* same as yours */ },
  ELITE: { /* same as yours */ },
} as const;

/* ============================= */
/* 🔥 EARLY USER (CACHED SAFE)
================================ */

let earlyUserCache: { value: boolean; expires: number } | null = null;

const isEarlyUser = async () => {
  if (earlyUserCache && earlyUserCache.expires > Date.now()) {
    return earlyUserCache.value;
  }

  const count = await prisma.subscription.count({
    where: { status: "ACTIVE" },
  });

  const value = count < 20;

  earlyUserCache = {
    value,
    expires: Date.now() + 60 * 1000, // cache 1 min
  };

  return value;
};

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
/* 🔥 VALIDATE PLAN
================================ */

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

  const early = await isEarlyUser();

  const price =
    PRICE_MAP[plan][currency][billing][
      early ? "early" : "normal"
    ];

  if (!price) throw new Error("Price ID not found");

  return price;
};

/* ============================= */
/* CREATE CHECKOUT */
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
  /* 🔥 CURRENCY LOCK */
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
  /* 🔥 CUSTOMER (SAFE)
================================ */

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
  /* PRICE */
  /* ============================= */

  const priceId = await getPriceId(plan, billing, finalCurrency);

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
  /* TRIAL */
  /* ============================= */

  const isTrialEligible =
    existingSub?.isTrial && !existingSub?.trialUsed;

  /* ============================= */
  /* 🔥 IDEMPOTENCY KEY */
  /* ============================= */

  const idempotencyKey = `${businessId}_${plan}_${billing}`;

  /* ============================= */
  /* CHECKOUT */
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

      customer_update: {
        address: "auto",
      },

      billing_address_collection: "required",

      ...getTaxConfig(finalCurrency),

      discounts,

      subscription_data: {
        trial_period_days: isTrialEligible ? 7 : undefined,
      },

      metadata: {
        businessId,
        plan,
        billing,
        currency: finalCurrency,
      },

      success_url: `${env.FRONTEND_URL}/billing/success`,
      cancel_url: `${env.FRONTEND_URL}/billing`,
    },
    {
      idempotencyKey,
    }
  );

  /* ============================= */
  /* FREE PLAN FETCH */
  /* ============================= */

  let freePlan = await prisma.plan.findFirst({
    where: { type: "FREE" },
  });

  if (!freePlan) {
    throw new Error("Free plan not found");
  }

  /* ============================= */
  /* 🔥 SAFE UPSERT (NO STATUS BREAK)
================================ */

  await prisma.subscription.upsert({
    where: { businessId },

    update: {
      stripeCustomerId: customerId,
      currency: finalCurrency,
      billingCycle: billing,
    },

    create: {
      businessId,
      planId: freePlan.id,
      stripeCustomerId: customerId,
      currency: finalCurrency,
      billingCycle: billing,
      status: "INACTIVE",
    },
  });

  return session;
};