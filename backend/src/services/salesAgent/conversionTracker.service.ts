import prisma from "../../config/prisma";
import logger from "../../utils/logger";
import { publishCRMRefreshEvent } from "../crm/refreshEvents.service";
import { reinforceKnowledgeHits } from "../knowledgeReinforcement.service";
import {
  buildRevenueTouchOutboundKey,
  findRevenueTouchAttribution,
  listRevenueTouchTrackingRows,
  resolveTouchOutboundKeyFromMessageMetadata,
  upsertRevenueTouchLedger,
} from "../revenueTouchLedger.service";
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

const getKnowledgeHitIds = (metadata?: Record<string, unknown>) => {
  if (!metadata) {
    return [];
  }

  const rawIds = Array.isArray(metadata.knowledgeHitIds)
    ? metadata.knowledgeHitIds
    : [];

  return rawIds
    .map((id) => String(id || "").trim())
    .filter(Boolean);
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

export const resolveTrackingLearningArmKey = ({
  variantKey,
  metadata,
}: {
  variantKey?: string | null;
  metadata?: Record<string, unknown>;
}) =>
  String(
    variantKey ||
      metadata?.learningArmKey ||
      metadata?.variantKey ||
      metadata?.experimentVariantKey ||
      metadata?.experimentArm ||
      ""
  ).trim() || null;

const getLeadAttribution = async (leadId: string) =>
  prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    select: {
      id: true,
      businessId: true,
      clientId: true,
      platform: true,
      revenueState: true,
      aiStage: true,
      stage: true,
    },
  });

const findLegacyAttributionTracking = async ({
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

const findAttributionTouch = async ({
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
    const touch = await prisma.revenueTouchLedger.findUnique({
      where: {
        id: trackingId,
      },
    });

    if (touch) {
      return {
        touch,
        legacy: null,
      };
    }
  }

  const touch = await findRevenueTouchAttribution({
    leadId,
    messageId: messageId || null,
    occurredAt,
  });

  if (touch) {
    return {
      touch,
      legacy: null,
    };
  }

  return {
    touch: null,
    legacy: await findLegacyAttributionTracking({
      leadId,
      messageId,
      trackingId,
      occurredAt,
    }),
  };
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
            resolveTrackingLearningArmKey({
              variantKey: tracking.variant?.variantKey,
              metadata,
            }),
            tracking.variant?.ctaStyle,
            tracking.variant?.messageLength
          )
      ).trim() || "value_proof_cta";
    const learningArmKey = resolveTrackingLearningArmKey({
      variantKey: tracking.variant?.variantKey,
      metadata,
    });
    const syntheticVariantLabel =
      String(metadata.experimentArm || metadata.variantKey || "").trim() || null;

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

    if (tracking.variant || learningArmKey) {
      const key = tracking.variant?.id || learningArmKey!;
      const current = variantMap.get(key) || {
        key,
        variantId: tracking.variant?.id || null,
        variantKey: learningArmKey,
        label: tracking.variant?.label || syntheticVariantLabel,
        tone:
          tracking.variant?.tone ||
          String(metadata.decisionTone || metadata.variantTone || "").trim() ||
          null,
        ctaStyle:
          tracking.variant?.ctaStyle ||
          String(
            metadata.variantCTAStyle || metadata.decisionCTAStyle || ""
          ).trim() ||
          null,
        messageLength:
          tracking.variant?.messageLength ||
          String(
            metadata.variantMessageLength || metadata.decisionMessageLength || ""
          ).trim() ||
          null,
        structure,
        isPromoted: tracking.variant?.isPromoted || false,
        weight: tracking.variant?.weight || 0,
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
      variantKey: learningArmKey,
      variantLabel: tracking.variant?.label || syntheticVariantLabel,
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
  const rows = await listRevenueTouchTrackingRows({
    businessId,
    ...(clientId !== undefined ? { clientId: clientId || null } : {}),
    ...(messageType ? { messageType } : {}),
    start: since,
    end: new Date(),
    limit,
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
  const persistedMessage = await prisma.message.findUnique({
    where: {
      id: input.messageId,
    },
    select: {
      sender: true,
      metadata: true,
    },
  });
  const persistedMetadata =
    (persistedMessage?.metadata || {}) as Record<string, unknown>;
  const mergedMetadata = {
    ...persistedMetadata,
    ...(input.metadata || {}),
  } as Record<string, unknown>;
  const deliveryMetadata =
    (mergedMetadata.delivery || {}) as Record<string, unknown>;
  const outboundKey = resolveTouchOutboundKeyFromMessageMetadata(mergedMetadata, {
    source: input.source || "AI_ROUTER",
    leadId: input.leadId,
    messageId: input.messageId,
  });
  const providerMessageId =
    String(
      input.metadata?.providerMessageId ||
        deliveryMetadata.providerMessageId ||
        mergedMetadata.providerMessageId ||
        ""
    ).trim() || null;
  const deliveryMode = String(
    input.metadata?.deliveryMode ||
      mergedMetadata.deliveryMode ||
      deliveryMetadata.mode ||
      ""
  )
    .trim()
    .toLowerCase();
  const deliveryState =
    String(deliveryMetadata.status || "").trim().toUpperCase() === "FAILED"
      ? "FAILED"
      : "CONFIRMED";
  const campaignId = String(
    ((mergedMetadata.autonomous as Record<string, unknown> | undefined)?.campaignId as
      | string
      | undefined) ||
      mergedMetadata.externalEventId ||
      ""
  ).trim() || null;

  if (!businessId) {
    throw new Error("businessId is required for AI message tracking");
  }

  try {
    const existing = await prisma.revenueTouchLedger.findUnique({
      where: {
        outboundKey,
      },
      select: {
        id: true,
      },
    });
    const tracking = await upsertRevenueTouchLedger({
      businessId,
      leadId: input.leadId,
      clientId: clientId || null,
      messageId: input.messageId,
      touchType: messageType,
      touchReason:
        String(
          mergedMetadata.trigger ||
            mergedMetadata.reason ||
            input.source ||
            messageType
        ).trim() || messageType,
      channel:
        String(mergedMetadata.platform || lead?.platform || "UNKNOWN").trim() ||
        "UNKNOWN",
      actor: persistedMessage?.sender || "AI",
      source: input.source || "AI_ROUTER",
      traceId: input.traceId || null,
      providerMessageId,
      outboundKey,
      deliveryState,
      campaignId,
      providerAcceptedAt: input.timestamp || new Date(),
      providerMessagePersistedAt: providerMessageId ? new Date() : null,
      confirmedAt: input.timestamp || new Date(),
      deliveredAt: null,
      failedAt: deliveryState === "FAILED" ? input.timestamp || new Date() : null,
      cta: input.cta || null,
      angle: input.angle || null,
      leadState:
        input.leadState || lead?.revenueState || lead?.aiStage || null,
      messageType,
      metadata: {
        ...mergedMetadata,
        outboundKey,
        providerMessageId,
        variantId: input.variantId || mergedMetadata.variantId || null,
      },
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
        touchLedgerId: tracking.id,
        messageId: input.messageId,
        leadId: input.leadId,
        businessId,
        clientId: clientId || null,
        variantId: input.variantId || null,
        source: input.source || "AI_ROUTER",
      },
      "AI message tracked in canonical revenue touch ledger"
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
      "Canonical revenue touch ledger write failed"
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

  const attribution = await findAttributionTouch({
    leadId: input.leadId,
    messageId: input.messageId,
    trackingId: input.trackingId,
    occurredAt,
  });
  const touch = attribution.touch;
  const tracking = attribution.legacy;
  const businessId =
    input.businessId || touch?.businessId || tracking?.businessId || lead?.businessId;
  const clientId =
    input.clientId !== undefined
      ? input.clientId
      : touch?.clientId || tracking?.clientId || lead?.clientId || null;
  const touchMetadata = (touch?.metadata || {}) as Record<string, unknown>;
  const trackingMetadata = (tracking?.metadata || {}) as Record<string, unknown>;
  const attributionMetadata = touch
    ? touchMetadata
    : trackingMetadata;
  const messageId = input.messageId || touch?.messageId || tracking?.messageId || null;
  const variantId =
    input.variantId ||
    String(
      attributionMetadata.variantId ||
        attributionMetadata.experimentVariantId ||
        tracking?.variantId ||
        ""
    ).trim() ||
    null;
  const knowledgeHitIds = getKnowledgeHitIds(attributionMetadata);
  const messageType = touch?.messageType || tracking?.messageType || null;

  if (!businessId) {
    throw new Error("businessId is required for conversion tracking");
  }

  const event = await prisma.conversionEvent.create({
    data: {
      businessId,
      leadId: input.leadId,
      clientId: clientId || null,
      messageId,
      trackingId: tracking?.id || null,
      variantId,
      touchLedgerId: touch?.id || null,
      outcome,
      value: input.value ?? null,
      source: input.source || null,
      idempotencyKey: input.idempotencyKey || null,
      metadata: {
        attributedMessageId: messageId,
        attributedVariantId: variantId,
        touchLedgerId: touch?.id || null,
        trackingSource: touch?.source || tracking?.source || null,
        trackingCta: touch?.cta || tracking?.cta || null,
        trackingAngle: touch?.angle || tracking?.angle || null,
        trackingLeadState: touch?.leadState || tracking?.leadState || null,
        trackingMessageType: messageType,
        trackingTone: String(
          attributionMetadata.decisionTone || attributionMetadata.variantTone || ""
        ).trim() || null,
        trackingStructure:
          String(attributionMetadata.decisionStructure || "").trim() || null,
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

  if (knowledgeHitIds.length) {
    await reinforceKnowledgeHits({
      knowledgeIds: knowledgeHitIds,
      outcome,
    }).catch((error) => {
      logger.warn(
        {
          leadId: input.leadId,
          outcome,
          knowledgeHitIds,
          error,
        },
        "Knowledge reinforcement skipped after conversion event"
      );
    });
  }

  await updateLeadState({
    businessId,
    leadId: input.leadId,
    outcome,
    source: input.source || "CONVERSION_TRACKER",
      metadata: {
        conversionEventId: event.id,
        touchLedgerId: touch?.id || null,
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

  if (outcome === "payment_completed") {
    await publishCRMRefreshEvent({
      businessId,
      leadId: input.leadId,
      event: "payment_completed",
    });
  }

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
      touchLedgerId: touch?.id || null,
      source: input.source || null,
    },
    "Conversion event recorded"
  );

  return event;
};

export const recordLeadOutcome = recordConversionEvent;
