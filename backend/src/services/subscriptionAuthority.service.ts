import prisma from "../config/prisma";

const SUBSCRIPTION_SNAPSHOT_CACHE_TTL_MS = 15_000;
const subscriptionSnapshotCache = new Map<
  string,
  {
    value: CanonicalSubscriptionSnapshot;
    expiresAt: number;
    promise?: Promise<CanonicalSubscriptionSnapshot>;
  }
>();

export type CanonicalPlanRef = {
  name: string;
  type: string;
};

export type CanonicalSubscriptionSnapshot = {
  id: string;
  businessId: string;
  status: string;
  plan: CanonicalPlanRef | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  isTrial: boolean;
  provider: string;
  providerSubscriptionId: string | null;
  currency: string;
  billingCycle: string;
  raw: any;
} | null;

const mapCanonicalStatus = (status: string) => {
  const normalized = String(status || "").trim().toUpperCase();

  if (normalized === "TRIALING") {
    return "TRIAL";
  }

  if (normalized === "ACTIVE") {
    return "ACTIVE";
  }

  if (normalized === "PAST_DUE") {
    return "PAST_DUE";
  }

  if (normalized === "PAUSED") {
    return "PAUSED";
  }

  if (normalized === "EXPIRED") {
    return "EXPIRED";
  }

  if (normalized === "CANCELLED") {
    return "CANCELLED";
  }

  return "INACTIVE";
};

export const getCanonicalSubscriptionSnapshot = async (
  businessId: string
): Promise<CanonicalSubscriptionSnapshot> => {
  const normalizedBusinessId = String(businessId || "").trim();

  if (!normalizedBusinessId) {
    return null;
  }

  const cached = subscriptionSnapshotCache.get(normalizedBusinessId);
  if (cached && !cached.promise && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (cached?.promise) {
    return cached.promise;
  }
  const computePromise = (async () => {
    const row = await prisma.subscriptionLedger.findFirst({
      where: {
        businessId: normalizedBusinessId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (!row) {
      subscriptionSnapshotCache.set(normalizedBusinessId, {
        value: null,
        expiresAt: Date.now() + 5_000,
      });
      return null;
    }

    const isTrial =
      row.status === "TRIALING" ||
      (row.trialEndsAt instanceof Date && row.trialEndsAt.getTime() > Date.now());
    const graceUntil =
      row.status === "PAST_DUE"
        ? row.renewAt || row.currentPeriodEnd || null
        : null;

    const snapshot: CanonicalSubscriptionSnapshot = {
      id: row.id,
      businessId: row.businessId,
      status: mapCanonicalStatus(row.status),
      plan: row.planCode
        ? {
            name: row.planCode,
            type: row.planCode,
          }
        : null,
      currentPeriodEnd: row.currentPeriodEnd || row.renewAt || row.trialEndsAt || null,
      graceUntil,
      isTrial,
      provider: row.provider,
      providerSubscriptionId: row.providerSubscriptionId || null,
      currency: row.currency,
      billingCycle: row.billingCycle,
      raw: row,
    };

    subscriptionSnapshotCache.set(normalizedBusinessId, {
      value: snapshot,
      expiresAt: Date.now() + SUBSCRIPTION_SNAPSHOT_CACHE_TTL_MS,
    });

    return snapshot;
  })().finally(() => {
    const latest = subscriptionSnapshotCache.get(normalizedBusinessId);
    if (latest?.promise) {
      subscriptionSnapshotCache.set(normalizedBusinessId, {
        value: latest.value,
        expiresAt: latest.expiresAt,
      });
    }
  });

  subscriptionSnapshotCache.set(normalizedBusinessId, {
    value: cached?.value ?? null,
    expiresAt: cached?.expiresAt || 0,
    promise: computePromise,
  });

  return computePromise;
};

export const getCanonicalPlanRef = async (businessId: string) => {
  const subscription = await getCanonicalSubscriptionSnapshot(businessId);
  return subscription?.plan || null;
};
