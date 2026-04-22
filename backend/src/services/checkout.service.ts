import crypto from "crypto";
import { Request } from "express";
import Stripe from "stripe";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { stripe } from "./stripe.service";
import { applyCoupon } from "./coupon.service";
import { getTaxConfig } from "./tax.service";
import { resolveBillingCurrency } from "./billingGeo.service";
import { getStripePriceId } from "../config/stripe.price.map";

type Currency = "INR" | "USD";
type Billing = "monthly" | "yearly";
type Plan = "BASIC" | "PRO" | "ELITE";
type HostedBillingSession = {
  url: string | null;
  kind: "checkout" | "subscription_update_confirm";
};

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
    businessId?: string;
  } | null
) => {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stripeCustomerId: true },
  });

  const persistedCustomerId =
    existingSub?.stripeCustomerId || business?.stripeCustomerId || null;

  if (persistedCustomerId) {
    if (business?.stripeCustomerId !== persistedCustomerId) {
      await prisma.business.update({
        where: { id: businessId },
        data: {
          stripeCustomerId: persistedCustomerId,
        },
      });
    }

    if (
      existingSub &&
      existingSub.stripeCustomerId !== persistedCustomerId
    ) {
      await prisma.subscription.update({
        where: { businessId },
        data: {
          stripeCustomerId: persistedCustomerId,
        },
      });
    }

    console.info("Stripe checkout customer linked", {
      businessId,
      customerId: persistedCustomerId,
      source: existingSub?.stripeCustomerId
        ? "subscription"
        : "business",
    });

    return persistedCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { businessId },
  });

  await prisma.business.update({
    where: { id: businessId },
    data: {
      stripeCustomerId: customer.id,
    },
  });

  if (existingSub) {
    await prisma.subscription.update({
      where: { businessId },
      data: {
        stripeCustomerId: customer.id,
      },
    });
  }

  console.info("Stripe checkout customer linked", {
    businessId,
    customerId: customer.id,
    source: "created",
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

const createSuccessUrl = (plan: Plan, billing: Billing) =>
  `${env.FRONTEND_URL}/billing/success?plan=${plan}&billing=${billing}`;

const createCancelUrl = (plan: Plan) =>
  `${env.FRONTEND_URL}/billing/cancel?plan=${plan}`;

const createSubscriptionUpdateFlow = async ({
  businessId,
  userId,
  customerId,
  subscription,
  priceId,
  plan,
  billing,
  currency,
  couponId,
}: {
  businessId: string;
  userId: string;
  customerId: string;
  subscription: Stripe.Subscription;
  priceId: string;
  plan: Plan;
  billing: Billing;
  currency: Currency;
  couponId?: string;
}) => {
  const itemId = subscription.items.data[0]?.id;

  if (!itemId) {
    throw new Error("Unable to update current subscription");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.FRONTEND_URL}/billing`,
    flow_data: {
      type: "subscription_update_confirm",
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: createSuccessUrl(plan, billing),
        },
      },
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [
          {
            id: itemId,
            price: priceId,
            quantity: 1,
          },
        ],
        ...(couponId
          ? {
              discounts: [{ coupon: couponId }],
            }
          : {}),
      },
    },
  });

  console.info("Stripe checkout session created", {
    businessId,
    userId,
    plan,
    billing,
    currency,
    kind: "subscription_update_confirm",
  });

  return {
    url: session.url,
    kind: "subscription_update_confirm" as const,
  };
};

export const createCheckoutSession = async (
  email: string,
  businessId: string,
  userId: string,
  planInput: string,
  billingInput: string,
  req: Request,
  currency?: Currency,
  couponCode?: string
): Promise<HostedBillingSession> => {
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

  let couponId: string | undefined;

  if (couponCode) {
    try {
      couponId = await applyCoupon(couponCode);
    } catch {
      throw new Error("Invalid coupon");
    }
  }

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
    return createSubscriptionUpdateFlow({
      businessId,
      userId,
      customerId,
      subscription: liveSubscription,
      priceId,
      plan,
      billing,
      currency: finalCurrency,
      couponId,
    });
  }

  const isTrialEligible = !existingSub?.trialUsed;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: customerId,
    client_reference_id: businessId,
    payment_method_types: ["card"],
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
    ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
    subscription_data: {
      ...(isTrialEligible
        ? {
            trial_period_days: 7,
          }
        : {}),
      metadata: {
        businessId,
        userId,
        plan,
        billing,
        currency: finalCurrency,
      },
    },
    metadata: {
      businessId,
      userId,
      plan,
      billing,
      currency: finalCurrency,
      usedEarly: earlyAccess.allowEarly ? "true" : "false",
      usedTrial: isTrialEligible ? "true" : "false",
      billingVersion: "2026-04",
    },
    success_url: `${createSuccessUrl(
      plan,
      billing
    )}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: createCancelUrl(plan),
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

  console.info("Stripe checkout session created", {
    businessId,
    userId,
    plan,
    billing,
    currency: finalCurrency,
    kind: "checkout",
    sessionId: session.id,
  });

  return {
    url: session.url,
    kind: "checkout",
  };
};
