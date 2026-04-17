import prisma from "../../config/prisma";
import logger from "../../utils/logger";
import {
  recordVariantImpression,
  recordVariantOutcome,
} from "./abTesting.service";
import { updateLeadState } from "./leadState.service";
import type {
  LeadRevenueState,
  SalesPerformanceAggregate,
  SalesPerformanceSnapshot,
  SalesRevenueMessageStat,
  SalesVariantPerformanceStat,
} from "./types";

export type ConversionOutcome =
  | "replied"
  | "link_clicked"
  | "booked_call"
  | "payment_completed"
  | "opened";

type TrackAIMessageInput = {
  messageId: string;
  businessId?: string | null;
  leadId: string;
  clientId?: string | null;
  variantId?: string | null;
  timestamp?: Date;
  source?: string | null;
  cta?: string | null;
  angle?: string | null;
  leadState?: string | null;
  messageType?: string | null;
  traceId?: string | null;
  metadata?: Record<string, unknown>;
};

type RecordConversionInput = {
  businessId?: string | null;
  leadId: string;
  clientId?: string | null;
  messageId?: string | null;
  trackingId?: string | null;
  variantId?: string | null;
  outcome: ConversionOutcome | string;
  value?: number | null;
  source?: string | null;
  idempotencyKey?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
};

type PerformanceInput = {
  businessId: string;
  clientId?: string | null;
  leadState?: LeadRevenueState | string | null;
  messageType?: string | null;
  lookbackDays?: number;
  limit?: number;
};

type TrackingWithRelations = any;

const CONVERSION_OUTCOME_SET = new Set<ConversionOutcome>([
  "link_clicked",
  "booked_call",
  "payment_completed",
]);

const EMPTY_AGGREGATE = (): SalesPerformanceAggregate => ({
  messages: 0,
  replies: 0,
  conversions: 0,
  replyRate: 0,
  conversionRate: 0,
  engagementRate: 0,
  revenue: 0,
  revenuePerMessage: 0,
  ctaStats: [],
  toneStats: [],
  structureStats: [],
  variantStats: [],
  topRevenueMessages: [],
  worstPerformingMessages: [],
});

const normalizeOutcome = (outcome: string): ConversionOutcome => {
  const normalized = String(outcome || "").trim().toLowerCase();

  if (
    normalized === "replied" ||
    normalized === "link_clicked" ||
    normalized === "booked_call" ||
    normalized === "payment_completed" ||
    normalized === "opened"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported conversion outcome: ${outcome}`);
};

const normalizeLeadState = (value?: string | null): LeadRevenueState => {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "CONVERTED") return "CONVERTED";
  if (normalized === "HOT") return "HOT";
  if (normalized === "WARM") return "WARM";
  return "COLD";
};

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;

const revenueForOutcome = (outcome: string, value?: number | null) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (outcome === "payment_completed") return 8;
  if (outcome === "booked_call") return 5;
  if (outcome === "link_clicked") return 2;
  if (outcome === "replied") return 1;
  return 0.25;
};

const buildVariantStructure = (
  variantKey?: string | null,
  ctaStyle?: string | null,
  messageLength?: string | null
) => {
  if (variantKey === "curiosity_short") return "curiosity_hook_question";
  if (variantKey === "value_proof") return "value_proof_cta";
  if (variantKey === "direct_cta") return "direct_close";

  const left = String(ctaStyle || "adaptive").trim();
  const right = String(messageLength || "short").trim();
  return `${left}-${right}`;
};

const getLeadAttribution = async (leadId: string) =>
  prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    select: {
      id: true,
      businessId: true,
      clientId: true,
      revenueState: true,
      aiStage: true,
      stage: true,
    },
  });

const findAttributionTracking = async ({
  leadId,
  messageId,
  trackingId,
  occurredAt,
}: {
  leadId: string;
  messageId?: string | null;
  trackingId?: string | null;
  occurredAt: Date;
}) => {
  if (trackingId) {
    const tracking = await prisma.salesMessageTracking.findUnique({
      where: {
        id: trackingId,
      },
    });

    if (tracking) {
      return tracking;
    }
  }

  if (messageId) {
    const tracking = await prisma.salesMessageTracking.findUnique({
      where: {
        messageId,
      },
    });

    if (tracking) {
      return tracking;
    }
  }

  return prisma.salesMessageTracking.findFirst({
    where: {
      leadId,
      sentAt: {
        lte: occurredAt,
      },
    },
    orderBy: {
      sentAt: "desc",
    },
  });
};

const rankStats = <T extends { revenuePerMessage: number; conversionRate: number; replyRate: number; revenue: number; messages: number }>(
  items: T[]
) =>
  [...items].sort((left, right) => {
    if (right.revenuePerMessage !== left.revenuePerMessage) {
      return right.revenuePerMessage - left.revenuePerMessage;
    }

    if (right.conversionRate !== left.conversionRate) {
      return right.conversionRate - left.conversionRate;
    }

    if (right.replyRate !== left.replyRate) {
      return right.replyRate - left.replyRate;
    }

    if (right.revenue !== left.revenue) {
      return right.revenue - left.revenue;
    }

    return right.messages - left.messages;
  });

const buildAggregate = (
  trackings: TrackingWithRelations[]
): SalesPerformanceAggregate => {
  if (!trackings.length) {
    return EMPTY_AGGREGATE();
  }

  const ctaMap = new Map<string, { messages: number; replies: number; conversions: number; revenue: number }>();
  const toneMap = new Map<string, { messages: number; replies: number; conversions: number; revenue: number }>();
  const structureMap = new Map<string, { messages: number; replies: number; conversions: number; revenue: number }>();
  const variantMap = new Map<string, SalesVariantPerformanceStat>();
  const messageStats: SalesRevenueMessageStat[] = [];

  let replies = 0;
  let conversions = 0;
  let revenue = 0;

  for (const tracking of trackings) {
    const metadata = (tracking.metadata || {}) as Record<string, unknown>;
    const events = tracking.conversionEvents || [];
    const replyHit = events.some((event) => event.outcome === "replied") ? 1 : 0;
    const conversionHit = events.some((event) =>
      CONVERSION_OUTCOME_SET.has(event.outcome as ConversionOutcome)
    )
      ? 1
      : 0;
    const eventRevenue = events.reduce(
      (sum, event) => sum + revenueForOutcome(event.outcome, event.value),
      0
    );
    const cta = String(tracking.cta || "NONE").trim() || "NONE";
    const tone =
      String(metadata.decisionTone || metadata.variantTone || tracking.variant?.tone || "human-confident").trim() ||
      "human-confident";
    const structure =
      String(
        metadata.decisionStructure ||
          buildVariantStructure(
            tracking.variant?.variantKey,
            tracking.variant?.ctaStyle,
            tracking.variant?.messageLength
          )
      ).trim() || "value_proof_cta";

    replies += replyHit;
    conversions += conversionHit;
    revenue += eventRevenue;

    const updateMap = (
      map: Map<string, { messages: number; replies: number; conversions: number; revenue: number }>,
      key: string
    ) => {
      const current = map.get(key) || {
        messages: 0,
        replies: 0,
        conversions: 0,
        revenue: 0,
      };

      current.messages += 1;
      current.replies += replyHit;
      current.conversions += conversionHit;
      current.revenue += eventRevenue;
      map.set(key, current);
    };

    updateMap(ctaMap, cta);
    updateMap(toneMap, tone);
    updateMap(structureMap, structure);

    if (tracking.variant) {
      const key = tracking.variant.id;
      const current = variantMap.get(key) || {
        key,
        variantId: tracking.variant.id,
        variantKey: tracking.variant.variantKey,
        label: tracking.variant.label,
        tone: tracking.variant.tone,
        ctaStyle: tracking.variant.ctaStyle,
        messageLength: tracking.variant.messageLength,
        structure,
        isPromoted: tracking.variant.isPromoted,
        weight: tracking.variant.weight,
        messages: 0,
        replies: 0,
        conversions: 0,
        replyRate: 0,
        conversionRate: 0,
        revenue: 0,
        revenuePerMessage: 0,
      };

      current.messages += 1;
      current.replies += replyHit;
      current.conversions += conversionHit;
      current.revenue += eventRevenue;
      variantMap.set(key, current);
    }

    messageStats.push({
      messageId: tracking.messageId,
      preview: tracking.message?.content?.slice(0, 180) || "",
      cta: tracking.cta,
      angle: tracking.angle,
      leadState: tracking.leadState,
      variantId: tracking.variantId,
      variantKey: tracking.variant?.variantKey || null,
      variantLabel: tracking.variant?.label || null,
      tone,
      structure,
      conversions: conversionHit,
      revenue: eventRevenue,
      outcomes: events.reduce((acc, event) => {
        acc[event.outcome] = (acc[event.outcome] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      sentAt: tracking.sentAt,
    });
  }

  const toStats = (
    map: Map<string, { messages: number; replies: number; conversions: number; revenue: number }>
  ) =>
    rankStats(
      Array.from(map.entries()).map(([key, value]) => ({
        key,
        messages: value.messages,
        replies: value.replies,
        conversions: value.conversions,
        replyRate: percent(value.replies, value.messages),
        conversionRate: percent(value.conversions, value.messages),
        revenue: value.revenue,
        revenuePerMessage:
          value.messages > 0
            ? Math.round((value.revenue / value.messages) * 100) / 100
            : 0,
      }))
    );

  const variantStats = rankStats(
    Array.from(variantMap.values()).map((variant) => ({
      ...variant,
      replyRate: percent(variant.replies, variant.messages),
      conversionRate: percent(variant.conversions, variant.messages),
      revenuePerMessage:
        variant.messages > 0
          ? Math.round((variant.revenue / variant.messages) * 100) / 100
          : 0,
    }))
  );

  const rankedMessages = [...messageStats].sort((left, right) => {
    if (right.revenue !== left.revenue) {
      return right.revenue - left.revenue;
    }

    if (right.conversions !== left.conversions) {
      return right.conversions - left.conversions;
    }

    return right.sentAt.getTime() - left.sentAt.getTime();
  });

  return {
    messages: trackings.length,
    replies,
    conversions,
    replyRate: percent(replies, trackings.length),
    conversionRate: percent(conversions, trackings.length),
    engagementRate: percent(replies, trackings.length),
    revenue,
    revenuePerMessage:
      trackings.length > 0 ? Math.round((revenue / trackings.length) * 100) / 100 : 0,
    ctaStats: toStats(ctaMap),
    toneStats: toStats(toneMap),
    structureStats: toStats(structureMap),
    variantStats,
    topRevenueMessages: rankedMessages.slice(0, 8),
    worstPerformingMessages: rankedMessages
      .filter((message) => message.revenue <= 0 && message.conversions === 0)
      .sort((left, right) => left.sentAt.getTime() - right.sentAt.getTime())
      .slice(0, 8),
  };
};

const invalidateDecisionCache = async ({
  businessId,
  clientId,
  messageType,
}: {
  businessId: string;
  clientId?: string | null;
  messageType?: string | null;
}) => {
  try {
    const { invalidateDecisionEngineCache } = await import(
      "./decisionEngine.service"
    );

    await invalidateDecisionEngineCache({
      businessId,
      clientId: clientId || null,
      messageType: messageType || undefined,
    });
  } catch (error) {
    logger.debug(
      {
        businessId,
        clientId: clientId || null,
        messageType: messageType || null,
        error,
      },
      "Decision cache invalidation skipped"
    );
  }
};

const refreshSalesLearningLoop = async ({
  businessId,
  clientId,
}: {
  businessId: string;
  clientId?: string | null;
}) => {
  try {
    const { runSalesOptimizer } = await import("./optimizer.service");
    await runSalesOptimizer({
      businessId,
      clientId: clientId || null,
    });
  } catch (error) {
    logger.warn(
      {
        businessId,
        clientId: clientId || null,
        error,
      },
      "Learning loop refresh skipped"
    );
  }
};

export const getSalesPerformanceSnapshot = async ({
  businessId,
  clientId,
  leadState,
  messageType,
  lookbackDays = 60,
  limit = 1000,
}: PerformanceInput): Promise<SalesPerformanceSnapshot> => {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.salesMessageTracking.findMany({
    where: {
      businessId,
      ...(clientId !== undefined ? { clientId: clientId || null } : {}),
      ...(messageType ? { messageType } : {}),
      sentAt: {
        gte: since,
      },
    },
    include: {
      message: true,
      variant: true,
      conversionEvents: true,
    },
    orderBy: {
      sentAt: "desc",
    },
    take: limit,
  });

  const byState: Record<LeadRevenueState, SalesPerformanceAggregate> = {
    COLD: buildAggregate(
      rows.filter((row) => normalizeLeadState(row.leadState) === "COLD")
    ),
    WARM: buildAggregate(
      rows.filter((row) => normalizeLeadState(row.leadState) === "WARM")
    ),
    HOT: buildAggregate(
      rows.filter((row) => normalizeLeadState(row.leadState) === "HOT")
    ),
    CONVERTED: buildAggregate(
      rows.filter((row) => normalizeLeadState(row.leadState) === "CONVERTED")
    ),
  };

  const overall = buildAggregate(rows);
  const requestedState = leadState ? normalizeLeadState(leadState) : null;
  const activeByState = requestedState ? byState[requestedState] : null;
  const active =
    activeByState && activeByState.messages >= 5 ? activeByState : overall;
  const scopeApplied =
    requestedState && activeByState && activeByState.messages >= 5
      ? "state"
      : clientId !== undefined
        ? "client"
        : "business";

  return {
    scopeApplied,
    overall,
    active,
    byState,
    revenueByVariant: overall.variantStats.map((variant) => ({
      key: variant.variantKey,
      revenue: variant.revenue,
      messages: variant.messages,
      revenuePerMessage: variant.revenuePerMessage,
    })),
    revenueByFunnelStage: (["COLD", "WARM", "HOT", "CONVERTED"] as const).map(
      (state) => ({
        state,
        revenue: byState[state].revenue,
        messages: byState[state].messages,
        revenuePerMessage: byState[state].revenuePerMessage,
      })
    ),
  };
};

export const getRevenueIntelligence = getSalesPerformanceSnapshot;

export const trackAIMessage = async (input: TrackAIMessageInput) => {
  if (!input.messageId || !input.leadId) {
    throw new Error("messageId and leadId are required for AI message tracking");
  }

  const lead = await getLeadAttribution(input.leadId);

  if (!lead && !input.businessId) {
    throw new Error("Lead attribution not found");
  }

  const businessId = input.businessId || lead?.businessId;
  const clientId =
    input.clientId !== undefined ? input.clientId : lead?.clientId || null;
  const messageType = input.messageType || "AI_REPLY";

  if (!businessId) {
    throw new Error("businessId is required for AI message tracking");
  }

  const existing = await prisma.salesMessageTracking.findUnique({
    where: {
      messageId: input.messageId,
    },
  });

  const data = {
    businessId,
    leadId: input.leadId,
    clientId: clientId || null,
    variantId: input.variantId || null,
    source: input.source || "AI_ROUTER",
    cta: input.cta || null,
    angle: input.angle || null,
    leadState:
      input.leadState || lead?.revenueState || lead?.aiStage || null,
    messageType,
    traceId: input.traceId || null,
    metadata: input.metadata || {},
    sentAt: input.timestamp || new Date(),
  };

  try {
    const tracking = existing
      ? await prisma.salesMessageTracking.update({
          where: {
            id: existing.id,
          },
          data: data as any,
        })
      : await prisma.salesMessageTracking.create({
          data: {
            ...data,
            messageId: input.messageId,
          } as any,
        });

    if (!existing && input.variantId) {
      await recordVariantImpression(input.variantId);
    }

    void invalidateDecisionCache({
      businessId,
      clientId: clientId || null,
      messageType,
    });

    logger.info(
      {
        trackingId: tracking.id,
        messageId: input.messageId,
        leadId: input.leadId,
        businessId,
        clientId: clientId || null,
        variantId: input.variantId || null,
        source: input.source || "AI_ROUTER",
      },
      "AI message tracked for revenue attribution"
    );

    return tracking;
  } catch (error) {
    logger.error(
      {
        messageId: input.messageId,
        leadId: input.leadId,
        businessId,
        error,
      },
      "AI message tracking failed"
    );
    throw error;
  }
};

export const recordConversionEvent = async (input: RecordConversionInput) => {
  const outcome = normalizeOutcome(input.outcome);
  const occurredAt = input.occurredAt || new Date();

  if (input.idempotencyKey) {
    const existing = await prisma.conversionEvent.findFirst({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (existing) {
      return existing;
    }
  }

  const lead = await getLeadAttribution(input.leadId);

  if (!lead && !input.businessId) {
    throw new Error("Lead attribution not found");
  }

  const tracking = await findAttributionTracking({
    leadId: input.leadId,
    messageId: input.messageId,
    trackingId: input.trackingId,
    occurredAt,
  });
  const businessId =
    input.businessId || tracking?.businessId || lead?.businessId;
  const clientId =
    input.clientId !== undefined
      ? input.clientId
      : tracking?.clientId || lead?.clientId || null;
  const messageId = input.messageId || tracking?.messageId || null;
  const variantId = input.variantId || tracking?.variantId || null;
  const trackingMetadata = (tracking?.metadata || {}) as Record<string, unknown>;
  const messageType = tracking?.messageType || null;

  if (!businessId) {
    throw new Error("businessId is required for conversion tracking");
  }

  const event = await prisma.conversionEvent.create({
    data: {
      businessId,
      leadId: input.leadId,
      clientId: clientId || null,
      messageId,
      trackingId: input.trackingId || tracking?.id || null,
      variantId,
      outcome,
      value: input.value ?? null,
      source: input.source || null,
      idempotencyKey: input.idempotencyKey || null,
      metadata: {
        attributedMessageId: messageId,
        attributedVariantId: variantId,
        trackingSource: tracking?.source || null,
        trackingCta: tracking?.cta || null,
        trackingAngle: tracking?.angle || null,
        trackingLeadState: tracking?.leadState || null,
        trackingMessageType: messageType,
        trackingTone: String(
          trackingMetadata.decisionTone || trackingMetadata.variantTone || ""
        ).trim() || null,
        trackingStructure:
          String(trackingMetadata.decisionStructure || "").trim() || null,
        ...(input.metadata || {}),
      },
      occurredAt,
    },
  });

  if (variantId) {
    await recordVariantOutcome({
      variantId,
      outcome,
      value: input.value,
    });
  }

  await updateLeadState({
    businessId,
    leadId: input.leadId,
    outcome,
    source: input.source || "CONVERSION_TRACKER",
    metadata: {
      conversionEventId: event.id,
      trackingId: tracking?.id || null,
      messageId,
      variantId,
    },
  }).catch((error) => {
    logger.warn(
      {
        leadId: input.leadId,
        outcome,
        error,
      },
      "Lead state update skipped after conversion event"
    );
  });

  await invalidateDecisionCache({
    businessId,
    clientId: clientId || null,
    messageType,
  });

  if (
    outcome === "booked_call" ||
    outcome === "payment_completed" ||
    outcome === "link_clicked"
  ) {
    await refreshSalesLearningLoop({
      businessId,
      clientId: clientId || null,
    });
  } else {
    void refreshSalesLearningLoop({
      businessId,
      clientId: clientId || null,
    });
  }

  logger.info(
    {
      conversionEventId: event.id,
      businessId,
      leadId: input.leadId,
      outcome,
      messageId,
      variantId,
      source: input.source || null,
    },
    "Conversion event recorded"
  );

  return event;
};

export const recordLeadOutcome = recordConversionEvent;
