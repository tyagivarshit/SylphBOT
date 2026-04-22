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
type StripeSubscriptionSyncOptions = {
  businessId?: string | null;
  planTypeHint?: string | null;
  billingHint?: string | null;
  currencyHint?: string | null;
  trialUsed?: boolean;
};
type ExpirePastDueLookup =
  | {
      businessId: string;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
    }
  | {
      businessId?: string | null;
      stripeCustomerId: string;
      stripeSubscriptionId?: string | null;
    }
  | {
      businessId?: string | null;
      stripeCustomerId?: string | null;
      stripeSubscriptionId: string;
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

const getCustomerId = (
  customer:
    | string
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | null
    | undefined
) => {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
};

const hasExpiredGracePeriod = (
  status: string | null | undefined,
  graceUntil: Date | null | undefined,
  now = Date.now()
) =>
  status === "PAST_DUE" &&
  Boolean(graceUntil) &&
  new Date(graceUntil as Date).getTime() < now;

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

const resolveBusinessIdForSubscription = async (
  subscription: Stripe.Subscription,
  providedBusinessId?: string | null
) => {
  if (providedBusinessId) {
    return providedBusinessId;
  }

  const metadataBusinessId = subscription.metadata?.businessId;

  if (metadataBusinessId) {
    return metadataBusinessId;
  }

  const existing = await prisma.subscription.findFirst({
    where: {
      stripeSubscriptionId: subscription.id,
    },
    select: {
      businessId: true,
    },
  });

  if (existing?.businessId) {
    return existing.businessId;
  }

  const customerId = getCustomerId(subscription.customer);

  if (!customerId) {
    return null;
  }

  const linkedSubscription = await prisma.subscription.findFirst({
    where: {
      stripeCustomerId: customerId,
    },
    select: {
      businessId: true,
    },
  });

  if (linkedSubscription?.businessId) {
    return linkedSubscription.businessId;
  }

  const linkedBusiness = await prisma.business.findFirst({
    where: {
      stripeCustomerId: customerId,
    },
    select: {
      id: true,
    },
  });

  return linkedBusiness?.id || null;
};

const applyStripeSubscriptionSync = async (
  subscription: Stripe.Subscription,
  options: StripeSubscriptionSyncOptions = {}
) => {
  const businessId = await resolveBusinessIdForSubscription(
    subscription,
    options.businessId
  );

  if (!businessId) {
    return null;
  }

  const existing = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });

  const planType =
    options.planTypeHint ||
    subscription.metadata?.plan ||
    getPlanFromPrice(getSubscriptionPriceId(subscription)) ||
    existing?.plan?.type ||
    existing?.plan?.name ||
    null;

  if (!planType) {
    throw new Error("Unable to resolve plan for Stripe subscription sync");
  }

  const plan = await findPlan(planType);

  if (!plan) {
    throw new Error("Plan not found for Stripe subscription sync");
  }

  const stripeCustomerId = getCustomerId(subscription.customer);
  const status = mapStripeSubscriptionStatus(subscription.status);
  const billingCycle =
    normalizeBillingCycle(options.billingHint) ||
    normalizeBillingCycle(subscription.metadata?.billing) ||
    normalizeBillingCycle(
      subscription.items.data[0]?.price?.recurring?.interval
    );

  const synced = await prisma.subscription.upsert({
    where: { businessId },
    update: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId,
      currency: mapCurrency(
        options.currencyHint ||
          subscription.metadata?.currency ||
          subscription.items.data[0]?.price?.currency
      ),
      billingCycle,
      status,
      currentPeriodEnd: getPeriodEnd(subscription),
      isTrial: subscription.status === "trialing",
      graceUntil:
        status === "ACTIVE" || status === "CANCELLED"
          ? null
          : existing?.graceUntil ?? null,
      plan: {
        connect: { id: plan.id },
      },
      trialUsed:
        existing?.trialUsed === true ||
        options.trialUsed === true ||
        subscription.status === "trialing",
    },
    create: {
      business: {
        connect: { id: businessId },
      },
      plan: {
        connect: { id: plan.id },
      },
      stripeSubscriptionId: subscription.id,
      stripeCustomerId,
      currency: mapCurrency(
        options.currencyHint ||
          subscription.metadata?.currency ||
          subscription.items.data[0]?.price?.currency
      ),
      billingCycle,
      status,
      currentPeriodEnd: getPeriodEnd(subscription),
      isTrial: subscription.status === "trialing",
      trialUsed:
        options.trialUsed === true ||
        subscription.status === "trialing",
    },
    include: {
      plan: true,
    },
  });

  if (stripeCustomerId) {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        stripeCustomerId,
      },
    });
  }

  await safeRedisDel(`sub:${businessId}`);

  return synced;
};

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

  return applyStripeSubscriptionSync(stripeSub, {
    businessId,
    planTypeHint: planType,
    billingHint: billingCycle,
    currencyHint:
      session.metadata?.currency || session.currency || null,
    trialUsed: session.metadata?.usedTrial === "true",
  });
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
  subscription: Stripe.Subscription,
  options: StripeSubscriptionSyncOptions = {}
) => {
  const synced = await applyStripeSubscriptionSync(subscription, options);

  if (!synced) {
    return null;
  }

  return {
    businessId: synced.businessId,
    status: synced.status,
    planType: synced.plan?.type || synced.plan?.name || null,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: synced.stripeCustomerId || getCustomerId(subscription.customer),
  };
};

export const expirePastDueSubscriptionIfNeeded = async (
  lookup: ExpirePastDueLookup
) => {
  const subscription = await prisma.subscription.findFirst({
    where: {
      OR: [
        lookup.businessId
          ? {
              businessId: lookup.businessId,
            }
          : undefined,
        lookup.stripeCustomerId
          ? {
              stripeCustomerId: lookup.stripeCustomerId,
            }
          : undefined,
        lookup.stripeSubscriptionId
          ? {
              stripeSubscriptionId: lookup.stripeSubscriptionId,
            }
          : undefined,
      ].filter(Boolean) as any[],
    },
    include: {
      plan: true,
    },
  });

  if (!subscription) {
    return null;
  }

  if (!hasExpiredGracePeriod(subscription.status, subscription.graceUntil)) {
    return subscription;
  }

  const updated = await prisma.subscription.update({
    where: {
      businessId: subscription.businessId,
    },
    data: {
      status: "CANCELLED",
      graceUntil: null,
      isTrial: false,
    },
    include: {
      plan: true,
    },
  });

  await safeRedisDel(`sub:${updated.businessId}`);

  console.log("Grace period expired, downgraded", {
    businessId: updated.businessId,
    stripeCustomerId: updated.stripeCustomerId || null,
    stripeSubscriptionId: updated.stripeSubscriptionId || null,
    effectivePlan: "FREE_LOCKED",
    previousStatus: subscription.status,
    nextStatus: updated.status,
  });

  return updated;
};

export const expirePastDueSubscriptions = async () => {
  const expired = await prisma.subscription.findMany({
    where: {
      status: "PAST_DUE",
      graceUntil: {
        lt: new Date(),
      },
    },
    include: {
      plan: true,
    },
  });

  if (!expired.length) {
    return 0;
  }

  for (const subscription of expired) {
    await expirePastDueSubscriptionIfNeeded({
      businessId: subscription.businessId,
    });
  }

  return expired.length;
};
