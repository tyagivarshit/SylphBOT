import Stripe from "stripe";
import prisma from "../config/prisma";
import redis from "../config/redis";
import { stripe } from "./stripe.service";
import { getPlanFromPrice } from "../config/stripe.price.map";

type BillingCycle = "monthly" | "yearly" | null;
type Currency = "INR" | "USD";
type BillingSyncOptions = {
  strictBusinessId?: string;
};

const safeRedisDel = async (key: string) => {
  try {
    await redis.del(key);
  } catch {
    console.warn("Redis cache delete failed:", key);
  }
};

const getSubscriptionId = (
  subscription: string | Stripe.Subscription | null | undefined
) => {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  return subscription.id;
};

const getPeriodEnd = (subscription: Stripe.Subscription) => {
  const raw =
    (subscription as any).current_period_end ||
    subscription.items.data[0]?.current_period_end;
  return raw ? new Date(raw * 1000) : null;
};

const mapCurrency = (currency?: string | null): Currency => {
  return currency?.toUpperCase() === "USD" ? "USD" : "INR";
};

const normalizeBillingCycle = (
  billing?: string | null
): BillingCycle => {
  if (!billing) {
    return null;
  }

  if (billing === "monthly" || billing === "month") {
    return "monthly";
  }

  if (billing === "yearly" || billing === "year") {
    return "yearly";
  }

  return null;
};

export const mapStripeSubscriptionStatus = (
  status: Stripe.Subscription.Status
) => {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE" as const;
    case "past_due":
    case "unpaid":
      return "PAST_DUE" as const;
    case "canceled":
    case "incomplete_expired":
      return "CANCELLED" as const;
    default:
      return "INACTIVE" as const;
  }
};

const findPlan = async (planType: string) => {
  return prisma.plan.findFirst({
    where: {
      OR: [{ name: planType }, { type: planType }],
    },
  });
};

const incrementEarlyUsage = async (planType: string) => {
  await prisma.plan.updateMany({
    where: {
      OR: [{ name: planType }, { type: planType }],
    },
    data: {
      earlyUsed: { increment: 1 },
    },
  });
};

const getSubscriptionPriceId = (subscription: Stripe.Subscription) =>
  subscription.items.data[0]?.price?.id || null;

const resolvePlanType = (
  metadataPlan: string | undefined,
  subscription: Stripe.Subscription
) => metadataPlan || getPlanFromPrice(getSubscriptionPriceId(subscription));

export const syncCheckoutSession = async (
  session: Stripe.Checkout.Session,
  options: BillingSyncOptions = {}
) => {
  const businessId = session.metadata?.businessId;
  const subscriptionId = getSubscriptionId(session.subscription);

  if (!businessId || !subscriptionId) {
    throw new Error("Checkout session is missing billing metadata");
  }

  if (
    options.strictBusinessId &&
    businessId !== options.strictBusinessId
  ) {
    throw new Error("Checkout session does not belong to this user");
  }

  const existing = await prisma.subscription.findUnique({
    where: { businessId },
  });

  const stripeSub = await stripe.subscriptions.retrieve(
    subscriptionId
  );
  const planType = resolvePlanType(session.metadata?.plan, stripeSub);

  if (!planType) {
    throw new Error("Unable to resolve plan from checkout session");
  }

  const plan = await findPlan(planType);

  if (!plan) {
    throw new Error("Plan not found for checkout session");
  }

  if (
    session.metadata?.usedEarly === "true" &&
    existing?.stripeSubscriptionId !== stripeSub.id
  ) {
    await incrementEarlyUsage(planType);
  }

  const billingCycle =
    normalizeBillingCycle(session.metadata?.billing) ||
    normalizeBillingCycle(
      stripeSub.items.data[0]?.price?.recurring?.interval
    );

  const subscriptionData = {
    stripeSubscriptionId: stripeSub.id,
    stripeCustomerId:
      typeof stripeSub.customer === "string"
        ? stripeSub.customer
        : stripeSub.customer?.id ?? null,
    currency: mapCurrency(
      session.metadata?.currency ||
        session.currency ||
        stripeSub.items.data[0]?.price?.currency
    ),
    billingCycle,
    status: mapStripeSubscriptionStatus(stripeSub.status),
    currentPeriodEnd: getPeriodEnd(stripeSub),
    isTrial: stripeSub.status === "trialing",
  };

  const subscription = await prisma.subscription.upsert({
    where: { businessId },
    update: {
      ...subscriptionData,
      plan: {
        connect: { id: plan.id },
      },
      trialUsed:
        existing?.trialUsed === true ||
        session.metadata?.usedTrial === "true" ||
        stripeSub.status === "trialing",
    },
    create: {
      ...subscriptionData,
      business: {
        connect: { id: businessId },
      },
      plan: {
        connect: { id: plan.id },
      },
      trialUsed:
        session.metadata?.usedTrial === "true" ||
        stripeSub.status === "trialing",
    },
    include: {
      plan: true,
    },
  });

  await safeRedisDel(`sub:${businessId}`);

  return subscription;
};

export const confirmCheckoutSession = async (
  sessionId: string,
  strictBusinessId: string
) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return syncCheckoutSession(session, {
    strictBusinessId,
  });
};

export const syncStripeSubscriptionState = async (
  subscription: Stripe.Subscription
) => {
  const existing = await prisma.subscription.findFirst({
    where: {
      stripeSubscriptionId: subscription.id,
    },
  });

  if (!existing) {
    return null;
  }

  const status = mapStripeSubscriptionStatus(subscription.status);
  const syncedPlanType = getPlanFromPrice(getSubscriptionPriceId(subscription));
  const syncedPlan = syncedPlanType ? await findPlan(syncedPlanType) : null;

  await prisma.subscription.update({
    where: {
      stripeSubscriptionId: subscription.id,
    },
    data: {
      ...(syncedPlan
        ? {
            plan: {
              connect: {
                id: syncedPlan.id,
              },
            },
          }
        : {}),
      status,
      currentPeriodEnd: getPeriodEnd(subscription),
      isTrial: subscription.status === "trialing",
      billingCycle:
        normalizeBillingCycle(
          subscription.items.data[0]?.price?.recurring?.interval
        ) || existing.billingCycle,
      graceUntil:
        status === "ACTIVE" || status === "CANCELLED"
          ? null
          : existing.graceUntil,
    },
  });

  await safeRedisDel(`sub:${existing.businessId}`);

  return existing.businessId;
};
