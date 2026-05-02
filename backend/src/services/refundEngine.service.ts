import { Prisma, RefundStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { commerceAuthorityService } from "./commerceAuthority.service";
import { publishCommerceEvent } from "./commerceEvent.service";
import { commerceProviderRegistry } from "./commerce/providers/commerceProviderRegistry.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { revenueRecognitionService } from "./revenueRecognition.service";
import { taxComplianceService } from "./taxCompliance.service";
import {
  REFUND_TRANSITIONS,
  assertTransition,
  buildDeterministicDigest,
  buildLedgerKey,
  getScopedAndLegacyIdempotencyCandidates,
  mergeMetadata,
  normalizeActor,
  scopeIdempotencyKey,
  toMinor,
} from "./commerce/shared";

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const scoreRefundRisk = ({
  amountMinor,
  reason,
  paymentAgeHours,
}: {
  amountMinor: number;
  reason?: string | null;
  paymentAgeHours?: number;
}) => {
  let score = 10;

  if (amountMinor > 200_000) score += 35;
  if (amountMinor > 50_000) score += 15;
  if (/fraud|chargeback/i.test(String(reason || ""))) score += 25;
  if ((paymentAgeHours || 0) < 2) score += 20;

  return Math.max(0, Math.min(100, score));
};

export const createRefundEngineService = () => {
  const requestRefund = async ({
    businessId,
    paymentIntentKey,
    invoiceKey = null,
    amountMinor,
    reason = null,
    requestedBy = "HUMAN",
    metadata = null,
    idempotencyKey = null,
  }: {
    businessId: string;
    paymentIntentKey: string;
    invoiceKey?: string | null;
    amountMinor: number;
    reason?: string | null;
    requestedBy?: string;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) => {
    const paymentIntent = await prisma.paymentIntentLedger.findFirst({
      where: {
        businessId,
        paymentIntentKey,
      },
    });

    if (!paymentIntent) {
      throw new Error("payment_intent_not_found");
    }

    await commerceAuthorityService.assertNoActiveManualOverride({
      businessId,
      scope: "REFUND_REVIEW",
      provider: paymentIntent.provider,
    });

    if (!["SUCCEEDED", "PARTIALLY_CAPTURED"].includes(paymentIntent.status)) {
      throw new Error(`payment_intent_not_refundable:${paymentIntent.status}`);
    }

    const invoice = invoiceKey
      ? await prisma.invoiceLedger.findFirst({
          where: {
            businessId,
            invoiceKey,
          },
        })
      : paymentIntent.invoiceId
      ? await prisma.invoiceLedger.findUnique({
          where: {
            id: paymentIntent.invoiceId,
          },
        })
      : null;
    const proposal = paymentIntent.proposalId
      ? await prisma.proposalLedger.findUnique({
          where: {
            id: paymentIntent.proposalId,
          },
          select: {
            leadId: true,
          },
        })
      : null;
    const runtime = await getIntelligenceRuntimeInfluence({
      businessId,
      leadId: proposal?.leadId || null,
    }).catch(() => null);

    const normalizedAmount = Math.min(
      toMinor(amountMinor),
      Math.max(0, paymentIntent.capturedMinor || paymentIntent.amountMinor)
    );
    const rawIdempotency = String(idempotencyKey || "").trim() || null;
    const normalizedIdempotency =
      scopeIdempotencyKey({
        businessId,
        idempotencyKey: rawIdempotency,
      }) ||
      buildDeterministicDigest({
        businessId,
        paymentIntentKey,
        invoiceKey,
        normalizedAmount,
        reason,
      });

    const existing = rawIdempotency
      ? await prisma.refundLedger.findFirst({
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
      : await prisma.refundLedger.findUnique({
          where: {
            idempotencyKey: normalizedIdempotency,
          },
        });

    if (existing) {
      return existing;
    }

    const adapter = commerceProviderRegistry.resolve(paymentIntent.provider);
    const paymentAgeHours =
      paymentIntent.updatedAt instanceof Date
        ? Math.max(
            0,
            (Date.now() - paymentIntent.updatedAt.getTime()) / (60 * 60 * 1000)
          )
        : 24;
    const riskScore = scoreRefundRisk({
      amountMinor: normalizedAmount,
      reason,
      paymentAgeHours,
    });
    const manualReviewAmountThreshold = Math.max(
      10_000,
      Number(runtime?.controls.commerce.refundManualReviewThresholdMinor || 100_000)
    );
    const chargebackGate = Math.max(
      0.1,
      Math.min(0.95, Number(runtime?.controls.commerce.chargebackRiskGate || 0.72))
    );
    const manualReviewRequired =
      normalizedAmount >= manualReviewAmountThreshold ||
      riskScore / 100 >= chargebackGate ||
      Boolean(runtime?.anomalies.critical.includes("refund_spike")) ||
      Boolean(runtime?.anomalies.critical.includes("chargeback_spike")) ||
      String(runtime?.overrideScopes.COMMERCE_MANUAL_REVIEW?.action || "") === "ENABLE";

    const requested = await prisma.refundLedger.create({
      data: {
        businessId,
        paymentIntentId: paymentIntent.id,
        invoiceId: invoice?.id || null,
        refundKey: buildLedgerKey("refund"),
        provider: paymentIntent.provider,
        status: "REQUESTED",
        amountMinor: normalizedAmount,
        currency: paymentIntent.currency,
        reason,
        requestedBy: normalizeActor(requestedBy),
        riskScore,
        metadata: mergeMetadata(
          {
            paymentIntentKey,
            invoiceKey: invoice?.invoiceKey || invoiceKey || null,
            manualReviewRequired,
            manualReviewAmountThreshold,
            chargebackGate,
            intelligencePolicyVersion: runtime?.policyVersion || null,
          },
          metadata || undefined
        ) as Prisma.InputJsonValue,
        idempotencyKey: normalizedIdempotency,
      },
    });

    await publishCommerceEvent({
      event: "commerce.refund.status_changed",
      businessId,
      aggregateType: "refund_ledger",
      aggregateId: requested.id,
      eventKey: `${requested.refundKey}:requested`,
      payload: {
        businessId,
        refundId: requested.id,
        refundKey: requested.refundKey,
        from: null,
        to: requested.status,
        paymentIntentId: paymentIntent.id,
        invoiceId: invoice?.id || null,
        riskScore,
      },
    });

    await taxComplianceService.recordTaxEvent({
      businessId,
      eventType: "REFUND_REQUEST",
      jurisdiction: String(toRecord(requested.metadata).jurisdiction || "GLOBAL"),
      taxType: String(
        toRecord(requested.metadata).taxType ||
          (requested.currency === "INR" ? "GST" : "VAT")
      ),
      reverseCharge: Boolean(toRecord(requested.metadata).reverseCharge),
      exemptionCode:
        String(toRecord(requested.metadata).exemptionCode || "").trim() || null,
      withholdingMinor: Number(toRecord(requested.metadata).withholdingMinor || 0),
      taxableMinor: requested.amountMinor,
      taxMinor: 0,
      totalMinor: requested.amountMinor,
      currency: requested.currency,
      invoiceKey: invoice?.invoiceKey || null,
      refundKey: requested.refundKey,
      mappingRef: `refund:${requested.refundKey}:requested`,
      metadata: {
        reason: requested.reason,
        paymentIntentKey,
      },
      idempotencyKey: `tax:refund:${requested.id}:requested`,
      occurredAt: requested.requestedAt,
    });

    if (manualReviewRequired) {
      await publishCommerceEvent({
        event: "commerce.refund.review_required",
        businessId,
        aggregateType: "refund_ledger",
        aggregateId: requested.id,
        eventKey: `${requested.refundKey}:manual_review`,
        payload: {
          businessId,
          refundId: requested.id,
          refundKey: requested.refundKey,
          amountMinor: requested.amountMinor,
          currency: requested.currency,
          riskScore,
          manualReviewAmountThreshold,
          chargebackGate,
        },
      });

      return requested;
    }

    const providerResult = await adapter.createRefund({
      paymentIntentId:
        paymentIntent.providerPaymentIntentId || paymentIntent.paymentIntentKey,
      amountMinor: requested.amountMinor,
      currency: requested.currency,
      reason,
      metadata: {
        refundKey: requested.refundKey,
      },
    });

    const nextStatus = providerResult.status === "SUCCEEDED" ? "SUCCEEDED" : "PROCESSING";

    const updated = await prisma.refundLedger.update({
      where: {
        id: requested.id,
      },
      data: {
        status: nextStatus,
        providerRefundId: providerResult.providerRefundId,
        processedAt: nextStatus === "SUCCEEDED" ? new Date() : null,
        metadata: mergeMetadata(requested.metadata, {
          providerMetadata: providerResult.metadata || null,
        }) as Prisma.InputJsonValue,
      },
    });

    await publishCommerceEvent({
      event: "commerce.refund.status_changed",
      businessId,
      aggregateType: "refund_ledger",
      aggregateId: updated.id,
      eventKey: `${updated.refundKey}:${nextStatus}`,
      payload: {
        businessId,
        refundId: updated.id,
        refundKey: updated.refundKey,
        from: requested.status,
        to: nextStatus,
        providerRefundId: updated.providerRefundId,
      },
    });

    if (nextStatus === "SUCCEEDED") {
      await revenueRecognitionService.recordStage({
        businessId,
        stage: "REFUNDED",
        amountMinor: updated.amountMinor,
        currency: updated.currency,
        sourceEvent: "refund_succeeded",
        invoiceId: updated.invoiceId,
        paymentIntentId: updated.paymentIntentId,
        refundId: updated.id,
        idempotencyKey: `revrec:refunded:${updated.id}`,
      });

      await taxComplianceService.recordTaxEvent({
        businessId,
        eventType: "CREDIT_NOTE",
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
        invoiceKey: invoice?.invoiceKey || null,
        refundKey: updated.refundKey,
        creditNoteKey: `cn_${updated.refundKey}`,
        mappingRef: `refund:${updated.refundKey}:credit_note`,
        metadata: {
          providerRefundId: updated.providerRefundId,
          reason: updated.reason,
        },
        idempotencyKey: `tax:refund:${updated.id}:credit_note`,
        occurredAt: updated.processedAt || new Date(),
      });
    }

    return updated;
  };

  const transitionRefundStatus = async ({
    businessId,
    refundKey,
    nextStatus,
    metadata = null,
  }: {
    businessId: string;
    refundKey: string;
    nextStatus: RefundStatus;
    metadata?: Record<string, unknown> | null;
  }) => {
    const refund = await prisma.refundLedger.findFirst({
      where: {
        businessId,
        refundKey,
      },
    });

    if (!refund) {
      throw new Error("refund_not_found");
    }

    assertTransition({
      current: refund.status,
      next: nextStatus,
      transitions: REFUND_TRANSITIONS,
      scope: "refund",
    });

    const updated = await prisma.refundLedger.update({
      where: {
        id: refund.id,
      },
      data: {
        status: nextStatus,
        processedAt: nextStatus === "SUCCEEDED" ? new Date() : refund.processedAt,
        metadata: mergeMetadata(refund.metadata, metadata || undefined) as Prisma.InputJsonValue,
      },
    });

    await publishCommerceEvent({
      event: "commerce.refund.status_changed",
      businessId,
      aggregateType: "refund_ledger",
      aggregateId: updated.id,
      eventKey: `${refundKey}:${refund.status}:${nextStatus}`,
      payload: {
        businessId,
        refundId: updated.id,
        refundKey,
        from: refund.status,
        to: nextStatus,
      },
    });

    if (nextStatus === "SUCCEEDED") {
      await taxComplianceService.recordTaxEvent({
        businessId,
        eventType: "CREDIT_NOTE",
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
        invoiceKey: null,
        refundKey: updated.refundKey,
        creditNoteKey: `cn_${updated.refundKey}`,
        mappingRef: `refund:${updated.refundKey}:manual_transition`,
        metadata: {
          transitionSource: "refund_transition",
        },
        idempotencyKey: `tax:refund:${updated.id}:transition:${nextStatus}`,
      });
    }

    return updated;
  };

  return {
    requestRefund,
    transitionRefundStatus,
  };
};

export const refundEngineService = createRefundEngineService();
