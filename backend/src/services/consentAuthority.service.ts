import prisma from "../config/prisma";
import { toRecord } from "./reception.shared";

export type ConsentAuthorityStatus = "GRANTED" | "REVOKED" | "UNKNOWN";

export type ConsentAuthorityDecision = {
  status: ConsentAuthorityStatus;
  businessId: string;
  leadId: string;
  channel: string;
  scope: string;
  source: string | null;
  legalBasis: string | null;
  grantedAt: Date | null;
  revokedAt: Date | null;
  effectiveAt: Date | null;
  recordId: string | null;
};

const normalizeToken = (value: unknown, fallback: string) =>
  String(value || fallback)
    .trim()
    .toUpperCase();

const resolveEffectiveAt = (input: {
  grantedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt?: Date | null;
}) => {
  const candidates = [input.revokedAt, input.grantedAt, input.createdAt].filter(
    (value): value is Date => value instanceof Date
  );

  candidates.sort((left, right) => right.getTime() - left.getTime());
  return candidates[0] || null;
};

const isAuthorityBearingConsentRow = (row: {
  grantedAt?: Date | null;
  revokedAt?: Date | null;
  metadata?: unknown;
}) => {
  if (row.grantedAt instanceof Date || row.revokedAt instanceof Date) {
    return true;
  }

  const metadata = toRecord(row.metadata);
  const consentAuthority = toRecord(metadata.consentAuthority);

  if (consentAuthority.authorityEvent === true) {
    return true;
  }

  if (consentAuthority.authorityEvent === false) {
    return false;
  }

  return false;
};

export const resolveConsentAuthority = async ({
  businessId,
  leadId,
  channel,
  scope,
  asOf = new Date(),
}: {
  businessId: string;
  leadId: string;
  channel: string;
  scope: string;
  asOf?: Date;
}): Promise<ConsentAuthorityDecision> => {
  const normalizedChannel = normalizeToken(channel, "UNKNOWN");
  const normalizedScope = normalizeToken(scope, "GENERAL");
  const rows = await prisma.consentLedger.findMany({
    where: {
      businessId,
      leadId,
      OR: [
        {
          channel: normalizedChannel,
          scope: normalizedScope,
        },
        {
          channel: normalizedChannel,
          scope: "ALL",
        },
        {
          channel: "ALL",
          scope: normalizedScope,
        },
        {
          channel: "ALL",
          scope: "ALL",
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 25,
  });

  const ranked = rows
    .filter((row) => isAuthorityBearingConsentRow(row))
    .map((row) => ({
      row,
      effectiveAt: resolveEffectiveAt(row),
    }))
    .sort((left, right) => {
      const rightTs = right.effectiveAt?.getTime() || 0;
      const leftTs = left.effectiveAt?.getTime() || 0;
      return rightTs - leftTs;
    });

  const latest = ranked[0];

  if (!latest) {
    return {
      status: "UNKNOWN",
      businessId,
      leadId,
      channel: normalizedChannel,
      scope: normalizedScope,
      source: null,
      legalBasis: null,
      grantedAt: null,
      revokedAt: null,
      effectiveAt: null,
      recordId: null,
    };
  }

  const { row, effectiveAt } = latest;
  const revokedAt = row.revokedAt || null;
  const grantedAt = row.grantedAt || null;
  const revokedIsActive =
    revokedAt instanceof Date &&
    revokedAt.getTime() <= asOf.getTime() &&
    (!grantedAt || revokedAt.getTime() >= grantedAt.getTime());
  const grantedIsActive =
    grantedAt instanceof Date &&
    grantedAt.getTime() <= asOf.getTime() &&
    (!revokedAt || revokedAt.getTime() > asOf.getTime());

  return {
    status: revokedIsActive ? "REVOKED" : grantedIsActive ? "GRANTED" : "UNKNOWN",
    businessId,
    leadId,
    channel: normalizedChannel,
    scope: normalizedScope,
    source: row.source || null,
    legalBasis: row.legalBasis || null,
    grantedAt,
    revokedAt,
    effectiveAt,
    recordId: row.id,
  };
};

export const isConsentRevoked = async ({
  businessId,
  leadId,
  channel,
  scope,
  asOf,
}: {
  businessId: string;
  leadId: string;
  channel: string;
  scope: string;
  asOf?: Date;
}) =>
  resolveConsentAuthority({
    businessId,
    leadId,
    channel,
    scope,
    asOf,
  }).then((decision) => decision.status === "REVOKED");
