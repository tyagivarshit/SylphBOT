import {
  getPlanKey,
  hasFeature as planHasFeature,
  type PlanFeatures,
  type PlanType,
} from "../config/plan.config";
import prisma from "../config/prisma";

type PlanRecord = {
  name?: string | null;
  type?: string | null;
};

type SubscriptionRecord = {
  status: string;
  graceUntil: Date | null;
  currentPeriodEnd: Date | null;
  isTrial: boolean;
  plan: PlanRecord | null;
} | null;

export type FeatureKey = keyof PlanFeatures;
export type SubscriptionState = "ACTIVE" | "LOCKED";
export type SubscriptionLockReason =
  | "missing_subscription"
  | "trial_expired"
  | "grace_period_expired"
  | "subscription_cancelled"
  | "subscription_expired"
  | "subscription_inactive"
  | "subscription_locked";

export type ResolvedPlanContext = {
  plan: PlanRecord;
  planKey: PlanType;
  state: SubscriptionState;
  source: "subscription" | "locked";
  lockReason: SubscriptionLockReason | null;
  subscriptionStatus: string | null;
};

const FEATURE_CACHE_TTL_MS = 60_000;

const LOCKED_PLAN: PlanRecord = {
  name: "LOCKED",
  type: "LOCKED",
};

type FeatureCacheEntry = {
  value?: ResolvedPlanContext;
  expiresAt: number;
  promise?: Promise<ResolvedPlanContext>;
};

const featureCache = new Map<string, FeatureCacheEntry>();

const normalizeBusinessId = (businessId: string) =>
  String(businessId || "").trim();

const hasActivePeriod = (currentPeriodEnd: Date | null, now: number) =>
  !currentPeriodEnd || currentPeriodEnd.getTime() >= now;

const isTrialActive = (subscription: SubscriptionRecord, now: number) => {
  if (!subscription?.plan) {
    return false;
  }

  return (
    (subscription.isTrial || subscription.status === "TRIAL") &&
    Boolean(subscription.currentPeriodEnd) &&
    subscription.currentPeriodEnd!.getTime() >= now
  );
};

const hasValidGracePeriod = (subscription: SubscriptionRecord, now: number) => {
  if (!subscription?.plan || subscription.status !== "PAST_DUE") {
    return false;
  }

  return (
    Boolean(subscription.graceUntil) &&
    subscription.graceUntil!.getTime() >= now
  );
};

const isSubscriptionActive = (subscription: SubscriptionRecord, now: number) => {
  if (!subscription?.plan) {
    return false;
  }

  if (isTrialActive(subscription, now)) {
    return true;
  }

  if (hasValidGracePeriod(subscription, now)) {
    return true;
  }

  return (
    subscription.status === "ACTIVE" &&
    hasActivePeriod(subscription.currentPeriodEnd, now)
  );
};

const resolveLockReason = (
  subscription: SubscriptionRecord,
  now: number
): SubscriptionLockReason => {
  if (!subscription?.plan) {
    return "missing_subscription";
  }

  if (subscription.isTrial || subscription.status === "TRIAL") {
    return subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd.getTime() >= now
      ? "subscription_locked"
      : "trial_expired";
  }

  if (subscription.status === "CANCELLED") {
    return "subscription_cancelled";
  }

  if (subscription.status === "PAST_DUE") {
    return subscription.graceUntil &&
      subscription.graceUntil.getTime() < now
      ? "grace_period_expired"
      : "subscription_inactive";
  }

  if (
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd.getTime() < now
  ) {
    return "subscription_expired";
  }

  if (subscription.status !== "ACTIVE") {
    return "subscription_inactive";
  }

  return "subscription_locked";
};

const createResolvedPlan = (
  plan: PlanRecord,
  state: SubscriptionState,
  source: ResolvedPlanContext["source"],
  lockReason: SubscriptionLockReason | null,
  subscriptionStatus: string | null
): ResolvedPlanContext => ({
  plan,
  planKey: getPlanKey(plan),
  state,
  source,
  lockReason,
  subscriptionStatus,
});

const loadResolvedPlan = async (
  businessId: string
): Promise<ResolvedPlanContext> => {
  const canonical = await prisma.subscriptionLedger.findFirst({
    where: {
      businessId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      status: true,
      planCode: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      renewAt: true,
    },
  });

  const subscription: SubscriptionRecord = canonical
    ? {
        status:
          canonical.status === "TRIALING"
            ? "TRIAL"
            : canonical.status === "PAST_DUE"
            ? "PAST_DUE"
            : canonical.status === "ACTIVE"
            ? "ACTIVE"
            : canonical.status === "PAUSED"
            ? "PAST_DUE"
            : "CANCELLED",
        graceUntil:
          canonical.status === "PAST_DUE" && canonical.renewAt
            ? canonical.renewAt
            : null,
        currentPeriodEnd: canonical.currentPeriodEnd || null,
        isTrial:
          canonical.status === "TRIALING" ||
          (canonical.trialEndsAt ? canonical.trialEndsAt.getTime() > Date.now() : false),
        plan: {
          name: canonical.planCode,
          type: canonical.planCode,
        },
      }
    : null;

  const now = Date.now();

  if (isSubscriptionActive(subscription, now)) {
    return createResolvedPlan(
      subscription!.plan as PlanRecord,
      "ACTIVE",
      "subscription",
      null,
      subscription!.status
    );
  }

  return createResolvedPlan(
    LOCKED_PLAN,
    "LOCKED",
    "locked",
    resolveLockReason(subscription, now),
    subscription?.status || null
  );
};

export const resolvePlanContext = async (
  businessId: string
): Promise<ResolvedPlanContext> => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  const now = Date.now();
  const cached = featureCache.get(normalizedBusinessId);

  if (cached?.value && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = loadResolvedPlan(normalizedBusinessId)
    .then((value) => {
      featureCache.set(normalizedBusinessId, {
        value,
        expiresAt: Date.now() + FEATURE_CACHE_TTL_MS,
      });

      return value;
    })
    .finally(() => {
      const latest = featureCache.get(normalizedBusinessId);

      if (latest?.promise) {
        featureCache.set(normalizedBusinessId, {
          value: latest.value,
          expiresAt: latest.expiresAt,
        });
      }
    });

  featureCache.set(normalizedBusinessId, {
    value: cached?.value,
    expiresAt: cached?.expiresAt || 0,
    promise,
  });

  return promise;
};

export const hasFeature = async (
  businessId: string,
  featureKey: FeatureKey
): Promise<boolean> => {
  const context = await resolvePlanContext(businessId);

  if (context.planKey === "LOCKED") {
    console.warn("Feature access blocked", {
      businessId,
      featureKey,
      planKey: context.planKey,
      subscriptionStatus: context.subscriptionStatus,
      lockReason: context.lockReason,
    });
    return false;
  }

  const allowed = planHasFeature(context.plan, featureKey);

  if (!allowed) {
    console.warn("Feature access blocked", {
      businessId,
      featureKey,
      planKey: context.planKey,
      subscriptionStatus: context.subscriptionStatus,
      lockReason: context.lockReason,
    });
  }

  return allowed;
};
