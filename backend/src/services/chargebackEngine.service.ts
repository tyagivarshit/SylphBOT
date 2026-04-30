import { ChargebackStatus, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { publishCommerceEvent } from "./commerceEvent.service";
import { revenueRecognitionService } from "./revenueRecognition.service";
import { taxComplianceService } from "./taxCompliance.service";
import {
  CHARGEBACK_TRANSITIONS,
  assertTransition,
  buildDeterministicDigest,
  buildLedgerKey,
  mergeMetadata,
  normalizeCurrency,
  normalizeProvider,
  toMinor,
} from "./commerce/shared";

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const scoreChargebackRisk = ({
  amountMinor,
  reasonCode,
}: {
  amountMinor: number;
  reasonCode?: string | null;
}) => {
  let score = 30;

  if (amountMinor > 200_000) score += 35;
  if (amountMinor > 50_000) score += 20;
  if (/fraud|unauthorized|stolen/i.test(String(reasonCode || ""))) score += 30;

  return Math.max(0, Math.min(100, score));
};

export const createChargebackEngineService = () => {
  const openChargeback = async ({
    businessId,
    paymentIntentId = null,
    invoiceId = null,
    provider = "STRIPE",
    providerCaseId,
    amountMinor,
    currency,
    reasonCode = null,
    evidenceDueAt = null,
    metadata = null,
    idempotencyKey = null,
  }: {
    businessId: string;
    paymentIntentId?: string | null;
    invoiceId?: string | null;
    provider?: string;
    providerCaseId: string;
    amountMinor: number;
    currency: string;
    reasonCode?: string | null;
    evidenceDueAt?: Date | null;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) => {
    const normalizedIdempotency =
      String(idempotencyKey || "").trim() ||
      buildDeterministicDigest({
        businessId,
        paymentIntentId,
        invoiceId,
        provider,
        providerCaseId,
      });

    const existing = await prisma.chargebackLedger.findUnique({
      where: {
        idempotencyKey: normalizedIdempotency,
      },
    });

    if (existing) {
      return existing;
    }

    const row = await prisma.chargebackLedger.create({
      data: {
        businessId,
        paymentIntentId,
        invoiceId,
        chargebackKey: buildLedgerKey("chargeback"),
        provider: normalizeProvider(provider),
        providerCaseId,
        status: "RECEIVED",
        amountMinor: toMinor(amountMinor),
        currency: normalizeCurrency(currency),
        reasonCode,
        riskScore: scoreChargebackRisk({
          amountMinor,
          reasonCode,
        }),
        evidenceDueAt,
        metadata: (metadata || undefined) as Prisma.InputJsonValue,
        idempotencyKey: normalizedIdempotency,
      },
    });

    await publishCommerceEvent({
      event: "commerce.chargeback.status_changed",
      businessId,
      aggregateType: "chargeback_ledger",
      aggregateId: row.id,
      eventKey: `${row.chargebackKey}:received`,
      payload: {
        businessId,
        chargebackId: row.id,
        chargebackKey: row.chargebackKey,
        status: row.status,
        providerCaseId,
        amountMinor: row.amountMinor,
        currency: row.currency,
        reasonCode,
        riskScore: row.riskScore,
      },
    });

    await taxComplianceService.recordTaxEvent({
      businessId,
      eventType: "CHARGEBACK",
      jurisdiction: String(toRecord(row.metadata).jurisdiction || "GLOBAL"),
      taxType: String(
        toRecord(row.metadata).taxType ||
          (row.currency === "INR" ? "GST" : "VAT")
      ),
      reverseCharge: Boolean(toRecord(row.metadata).reverseCharge),
      exemptionCode:
        String(toRecord(row.metadata).exemptionCode || "").trim() || null,
      withholdingMinor: Number(toRecord(row.metadata).withholdingMinor || 0),
      taxableMinor: row.amountMinor,
      taxMinor: 0,
      totalMinor: row.amountMinor,
      currency: row.currency,
      invoiceKey: null,
      chargebackKey: row.chargebackKey,
      mappingRef: `chargeback:${row.chargebackKey}:opened`,
      metadata: {
        providerCaseId,
        reasonCode,
      },
      idempotencyKey: `tax:chargeback:${row.id}:opened`,
    });

    return row;
  };

  const transitionChargebackStatus = async ({
    businessId,
    chargebackKey,
    nextStatus,
    metadata = null,
  }: {
    businessId: string;
    chargebackKey: string;
    nextStatus: ChargebackStatus;
    metadata?: Record<string, unknown> | null;
  }) => {
    const chargeback = await prisma.chargebackLedger.findFirst({
      where: {
        businessId,
        chargebackKey,
      },
    });

    if (!chargeback) {
      throw new Error("chargeback_not_found");
    }

    assertTransition({
      current: chargeback.status,
      next: nextStatus,
      transitions: CHARGEBACK_TRANSITIONS,
      scope: "chargeback",
    });

    const updated = await prisma.chargebackLedger.update({
      where: {
        id: chargeback.id,
      },
      data: {
        status: nextStatus,
        resolvedAt:
          nextStatus === "WON" ||
          nextStatus === "LOST" ||
          nextStatus === "ACCEPTED" ||
          nextStatus === "REVERSED"
            ? new Date()
            : chargeback.resolvedAt,
        metadata: mergeMetadata(chargeback.metadata, metadata || undefined) as Prisma.InputJsonValue,
      },
    });

    await publishCommerceEvent({
      event: "commerce.chargeback.status_changed",
      businessId,
      aggregateType: "chargeback_ledger",
      aggregateId: updated.id,
      eventKey: `${chargebackKey}:${chargeback.status}:${nextStatus}`,
      payload: {
        businessId,
        chargebackId: updated.id,
        chargebackKey,
        from: chargeback.status,
        to: nextStatus,
      },
    });

    if (nextStatus === "LOST" || nextStatus === "ACCEPTED") {
      await revenueRecognitionService.recordStage({
        businessId,
        stage: "REFUNDED",
        amountMinor: updated.amountMinor,
        currency: updated.currency,
        sourceEvent: "chargeback_lost",
        invoiceId: updated.invoiceId,
        paymentIntentId: updated.paymentIntentId,
        chargebackId: updated.id,
        idempotencyKey: `revrec:chargeback:${updated.id}:lost`,
      });
    }

    if (nextStatus === "REVERSED") {
      await taxComplianceService.recordTaxEvent({
        businessId,
        eventType: "CHARGEBACK_REVERSAL",
        jurisdiction: String(toRecord(updated.metadata).jurisdiction || "GLOBAL"),
        taxType: String(
          toRecord(updated.metadata).taxType ||
            (updated.currency === "INR" ? "GST" : "VAT")
        ),
        reverseCharge: Boolean(toRecord(updated.metadata).reverseCharge),
        exemptionCode:
          String(toRecord(updated.metadata).exemptionCode || "").trim() || null,
        withholdingMinor: Number(toRecord(updated.metadata).withholdingMinor || 0),
        taxableMinor: updated.amountMinor,
        taxMinor: 0,
        totalMinor: updated.amountMinor,
        currency: updated.currency,
        chargebackKey: updated.chargebackKey,
        mappingRef: `chargeback:${updated.chargebackKey}:reversal`,
        metadata: {
          previousStatus: chargeback.status,
        },
        idempotencyKey: `tax:chargeback:${updated.id}:reversal`,
      });
    }

    return updated;
  };

  return {
    openChargeback,
    transitionChargebackStatus,
  };
};

export const chargebackEngineService = createChargebackEngineService();
