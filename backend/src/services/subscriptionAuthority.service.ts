import prisma from "../config/prisma";

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

  const row = await prisma.subscriptionLedger.findFirst({
    where: {
      businessId: normalizedBusinessId,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (!row) {
    return null;
  }

  const isTrial =
    row.status === "TRIALING" ||
    (row.trialEndsAt instanceof Date && row.trialEndsAt.getTime() > Date.now());
  const graceUntil =
    row.status === "PAST_DUE"
      ? row.renewAt || row.currentPeriodEnd || null
      : null;

  return {
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
};

export const getCanonicalPlanRef = async (businessId: string) => {
  const subscription = await getCanonicalSubscriptionSnapshot(businessId);
  return subscription?.plan || null;
};
