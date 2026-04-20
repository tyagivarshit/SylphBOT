import crypto from "crypto";
import { Request } from "express";
import Stripe from "stripe";
import prisma from "../config/prisma";
import redis from "../config/redis";
import { env } from "../config/env";
import { stripe } from "./stripe.service";
import { applyCoupon } from "./coupon.service";
import { getTaxConfig } from "./tax.service";
import { resolveBillingCurrency } from "./billingGeo.service";
import { mapStripeSubscriptionStatus } from "./billingSync.service";
import { getStripePriceId } from "../config/stripe.price.map";

type Currency = "INR" | "USD";
type Billing = "monthly" | "yearly";
type Plan = "BASIC" | "PRO" | "ELITE";

const EARLY_ACCESS_LIMIT = Number(env.EARLY_ACCESS_LIMIT || 50);

const UPDATABLE_SUBSCRIPTION_STATUSES = new Set<
  Stripe.Subscription.Status
>(["active", "trialing", "past_due", "unpaid"]);

const validatePlan = (plan: string): Plan => {
  const allowed: Plan[] = ["BASIC", "PRO", "ELITE"];

  if (!allowed.includes(plan as Plan)) {
    throw new Error("Invalid plan selected");
  }

  return plan as Plan;
};

const validateBilling = (billing: string): Billing => {
  if (billing !== "monthly" && billing !== "yearly") {
    throw new Error("Invalid billing cycle");
  }

  return billing;
};

const getPriceId = (
  plan: Plan,
  billing: Billing,
  currency: Currency,
  allowEarly: boolean
) => {
  const priceId = getStripePriceId({
    plan,
    billing,
    currency,
    early: allowEarly,
  });

  if (!priceId) {
    throw new Error(
      `Missing Stripe price for ${plan} ${currency} ${billing}${
        allowEarly ? " early" : ""
      }`
    );
  }

  return priceId;
};

const getOrCreateCustomerId = async (
  email: string,
  businessId: string,
  existingSub: {
    stripeCustomerId?: string | null;
  } | null
) => {
  if (existingSub?.stripeCustomerId) {
    return existingSub.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { businessId },
  });

  return customer.id;
};

const getEarlyAccessState = async (
  existingSub: {
    stripeSubscriptionId?: string | null;
  } | null
) => {
  const plans = await prisma.plan.findMany({
    where: {
      type: {
        in: ["BASIC", "PRO", "ELITE"],
      },
    },
    select: {
      earlyUsed: true,
    },
  });

  const totalEarlyUsed = plans.reduce(
    (acc, plan) => acc + (plan.earlyUsed || 0),
    0
  );

  return {
    allowEarly:
      totalEarlyUsed < EARLY_ACCESS_LIMIT &&
      !existingSub?.stripeSubscriptionId,
    remainingEarly: Math.max(
      EARLY_ACCESS_LIMIT - totalEarlyUsed,
      0
    ),
  };
};

const createCheckoutIdempotencyKey = (input: {
  businessId: string;
  plan: Plan;
  billing: Billing;
  currency: Currency;
  trialEligible: boolean;
}) =>
  crypto
    .createHash("sha256")
    .update(
      [
        input.businessId,
        input.plan,
        input.billing,
        input.currency,
        input.trialEligible ? "trial" : "paid",
      ].join(":")
    )
    .digest("hex");

const isLiveUpdatableSubscription = async (
  stripeSubscriptionId?: string | null
) => {
  if (!stripeSubscriptionId) {
    return null;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(
      stripeSubscriptionId
    );

    if (
      UPDATABLE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
      !subscription.cancel_at_period_end
    ) {
      return subscription;
    }

    return null;
  } catch {
    return null;
  }
};

const invalidateBillingCache = async (businessId: string) => {
  try {
    await redis.del(`sub:${businessId}`);
  } catch {
    console.warn("Billing cache clear failed:", businessId);
  }
};

export const createCheckoutSession = async (
  email: string,
  businessId: string,
  planInput: string,
  billingInput: string,
  req: Request,
  currency?: Currency,
  couponCode?: string
) => {
  const plan = validatePlan(planInput);
  const billing = validateBilling(billingInput);

  const existingSub = await prisma.subscription.findUnique({
    where: { businessId },
  });

  const detectedCurrency = resolveBillingCurrency(req);
  const finalCurrency =
    currency ||
    (existingSub?.currency as Currency | null) ||
    detectedCurrency;

  if (
    existingSub?.stripeSubscriptionId &&
    existingSub.currency &&
    existingSub.currency !== finalCurrency
  ) {
    throw new Error(
      "Currency cannot be changed for active paid subscription"
    );
  }

  const planData = await prisma.plan.findUnique({
    where: { type: plan },
  });

  if (!planData) {
    throw new Error("Plan not found");
  }

  const customerId = await getOrCreateCustomerId(
    email,
    businessId,
    existingSub
  );

  const earlyAccess = await getEarlyAccessState(existingSub);
  const priceId = getPriceId(
    plan,
    billing,
    finalCurrency,
    earlyAccess.allowEarly
  );

  const liveSubscription = await isLiveUpdatableSubscription(
    existingSub?.stripeSubscriptionId
  );

  if (liveSubscription) {
    const itemId = liveSubscription.items.data[0]?.id;

    if (!itemId) {
      throw new Error("Unable to update current subscription");
    }

    await stripe.subscriptions.update(liveSubscription.id, {
      items: [
        {
          id: itemId,
          price: priceId,
        },
      ],
      metadata: {
        businessId,
        plan,
        billing,
        currency: finalCurrency,
      },
      proration_behavior: "create_prorations",
    });

    await prisma.subscription.update({
      where: { businessId },
      data: {
        plan: {
          connect: { id: planData.id },
        },
        billingCycle: billing,
        currency: finalCurrency,
        status: mapStripeSubscriptionStatus(liveSubscription.status),
      },
    });

    await invalidateBillingCache(businessId);

    return {
      url: `${env.FRONTEND_URL}/billing/success?upgraded=1&plan=${plan}`,
    };
  }

  let discounts:
    | Stripe.Checkout.SessionCreateParams.Discount[]
    | undefined;

  if (couponCode) {
    try {
      const couponId = await applyCoupon(couponCode);
      discounts = [{ coupon: couponId }];
    } catch {
      throw new Error("Invalid coupon");
    }
  }

  const isTrialEligible = !existingSub?.trialUsed;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: businessId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      billing_address_collection: "required",
      phone_number_collection: {
        enabled: true,
      },
      allow_promotion_codes: !couponCode,
      ...(getTaxConfig(
        finalCurrency
      ) as Partial<Stripe.Checkout.SessionCreateParams>),
      ...(discounts ? { discounts } : {}),
      subscription_data: {
        ...(isTrialEligible
          ? {
              trial_period_days: 7,
            }
          : {}),
        metadata: {
          businessId,
          plan,
          billing,
          currency: finalCurrency,
        },
      },
      metadata: {
        businessId,
        plan,
        billing,
        currency: finalCurrency,
        usedEarly: earlyAccess.allowEarly ? "true" : "false",
        usedTrial: isTrialEligible ? "true" : "false",
        billingVersion: "2026-04",
      },
      success_url: `${env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${env.FRONTEND_URL}/billing?checkout=cancelled`,
    };

  const session = await stripe.checkout.sessions.create(
    sessionParams,
    {
      idempotencyKey: createCheckoutIdempotencyKey({
        businessId,
        plan,
        billing,
        currency: finalCurrency,
        trialEligible: isTrialEligible,
      }),
    }
  );

  return {
    url: session.url,
  };
};
