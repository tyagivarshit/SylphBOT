import prisma from "../../config/prisma";
import logger from "../../utils/logger";
import { listRevenueTouchTrackingRows } from "../revenueTouchLedger.service";
import { autoPromoteBestVariant } from "./abTesting.service";
import {
  getSalesPerformanceSnapshot,
  recordConversionEvent,
  resolveTrackingLearningArmKey,
} from "./conversionTracker.service";
import type {
  SalesAngle,
  SalesCTA,
  SalesOptimizationInsights,
  SalesPlanKey,
} from "./types";

const DEFAULT_INSIGHTS: SalesOptimizationInsights = {
  recommendedAngle: "personalization",
  recommendedCTA: "VIEW_DEMO",
  recommendedTone: "human-confident",
  recommendedCTAStyle: "single-clear-cta",
  recommendedMessageLength: "short",
  topPatterns: [],
  bestMessages: [],
  worstMessages: [],
  confidence: 0,
  bestAngles: [],
  bestCtas: [],
  guidance:
    "Start with personalization, then add proof or urgency only after clear buying signals.",
};

const toAngle = (value: unknown): SalesAngle | null => {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "curiosity" ||
    normalized === "urgency" ||
    normalized === "social_proof" ||
    normalized === "personalization" ||
    normalized === "value"
  ) {
    return normalized as SalesAngle;
  }

  return null;
};

const toCTA = (value: unknown): SalesCTA | null => {
  const normalized = String(value || "").trim().toUpperCase();

  if (
    normalized === "REPLY_DM" ||
    normalized === "VIEW_DEMO" ||
    normalized === "BOOK_CALL" ||
    normalized === "BUY_NOW" ||
    normalized === "CAPTURE_LEAD" ||
    normalized === "NONE"
  ) {
    return normalized as SalesCTA;
  }

  return null;
};

const rankEntries = <TKey extends string>(
  usageMap: Map<TKey, number>,
  conversionMap: Map<TKey, number>,
  failureMap?: Map<TKey, number>
) =>
  Array.from(usageMap.entries())
    .map(([key, usage]) => ({
      key,
      usage,
      conversions: conversionMap.get(key) || 0,
      failures: failureMap?.get(key) || 0,
      rate: usage > 0 ? (conversionMap.get(key) || 0) / usage : 0,
      failureRate: usage > 0 ? (failureMap?.get(key) || 0) / usage : 0,
      score:
        usage > 0
          ? ((conversionMap.get(key) || 0) - (failureMap?.get(key) || 0) * 0.75) /
            usage
          : 0,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.failureRate !== right.failureRate) {
        return left.failureRate - right.failureRate;
      }

      if (right.rate !== left.rate) {
        return right.rate - left.rate;
      }

      if (right.conversions !== left.conversions) {
        return right.conversions - left.conversions;
      }

      return right.usage - left.usage;
    });

const getLatestStoredInsight = async (businessId: string) => {
  const insight = await prisma.salesOptimizationInsight.findFirst({
    where: {
      businessId,
      insightType: "REVENUE_OPTIMIZATION",
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: new Date(),
          },
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!insight) {
    return null;
  }

  const recommendations = (insight.recommendations || {}) as Record<
    string,
    unknown
  >;

  return {
    recommendedTone: insight.recommendedTone || null,
    recommendedCTAStyle: insight.recommendedCTAStyle || null,
    recommendedMessageLength: insight.recommendedMessageLength || null,
    topPatterns: Array.isArray(recommendations.topPatterns)
      ? recommendations.topPatterns.map(String).slice(0, 3)
      : [],
    bestMessages: Array.isArray(insight.bestMessages)
      ? (insight.bestMessages as any[])
      : [],
    worstMessages: Array.isArray(insight.worstMessages)
      ? (insight.worstMessages as any[])
      : [],
    confidence: insight.confidence || 0,
    guidance: insight.summary,
  };
};

export const getSalesOptimizationInsights = async (
  businessId: string
): Promise<SalesOptimizationInsights> => {
  try {
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const storedInsight = await getLatestStoredInsight(businessId);

    const events = await prisma.analytics.findMany({
      where: {
        businessId,
        type: {
          in: [
            "SALES_AGENT_REPLY",
            "SALES_AGENT_CONVERSION",
            "SALES_AGENT_REPLY_FAILED",
          ],
        },
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    });

    if (!events.length) {
      return {
        ...DEFAULT_INSIGHTS,
        recommendedTone:
          storedInsight?.recommendedTone || DEFAULT_INSIGHTS.recommendedTone,
        recommendedCTAStyle:
          storedInsight?.recommendedCTAStyle ||
          DEFAULT_INSIGHTS.recommendedCTAStyle,
        recommendedMessageLength:
          storedInsight?.recommendedMessageLength ||
          DEFAULT_INSIGHTS.recommendedMessageLength,
        topPatterns: storedInsight?.topPatterns || [],
        bestMessages: storedInsight?.bestMessages || [],
        worstMessages: storedInsight?.worstMessages || [],
        confidence: storedInsight?.confidence || DEFAULT_INSIGHTS.confidence,
        guidance: storedInsight?.guidance || DEFAULT_INSIGHTS.guidance,
      };
    }

    const angleUsage = new Map<SalesAngle, number>();
    const angleConversions = new Map<SalesAngle, number>();
    const angleFailures = new Map<SalesAngle, number>();
    const ctaUsage = new Map<SalesCTA, number>();
    const ctaConversions = new Map<SalesCTA, number>();
    const ctaFailures = new Map<SalesCTA, number>();

    for (const event of events) {
      const meta = (event.meta || {}) as Record<string, unknown>;
      const angle = toAngle(meta.angle);
      const cta = toCTA(meta.cta);

      if (event.type === "SALES_AGENT_REPLY") {
        if (angle) {
          angleUsage.set(angle, (angleUsage.get(angle) || 0) + 1);
        }

        if (cta) {
          ctaUsage.set(cta, (ctaUsage.get(cta) || 0) + 1);
        }
      }

      if (event.type === "SALES_AGENT_CONVERSION") {
        if (angle) {
          angleConversions.set(angle, (angleConversions.get(angle) || 0) + 1);
        }

        if (cta) {
          ctaConversions.set(cta, (ctaConversions.get(cta) || 0) + 1);
        }
      }

      if (event.type === "SALES_AGENT_REPLY_FAILED") {
        if (angle) {
          angleUsage.set(angle, (angleUsage.get(angle) || 0) + 1);
          angleFailures.set(angle, (angleFailures.get(angle) || 0) + 1);
        }

        if (cta) {
          ctaUsage.set(cta, (ctaUsage.get(cta) || 0) + 1);
          ctaFailures.set(cta, (ctaFailures.get(cta) || 0) + 1);
        }
      }
    }

    const bestAngles = rankEntries(
      angleUsage,
      angleConversions,
      angleFailures
    ).slice(0, 3);
    const bestCtas = rankEntries(
      ctaUsage,
      ctaConversions,
      ctaFailures
    ).slice(0, 3);

    return {
      recommendedAngle: bestAngles[0]?.key || DEFAULT_INSIGHTS.recommendedAngle,
      recommendedCTA: bestCtas[0]?.key || DEFAULT_INSIGHTS.recommendedCTA,
      recommendedTone:
        storedInsight?.recommendedTone || DEFAULT_INSIGHTS.recommendedTone,
      recommendedCTAStyle:
        storedInsight?.recommendedCTAStyle ||
        DEFAULT_INSIGHTS.recommendedCTAStyle,
      recommendedMessageLength:
        storedInsight?.recommendedMessageLength ||
        DEFAULT_INSIGHTS.recommendedMessageLength,
      topPatterns: storedInsight?.topPatterns || [],
      bestMessages: storedInsight?.bestMessages || [],
      worstMessages: storedInsight?.worstMessages || [],
      confidence: storedInsight?.confidence || DEFAULT_INSIGHTS.confidence,
      bestAngles: bestAngles.map((item) => ({
        angle: item.key,
        usage: item.usage,
        conversions: item.conversions,
      })),
      bestCtas: bestCtas.map((item) => ({
        cta: item.key,
        usage: item.usage,
        conversions: item.conversions,
      })),
      guidance:
        storedInsight?.guidance ||
        (bestAngles[0] && bestCtas[0]
          ? `Recent winners lean ${bestAngles[0].key} with ${bestCtas[0].key} as the primary CTA.`
          : DEFAULT_INSIGHTS.guidance),
    };
  } catch {
    return DEFAULT_INSIGHTS;
  }
};

type ReplyEventInput = {
  businessId: string;
  leadId: string;
  planKey: SalesPlanKey;
  cta: SalesCTA;
  angle: SalesAngle;
  stage: string;
  temperature: string;
  intent: string;
  decisionIntent?: string | null;
  emotion?: string | null;
  userSignal?: string | null;
  objection: string;
  platform?: string | null;
  source?: string | null;
  variantId?: string | null;
  variantKey?: string | null;
  variantTone?: string | null;
  variantCTAStyle?: string | null;
  variantMessageLength?: string | null;
  decisionStrategy?: string | null;
  decisionTone?: string | null;
  decisionStructure?: string | null;
  conversionScore?: number | null;
  conversionBucket?: string | null;
  trustLevel?: string | null;
  urgencyLevel?: string | null;
  negotiationMode?: string | null;
  offerType?: string | null;
  closeMotion?: string | null;
  experimentArm?: string | null;
  leadState?: string | null;
  action?: string | null;
  actionPriority?: number | null;
  funnelPosition?: string | null;
};

type ReplyFailureEventInput = ReplyEventInput & {
  route: string;
  failureReason: string;
  failureStage: string;
  currentAttempt: number;
  maxAttempts: number;
  willRetry: boolean;
  terminal: boolean;
  deliveryMode?: string | null;
};

export const recordSalesReplyEvent = async ({
  businessId,
  leadId,
  planKey,
  cta,
  angle,
  stage,
  temperature,
  intent,
  decisionIntent,
  emotion,
  userSignal,
  objection,
  platform,
  source,
  variantId,
  variantKey,
  variantTone,
  variantCTAStyle,
  variantMessageLength,
  decisionStrategy,
  decisionTone,
  decisionStructure,
  conversionScore,
  conversionBucket,
  trustLevel,
  urgencyLevel,
  negotiationMode,
  offerType,
  closeMotion,
  experimentArm,
  leadState,
  action,
  actionPriority,
  funnelPosition,
}: ReplyEventInput) => {
  try {
    await prisma.analytics.create({
      data: {
        businessId,
        type: "SALES_AGENT_REPLY",
        meta: {
          leadId,
          planKey,
          cta,
          angle,
          stage,
          temperature,
          intent,
          decisionIntent: decisionIntent || null,
          emotion: emotion || null,
          userSignal: userSignal || null,
          objection,
          platform: platform || null,
          source: source || "AI_ROUTER",
          variantId: variantId || null,
          variantKey: variantKey || null,
          variantTone: variantTone || null,
          variantCTAStyle: variantCTAStyle || null,
          variantMessageLength: variantMessageLength || null,
          decisionStrategy: decisionStrategy || null,
          decisionTone: decisionTone || null,
          decisionStructure: decisionStructure || null,
          conversionScore:
            typeof conversionScore === "number" ? conversionScore : null,
          conversionBucket: conversionBucket || null,
          trustLevel: trustLevel || null,
          urgencyLevel: urgencyLevel || null,
          negotiationMode: negotiationMode || null,
          offerType: offerType || null,
          closeMotion: closeMotion || null,
          experimentArm: experimentArm || null,
          leadState: leadState || null,
          action: action || null,
          actionPriority:
            typeof actionPriority === "number" ? actionPriority : null,
          funnelPosition: funnelPosition || null,
        },
      },
    });
  } catch {}
};

export const recordSalesReplyFailureEvent = async ({
  businessId,
  leadId,
  planKey,
  cta,
  angle,
  stage,
  temperature,
  intent,
  decisionIntent,
  emotion,
  userSignal,
  objection,
  platform,
  source,
  variantId,
  variantKey,
  variantTone,
  variantCTAStyle,
  variantMessageLength,
  decisionStrategy,
  decisionTone,
  decisionStructure,
  conversionScore,
  conversionBucket,
  trustLevel,
  urgencyLevel,
  negotiationMode,
  offerType,
  closeMotion,
  experimentArm,
  leadState,
  action,
  actionPriority,
  funnelPosition,
  route,
  failureReason,
  failureStage,
  currentAttempt,
  maxAttempts,
  willRetry,
  terminal,
  deliveryMode,
}: ReplyFailureEventInput) => {
  try {
    await prisma.analytics.create({
      data: {
        businessId,
        type: "SALES_AGENT_REPLY_FAILED",
        meta: {
          leadId,
          route,
          planKey,
          cta,
          angle,
          stage,
          temperature,
          intent,
          decisionIntent: decisionIntent || null,
          emotion: emotion || null,
          userSignal: userSignal || null,
          objection,
          platform: platform || null,
          source: source || "AI_ROUTER",
          variantId: variantId || null,
          variantKey: variantKey || null,
          variantTone: variantTone || null,
          variantCTAStyle: variantCTAStyle || null,
          variantMessageLength: variantMessageLength || null,
          decisionStrategy: decisionStrategy || null,
          decisionTone: decisionTone || null,
          decisionStructure: decisionStructure || null,
          conversionScore:
            typeof conversionScore === "number" ? conversionScore : null,
          conversionBucket: conversionBucket || null,
          trustLevel: trustLevel || null,
          urgencyLevel: urgencyLevel || null,
          negotiationMode: negotiationMode || null,
          offerType: offerType || null,
          closeMotion: closeMotion || null,
          experimentArm: experimentArm || null,
          leadState: leadState || null,
          action: action || null,
          actionPriority:
            typeof actionPriority === "number" ? actionPriority : null,
          funnelPosition: funnelPosition || null,
          failureReason,
          failureStage,
          currentAttempt,
          maxAttempts,
          willRetry,
          terminal,
          deliveryMode: deliveryMode || null,
        },
      },
    });
  } catch {}
};

type FollowupEventInput = {
  businessId: string;
  leadId: string;
  step: string;
  cta: SalesCTA;
  angle: SalesAngle;
  planKey: SalesPlanKey;
  temperature: string;
  trigger?: string;
  variantId?: string | null;
};

export const recordSalesFollowupEvent = async ({
  businessId,
  leadId,
  step,
  cta,
  angle,
  planKey,
  temperature,
  trigger,
  variantId,
}: FollowupEventInput) => {
  try {
    await prisma.analytics.create({
      data: {
        businessId,
        type: "SALES_AGENT_FOLLOWUP",
        meta: {
          leadId,
          step,
          cta,
          angle,
          planKey,
          temperature,
          trigger: trigger || null,
          variantId: variantId || null,
        },
      },
    });
  } catch {}
};

type ConversionEventInput = {
  businessId: string;
  leadId?: string | null;
  outcome:
    | "BOOKED_CALL"
    | "PURCHASE"
    | "RE_ENGAGED"
    | "booked_call"
    | "payment_completed"
    | "replied"
    | "link_clicked";
  value?: number | null;
  idempotencyKey?: string | null;
};

export const recordSalesConversionEvent = async ({
  businessId,
  leadId,
  outcome,
  value,
  idempotencyKey,
}: ConversionEventInput) => {
  try {
    let relatedMeta: Record<string, unknown> = {};

    if (leadId) {
      const latestReply = await prisma.analytics.findFirst({
        where: {
          businessId,
          type: "SALES_AGENT_REPLY",
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const latestMeta = (latestReply?.meta || {}) as Record<string, unknown>;

      if (String(latestMeta.leadId || "") === leadId) {
        relatedMeta = latestMeta;
      }
    }

    await prisma.analytics.create({
      data: {
        businessId,
        type: "SALES_AGENT_CONVERSION",
        meta: {
          leadId: leadId || null,
          outcome,
          value: value || null,
          cta: String(relatedMeta.cta || "") || null,
          angle: String(relatedMeta.angle || "") || null,
          planKey: String(relatedMeta.planKey || "") || null,
          stage: String(relatedMeta.stage || "") || null,
        },
      },
    });

    if (leadId) {
      const normalizedOutcome =
        outcome === "BOOKED_CALL"
          ? "booked_call"
          : outcome === "PURCHASE"
            ? "payment_completed"
            : outcome === "RE_ENGAGED"
              ? "replied"
              : outcome;

      if (
        normalizedOutcome === "booked_call" ||
        normalizedOutcome === "payment_completed" ||
        normalizedOutcome === "replied" ||
        normalizedOutcome === "link_clicked"
      ) {
        await recordConversionEvent({
          businessId,
          leadId,
          outcome: normalizedOutcome,
          value,
          source: "SALES_OPTIMIZER",
          idempotencyKey: idempotencyKey || null,
        });
      }
    }
  } catch {}
};

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;

const getMessageLengthBucket = (content: string) => {
  const length = content.trim().length;

  if (length <= 160) return "micro";
  if (length <= 240) return "short";
  if (length <= 320) return "medium";
  return "detailed";
};

const chooseRecommendation = (items: Array<{
  variantTone?: string | null;
  variantCTAStyle?: string | null;
  lengthBucket: string;
  conversions: number;
  conversionValue: number;
}>) => {
  const scoreMap = new Map<
    string,
    {
      score: number;
      count: number;
    }
  >();

  const addScore = (key: string, value: number) => {
    const current = scoreMap.get(key) || { score: 0, count: 0 };
    current.score += value;
    current.count += 1;
    scoreMap.set(key, current);
  };

  for (const item of items) {
    const value = item.conversionValue + item.conversions;
    addScore(`tone:${item.variantTone || "human-confident"}`, value);
    addScore(`cta:${item.variantCTAStyle || "single-clear-cta"}`, value);
    addScore(`length:${item.lengthBucket}`, value);
  }

  const getBest = (prefix: string, fallback: string) =>
    Array.from(scoreMap.entries())
      .filter(([key]) => key.startsWith(prefix))
      .sort((left, right) => right[1].score - left[1].score)[0]?.[0]
      ?.replace(prefix, "") || fallback;

  return {
    tone: getBest("tone:", "human-confident"),
    ctaStyle: getBest("cta:", "single-clear-cta"),
    messageLength: getBest("length:", "short"),
  };
};

export const runSalesOptimizer = async ({
  businessId,
  clientId,
}: {
  businessId: string;
  clientId?: string | null;
}) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const performance = await getSalesPerformanceSnapshot({
    businessId,
    clientId,
    lookbackDays: 30,
  });

  const trackings = await listRevenueTouchTrackingRows({
    businessId,
    ...(clientId !== undefined ? { clientId: clientId || null } : {}),
    start: since,
    end: new Date(),
    limit: 1000,
  });

  const rows = trackings.map((tracking) => {
    const metadata = (tracking.metadata || {}) as Record<string, unknown>;
    const learningArmKey = resolveTrackingLearningArmKey({
      variantKey: tracking.variant?.variantKey || null,
      metadata,
    });
    const conversionValue = tracking.conversionEvents.reduce((sum, event) => {
      if (event.outcome === "payment_completed") return sum + (event.value || 8);
      if (event.outcome === "booked_call") return sum + 5;
      if (event.outcome === "link_clicked") return sum + 2;
      if (event.outcome === "replied") return sum + 1;
      return sum + 0.25;
    }, 0);

    return {
      messageId: tracking.messageId,
      content: tracking.message.content,
      cta: tracking.cta,
      angle: tracking.angle,
      variantId: tracking.variantId,
      variantKey: learningArmKey,
      variantTone:
        String(metadata.decisionTone || tracking.variant?.tone || "").trim() || null,
      variantCTAStyle:
        String(
          metadata.variantCTAStyle ||
            metadata.decisionCTAStyle ||
            tracking.variant?.ctaStyle ||
            ""
        ).trim() || null,
      lengthBucket: getMessageLengthBucket(tracking.message.content),
      conversions: tracking.conversionEvents.length,
      conversionValue,
      sentAt: tracking.sentAt,
    };
  });

  const ranked = rows.sort((left, right) => {
    if (right.conversionValue !== left.conversionValue) {
      return right.conversionValue - left.conversionValue;
    }

    return right.conversions - left.conversions;
  });
  const bestMessages = performance.overall.topRevenueMessages.slice(0, 5).map(
    (message) => ({
      ...message,
      sentAt: message.sentAt.toISOString(),
    })
  );
  const worstMessages = performance.overall.worstPerformingMessages
    .slice(0, 5)
    .map((message) => ({
      ...message,
      sentAt: message.sentAt.toISOString(),
    }));
  const recommendation = chooseRecommendation(ranked);
  const topPatterns = bestMessages
    .map((message) =>
      [
        message.angle ? `angle:${message.angle}` : null,
        message.cta ? `cta:${message.cta}` : null,
        message.variantKey ? `variant:${message.variantKey}` : null,
        message.structure ? `structure:${message.structure}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)
    .slice(0, 3);
  const conversionCount = rows.reduce(
    (sum, row) => sum + (row.conversions > 0 ? 1 : 0),
    0
  );
  const topRevenueStage = [...performance.revenueByFunnelStage].sort(
    (left, right) => right.revenuePerMessage - left.revenuePerMessage
  )[0];
  const confidence =
    rows.length >= 50
      ? 0.85
      : rows.length >= 20
        ? 0.65
        : rows.length >= 10
          ? 0.45
          : 0.25;
  const summary = performance.overall.messages
    ? `Recent AI messages convert at ${percent(
        performance.overall.conversions,
        performance.overall.messages
      )}%. Favor ${recommendation.tone} tone, ${
        recommendation.ctaStyle
      } CTA style, and ${recommendation.messageLength} replies. Top revenue is strongest in ${
        topRevenueStage?.state || "active"
      } segments.`
    : DEFAULT_INSIGHTS.guidance;

  const insight = await prisma.salesOptimizationInsight.create({
    data: {
      businessId,
      clientId: clientId || null,
      insightType: "REVENUE_OPTIMIZATION",
      summary,
      recommendedTone: recommendation.tone,
      recommendedCTAStyle: recommendation.ctaStyle,
      recommendedMessageLength: recommendation.messageLength,
      bestMessages,
      worstMessages,
      recommendations: {
        topPatterns,
        ctaStyle: recommendation.ctaStyle,
        tone: recommendation.tone,
        messageLength: recommendation.messageLength,
        revenueByVariant: performance.revenueByVariant,
        revenueByFunnelStage: performance.revenueByFunnelStage,
      },
      sampleSize: rows.length,
      confidence,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await autoPromoteBestVariant({
    businessId,
    clientId: clientId || null,
    messageType: "AI_REPLY",
  }).catch((error) => {
    logger.debug({ businessId, clientId, error }, "Variant promotion skipped");
  });

  await autoPromoteBestVariant({
    businessId,
    clientId: clientId || null,
    messageType: "FOLLOWUP",
  }).catch((error) => {
    logger.debug(
      { businessId, clientId, error },
      "Follow-up variant promotion skipped"
    );
  });

  try {
    const { syncDecisionEngineCache } = await import("./decisionEngine.service");
    await Promise.all([
      syncDecisionEngineCache({
        businessId,
        clientId: clientId || null,
        messageType: "AI_REPLY",
      }),
      syncDecisionEngineCache({
        businessId,
        clientId: clientId || null,
        messageType: "FOLLOWUP",
      }),
    ]);
  } catch (error) {
    logger.debug(
      { businessId, clientId: clientId || null, error },
      "Decision cache refresh skipped after optimizer cycle"
    );
  }

  logger.info(
    {
      businessId,
      clientId: clientId || null,
      sampleSize: rows.length,
      confidence,
    },
    "Sales optimizer insight stored"
  );

  return insight;
};
