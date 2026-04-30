import prisma from "../config/prisma";
import { publishCommerceEvent } from "./commerceEvent.service";
import { paymentIntentService } from "./paymentIntent.service";
import { mergeMetadata } from "./commerce/shared";

export const createCheckoutRecoveryService = () => {
  const markAbandonedCheckouts = async ({
    now = new Date(),
  }: {
    now?: Date;
  } = {}) => {
    const rows = await prisma.paymentIntentLedger.findMany({
      where: {
        status: {
          in: ["CREATED", "REQUIRES_ACTION", "PROCESSING"],
        },
        checkoutExpiresAt: {
          lte: now,
        },
      },
      orderBy: {
        checkoutExpiresAt: "asc",
      },
      take: 200,
    });

    for (const row of rows) {
      await prisma.paymentIntentLedger.update({
        where: {
          id: row.id,
        },
        data: {
          status: "EXPIRED",
          metadata: mergeMetadata(row.metadata, {
            abandonedAt: now.toISOString(),
          }) as any,
        },
      });

      await publishCommerceEvent({
        event: "commerce.checkout.abandoned",
        businessId: row.businessId,
        aggregateType: "payment_intent_ledger",
        aggregateId: row.id,
        eventKey: `${row.paymentIntentKey}:abandoned`,
        payload: {
          businessId: row.businessId,
          paymentIntentId: row.id,
          paymentIntentKey: row.paymentIntentKey,
          proposalId: row.proposalId,
          checkoutExpiresAt: row.checkoutExpiresAt?.toISOString() || null,
        },
      });
    }

    return {
      count: rows.length,
    };
  };

  const recoverCheckout = async ({
    businessId,
    paymentIntentKey,
    provider,
    recoveredBy = "SELF",
  }: {
    businessId: string;
    paymentIntentKey: string;
    provider?: string;
    recoveredBy?: string;
  }) => {
    const existing = await prisma.paymentIntentLedger.findFirst({
      where: {
        businessId,
        paymentIntentKey,
      },
      include: {
        proposal: true,
      },
    });

    if (!existing) {
      throw new Error("payment_intent_not_found");
    }

    if (!existing.proposal || !existing.proposal.proposalKey) {
      throw new Error("payment_intent_proposal_missing");
    }

    const recovered = await paymentIntentService.createCheckout({
      businessId,
      proposalKey: existing.proposal.proposalKey,
      provider: provider || existing.provider,
      source: recoveredBy,
      idempotencyKey: `checkout_recovery:${existing.id}:${Date.now()}`,
      metadata: {
        recoveredFromPaymentIntentKey: paymentIntentKey,
      },
    });

    await publishCommerceEvent({
      event: "commerce.checkout.recovered",
      businessId,
      aggregateType: "payment_intent_ledger",
      aggregateId: recovered.id,
      eventKey: `${existing.paymentIntentKey}:${recovered.paymentIntentKey}`,
      payload: {
        businessId,
        recoveredFromPaymentIntentId: existing.id,
        recoveredFromPaymentIntentKey: existing.paymentIntentKey,
        recoveredPaymentIntentId: recovered.id,
        recoveredPaymentIntentKey: recovered.paymentIntentKey,
      },
    });

    return recovered;
  };

  return {
    markAbandonedCheckouts,
    recoverCheckout,
  };
};

export const checkoutRecoveryService = createCheckoutRecoveryService();
