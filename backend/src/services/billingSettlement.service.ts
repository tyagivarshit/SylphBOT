import type { BillingCycle, Currency, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { invalidateBillingContextCache } from "../middleware/subscription.middleware";
import { scheduleBillingEmail } from "../queues/authEmail.queue";
import { buildLedgerKey, mergeMetadata, normalizeBillingCycle, normalizeCurrency } from "./commerce/shared";

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
          metadata: {
            source: "checkout_settlement",
            paymentIntentId: paymentIntent.id,
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

  return {
    settled: true,
    paymentIntentId: paymentIntent.id,
    subscriptionId: settled.subscription.id,
    invoiceId: settled.invoice.id,
    planCode,
    billingCycle,
    currency,
  };
};
