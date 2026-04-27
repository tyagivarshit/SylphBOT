import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";

export type RevenueTouchTrackingRow = {
  id: string;
  messageId: string;
  leadId: string;
  variantId: string | null;
  source: string;
  cta: string | null;
  angle: string | null;
  leadState: string | null;
  messageType: string;
  sentAt: Date;
  metadata?: unknown;
  outboundKey: string;
  providerMessageId: string | null;
  message: {
    content: string;
  };
  variant: {
    variantKey: string;
    label: string;
    tone: string;
    ctaStyle: string;
    messageLength: string;
  } | null;
  conversionEvents: Array<{
    outcome: string;
    value: number | null;
  }>;
};

const DEFAULT_CONVERSION_WINDOW_DAYS = 7;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown) => (isRecord(value) ? value : {});

const normalizeToken = (value: unknown, fallback = "UNKNOWN") =>
  String(value || fallback)
    .trim()
    .toUpperCase();

const resolveVariantId = (metadata: Record<string, unknown>) =>
  String(
    metadata.variantId ||
      metadata.experimentVariantId ||
      metadata.deliveredVariantId ||
      ""
  ).trim() || null;

const resolveOutboundKeyFromMetadata = (metadata: Record<string, unknown>) =>
  String(
    metadata.outboundKey ||
      metadata.deliveryJobKey ||
      metadata.clientMessageId ||
      metadata.externalEventId ||
      ""
  ).trim() || null;

const resolveConversionWindowEndsAt = (baseDate?: Date | null) => {
  const anchor = baseDate instanceof Date ? baseDate : new Date();
  return new Date(
    anchor.getTime() + DEFAULT_CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
};

export const buildRevenueTouchOutboundKey = ({
  source,
  leadId,
  clientMessageId,
  deliveryJobKey,
  externalEventId,
  messageId,
  campaignId,
  step,
}: {
  source: string;
  leadId: string;
  clientMessageId?: string | null;
  deliveryJobKey?: string | null;
  externalEventId?: string | null;
  messageId?: string | null;
  campaignId?: string | null;
  step?: string | null;
}) => {
  const stableSegment =
    String(clientMessageId || "").trim() ||
    String(deliveryJobKey || "").trim() ||
    String(externalEventId || "").trim() ||
    String(campaignId || "").trim() ||
    String(messageId || "").trim() ||
    "unknown";

  const parts = [
    normalizeToken(source, "OUTBOUND"),
    String(leadId || "").trim() || "unknown",
    String(step || "").trim(),
    stableSegment,
  ].filter(Boolean);

  return parts.join(":");
};

export const upsertRevenueTouchLedger = async ({
  businessId,
  leadId,
  clientId,
  messageId,
  touchType,
  touchReason,
  channel,
  actor,
  source,
  traceId,
  providerMessageId,
  outboundKey,
  deliveryState,
  campaignId,
  conversionWindowEndsAt,
  providerAcceptedAt,
  providerMessagePersistedAt,
  confirmedAt,
  deliveredAt,
  failedAt,
  cta,
  angle,
  leadState,
  messageType,
  metadata,
}: {
  businessId: string;
  leadId: string;
  clientId?: string | null;
  messageId?: string | null;
  touchType: string;
  touchReason: string;
  channel: string;
  actor: string;
  source: string;
  traceId?: string | null;
  providerMessageId?: string | null;
  outboundKey: string;
  deliveryState: string;
  campaignId?: string | null;
  conversionWindowEndsAt?: Date | null;
  providerAcceptedAt?: Date | null;
  providerMessagePersistedAt?: Date | null;
  confirmedAt?: Date | null;
  deliveredAt?: Date | null;
  failedAt?: Date | null;
  cta?: string | null;
  angle?: string | null;
  leadState?: string | null;
  messageType?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const existing = await prisma.revenueTouchLedger.findUnique({
    where: {
      outboundKey,
    },
    select: {
      id: true,
      providerMessageId: true,
    },
  });

  if (
    existing?.providerMessageId &&
    providerMessageId &&
    existing.providerMessageId !== providerMessageId
  ) {
    throw new Error(`provider_message_id_conflict:${outboundKey}`);
  }

  const data = {
    businessId,
    leadId,
    clientId: clientId || null,
    messageId: messageId || null,
    touchType: normalizeToken(touchType, "OUTBOUND"),
    touchReason: String(touchReason || "unspecified").trim() || "unspecified",
    channel: normalizeToken(channel),
    actor: normalizeToken(actor, "SYSTEM"),
    source: String(source || "SYSTEM").trim() || "SYSTEM",
    traceId: traceId || null,
    ...(providerMessageId
      ? {
          providerMessageId,
        }
      : {}),
    outboundKey,
    deliveryState: normalizeToken(deliveryState, "CONFIRMED"),
    campaignId: campaignId || null,
    conversionWindowEndsAt:
      conversionWindowEndsAt ||
      resolveConversionWindowEndsAt(
        deliveredAt || confirmedAt || providerAcceptedAt || null
      ),
    ...(providerAcceptedAt
      ? {
          providerAcceptedAt,
        }
      : {}),
    ...(providerMessagePersistedAt
      ? {
          providerMessagePersistedAt,
        }
      : {}),
    ...(confirmedAt
      ? {
          confirmedAt,
        }
      : {}),
    ...(deliveredAt
      ? {
          deliveredAt,
        }
      : {}),
    ...(failedAt
      ? {
          failedAt,
        }
      : {}),
    cta: cta || null,
    angle: angle || null,
    leadState: leadState || null,
    messageType: messageType || null,
    metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
  };

  if (existing) {
    return prisma.revenueTouchLedger.update({
      where: {
        outboundKey,
      },
      data: data as any,
    });
  }

  return prisma.revenueTouchLedger.create({
    data: data as any,
  });
};

export const findRevenueTouchAttribution = async ({
  leadId,
  outboundKey,
  messageId,
  providerMessageId,
  traceId,
  occurredAt,
}: {
  leadId: string;
  outboundKey?: string | null;
  messageId?: string | null;
  providerMessageId?: string | null;
  traceId?: string | null;
  occurredAt?: Date;
}) => {
  const normalizedOutboundKey = String(outboundKey || "").trim();

  if (normalizedOutboundKey) {
    const touch = await prisma.revenueTouchLedger.findUnique({
      where: {
        outboundKey: normalizedOutboundKey,
      },
    });

    if (touch) {
      return touch;
    }
  }

  const normalizedProviderMessageId = String(providerMessageId || "").trim();

  if (normalizedProviderMessageId) {
    const touch = await prisma.revenueTouchLedger.findUnique({
      where: {
        providerMessageId: normalizedProviderMessageId,
      },
    });

    if (touch) {
      return touch;
    }
  }

  if (messageId) {
    const touch = await prisma.revenueTouchLedger.findFirst({
      where: {
        leadId,
        messageId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (touch) {
      return touch;
    }
  }

  if (traceId) {
    const touch = await prisma.revenueTouchLedger.findFirst({
      where: {
        leadId,
        traceId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (touch) {
      return touch;
    }
  }

  const targetTime = occurredAt || new Date();

  return prisma.revenueTouchLedger.findFirst({
    where: {
      leadId,
      OR: [
        {
          confirmedAt: {
            lte: targetTime,
          },
        },
        {
          deliveredAt: {
            lte: targetTime,
          },
        },
        {
          createdAt: {
            lte: targetTime,
          },
        },
      ],
    },
    orderBy: [
      {
        confirmedAt: "desc",
      },
      {
        deliveredAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
};

export const listRevenueTouchTrackingRows = async ({
  businessId,
  clientId,
  messageType,
  start,
  end,
  limit = 1000,
}: {
  businessId: string;
  clientId?: string | null;
  messageType?: string | null;
  start: Date;
  end: Date;
  limit?: number;
}) => {
  const rows = await prisma.revenueTouchLedger.findMany({
    where: {
      businessId,
      ...(clientId !== undefined ? { clientId: clientId || null } : {}),
      ...(messageType ? { messageType } : {}),
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      message: {
        select: {
          id: true,
          content: true,
        },
      },
      conversionEvents: {
        select: {
          outcome: true,
          value: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  const variantIds = Array.from(
    new Set(
      rows
        .map((row) => resolveVariantId(toRecord(row.metadata)))
        .filter(Boolean)
    )
  );
  const variants = variantIds.length
    ? await prisma.salesMessageVariant.findMany({
        where: {
          id: {
            in: variantIds as string[],
          },
        },
        select: {
          id: true,
          variantKey: true,
          label: true,
          tone: true,
          ctaStyle: true,
          messageLength: true,
        },
      })
    : [];
  const variantMap = new Map(
    variants.map((variant) => [variant.id, variant])
  );

  return rows.map((row): RevenueTouchTrackingRow => {
    const metadata = toRecord(row.metadata);
    const variantId = resolveVariantId(metadata);
    const variant = variantId ? variantMap.get(variantId) || null : null;

    return {
      id: row.id,
      messageId: row.messageId || row.message?.id || row.id,
      leadId: row.leadId,
      variantId,
      source: row.source,
      cta: row.cta || null,
      angle: row.angle || null,
      leadState: row.leadState || null,
      messageType: row.messageType || row.touchType,
      sentAt:
        row.confirmedAt ||
        row.deliveredAt ||
        row.providerAcceptedAt ||
        row.createdAt,
      metadata: row.metadata,
      outboundKey: row.outboundKey,
      providerMessageId: row.providerMessageId || null,
      message: {
        content: row.message?.content || "",
      },
      variant: variant
        ? {
            variantKey: variant.variantKey,
            label: variant.label,
            tone: variant.tone,
            ctaStyle: variant.ctaStyle,
            messageLength: variant.messageLength,
          }
        : null,
      conversionEvents: row.conversionEvents.map((event) => ({
        outcome: event.outcome,
        value: typeof event.value === "number" ? event.value : null,
      })),
    };
  });
};

export const resolveTouchOutboundKeyFromMessageMetadata = (
  metadata: unknown,
  fallback: {
    source: string;
    leadId: string;
    messageId?: string | null;
  }
) =>
  resolveOutboundKeyFromMetadata(toRecord(metadata)) ||
  buildRevenueTouchOutboundKey({
    source: fallback.source,
    leadId: fallback.leadId,
    messageId: fallback.messageId || null,
  });
