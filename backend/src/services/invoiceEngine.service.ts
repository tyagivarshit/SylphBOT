import { InvoiceLedgerStatus, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { commerceAuthorityService } from "./commerceAuthority.service";
import { publishCommerceEvent } from "./commerceEvent.service";
import { revenueRecognitionService } from "./revenueRecognition.service";
import { taxComplianceService } from "./taxCompliance.service";
import {
  INVOICE_TRANSITIONS,
  applyTax,
  assertTransition,
  buildDeterministicDigest,
  buildLedgerKey,
  getScopedAndLegacyIdempotencyCandidates,
  mergeMetadata,
  normalizeCurrency,
  scopeIdempotencyKey,
  toMinor,
} from "./commerce/shared";

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const buildInvoiceNumber = ({
  invoiceKey,
  issuedAt,
}: {
  invoiceKey: string;
  issuedAt: Date;
}) => {
  const stamp = issuedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const tail = String(invoiceKey || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toUpperCase();

  return `INV-${stamp}-${tail || "AUTO"}`;
};

const getSourceAmount = async ({
  businessId,
  proposalKey,
  contractKey,
  subscriptionKey,
}: {
  businessId: string;
  proposalKey?: string | null;
  contractKey?: string | null;
  subscriptionKey?: string | null;
}) => {
  if (proposalKey) {
    const proposal = await prisma.proposalLedger.findFirst({
      where: {
        businessId,
        proposalKey,
      },
    });

    if (!proposal) {
      throw new Error("proposal_not_found");
    }

    return {
      proposalId: proposal.id,
      contractId: null,
      subscriptionId: null,
      subtotalMinor: proposal.subtotalMinor,
      taxMinor: proposal.taxMinor,
      totalMinor: proposal.totalMinor,
      currency: proposal.currency,
      metadata: {
        proposalKey,
      },
    };
  }

  if (subscriptionKey) {
    const subscription = await prisma.subscriptionLedger.findFirst({
      where: {
        businessId,
        subscriptionKey,
      },
    });

    if (!subscription) {
      throw new Error("subscription_ledger_not_found");
    }

    return {
      proposalId: null,
      contractId: subscription.contractId,
      subscriptionId: subscription.id,
      subtotalMinor: subscription.amountMinor,
      taxMinor: 0,
      totalMinor: subscription.amountMinor,
      currency: subscription.currency,
      metadata: {
        subscriptionKey,
      },
    };
  }

  if (contractKey) {
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

    const subtotalMinor = toMinor(Number(contract.proposal?.totalMinor || 0));
    const { taxMinor, totalMinor } = applyTax({
      subtotalMinor,
    });

    return {
      proposalId: contract.proposalId || null,
      contractId: contract.id,
      subscriptionId: null,
      subtotalMinor,
      taxMinor,
      totalMinor,
      currency: normalizeCurrency(String(contract.proposal?.currency || "INR")),
      metadata: {
        contractKey,
      },
    };
  }

  throw new Error("invoice_source_required");
};

export const createInvoiceEngineService = () => {
  const issueInvoice = async ({
    businessId,
    proposalKey = null,
    contractKey = null,
    subscriptionKey = null,
    dueDays = 7,
    metadata = null,
    idempotencyKey = null,
  }: {
    businessId: string;
    proposalKey?: string | null;
    contractKey?: string | null;
    subscriptionKey?: string | null;
    dueDays?: number;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) => {
    const source = await getSourceAmount({
      businessId,
      proposalKey,
      contractKey,
      subscriptionKey,
    });
    await commerceAuthorityService.assertNoActiveManualOverride({
      businessId,
      scope: "INVOICE_WRITE",
      provider: "ALL",
    });

    const normalizedIdempotency =
      scopeIdempotencyKey({
        businessId,
        idempotencyKey: idempotencyKey || null,
      }) ||
      buildDeterministicDigest({
        businessId,
        source,
      });
    const rawIdempotency = String(idempotencyKey || "").trim() || null;

    const existing = rawIdempotency
      ? await prisma.invoiceLedger.findFirst({
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
      : await prisma.invoiceLedger.findUnique({
          where: {
            idempotencyKey: normalizedIdempotency,
          },
        });

    if (existing) {
      return existing;
    }

    const issuedAt = new Date();
    const invoiceKey = buildLedgerKey("invoice");
    const invoice = await prisma.invoiceLedger.create({
      data: {
        businessId,
        proposalId: source.proposalId,
        contractId: source.contractId,
        subscriptionId: source.subscriptionId,
        invoiceKey,
        status: "ISSUED",
        currency: source.currency,
        subtotalMinor: toMinor(source.subtotalMinor),
        taxMinor: toMinor(source.taxMinor),
        totalMinor: toMinor(source.totalMinor),
        dueAt: new Date(Date.now() + Math.max(1, dueDays) * 24 * 60 * 60 * 1000),
        issuedAt,
        externalInvoiceId: buildInvoiceNumber({
          invoiceKey,
          issuedAt,
        }),
        metadata: mergeMetadata(source.metadata, metadata || undefined) as Prisma.InputJsonValue,
        idempotencyKey: normalizedIdempotency,
      },
    });

    await publishCommerceEvent({
      event: "commerce.invoice.issued",
      businessId,
      aggregateType: "invoice_ledger",
      aggregateId: invoice.id,
      eventKey: invoice.invoiceKey,
      payload: {
        businessId,
        invoiceId: invoice.id,
        invoiceKey: invoice.invoiceKey,
        status: invoice.status,
        proposalId: invoice.proposalId,
        contractId: invoice.contractId,
        subscriptionId: invoice.subscriptionId,
        totalMinor: invoice.totalMinor,
        currency: invoice.currency,
      },
    });

    await revenueRecognitionService.recordStage({
      businessId,
      stage: "INVOICED",
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      sourceEvent: "invoice_issued",
      proposalId: invoice.proposalId,
      contractId: invoice.contractId,
      invoiceId: invoice.id,
      subscriptionId: invoice.subscriptionId,
      idempotencyKey: `revrec:invoiced:${invoice.id}`,
    });

    await taxComplianceService.recordTaxEvent({
      businessId,
      eventType: "INVOICE",
      jurisdiction: String(toRecord(invoice.metadata).jurisdiction || "GLOBAL"),
      taxType: String(
        toRecord(invoice.metadata).taxType ||
          (invoice.currency === "INR" ? "GST" : "VAT")
      ),
      reverseCharge: Boolean(toRecord(invoice.metadata).reverseCharge),
      exemptionCode:
        String(toRecord(invoice.metadata).exemptionCode || "").trim() || null,
      withholdingMinor: Number(toRecord(invoice.metadata).withholdingMinor || 0),
      taxableMinor: invoice.subtotalMinor,
      taxMinor: invoice.taxMinor,
      totalMinor: invoice.totalMinor,
      currency: invoice.currency,
      proposalKey:
        String(toRecord(invoice.metadata).proposalKey || "").trim() || null,
      invoiceKey: invoice.invoiceKey,
      mappingRef: `invoice:${invoice.invoiceKey}`,
      metadata: {
        dueAt: invoice.dueAt?.toISOString() || null,
        issuedAt: invoice.issuedAt?.toISOString() || null,
      },
      idempotencyKey: `tax:invoice:${invoice.id}`,
      occurredAt: invoice.issuedAt || new Date(),
    });

    return invoice;
  };

  const transitionInvoiceStatus = async ({
    businessId,
    invoiceKey,
    nextStatus,
    paidMinor,
    metadata,
  }: {
    businessId: string;
    invoiceKey: string;
    nextStatus: InvoiceLedgerStatus;
    paidMinor?: number | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const invoice = await prisma.invoiceLedger.findFirst({
      where: {
        businessId,
        invoiceKey,
      },
    });

    if (!invoice) {
      throw new Error("invoice_not_found");
    }

    await commerceAuthorityService.assertNoActiveManualOverride({
      businessId,
      scope: "INVOICE_FREEZE",
      provider: "ALL",
    });

    assertTransition({
      current: invoice.status,
      next: nextStatus,
      transitions: INVOICE_TRANSITIONS,
      scope: "invoice",
    });

    const nextPaidMinor =
      paidMinor === null || paidMinor === undefined
        ? invoice.paidMinor
        : Math.max(0, Math.floor(paidMinor));
    const mergedMetadata = mergeMetadata(invoice.metadata, {
      ...(metadata || {}),
      ...(nextStatus === "PAID"
        ? {
            receiptNumber:
              String(toRecord(invoice.metadata).receiptNumber || `RCT-${invoice.externalInvoiceId || invoice.invoiceKey}`)
                .trim() || null,
          }
        : {}),
    });

    const updated = await prisma.invoiceLedger.update({
      where: {
        id: invoice.id,
      },
      data: {
        status: nextStatus,
        paidMinor: nextPaidMinor,
        paidAt:
          nextStatus === "PAID" || nextStatus === "PARTIALLY_PAID"
            ? new Date()
            : invoice.paidAt,
        writeOffAt: nextStatus === "WRITTEN_OFF" ? new Date() : invoice.writeOffAt,
        metadata: mergedMetadata as Prisma.InputJsonValue,
      },
    });

    await publishCommerceEvent({
      event: "commerce.invoice.status_changed",
      businessId,
      aggregateType: "invoice_ledger",
      aggregateId: updated.id,
      eventKey: `${invoice.invoiceKey}:${invoice.status}:${nextStatus}`,
      payload: {
        businessId,
        invoiceId: updated.id,
        invoiceKey,
        from: invoice.status,
        to: nextStatus,
        paidMinor: nextPaidMinor,
      },
    });

    if (nextStatus === "PAID") {
      await revenueRecognitionService.recordStage({
        businessId,
        stage: "COLLECTED",
        amountMinor: updated.totalMinor,
        currency: updated.currency,
        sourceEvent: "invoice_paid",
        proposalId: updated.proposalId,
        contractId: updated.contractId,
        invoiceId: updated.id,
        subscriptionId: updated.subscriptionId,
        idempotencyKey: `revrec:collected:${updated.id}`,
      });
    }

    if (nextStatus === "WRITTEN_OFF") {
      await revenueRecognitionService.recordStage({
        businessId,
        stage: "WRITTEN_OFF",
        amountMinor: updated.totalMinor,
        currency: updated.currency,
        sourceEvent: "invoice_written_off",
        invoiceId: updated.id,
        idempotencyKey: `revrec:written_off:${updated.id}`,
      });
    }

    return updated;
  };

  const linkPaymentToInvoice = async ({
    businessId,
    paymentIntentId,
  }: {
    businessId: string;
    paymentIntentId: string;
  }) => {
    const paymentIntent = await prisma.paymentIntentLedger.findUnique({
      where: {
        id: paymentIntentId,
      },
      include: {
        invoice: true,
      },
    });

    if (!paymentIntent || paymentIntent.businessId !== businessId) {
      throw new Error("payment_intent_not_found");
    }

    if (!paymentIntent.invoiceId || !paymentIntent.invoice) {
      throw new Error("payment_intent_invoice_missing");
    }

    const invoice = paymentIntent.invoice;
    const paidMinor = Math.min(
      invoice.totalMinor,
      invoice.paidMinor + Math.max(0, paymentIntent.capturedMinor || paymentIntent.amountMinor)
    );
    const nextStatus: InvoiceLedgerStatus =
      paidMinor >= invoice.totalMinor ? "PAID" : "PARTIALLY_PAID";

    return transitionInvoiceStatus({
      businessId,
      invoiceKey: invoice.invoiceKey,
      nextStatus,
      paidMinor,
      metadata: {
        paymentIntentId,
        providerPaymentIntentId: paymentIntent.providerPaymentIntentId,
      },
    });
  };

  const retryOverdueInvoices = async ({
    businessId,
    now = new Date(),
  }: {
    businessId: string;
    now?: Date;
  }) => {
    const invoices = await prisma.invoiceLedger.findMany({
      where: {
        businessId,
        status: {
          in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"],
        },
        dueAt: {
          lte: now,
        },
      },
      orderBy: {
        dueAt: "asc",
      },
      take: 200,
    });

    for (const invoice of invoices) {
      await prisma.invoiceLedger.update({
        where: {
          id: invoice.id,
        },
        data: {
          status: invoice.paidMinor >= invoice.totalMinor ? invoice.status : "OVERDUE",
          retryCount: {
            increment: 1,
          },
          metadata: mergeMetadata(invoice.metadata, {
            retryTriggeredAt: now.toISOString(),
          }) as Prisma.InputJsonValue,
        },
      });
    }

    return {
      count: invoices.length,
    };
  };

  return {
    issueInvoice,
    transitionInvoiceStatus,
    linkPaymentToInvoice,
    retryOverdueInvoices,
  };
};

export const invoiceEngineService = createInvoiceEngineService();
