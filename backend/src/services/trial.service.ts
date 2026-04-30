import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { TRIAL_DAYS, TRIAL_PLAN_KEY } from "../config/pricing.config";
import { buildLedgerKey, mergeMetadata } from "./commerce/shared";

type TrialStatus = {
  trialActive: boolean;
  daysLeft: number;
  currentPeriodEnd: Date | null;
};

const normalizeBusinessId = (businessId: string) =>
  String(businessId || "").trim();

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const hasTrialBeenUsed = (metadata: unknown) =>
  Boolean(toRecord(metadata).trialUsed) || Boolean(toRecord(metadata).trialUsedAt);

export const getTrialStatus = async (
  businessId: string
): Promise<TrialStatus> => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  const subscription = await prisma.subscriptionLedger.findFirst({
    where: {
      businessId: normalizedBusinessId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      status: true,
      trialEndsAt: true,
    },
  });

  if (
    !subscription ||
    subscription.status !== "TRIALING" ||
    !subscription.trialEndsAt
  ) {
    return {
      trialActive: false,
      daysLeft: 0,
      currentPeriodEnd: null,
    };
  }

  const now = Date.now();
  const expiresAt = subscription.trialEndsAt.getTime();
  const active = expiresAt >= now;

  return {
    trialActive: active,
    daysLeft: active ? Math.max(Math.ceil((expiresAt - now) / 86400000), 0) : 0,
    currentPeriodEnd: subscription.trialEndsAt,
  };
};

export const startTrial = async (businessId: string) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.subscriptionLedger.findFirst({
      where: {
        businessId: normalizedBusinessId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (existing && hasTrialBeenUsed(existing.metadata)) {
      throw new Error("Trial already used");
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    if (existing) {
      return tx.subscriptionLedger.update({
        where: {
          id: existing.id,
        },
        data: {
          status: "TRIALING",
          planCode: TRIAL_PLAN_KEY,
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          renewAt: trialEndsAt,
          metadata: mergeMetadata(existing.metadata, {
            trialUsed: true,
            trialUsedAt: now.toISOString(),
            trialSource: "trial_service",
          }) as Prisma.InputJsonValue,
          version: {
            increment: 1,
          },
        },
      });
    }

    return tx.subscriptionLedger.create({
      data: {
        businessId: normalizedBusinessId,
        subscriptionKey: buildLedgerKey("subscription"),
        status: "TRIALING",
        provider: "INTERNAL",
        planCode: TRIAL_PLAN_KEY,
        billingCycle: "monthly",
        currency: "INR",
        quantity: 1,
        unitPriceMinor: 0,
        amountMinor: 0,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        renewAt: trialEndsAt,
        metadata: {
          trialUsed: true,
          trialUsedAt: now.toISOString(),
          trialSource: "trial_service",
        } as Prisma.InputJsonValue,
        idempotencyKey: `trial_start:${normalizedBusinessId}`,
      },
    });
  });
};

export const ensureTrialPlanExists = async () => {
  return {
    key: TRIAL_PLAN_KEY,
  };
};

export const expireTrials = async () => {
  const now = new Date();

  await prisma.subscriptionLedger.updateMany({
    where: {
      status: "TRIALING",
      trialEndsAt: {
        lt: now,
      },
    },
    data: {
      status: "EXPIRED",
      renewAt: null,
      trialEndsAt: now,
    },
  });
};
