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

export const REVENUE_TOUCH_DELIVERY_STATES = [
  "RESERVED",
  "PROVIDER_ACCEPTED",
  "PROVIDER_MESSAGE_ID_PERSISTED",
  "CONFIRMED",
  "DELIVERED",
  "FAILED",
] as const;

export type RevenueTouchDeliveryState =
  (typeof REVENUE_TOUCH_DELIVERY_STATES)[number];

export type RevenueTouchLedgerCheckpoint = {
  id: string;
  businessId: string;
  leadId: string;
  clientId: string | null;
  messageId: string | null;
  touchType: string;
  touchReason: string;
  channel: string;
  actor: string;
  source: string;
  traceId: string | null;
  providerMessageId: string | null;
  outboundKey: string;
  deliveryState: string;
  campaignId: string | null;
  conversionWindowEndsAt: Date | null;
  providerAcceptedAt: Date | null;
  providerMessagePersistedAt: Date | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  cta: string | null;
  angle: string | null;
  leadState: string | null;
  messageType: string | null;
  metadata: unknown;
};

const DEFAULT_CONVERSION_WINDOW_DAYS = 7;

const DELIVERY_RANK: Record<RevenueTouchDeliveryState, number> = {
  RESERVED: 0,
  PROVIDER_ACCEPTED: 1,
  PROVIDER_MESSAGE_ID_PERSISTED: 2,
  CONFIRMED: 3,
  FAILED: 4,
  DELIVERED: 5,
};

const DELIVERY_CHECKPOINT_SELECT = {
  id: true,
  businessId: true,
  leadId: true,
  clientId: true,
  messageId: true,
  touchType: true,
  touchReason: true,
  channel: true,
  actor: true,
  source: true,
  traceId: true,
  providerMessageId: true,
  outboundKey: true,
  deliveryState: true,
  campaignId: true,
  conversionWindowEndsAt: true,
  providerAcceptedAt: true,
  providerMessagePersistedAt: true,
  confirmedAt: true,
  deliveredAt: true,
  failedAt: true,
  cta: true,
  angle: true,
  leadState: true,
  messageType: true,
  metadata: true,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown) => (isRecord(value) ? value : {});

const normalizeToken = (value: unknown, fallback = "UNKNOWN") =>
  String(value || fallback)
    .trim()
    .toUpperCase();

const mergeMetadata = (
  existing: unknown,
  incoming: Record<string, unknown> | null | undefined
) => {
  const merged = {
    ...toRecord(existing),
    ...(incoming || {}),
  };

  return Object.keys(merged).length ? merged : null;
};

export const normalizeRevenueTouchDeliveryState = (
  value: unknown,
  fallback: RevenueTouchDeliveryState = "RESERVED"
): RevenueTouchDeliveryState => {
  const normalized = normalizeToken(value, fallback) as RevenueTouchDeliveryState;

  return REVENUE_TOUCH_DELIVERY_STATES.includes(normalized)
    ? normalized
    : fallback;
};

export const isRevenueTouchStateAtLeast = (
  current: unknown,
  minimum: RevenueTouchDeliveryState
) =>
  DELIVERY_RANK[normalizeRevenueTouchDeliveryState(current)] >=
  DELIVERY_RANK[minimum];

const resolveDeliveryState = ({
  existing,
  incoming,
}: {
  existing?: unknown;
  incoming: unknown;
}): RevenueTouchDeliveryState => {
  const incomingState = normalizeRevenueTouchDeliveryState(incoming);

  if (!existing) {
    return incomingState;
  }

  const existingState = normalizeRevenueTouchDeliveryState(existing);

  if (existingState === incomingState) {
    return existingState;
  }

  if (existingState === "DELIVERED") {
    return "DELIVERED";
  }

  if (existingState === "FAILED" && incomingState === "DELIVERED") {
    return "DELIVERED";
  }

  if (DELIVERY_RANK[incomingState] < DELIVERY_RANK[existingState]) {
    return existingState;
  }

  return incomingState;
};

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

export const findRevenueTouchLedgerByOutboundKey = async (outboundKey: string) =>
  prisma.revenueTouchLedger.findUnique({
    where: {
      outboundKey,
    },
    select: DELIVERY_CHECKPOINT_SELECT,
  });

export const findRevenueTouchLedgerByProviderMessageId = async (
  providerMessageId: string
) =>
  prisma.revenueTouchLedger.findUnique({
    where: {
      providerMessageId,
    },
    select: DELIVERY_CHECKPOINT_SELECT,
  });

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
  const existing = await findRevenueTouchLedgerByOutboundKey(outboundKey);

  if (
    existing?.providerMessageId &&
    providerMessageId &&
    existing.providerMessageId !== providerMessageId
  ) {
    throw new Error(`provider_message_id_conflict:${outboundKey}`);
  }

  const resolvedDeliveryState = resolveDeliveryState({
    existing: existing?.deliveryState,
    incoming: deliveryState,
  });
  const resolvedMetadata = mergeMetadata(existing?.metadata, metadata);
  const data = {
    businessId: existing?.businessId || businessId,
    leadId: existing?.leadId || leadId,
    clientId: clientId || existing?.clientId || null,
    messageId: messageId || existing?.messageId || null,
    touchType: existing?.touchType || normalizeToken(touchType, "OUTBOUND"),
    touchReason:
      existing?.touchReason ||
      String(touchReason || "unspecified").trim() ||
      "unspecified",
    channel: existing?.channel || normalizeToken(channel),
    actor: existing?.actor || normalizeToken(actor, "SYSTEM"),
    source: existing?.source || String(source || "SYSTEM").trim() || "SYSTEM",
    traceId: traceId || existing?.traceId || null,
    ...(providerMessageId || existing?.providerMessageId
      ? {
          providerMessageId:
            providerMessageId || existing?.providerMessageId || null,
        }
      : {}),
    outboundKey,
    deliveryState: resolvedDeliveryState,
    campaignId: campaignId || existing?.campaignId || null,
    conversionWindowEndsAt:
      conversionWindowEndsAt ||
      existing?.conversionWindowEndsAt ||
      resolveConversionWindowEndsAt(
        deliveredAt ||
          confirmedAt ||
          providerAcceptedAt ||
          existing?.deliveredAt ||
          existing?.confirmedAt ||
          existing?.providerAcceptedAt ||
          null
      ),
    ...(providerAcceptedAt || existing?.providerAcceptedAt
      ? {
          providerAcceptedAt: providerAcceptedAt || existing?.providerAcceptedAt,
        }
      : {}),
    ...(providerMessagePersistedAt || existing?.providerMessagePersistedAt
      ? {
          providerMessagePersistedAt:
            providerMessagePersistedAt || existing?.providerMessagePersistedAt,
        }
      : {}),
    ...(confirmedAt || existing?.confirmedAt
      ? {
          confirmedAt: confirmedAt || existing?.confirmedAt,
        }
      : {}),
    ...(deliveredAt || existing?.deliveredAt
      ? {
          deliveredAt: deliveredAt || existing?.deliveredAt,
        }
      : {}),
    ...(failedAt || existing?.failedAt
      ? {
          failedAt: failedAt || existing?.failedAt,
        }
      : {}),
    cta: cta || existing?.cta || null,
    angle: angle || existing?.angle || null,
    leadState: leadState || existing?.leadState || null,
    messageType: messageType || existing?.messageType || null,
    metadata: resolvedMetadata
      ? (resolvedMetadata as Prisma.InputJsonValue)
      : undefined,
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

const updateMessageDeliveryMetadata = async ({
  messageId,
  status,
  providerMessageId,
  deliveredAt,
}: {
  messageId: string;
  status: RevenueTouchDeliveryState;
  providerMessageId?: string | null;
  deliveredAt?: Date | null;
}) => {
  const message = await prisma.message.findUnique({
    where: {
      id: messageId,
    },
    select: {
      metadata: true,
    },
  });

  if (!message) {
    return;
  }

  const existingMetadata = toRecord(message.metadata);
  const existingDelivery = toRecord(existingMetadata.delivery);

  await prisma.message.update({
    where: {
      id: messageId,
    },
    data: {
      metadata: {
        ...existingMetadata,
        providerMessageId:
          providerMessageId || existingMetadata.providerMessageId || null,
        delivery: {
          ...existingDelivery,
          status,
          providerMessageId:
            providerMessageId ||
            existingDelivery.providerMessageId ||
            existingMetadata.providerMessageId ||
            null,
          deliveredAt:
            deliveredAt?.toISOString() ||
            existingDelivery.deliveredAt ||
            null,
        },
      } as Prisma.InputJsonValue,
    },
  });
};

export const reconcileRevenueTouchDeliveryByProviderMessageId = async ({
  providerMessageId,
  deliveredAt = new Date(),
}: {
  providerMessageId: string;
  deliveredAt?: Date;
}) => {
  const normalizedProviderMessageId = String(providerMessageId || "").trim();

  if (!normalizedProviderMessageId) {
    return null;
  }

  const existing = await findRevenueTouchLedgerByProviderMessageId(
    normalizedProviderMessageId
  );

  if (!existing) {
    return null;
  }

  const updated = await upsertRevenueTouchLedger({
    businessId: existing.businessId,
    leadId: existing.leadId,
    clientId: existing.clientId || null,
    messageId: existing.messageId || null,
    touchType: existing.touchType,
    touchReason: existing.touchReason,
    channel: existing.channel,
    actor: existing.actor,
    source: existing.source,
    traceId: existing.traceId || null,
    providerMessageId: normalizedProviderMessageId,
    outboundKey: existing.outboundKey,
    deliveryState: "DELIVERED",
    campaignId: existing.campaignId || null,
    conversionWindowEndsAt: existing.conversionWindowEndsAt || null,
    providerAcceptedAt: existing.providerAcceptedAt || null,
    providerMessagePersistedAt:
      existing.providerMessagePersistedAt || deliveredAt,
    confirmedAt: existing.confirmedAt || existing.providerAcceptedAt || deliveredAt,
    deliveredAt,
    failedAt: null,
    cta: existing.cta || null,
    angle: existing.angle || null,
    leadState: existing.leadState || null,
    messageType: existing.messageType || null,
    metadata: mergeMetadata(existing.metadata, {
      providerMessageId: normalizedProviderMessageId,
      deliveryWebhookDeliveredAt: deliveredAt.toISOString(),
    }),
  });

  if (updated.messageId) {
    await updateMessageDeliveryMetadata({
      messageId: updated.messageId,
      status: "DELIVERED",
      providerMessageId: normalizedProviderMessageId,
      deliveredAt,
    }).catch(() => undefined);
  }

  return updated;
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
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

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
