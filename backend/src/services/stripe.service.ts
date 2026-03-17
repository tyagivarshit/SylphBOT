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
  BASIC: {
    INR: {
      monthly: {
        normal: env.STRIPE_BASIC_INR_MONTHLY!,
        early: env.STRIPE_BASIC_INR_MONTHLY_EARLY!,
      },
      yearly: {
        normal: env.STRIPE_BASIC_INR_YEARLY!,
        early: env.STRIPE_BASIC_INR_YEARLY_EARLY!,
      },
    },
    USD: {
      monthly: {
        normal: env.STRIPE_BASIC_USD_MONTHLY!,
        early: env.STRIPE_BASIC_USD_MONTHLY_EARLY!,
      },
      yearly: {
        normal: env.STRIPE_BASIC_USD_YEARLY!,
        early: env.STRIPE_BASIC_USD_YEARLY_EARLY!,
      },
    },
  },

  PRO: {
    INR: {
      monthly: {
        normal: env.STRIPE_PRO_INR_MONTHLY!,
        early: env.STRIPE_PRO_INR_MONTHLY_EARLY!,
      },
      yearly: {
        normal: env.STRIPE_PRO_INR_YEARLY!,
        early: env.STRIPE_PRO_INR_YEARLY_EARLY!,
      },
    },
    USD: {
      monthly: {
        normal: env.STRIPE_PRO_USD_MONTHLY!,
        early: env.STRIPE_PRO_USD_MONTHLY_EARLY!,
      },
      yearly: {
        normal: env.STRIPE_PRO_USD_YEARLY!,
        early: env.STRIPE_PRO_USD_YEARLY_EARLY!,
      },
    },
  },

  ELITE: {
    INR: {
      monthly: {
        normal: env.STRIPE_ELITE_INR_MONTHLY!,
        early: env.STRIPE_ELITE_INR_MONTHLY_EARLY!,
      },
      yearly: {
        normal: env.STRIPE_ELITE_INR_YEARLY!,
        early: env.STRIPE_ELITE_INR_YEARLY_EARLY!,
      },
    },
    USD: {
      monthly: {
        normal: env.STRIPE_ELITE_USD_MONTHLY!,
        early: env.STRIPE_ELITE_USD_MONTHLY_EARLY!,
      },
      yearly: {
        normal: env.STRIPE_ELITE_USD_YEARLY!,
        early: env.STRIPE_ELITE_USD_YEARLY_EARLY!,
      },
    },
  },
} as const;

/* ============================= */
/* EARLY USER */
/* ============================= */

const isEarlyUser = async () => {
  const count = await prisma.subscription.count({
    where: { status: "ACTIVE" },
  });
  return count < 20;
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
  plan: Plan,
  billing: Billing,
  req: Request,
  currency?: Currency,
  couponCode?: string
) => {

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
    existingSub?.currency &&
    existingSub.currency !== detectedCurrency
  ) {
    throw new Error(
      "Currency cannot be changed once subscription is started"
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
  /* PRICE */
  /* ============================= */

  const priceId = await getPriceId(plan, billing, finalCurrency);

  /* ============================= */
  /* COUPON */
  /* ============================= */

  let discounts;

  if (couponCode) {
    const couponId = await applyCoupon(couponCode);
    discounts = [{ coupon: couponId }];
  }

  /* ============================= */
  /* CHECKOUT */
  /* ============================= */

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",

    customer: customerId,

    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],

    ...getTaxConfig(finalCurrency),

    discounts,

    subscription_data: {
      trial_period_days: existingSub?.trialUsed ? undefined : 7,
      proration_behavior: "create_prorations",
    },

    metadata: {
      businessId,
      plan,
      planType: plan,
      billing,
      currency: finalCurrency,
    },

    success_url: `${env.FRONTEND_URL}/billing/success`,
    cancel_url: `${env.FRONTEND_URL}/billing`,
  });

  /* ============================= */
  /* SAVE */
  /* ============================= */

  await prisma.subscription.upsert({
    where: { businessId },
    update: {
      stripeCustomerId: customerId,
      currency: finalCurrency,
      billingCycle: billing,
    },
    create: {
      businessId,
      planId: "" as any,
      stripeCustomerId: customerId,
      currency: finalCurrency,
      billingCycle: billing,
      status: "INACTIVE",
    },
  });

  return session;
};