import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { resolveConsentAuthority } from "./consentAuthority.service";
import { createDurableOutboxEvent } from "./eventOutbox.service";
import { mergeJsonRecords, toRecord, type JsonRecord } from "./reception.shared";

export type ConsentAuthorityWriteAction = "GRANTED" | "REVOKED" | "UPDATED" | "EVIDENCE";

type ConsentWriterContext = {
  businessId: string;
  leadId: string;
  channel: string;
  scope: string;
  source: string;
  legalBasis?: string | null;
  actor?: string | null;
  at?: Date;
  metadata?: JsonRecord | null;
  evidence?: JsonRecord | null;
};

type ConsentScopeUpdateInput = ConsentWriterContext & {
  nextScope: string;
  status?: "GRANTED" | "REVOKED";
};

export type ConsentAuthorityWriteResult = {
  action: ConsentAuthorityWriteAction;
  recordId: string;
  businessId: string;
  leadId: string;
  channel: string;
  scope: string;
  source: string;
  legalBasis: string | null;
  grantedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

type ConsentWriterTx = Prisma.TransactionClient | typeof prisma;

const normalizeToken = (value: unknown, fallback: string) =>
  String(value || fallback)
    .trim()
    .toUpperCase();

const buildConsentDedupeKey = ({
  action,
  recordId,
}: {
  action: "consent.granted" | "consent.revoked" | "consent.updated";
  recordId: string;
}) => ["consent", "v1", action, recordId].join(":");

const createConsentRow = async ({
  tx,
  context,
  grantedAt,
  revokedAt,
  scopeOverride,
  action,
}: {
  tx: ConsentWriterTx;
  context: ConsentWriterContext;
  grantedAt: Date | null;
  revokedAt: Date | null;
  scopeOverride?: string;
  action: ConsentAuthorityWriteAction;
}) =>
  tx.consentLedger.create({
    data: {
      businessId: context.businessId,
      leadId: context.leadId,
      channel: normalizeToken(context.channel, "ALL"),
      scope: normalizeToken(scopeOverride || context.scope, "ALL"),
      source: String(context.source || "SYSTEM").trim() || "SYSTEM",
      legalBasis: String(context.legalBasis || "CONSENT").trim() || "CONSENT",
      actor: context.actor || null,
      grantedAt,
      revokedAt,
      evidence: (context.evidence || null) as Prisma.InputJsonValue,
      metadata: mergeJsonRecords(context.metadata, {
        consentAuthority: {
          authorityEvent: action !== "EVIDENCE",
          action,
          at: (context.at || new Date()).toISOString(),
          actor: context.actor || null,
        },
      }) as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      businessId: true,
      leadId: true,
      channel: true,
      scope: true,
      source: true,
      legalBasis: true,
      grantedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

const publishConsentMutationEvent = async ({
  eventType,
  row,
  action,
}: {
  eventType: "consent.granted" | "consent.revoked" | "consent.updated";
  row: {
    id: string;
    businessId: string;
    leadId: string;
    channel: string;
    scope: string;
    source: string;
    legalBasis: string;
    grantedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  };
  action: ConsentAuthorityWriteAction;
}) =>
  createDurableOutboxEvent({
    businessId: row.businessId,
    eventType,
    aggregateType: "consent_ledger",
    aggregateId: row.id,
    dedupeKey: buildConsentDedupeKey({
      action: eventType,
      recordId: row.id,
    }),
    payload: {
      type: eventType,
      version: 1,
      payload: {
        action,
        recordId: row.id,
        businessId: row.businessId,
        leadId: row.leadId,
        channel: row.channel,
        scope: row.scope,
        source: row.source,
        legalBasis: row.legalBasis,
        grantedAt: row.grantedAt ? row.grantedAt.toISOString() : null,
        revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      },
    },
  });

const toWriteResult = (
  action: ConsentAuthorityWriteAction,
  row: {
    id: string;
    businessId: string;
    leadId: string;
    channel: string;
    scope: string;
    source: string;
    legalBasis: string;
    grantedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }
): ConsentAuthorityWriteResult => ({
  action,
  recordId: row.id,
  businessId: row.businessId,
  leadId: row.leadId,
  channel: row.channel,
  scope: row.scope,
  source: row.source,
  legalBasis: row.legalBasis || null,
  grantedAt: row.grantedAt || null,
  revokedAt: row.revokedAt || null,
  createdAt: row.createdAt,
});

export const createConsentAuthorityWriterService = (db: ConsentWriterTx = prisma) => ({
  grantConsent: async (context: ConsentWriterContext): Promise<ConsentAuthorityWriteResult> => {
    const at = context.at || new Date();
    const row = await createConsentRow({
      tx: db,
      context: {
        ...context,
        at,
      },
      grantedAt: at,
      revokedAt: null,
      action: "GRANTED",
    });

    await publishConsentMutationEvent({
      eventType: "consent.granted",
      row,
      action: "GRANTED",
    });

    return toWriteResult("GRANTED", row);
  },

  revokeConsent: async (context: ConsentWriterContext): Promise<ConsentAuthorityWriteResult> => {
    const at = context.at || new Date();
    const row = await createConsentRow({
      tx: db,
      context: {
        ...context,
        at,
      },
      grantedAt: null,
      revokedAt: at,
      action: "REVOKED",
    });

    await publishConsentMutationEvent({
      eventType: "consent.revoked",
      row,
      action: "REVOKED",
    });

    return toWriteResult("REVOKED", row);
  },

  updateConsentScope: async (
    input: ConsentScopeUpdateInput
  ): Promise<ConsentAuthorityWriteResult> => {
    const at = input.at || new Date();
    const normalizedChannel = normalizeToken(input.channel, "ALL");
    const normalizedCurrentScope = normalizeToken(input.scope, "ALL");
    const normalizedNextScope = normalizeToken(input.nextScope, normalizedCurrentScope);
    const status =
      input.status ||
      (await resolveConsentAuthority({
        businessId: input.businessId,
        leadId: input.leadId,
        channel: normalizedChannel,
        scope: normalizedCurrentScope,
      }).then((decision) => decision.status));
    const grantedAt = status === "REVOKED" ? null : at;
    const revokedAt = status === "REVOKED" ? at : null;
    const row = await createConsentRow({
      tx: db,
      context: {
        ...input,
        at,
        channel: normalizedChannel,
        scope: normalizedCurrentScope,
      },
      grantedAt,
      revokedAt,
      scopeOverride: normalizedNextScope,
      action: "UPDATED",
    });

    await publishConsentMutationEvent({
      eventType: "consent.updated",
      row,
      action: "UPDATED",
    });

    return toWriteResult("UPDATED", row);
  },

  recordConsentEvidence: async (
    context: ConsentWriterContext
  ): Promise<ConsentAuthorityWriteResult> => {
    const row = await createConsentRow({
      tx: db,
      context: {
        ...context,
        at: context.at || new Date(),
        evidence: mergeJsonRecords(toRecord(context.evidence), {
          collectedAt: (context.at || new Date()).toISOString(),
        }),
      },
      grantedAt: null,
      revokedAt: null,
      action: "EVIDENCE",
    });

    return toWriteResult("EVIDENCE", row);
  },
});

const OPT_OUT_PATTERNS = [
  /(^|\s)STOP(\s|$)/i,
  /UNSUBSCRIBE/i,
  /(^|\s)END(\s|$)/i,
  /(^|\s)QUIT(\s|$)/i,
  /(^|\s)CANCEL(\s|$)/i,
  /OPT[\s_-]?OUT/i,
];

const OPT_IN_PATTERNS = [
  /^START$/i,
  /^UNSTOP$/i,
  /^SUBSCRIBE$/i,
  /^YES$/i,
  /OPT[\s_-]?IN/i,
  /^RESUME$/i,
];

export const detectConsentSignal = (rawText: unknown): "GRANT" | "REVOKE" | null => {
  const text = String(rawText || "").trim();

  if (!text) {
    return null;
  }

  if (OPT_OUT_PATTERNS.some((pattern) => pattern.test(text))) {
    return "REVOKE";
  }

  if (OPT_IN_PATTERNS.some((pattern) => pattern.test(text))) {
    return "GRANT";
  }

  return null;
};
