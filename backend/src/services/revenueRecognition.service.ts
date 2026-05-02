import { Prisma, RevenueRecognitionStage } from "@prisma/client";
import prisma from "../config/prisma";
import { publishCommerceEvent } from "./commerceEvent.service";
import {
  buildDeterministicDigest,
  buildLedgerKey,
  getScopedAndLegacyIdempotencyCandidates,
  normalizeCurrency,
  scopeIdempotencyKey,
} from "./commerce/shared";

export const createRevenueRecognitionService = () => {
  const recordStage = async ({
    businessId,
    stage,
    amountMinor,
    currency,
    sourceEvent,
    proposalId = null,
    contractId = null,
    invoiceId = null,
    paymentIntentId = null,
    subscriptionId = null,
    refundId = null,
    chargebackId = null,
    periodStart = null,
    periodEnd = null,
    metadata = null,
    idempotencyKey = null,
    occurredAt = new Date(),
  }: {
    businessId: string;
    stage: RevenueRecognitionStage;
    amountMinor: number;
    currency: string;
    sourceEvent: string;
    proposalId?: string | null;
    contractId?: string | null;
    invoiceId?: string | null;
    paymentIntentId?: string | null;
    subscriptionId?: string | null;
    refundId?: string | null;
    chargebackId?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
    occurredAt?: Date;
  }) => {
    const normalizedIdempotency =
      scopeIdempotencyKey({
        businessId,
        idempotencyKey: idempotencyKey || null,
      }) ||
      buildDeterministicDigest({
        businessId,
        stage,
        amountMinor,
        currency,
        sourceEvent,
        proposalId,
        contractId,
        invoiceId,
        paymentIntentId,
        subscriptionId,
        refundId,
        chargebackId,
        occurredAt: occurredAt.toISOString(),
      });
    const rawIdempotency = String(idempotencyKey || "").trim() || null;

    const existing = rawIdempotency
      ? await prisma.revenueRecognitionLedger.findFirst({
          where: {
            businessId,
            idempotencyKey: {
              in: getScopedAndLegacyIdempotencyCandidates({
                businessId,
                idempotencyKey: rawIdempotency,
              }),
            },
          },
        })
      : await prisma.revenueRecognitionLedger.findUnique({
          where: {
            idempotencyKey: normalizedIdempotency,
          },
        });

    if (existing) {
      return existing;
    }

    const row = await prisma.revenueRecognitionLedger.create({
      data: {
        businessId,
        proposalId,
        contractId,
        invoiceId,
        paymentIntentId,
        subscriptionId,
        refundId,
        chargebackId,
        recognitionKey: buildLedgerKey("revrec"),
        stage,
        amountMinor: Math.max(0, Math.floor(Number(amountMinor || 0))),
        currency: normalizeCurrency(currency),
        sourceEvent,
        periodStart,
        periodEnd,
        metadata: (metadata || undefined) as Prisma.InputJsonValue,
        idempotencyKey: normalizedIdempotency,
        occurredAt,
      },
    });

    await publishCommerceEvent({
      event: "commerce.revenue.stage_recorded",
      businessId,
      aggregateType: "revenue_recognition_ledger",
      aggregateId: row.id,
      eventKey: `${row.recognitionKey}:${row.stage}`,
      payload: {
        businessId,
        recognitionId: row.id,
        recognitionKey: row.recognitionKey,
        stage: row.stage,
        amountMinor: row.amountMinor,
        currency: row.currency,
        sourceEvent,
        invoiceId,
        paymentIntentId,
        subscriptionId,
        refundId,
        chargebackId,
      },
    });

    return row;
  };

  return {
    recordStage,
  };
};

export const revenueRecognitionService = createRevenueRecognitionService();
