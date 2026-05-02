import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import {
  buildDeterministicDigest,
  buildLedgerKey,
  getScopedAndLegacyIdempotencyCandidates,
  mergeMetadata,
  normalizeCurrency,
  scopeIdempotencyKey,
  toMinor,
} from "./commerce/shared";

export const createTaxComplianceService = () => {
  const recordTaxEvent = async ({
    businessId,
    eventType,
    jurisdiction = "GLOBAL",
    taxType = "GST",
    reverseCharge = false,
    exemptionCode = null,
    withholdingMinor = 0,
    taxableMinor,
    taxMinor,
    totalMinor,
    currency,
    proposalKey = null,
    invoiceKey = null,
    refundKey = null,
    chargebackKey = null,
    creditNoteKey = null,
    mappingRef = null,
    metadata = null,
    idempotencyKey = null,
    occurredAt = new Date(),
    tx = null,
  }: {
    businessId: string;
    eventType: string;
    jurisdiction?: string;
    taxType?: string;
    reverseCharge?: boolean;
    exemptionCode?: string | null;
    withholdingMinor?: number;
    taxableMinor: number;
    taxMinor: number;
    totalMinor: number;
    currency: string;
    proposalKey?: string | null;
    invoiceKey?: string | null;
    refundKey?: string | null;
    chargebackKey?: string | null;
    creditNoteKey?: string | null;
    mappingRef?: string | null;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
    occurredAt?: Date;
    tx?: Prisma.TransactionClient | null;
  }) => {
    const db = tx || prisma;
    const normalizedIdempotency =
      scopeIdempotencyKey({
        businessId,
        idempotencyKey: idempotencyKey || null,
      }) ||
      buildDeterministicDigest({
        businessId,
        eventType,
        jurisdiction,
        taxType,
        reverseCharge,
        exemptionCode,
        withholdingMinor: toMinor(withholdingMinor),
        taxableMinor: toMinor(taxableMinor),
        taxMinor: toMinor(taxMinor),
        totalMinor: toMinor(totalMinor),
        currency: normalizeCurrency(currency),
        proposalKey,
        invoiceKey,
        refundKey,
        chargebackKey,
        creditNoteKey,
        mappingRef,
        occurredAt: occurredAt.toISOString(),
      });
    const rawIdempotency = String(idempotencyKey || "").trim() || null;

    const existing = rawIdempotency
      ? await db.taxComplianceLedger.findFirst({
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
      : await db.taxComplianceLedger.findUnique({
          where: {
            idempotencyKey: normalizedIdempotency,
          },
        });

    if (existing) {
      return existing;
    }

    return db.taxComplianceLedger.create({
      data: {
        businessId,
        taxKey: buildLedgerKey("tax"),
        jurisdiction: String(jurisdiction || "GLOBAL").trim().toUpperCase() || "GLOBAL",
        taxType: String(taxType || "GST").trim().toUpperCase() || "GST",
        reverseCharge: Boolean(reverseCharge),
        exemptionCode: String(exemptionCode || "").trim() || null,
        withholdingMinor: toMinor(withholdingMinor),
        taxableMinor: toMinor(taxableMinor),
        taxMinor: toMinor(taxMinor),
        totalMinor: toMinor(totalMinor),
        currency: normalizeCurrency(currency),
        eventType: String(eventType || "INVOICE").trim().toUpperCase() || "INVOICE",
        proposalKey: String(proposalKey || "").trim() || null,
        invoiceKey: String(invoiceKey || "").trim() || null,
        refundKey: String(refundKey || "").trim() || null,
        chargebackKey: String(chargebackKey || "").trim() || null,
        creditNoteKey: String(creditNoteKey || "").trim() || null,
        mappingRef: String(mappingRef || "").trim() || null,
        metadata: mergeMetadata(metadata, {
          recordedAt: new Date().toISOString(),
        }) as Prisma.InputJsonValue,
        idempotencyKey: normalizedIdempotency,
        occurredAt,
      },
    });
  };

  return {
    recordTaxEvent,
  };
};

export const taxComplianceService = createTaxComplianceService();
