import { Prisma, SubscriptionLedgerStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { commerceAuthorityService } from "./commerceAuthority.service";
import { publishCommerceEvent } from "./commerceEvent.service";
import { invoiceEngineService } from "./invoiceEngine.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { revenueRecognitionService } from "./revenueRecognition.service";
import {
  SUBSCRIPTION_TRANSITIONS,
  assertTransition,
  buildDeterministicDigest,
  buildLedgerKey,
  mergeMetadata,
  normalizeBillingCycle,
  normalizeCurrency,
  normalizeProvider,
  toMinor,
} from "./commerce/shared";

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const nextPeriodFrom = ({
  from,
  billingCycle,
}: {
  from: Date;
  billingCycle: "monthly" | "yearly";
}) => new Date(from.getTime() + (billingCycle === "yearly" ? ONE_YEAR_MS : ONE_MONTH_MS));

export const createSubscriptionEngineService = () => {
  const createFromContract = async ({
    businessId,
    contractKey,
    planCode,
    billingCycle,
    currency,
    unitPriceMinor,
    quantity = 1,
    provider = "INTERNAL",
    metadata = null,
    idempotencyKey = null,
  }: {
    businessId: string;
    contractKey: string;
    planCode: string;
    billingCycle: string;
    currency: string;
    unitPriceMinor: number;
    quantity?: number;
    provider?: string;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) => {
    const contract = await prisma.contractLedger.findFirst({
      where: {
        businessId,
        contractKey,
      },
      include: {
        proposal: true,
      },
    });

    if (!contract) {
      throw new Error("contract_not_found");
    }

    const normalizedIdempotency =
      String(idempotencyKey || "").trim() ||
      buildDeterministicDigest({
        businessId,
        contractKey,
        planCode,
        billingCycle,
        currency,
        unitPriceMinor,
        quantity,
      });

    const existing = await prisma.subscriptionLedger.findUnique({
      where: {
        idempotencyKey: normalizedIdempotency,
      },
    });

    if (existing) {
      return existing;
    }

    const normalizedQuantity = Math.max(1, Math.floor(Number(quantity || 1)));
    const amountMinor = toMinor(unitPriceMinor) * normalizedQuantity;
    const now = new Date();
    const normalizedBillingCycle = normalizeBillingCycle(billingCycle);
    await commerceAuthorityService.assertNoActiveManualOverride({
      businessId,
      scope: "SUBSCRIPTION_CREATE",
      provider,
    });
    const currentPeriodEnd = nextPeriodFrom({
      from: now,
      billingCycle: normalizedBillingCycle,
    });

    const subscription = await prisma.subscriptionLedger.create({
      data: {
        businessId,
        contractId: contract.id,
        proposalId: contract.proposalId,
        subscriptionKey: buildLedgerKey("subscription"),
        status: "ACTIVE",
        provider: normalizeProvider(provider),
        planCode: String(planCode || "PRO").trim().toUpperCase(),
        billingCycle: normalizedBillingCycle,
        currency: normalizeCurrency(currency),
        quantity: normalizedQuantity,
        unitPriceMinor: toMinor(unitPriceMinor),
        amountMinor,
        currentPeriodStart: now,
        currentPeriodEnd,
        renewAt: currentPeriodEnd,
        metadata: mergeMetadata(
          {
            contractKey,
          },
          metadata || undefined
        ) as Prisma.InputJsonValue,
        idempotencyKey: normalizedIdempotency,
      },
    });

    await publishCommerceEvent({
      event: "commerce.subscription.created",
      businessId,
      aggregateType: "subscription_ledger",
      aggregateId: subscription.id,
      eventKey: subscription.subscriptionKey,
      payload: {
        businessId,
        subscriptionId: subscription.id,
        subscriptionKey: subscription.subscriptionKey,
        contractId: subscription.contractId,
        planCode: subscription.planCode,
        billingCycle: subscription.billingCycle,
        amountMinor: subscription.amountMinor,
        currency: subscription.currency,
      },
    });

    await revenueRecognitionService.recordStage({
      businessId,
      stage: "BOOKED",
      amountMinor: subscription.amountMinor,
      currency: subscription.currency,
      sourceEvent: "subscription_created",
      proposalId: subscription.proposalId,
      contractId: subscription.contractId,
      subscriptionId: subscription.id,
      idempotencyKey: `revrec:booked:${subscription.id}`,
    });

    return subscription;
  };

  const transitionSubscriptionStatus = async ({
    businessId,
    subscriptionKey,
    nextStatus,
    metadata,
  }: {
    businessId: string;
    subscriptionKey: string;
    nextStatus: SubscriptionLedgerStatus;
    metadata?: Record<string, unknown> | null;
  }) => {
    const subscription = await prisma.subscriptionLedger.findFirst({
      where: {
        businessId,
        subscriptionKey,
      },
    });

    if (!subscription) {
      throw new Error("subscription_not_found");
    }

    assertTransition({
      current: subscription.status,
      next: nextStatus,
      transitions: SUBSCRIPTION_TRANSITIONS,
      scope: "subscription",
    });

    const now = new Date();

    const updated = await prisma.subscriptionLedger.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: nextStatus,
        pausedAt: nextStatus === "PAUSED" ? now : subscription.pausedAt,
        resumedAt: nextStatus === "ACTIVE" && subscription.status === "PAUSED" ? now : subscription.resumedAt,
        cancelledAt: nextStatus === "CANCELLED" ? now : subscription.cancelledAt,
        metadata: mergeMetadata(subscription.metadata, metadata || undefined) as Prisma.InputJsonValue,
        version: {
          increment: subscription.status === nextStatus ? 0 : 1,
        },
      },
    });

    await publishCommerceEvent({
      event: "commerce.subscription.status_changed",
      businessId,
      aggregateType: "subscription_ledger",
      aggregateId: updated.id,
      eventKey: `${updated.subscriptionKey}:${subscription.status}:${nextStatus}`,
      payload: {
        businessId,
        subscriptionId: updated.id,
        subscriptionKey,
        from: subscription.status,
        to: nextStatus,
      },
    });

    return updated;
  };

  const applyLifecycleAction = async ({
    businessId,
    subscriptionKey,
    action,
    metadata = null,
  }: {
    businessId: string;
    subscriptionKey: string;
    action:
      | "upgrade"
      | "downgrade"
      | "pause"
      | "resume"
      | "renew"
      | "cancel"
      | "save_attempt";
    metadata?: Record<string, unknown> | null;
  }) => {
    const subscription = await prisma.subscriptionLedger.findFirst({
      where: {
        businessId,
        subscriptionKey,
      },
    });

    if (!subscription) {
      throw new Error("subscription_not_found");
    }

    const overrideScope =
      action === "renew"
        ? "RENEWAL"
        : action === "cancel"
        ? "SUBSCRIPTION_CANCEL"
        : action === "pause"
        ? "SUBSCRIPTION_HOLD"
        : "SUBSCRIPTION_WRITE";
    await commerceAuthorityService.assertNoActiveManualOverride({
      businessId,
      scope: overrideScope,
      provider: subscription.provider,
    });

    if (action === "pause") {
      return transitionSubscriptionStatus({
        businessId,
        subscriptionKey,
        nextStatus: "PAUSED",
        metadata,
      });
    }

    if (action === "resume") {
      return transitionSubscriptionStatus({
        businessId,
        subscriptionKey,
        nextStatus: "ACTIVE",
        metadata,
      });
    }

    if (action === "cancel") {
      return transitionSubscriptionStatus({
        businessId,
        subscriptionKey,
        nextStatus: "CANCELLED",
        metadata,
      });
    }

    if (action === "save_attempt") {
      return prisma.subscriptionLedger.update({
        where: {
          id: subscription.id,
        },
        data: {
          saveAttemptCount: {
            increment: 1,
          },
          metadata: mergeMetadata(subscription.metadata, {
            ...(metadata || {}),
            saveAttemptedAt: new Date().toISOString(),
          }) as Prisma.InputJsonValue,
        },
      });
    }

    if (action === "upgrade" || action === "downgrade") {
      const planCode = String(metadata?.planCode || subscription.planCode).trim().toUpperCase();
      const unitPriceMinor =
        metadata?.unitPriceMinor === undefined
          ? subscription.unitPriceMinor
          : toMinor(Number(metadata.unitPriceMinor));
      const quantity =
        metadata?.quantity === undefined
          ? subscription.quantity
          : Math.max(1, Math.floor(Number(metadata.quantity)));
      const amountMinor = unitPriceMinor * quantity;

      return prisma.subscriptionLedger.update({
        where: {
          id: subscription.id,
        },
        data: {
          planCode,
          unitPriceMinor,
          quantity,
          amountMinor,
          metadata: mergeMetadata(subscription.metadata, {
            ...(metadata || {}),
            lastPlanAction: action,
          }) as Prisma.InputJsonValue,
          version: {
            increment: 1,
          },
        },
      });
    }

    // renew
    const now = new Date();
    const cycle = subscription.billingCycle;
    const nextPeriodStart = subscription.currentPeriodEnd || now;
    const nextPeriodEnd = nextPeriodFrom({
      from: nextPeriodStart,
      billingCycle: cycle,
    });

    const renewed = await prisma.subscriptionLedger.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: "ACTIVE",
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
        renewAt: nextPeriodEnd,
        metadata: mergeMetadata(subscription.metadata, {
          ...(metadata || {}),
          lastRenewedAt: now.toISOString(),
        }) as Prisma.InputJsonValue,
        version: {
          increment: 1,
        },
      },
    });

    await publishCommerceEvent({
      event: "commerce.renewal.processed",
      businessId,
      aggregateType: "subscription_ledger",
      aggregateId: renewed.id,
      eventKey: `${renewed.subscriptionKey}:${nextPeriodStart.toISOString()}`,
      payload: {
        businessId,
        subscriptionId: renewed.id,
        subscriptionKey: renewed.subscriptionKey,
        currentPeriodStart: renewed.currentPeriodStart?.toISOString() || null,
        currentPeriodEnd: renewed.currentPeriodEnd?.toISOString() || null,
        amountMinor: renewed.amountMinor,
        currency: renewed.currency,
      },
    });

    await invoiceEngineService.issueInvoice({
      businessId,
      subscriptionKey: renewed.subscriptionKey,
      dueDays: 0,
      idempotencyKey: `invoice:renewal:${renewed.id}:${nextPeriodStart.toISOString()}`,
      metadata: {
        renewal: true,
      },
    });

    return renewed;
  };

  const processDueRenewals = async ({
    now = new Date(),
  }: {
    now?: Date;
  } = {}) => {
    const maxAdvanceWindow = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const rows = await prisma.subscriptionLedger.findMany({
      where: {
        status: "ACTIVE",
        renewAt: {
          lte: maxAdvanceWindow,
        },
      },
      orderBy: {
        renewAt: "asc",
      },
      take: 200,
    });
    const runtimeByBusiness = new Map<string, any>();
    let processed = 0;

    for (const row of rows) {
      let runtime = runtimeByBusiness.get(row.businessId);

      if (!runtime) {
        runtime = await getIntelligenceRuntimeInfluence({
          businessId: row.businessId,
        }).catch(() => null);
        runtimeByBusiness.set(row.businessId, runtime);
      }

      const advanceHours = Math.max(
        0,
        Math.min(72, Number(runtime?.controls.commerce.renewalAdvanceHours || 0))
      );
      const eligibleAt = new Date(now.getTime() + advanceHours * 60 * 60 * 1000);

      if (row.renewAt instanceof Date && row.renewAt.getTime() > eligibleAt.getTime()) {
        continue;
      }

      const override = await commerceAuthorityService.getActiveManualOverride({
        businessId: row.businessId,
        scope: "RENEWAL",
        provider: row.provider,
      });

      if (override) {
        continue;
      }

      await applyLifecycleAction({
        businessId: row.businessId,
        subscriptionKey: row.subscriptionKey,
        action: "renew",
      }).catch(() => undefined);
      processed += 1;
    }

    return {
      count: processed,
    };
  };

  return {
    createFromContract,
    transitionSubscriptionStatus,
    applyLifecycleAction,
    processDueRenewals,
  };
};

export const subscriptionEngineService = createSubscriptionEngineService();
