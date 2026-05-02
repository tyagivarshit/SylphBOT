import type { BillingCycle, Currency, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { invalidateBillingContextCache } from "../middleware/subscription.middleware";
import { scheduleBillingEmail } from "../queues/authEmail.queue";
import { purchaseAddon } from "./addon.service";
import { buildLedgerKey, mergeMetadata, normalizeBillingCycle, normalizeCurrency } from "./commerce/shared";
import { processPlanUpgrade } from "./saasPackagingConnectHubOS.service";

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getProposalPlanCode = (proposal: {
  pricingSnapshot: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
}) => {
  const pricingSnapshot = toRecord(proposal.pricingSnapshot);
  const metadata = toRecord(proposal.metadata);

  return String(
    pricingSnapshot.planCode ||
      metadata.planCode ||
      "PRO"
  )
    .trim()
    .toUpperCase();
};

const mapPlanCodeToSaaSTier = (planCode: string) => {
  const normalized = String(planCode || "").trim().toUpperCase();

  if (normalized === "BASIC") {
    return "STARTER" as const;
  }

  if (normalized === "PRO") {
    return "PRO" as const;
  }

  if (normalized === "ELITE") {
    return "ENTERPRISE" as const;
  }

  return null;
};

const buildInvoiceNumber = (input: {
  paymentIntentKey: string;
  now: Date;
}) => {
  const stamp = input.now.toISOString().slice(0, 10).replace(/-/g, "");
  const tail = String(input.paymentIntentKey || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toUpperCase();

  return `INV-${stamp}-${tail || "AUTO"}`;
};

const toLineItems = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (entry) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      ) as Array<Record<string, unknown>>
    : [];

const getAddonPurchases = (lineItems: unknown) => {
  const purchases: Array<{ type: "ai_credits" | "contacts"; credits: number }> = [];

  for (const item of toLineItems(lineItems)) {
    const type = String(item.type || item.addonType || "")
      .trim()
      .toLowerCase();
    const credits = Math.max(
      0,
      Math.floor(Number(item.credits || item.quantity || item.units || 0))
    );

    if (!credits) {
      continue;
    }

    if (type === "ai_credits" || type === "addon_ai_credits") {
      purchases.push({
        type: "ai_credits",
        credits,
      });
      continue;
    }

    if (type === "contacts" || type === "addon_contacts") {
      purchases.push({
        type: "contacts",
        credits,
      });
    }
  }

  return purchases;
};

const isPendingEntitlementReconcile = (value: unknown) => {
  const metadata = toRecord(value);
  return Boolean(metadata.pendingEntitlementReconcile);
};

const getProposalBillingCycle = (proposal: {
  pricingSnapshot: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
}): BillingCycle =>
  normalizeBillingCycle(
    String(
      toRecord(proposal.pricingSnapshot).billingCycle ||
        toRecord(proposal.metadata).billingCycle ||
        "monthly"
    )
  );

const resolvePeriodEnd = (from: Date, billingCycle: BillingCycle) =>
  new Date(
    from.getTime() + (billingCycle === "yearly" ? ONE_YEAR_MS : ONE_MONTH_MS)
  );

export const settleSuccessfulCheckout = async (input: {
  paymentIntentId?: string | null;
  providerPaymentIntentId?: string | null;
  paymentIntentKey?: string | null;
  providerSubscriptionId?: string | null;
  occurredAt?: Date;
  source?: string;
}) => {
  if (
    !input.paymentIntentId &&
    !input.providerPaymentIntentId &&
    !input.paymentIntentKey
  ) {
    return {
      settled: false,
      reason: "payment_intent_identifier_required",
    };
  }

  const paymentIntentLookupOr = [
    input.providerPaymentIntentId
      ? {
          providerPaymentIntentId: input.providerPaymentIntentId,
        }
      : null,
    input.paymentIntentKey
      ? {
          paymentIntentKey: input.paymentIntentKey,
        }
      : null,
  ].filter(Boolean) as Array<Record<string, string>>;

  const paymentIntent = input.paymentIntentId
    ? await prisma.paymentIntentLedger.findUnique({
        where: {
          id: input.paymentIntentId,
        },
      })
    : await prisma.paymentIntentLedger.findFirst({
        where: {
          OR: paymentIntentLookupOr,
        },
      });

  if (!paymentIntent) {
    return {
      settled: false,
      reason: "payment_intent_not_found",
    };
  }

  const proposal = paymentIntent.proposalId
    ? await prisma.proposalLedger.findUnique({
        where: {
          id: paymentIntent.proposalId,
        },
      })
    : null;

  if (!proposal) {
    await prisma.paymentIntentLedger
      .update({
        where: {
          id: paymentIntent.id,
        },
        data: {
          status: "SUCCEEDED",
          capturedMinor: Math.max(
            Number(paymentIntent.capturedMinor || 0),
            Number(paymentIntent.amountMinor || 0)
          ),
          metadata: mergeMetadata(paymentIntent.metadata, {
            settlementSource: input.source || "billing_settlement",
            settledAt: new Date().toISOString(),
          }) as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);

    await invalidateBillingContextCache(paymentIntent.businessId);

    return {
      settled: false,
      reason: "proposal_missing",
      paymentIntentId: paymentIntent.id,
    };
  }

  const now = input.occurredAt || new Date();
  const planCode = getProposalPlanCode(proposal);
  const billingCycle = getProposalBillingCycle(proposal);
  const currency = normalizeCurrency(proposal.currency as unknown as string);
  const quantity = Math.max(1, Number(proposal.quantity || 1));
  const unitPriceMinor = Math.max(
    0,
    Number(proposal.unitPriceMinor || Math.round(proposal.totalMinor / quantity))
  );
  const amountMinor = Math.max(0, Number(proposal.totalMinor || unitPriceMinor * quantity));
  const subscriptionIdempotencyKey = `checkout:settlement:subscription:${paymentIntent.id}`;
  const invoiceIdempotencyKey = `checkout:settlement:invoice:${paymentIntent.id}`;
  const periodEnd = resolvePeriodEnd(now, billingCycle);
  const invoiceNumber = buildInvoiceNumber({
    paymentIntentKey: paymentIntent.paymentIntentKey,
    now,
  });

  const settled = await prisma.$transaction(async (tx) => {
    let shouldQueueBillingEmail = false;

    let subscription = await tx.subscriptionLedger.findUnique({
      where: {
        idempotencyKey: subscriptionIdempotencyKey,
      },
    });

    if (!subscription) {
      const bootstrapSubscription = await tx.subscriptionLedger.findFirst({
        where: {
          businessId: paymentIntent.businessId,
          status: "PENDING",
          planCode: "FREE_LOCKED",
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      if (bootstrapSubscription) {
        subscription = await tx.subscriptionLedger.update({
          where: {
            id: bootstrapSubscription.id,
          },
          data: {
            status: "ACTIVE",
            provider: "STRIPE",
            providerSubscriptionId: input.providerSubscriptionId || bootstrapSubscription.providerSubscriptionId,
            planCode,
            billingCycle,
            currency,
            quantity,
            unitPriceMinor,
            amountMinor,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            renewAt: periodEnd,
            pausedAt: null,
            cancelledAt: null,
            metadata: mergeMetadata(bootstrapSubscription.metadata, {
              source: "checkout_settlement",
              paymentIntentId: paymentIntent.id,
            }) as Prisma.InputJsonValue,
            idempotencyKey: subscriptionIdempotencyKey,
            version: {
              increment: 1,
            },
          },
        });
      } else {
        subscription = await tx.subscriptionLedger.create({
          data: {
            businessId: paymentIntent.businessId,
            proposalId: proposal.id,
            subscriptionKey: buildLedgerKey("subscription"),
            status: "ACTIVE",
            provider: "STRIPE",
            providerSubscriptionId: input.providerSubscriptionId || null,
            planCode,
            billingCycle,
            currency,
            quantity,
            unitPriceMinor,
            amountMinor,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            renewAt: periodEnd,
            metadata: {
              source: "checkout_settlement",
              paymentIntentId: paymentIntent.id,
            } as Prisma.InputJsonValue,
            idempotencyKey: subscriptionIdempotencyKey,
          },
        });
      }

      shouldQueueBillingEmail = true;
    } else if (subscription.status !== "ACTIVE") {
      subscription = await tx.subscriptionLedger.update({
        where: {
          id: subscription.id,
        },
        data: {
          status: "ACTIVE",
          providerSubscriptionId: input.providerSubscriptionId || subscription.providerSubscriptionId,
          currentPeriodStart: subscription.currentPeriodStart || now,
          currentPeriodEnd: subscription.currentPeriodEnd || periodEnd,
          renewAt: subscription.renewAt || periodEnd,
          metadata: mergeMetadata(subscription.metadata, {
            settlementSource: input.source || "billing_settlement",
            paymentIntentId: paymentIntent.id,
          }) as Prisma.InputJsonValue,
          version: {
            increment: 1,
          },
        },
      });
      shouldQueueBillingEmail = true;
    }

    let invoice = await tx.invoiceLedger.findUnique({
      where: {
        idempotencyKey: invoiceIdempotencyKey,
      },
    });

    if (!invoice) {
      invoice = await tx.invoiceLedger.create({
        data: {
          businessId: paymentIntent.businessId,
          proposalId: proposal.id,
          subscriptionId: subscription.id,
          invoiceKey: buildLedgerKey("invoice"),
          status: "PAID",
          currency: currency as Currency,
          subtotalMinor: Math.max(0, Number(proposal.subtotalMinor || amountMinor)),
          taxMinor: Math.max(0, Number(proposal.taxMinor || 0)),
          totalMinor: amountMinor,
          paidMinor: amountMinor,
          dueAt: now,
          issuedAt: now,
          paidAt: now,
          externalInvoiceId: invoiceNumber,
          metadata: {
            source: "checkout_settlement",
            paymentIntentId: paymentIntent.id,
            invoiceNumber,
            receiptNumber: `RCT-${invoiceNumber}`,
          } as Prisma.InputJsonValue,
          idempotencyKey: invoiceIdempotencyKey,
        },
      });
      shouldQueueBillingEmail = true;
    } else if (invoice.status !== "PAID") {
      invoice = await tx.invoiceLedger.update({
        where: {
          id: invoice.id,
        },
        data: {
          status: "PAID",
          paidMinor: Math.max(invoice.paidMinor, amountMinor),
          paidAt: invoice.paidAt || now,
          metadata: mergeMetadata(invoice.metadata, {
            settlementSource: input.source || "billing_settlement",
            paymentIntentId: paymentIntent.id,
            invoiceNumber: invoice.externalInvoiceId || invoiceNumber,
            receiptNumber: `RCT-${invoice.externalInvoiceId || invoiceNumber}`,
          }) as Prisma.InputJsonValue,
        },
      });
      shouldQueueBillingEmail = true;
    }

    await tx.paymentIntentLedger.update({
      where: {
        id: paymentIntent.id,
      },
      data: {
        status: "SUCCEEDED",
        capturedMinor: Math.max(
          Number(paymentIntent.capturedMinor || 0),
          amountMinor
        ),
        proposalId: proposal.id,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        metadata: mergeMetadata(paymentIntent.metadata, {
          settlementSource: input.source || "billing_settlement",
          settledAt: now.toISOString(),
        }) as Prisma.InputJsonValue,
      },
    });

    if (proposal.status === "APPROVED" || proposal.status === "SENT") {
      await tx.proposalLedger.update({
        where: {
          id: proposal.id,
        },
        data: {
          status: "ACCEPTED",
          acceptedAt: proposal.acceptedAt || now,
          metadata: mergeMetadata(proposal.metadata, {
            acceptedBy: "SELF",
            acceptedFromPaymentIntentId: paymentIntent.id,
          }) as Prisma.InputJsonValue,
        },
      });
    }

    return {
      subscription,
      invoice,
      shouldQueueBillingEmail,
    };
  });

  await invalidateBillingContextCache(paymentIntent.businessId);

  if (settled.shouldQueueBillingEmail) {
    const owner = await prisma.business.findUnique({
      where: {
        id: paymentIntent.businessId,
      },
      select: {
        owner: {
          select: {
            email: true,
          },
        },
      },
    });

    if (owner?.owner?.email) {
      void scheduleBillingEmail({
        to: owner.owner.email,
        plan: planCode,
        amountMinor,
        currency,
        reference: paymentIntent.id,
      });
    }
  }

  const mappedTier = mapPlanCodeToSaaSTier(planCode);
  const entitlementReconcileReasons: string[] = [];

  if (mappedTier) {
    const remainingCycleDays = Math.max(
      1,
      Math.floor((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    );
    await processPlanUpgrade({
      businessId: paymentIntent.businessId,
      toPlan: mappedTier,
      replayToken: `billing_settlement:${paymentIntent.id}:${planCode}`,
      remainingCycleDays,
    }).catch((error) => {
      entitlementReconcileReasons.push(
        `plan_upgrade_sync_failed:${String((error as { message?: unknown })?.message || "unknown")}`
      );
      return undefined;
    });
  }

  const addonPurchases = getAddonPurchases(proposal.lineItems);
  for (const purchase of addonPurchases) {
    await purchaseAddon(paymentIntent.businessId, purchase.type, purchase.credits).catch(
      (error) => {
        entitlementReconcileReasons.push(
          `addon_sync_failed:${purchase.type}:${purchase.credits}:${String(
            (error as { message?: unknown })?.message || "unknown"
          )}`
        );
        return undefined;
      }
    );
  }
  const pendingEntitlementReconcile = entitlementReconcileReasons.length > 0;

  await Promise.all([
    prisma.paymentIntentLedger
      .update({
        where: {
          id: paymentIntent.id,
        },
        data: {
          metadata: mergeMetadata(paymentIntent.metadata, {
            pendingEntitlementReconcile,
            entitlementReconcileReasons:
              entitlementReconcileReasons.length > 0 ? entitlementReconcileReasons : null,
            entitlementReconcileUpdatedAt: new Date().toISOString(),
          }) as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined),
    prisma.subscriptionLedger
      .update({
        where: {
          id: settled.subscription.id,
        },
        data: {
          metadata: mergeMetadata(settled.subscription.metadata, {
            pendingEntitlementReconcile,
            entitlementReconcileReasons:
              entitlementReconcileReasons.length > 0 ? entitlementReconcileReasons : null,
            entitlementReconcileUpdatedAt: new Date().toISOString(),
          }) as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined),
  ]);

  return {
    settled: true,
    paymentIntentId: paymentIntent.id,
    subscriptionId: settled.subscription.id,
    invoiceId: settled.invoice.id,
    planCode,
    billingCycle,
    currency,
    addonCreditsApplied: addonPurchases,
    pendingEntitlementReconcile,
    entitlementReconcileReasons,
  };
};

export const reconcilePendingEntitlementSync = async ({
  limit = 100,
}: {
  limit?: number;
} = {}) => {
  const normalizedLimit = Math.max(1, Math.min(500, Math.floor(Number(limit || 100))));
  const candidates = await prisma.paymentIntentLedger.findMany({
    where: {
      status: "SUCCEEDED",
      subscriptionId: {
        not: null,
      },
    },
    include: {
      proposal: {
        select: {
          lineItems: true,
        },
      },
      subscription: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: Math.max(normalizedLimit * 5, 200),
  });

  const pending = candidates
    .filter(
      (row) =>
        isPendingEntitlementReconcile(row.metadata) ||
        isPendingEntitlementReconcile(row.subscription?.metadata)
    )
    .slice(0, normalizedLimit);

  let processed = 0;
  let recovered = 0;
  let failed = 0;
  const failureDetails: Array<{ paymentIntentId: string; error: string }> = [];

  for (const row of pending) {
    const subscription = row.subscription;
    if (!subscription) {
      continue;
    }

    processed += 1;
    const entitlementReconcileReasons: string[] = [];
    const mappedTier = mapPlanCodeToSaaSTier(subscription.planCode);
    const cycleAnchor = subscription.currentPeriodEnd || subscription.renewAt || new Date();
    const remainingCycleDays = Math.max(
      1,
      Math.floor((cycleAnchor.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    );

    if (mappedTier) {
      await processPlanUpgrade({
        businessId: row.businessId,
        toPlan: mappedTier,
        replayToken: `entitlement_reconcile:${row.id}:${subscription.planCode}`,
        remainingCycleDays,
      }).catch((error) => {
        entitlementReconcileReasons.push(
          `plan_upgrade_sync_failed:${String((error as { message?: unknown })?.message || "unknown")}`
        );
        return undefined;
      });
    }

    const addonPurchases = getAddonPurchases(row.proposal?.lineItems);
    for (const purchase of addonPurchases) {
      await purchaseAddon(row.businessId, purchase.type, purchase.credits).catch((error) => {
        entitlementReconcileReasons.push(
          `addon_sync_failed:${purchase.type}:${purchase.credits}:${String(
            (error as { message?: unknown })?.message || "unknown"
          )}`
        );
        return undefined;
      });
    }

    const pendingEntitlementReconcile = entitlementReconcileReasons.length > 0;
    if (pendingEntitlementReconcile) {
      failed += 1;
      failureDetails.push({
        paymentIntentId: row.id,
        error: entitlementReconcileReasons.join(";"),
      });
    } else {
      recovered += 1;
    }

    await Promise.all([
      prisma.paymentIntentLedger
        .update({
          where: {
            id: row.id,
          },
          data: {
            metadata: mergeMetadata(row.metadata, {
              pendingEntitlementReconcile,
              entitlementReconcileReasons:
                entitlementReconcileReasons.length > 0 ? entitlementReconcileReasons : null,
              entitlementReconcileUpdatedAt: new Date().toISOString(),
            }) as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined),
      prisma.subscriptionLedger
        .update({
          where: {
            id: subscription.id,
          },
          data: {
            metadata: mergeMetadata(subscription.metadata, {
              pendingEntitlementReconcile,
              entitlementReconcileReasons:
                entitlementReconcileReasons.length > 0 ? entitlementReconcileReasons : null,
              entitlementReconcileUpdatedAt: new Date().toISOString(),
            }) as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined),
    ]);
  }

  return {
    scanned: candidates.length,
    pending: pending.length,
    processed,
    recovered,
    failed,
    failureDetails: failureDetails.slice(0, 20),
  };
};
