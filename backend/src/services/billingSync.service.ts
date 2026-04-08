import Stripe from "stripe";
import prisma from "../config/prisma";
import redis from "../config/redis";
import { stripe } from "./stripe.service";

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
  const raw = (subscription as any).current_period_end;
  return raw ? new Date(raw * 1000) : null;
};

const mapCurrency = (
  currency?: string | null
): "INR" | "USD" => {
  return currency?.toUpperCase() === "USD" ? "USD" : "INR";
};

const normalizeBillingCycle = (
  billing?: string | null
): "monthly" | "yearly" | null => {
  if (!billing) return null;
  if (billing === "monthly" || billing === "month") return "monthly";
  if (billing === "yearly" || billing === "year") return "yearly";
  return null;
};

export const mapStripeSubscriptionStatus = (
  status: Stripe.Subscription.Status
): "ACTIVE" | "INACTIVE" | "PAST_DUE" | "CANCELLED" => {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELLED";
    default:
      return "INACTIVE";
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

export const syncCheckoutSession = async (
  session: Stripe.Checkout.Session,
  options: { strictBusinessId?: string } = {}
) => {
  const businessId = session.metadata?.businessId;
  const planType = session.metadata?.plan as string | undefined;
  const subscriptionId = getSubscriptionId(
    session.subscription as any
  );

  if (!businessId || !planType || !subscriptionId) {
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

  const plan = await findPlan(planType);

  if (!plan) {
    throw new Error("Plan not found for checkout session");
  }

  const stripeSub = await stripe.subscriptions.retrieve(
    subscriptionId
  );

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

  const subscription = await prisma.subscription.upsert({
    where: { businessId },
    update: {
      stripeSubscriptionId: stripeSub.id,
      stripeCustomerId:
        typeof stripeSub.customer === "string"
          ? stripeSub.customer
          : stripeSub.customer?.id ?? null,
      planId: plan.id,
      currency: mapCurrency(
        (session.metadata?.currency as string) ||
          session.currency ||
          stripeSub.items.data[0]?.price?.currency
      ),
      billingCycle,
      status: mapStripeSubscriptionStatus(stripeSub.status),
      currentPeriodEnd: getPeriodEnd(stripeSub),
      isTrial: stripeSub.status === "trialing",
      trialUsed:
        existing?.trialUsed === true ||
        session.metadata?.usedTrial === "true" ||
        stripeSub.status === "trialing",
    },
    create: {
      businessId,
      stripeSubscriptionId: stripeSub.id,
      stripeCustomerId:
        typeof stripeSub.customer === "string"
          ? stripeSub.customer
          : stripeSub.customer?.id ?? null,
      planId: plan.id,
      currency: mapCurrency(
        (session.metadata?.currency as string) ||
          session.currency ||
          stripeSub.items.data[0]?.price?.currency
      ),
      billingCycle,
      status: mapStripeSubscriptionStatus(stripeSub.status),
      currentPeriodEnd: getPeriodEnd(stripeSub),
      isTrial: stripeSub.status === "trialing",
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
  strictBusinessId?: string
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

  await prisma.subscription.update({
    where: {
      stripeSubscriptionId: subscription.id,
    },
    data: {
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
