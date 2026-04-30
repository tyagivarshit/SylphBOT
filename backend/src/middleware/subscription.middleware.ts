import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import redis from "../config/redis";
import { getPlanKey } from "../config/plan.config";
import { env } from "../config/env";

const CACHE_TTL = 60 * 3;
const EARLY_ACCESS_LIMIT = Number(env.EARLY_ACCESS_LIMIT || 50);

const getKey = (businessId: string) => `sub:${businessId}`;

export type BillingContext = {
  subscription: any | null;
  plan: any | null;
  planKey: string;
  status: "INACTIVE" | "ACTIVE" | "TRIAL";
  isLimited: boolean;
  upgradeRequired: boolean;
  allowEarly?: boolean;
  remainingEarly?: number;
};

const getBaseContext = (): BillingContext => ({
  subscription: null,
  plan: null,
  planKey: "FREE_LOCKED",
  status: "INACTIVE",
  isLimited: true,
  upgradeRequired: true,
  allowEarly: false,
  remainingEarly: 0,
});

const lockContext = (
  context: BillingContext,
  status: BillingContext["status"] = "INACTIVE"
): BillingContext => ({
  ...context,
  planKey: "FREE_LOCKED",
  status,
  isLimited: true,
  upgradeRequired: true,
});

const mapCanonicalSubscription = (row: any) => ({
  id: row.id,
  businessId: row.businessId,
  status:
    row.status === "TRIALING"
      ? "TRIAL"
      : row.status === "ACTIVE"
      ? "ACTIVE"
      : row.status === "PAST_DUE"
      ? "PAST_DUE"
      : row.status === "PENDING"
      ? "INACTIVE"
      : "CANCELLED",
  graceUntil: row.status === "PAST_DUE" ? row.renewAt || row.currentPeriodEnd || null : null,
  currentPeriodEnd: row.currentPeriodEnd || row.renewAt || null,
  isTrial:
    row.status === "TRIALING" ||
    (row.trialEndsAt ? new Date(row.trialEndsAt).getTime() > Date.now() : false),
  stripeCustomerId: null,
  stripeSubscriptionId: row.providerSubscriptionId || null,
  currency: row.currency,
  billingCycle: row.billingCycle,
  plan: {
    name: row.planCode,
    type: row.planCode,
  },
});

const getCachedSubscription = async (businessId: string) => {
  const cacheKey = getKey(businessId);
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const canonical = await prisma.subscriptionLedger.findFirst({
    where: {
      businessId,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
  const subscription = canonical
    ? mapCanonicalSubscription(canonical)
    : null;

  if (subscription) {
    await redis.set(
      cacheKey,
      JSON.stringify(subscription),
      "EX",
      CACHE_TTL
    );
  }

  return subscription;
};

const getEarlyAccessSnapshot = async (subscription: any | null) => {
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
      !subscription?.stripeSubscriptionId,
    remainingEarly: Math.max(
      EARLY_ACCESS_LIMIT - totalEarlyUsed,
      0
    ),
  };
};

export const loadBillingContext = async (businessId: string) => {
  const cachedSubscription = await getCachedSubscription(businessId);
  const subscription = cachedSubscription;
  const now = new Date();

  let context = getBaseContext();

  if (subscription?.plan) {
    context = {
      subscription,
      plan: subscription.plan,
      planKey: getPlanKey(subscription.plan),
      status: "ACTIVE",
      isLimited: false,
      upgradeRequired: false,
      allowEarly: false,
      remainingEarly: 0,
    };

    if (subscription.status === "INACTIVE") {
      context = lockContext(context);
    }

    if (subscription.status === "CANCELLED") {
      context = lockContext(context);
    }

    if (subscription.status === "PAST_DUE") {
      context =
        subscription.graceUntil &&
        now <= new Date(subscription.graceUntil)
          ? {
              ...context,
              status: "ACTIVE",
            }
          : lockContext(context);
    }

    if (subscription.isTrial) {
      context =
        subscription.currentPeriodEnd &&
        now <= new Date(subscription.currentPeriodEnd)
          ? {
              ...context,
              status: "TRIAL",
            }
          : lockContext(context);
    }
  }

  const earlyAccess = await getEarlyAccessSnapshot(subscription);

  context.allowEarly = earlyAccess.allowEarly;
  context.remainingEarly = earlyAccess.remainingEarly;

  return {
    subscription,
    context,
  };
};

export const attachBillingContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    }

    const { subscription, context } = await loadBillingContext(
      businessId
    );

    (req as any).subscription = subscription;
    (req as any).billing = context;

    next();
  } catch (error) {
    console.error("Subscription middleware error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};
