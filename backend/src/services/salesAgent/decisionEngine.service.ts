import redis from "../../config/redis";
import logger from "../../utils/logger";
import {
  SALES_DECISION_TTL_SECONDS,
  writeRedisJsonIfChanged,
} from "../redisState.service";
import { getIntelligenceRuntimeInfluence } from "../intelligence/intelligenceRuntimeInfluence.service";
import { getMessageVariantPool } from "./abTesting.service";
import { getSalesPerformanceSnapshot } from "./conversionTracker.service";
import { getLeadStateContext } from "./leadState.service";
import { getSalesOptimizationInsights } from "./optimizer.service";
import { getSalesActionPriority } from "./progression.service";
import type {
  LeadRevenueState,
  SalesActionType,
  SalesCTA,
  SalesDecisionAction,
  SalesDecisionIntent,
  SalesDecisionStrategy,
  SalesEmotion,
  SalesIntent,
  SalesMessageVariantContext,
  SalesPerformanceAggregate,
  SalesPerformanceSnapshot,
  SalesProgressionState,
} from "./types";

type DecisionSelectionInput = {
  businessId: string;
  leadId?: string;
  clientId?: string | null;
  messageType?: string;
  leadState?: LeadRevenueState | string | null;
  intent: SalesDecisionIntent;
  salesIntent?: SalesIntent | string | null;
  progression?: SalesProgressionState | null;
  emotion: SalesEmotion;
  clientData?: {
    aiTone?: string | null;
    businessInfo?: string | null;
    pricingInfo?: string | null;
    faqKnowledge?: string | null;
    salesInstructions?: string | null;
  };
  capabilities?: {
    primaryCtas: SalesCTA[];
    supportBooking?: boolean;
    supportPaymentLinks?: boolean;
  };
};

type DecisionCacheScope = {
  businessId: string;
  clientId?: string | null;
  messageType?: string;
};

type CachedDecisionRecommendation = Omit<SalesDecisionAction, "variant"> & {
  variantId?: string | null;
  variantKey?: string | null;
};

type DecisionCachePayload = {
  updatedAt: string;
  byState: Record<LeadRevenueState, CachedDecisionRecommendation>;
  bySegment: Record<string, CachedDecisionRecommendation>;
};

const STATES: LeadRevenueState[] = ["COLD", "WARM", "HOT", "CONVERTED"];
const INTENTS: SalesDecisionIntent[] = ["buy", "explore", "doubt", "ignore"];
const EMOTIONS: SalesEmotion[] = ["curious", "skeptical", "urgent", "cold"];
const CACHE_PREFIX = "sales_decision_engine";
const CACHE_TTL_SECONDS = SALES_DECISION_TTL_SECONDS;
const MEMORY_TTL_MS = 5 * 60 * 1000;

const globalForDecisionCache = globalThis as typeof globalThis & {
  __sylphDecisionCache?: Map<
    string,
    {
      expiresAt: number;
      payload: DecisionCachePayload;
    }
  >;
};

const decisionCache =
  globalForDecisionCache.__sylphDecisionCache ||
  new Map<
    string,
    {
      expiresAt: number;
      payload: DecisionCachePayload;
    }
  >();

if (!globalForDecisionCache.__sylphDecisionCache) {
  globalForDecisionCache.__sylphDecisionCache = decisionCache;
}

const normalizeLeadState = (value?: string | null): LeadRevenueState => {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "CONVERTED") return "CONVERTED";
  if (normalized === "HOT") return "HOT";
  if (normalized === "WARM") return "WARM";
  return "COLD";
};

const buildCacheKey = ({
  businessId,
  clientId,
  messageType = "AI_REPLY",
}: DecisionCacheScope) =>
  `${CACHE_PREFIX}:${businessId}:${clientId || "global"}:${messageType}`;

const buildSegmentKey = (
  state: LeadRevenueState,
  intent: SalesDecisionIntent,
  emotion: SalesEmotion
) => `${state}:${intent}:${emotion}`;

const strategyForState = (state: LeadRevenueState): SalesDecisionStrategy => {
  if (state === "HOT") return "CONVERSION";
  if (state === "WARM") return "BALANCED";
  return "ENGAGEMENT";
};

const weightsForState = (state: LeadRevenueState) => {
  if (state === "HOT") {
    return {
      reply: 0.2,
      conversion: 0.65,
      revenue: 3,
    };
  }

  if (state === "WARM") {
    return {
      reply: 0.4,
      conversion: 0.45,
      revenue: 2.25,
    };
  }

  return {
    reply: 0.65,
    conversion: 0.2,
    revenue: 1.5,
  };
};

const defaultCTAForSegment = ({
  state,
  intent,
  emotion,
}: {
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
}): SalesCTA => {
  if (state === "CONVERTED") return "NONE";
  if (intent === "buy" && emotion === "urgent") return "BUY_NOW";
  if (intent === "buy") return "BOOK_CALL";
  if (intent === "doubt") return state === "HOT" ? "BOOK_CALL" : "VIEW_DEMO";
  if (state === "HOT") return "BOOK_CALL";
  if (state === "WARM") return "VIEW_DEMO";
  return intent === "ignore" ? "REPLY_DM" : "CAPTURE_LEAD";
};

const pickBestAvailableCta = (
  priorities: SalesCTA[],
  allowedCtas: SalesCTA[]
): SalesCTA => {
  for (const cta of priorities) {
    if (cta !== "NONE" && allowedCtas.includes(cta)) {
      return cta;
    }
  }

  return allowedCtas.find((cta) => cta !== "NONE") || "REPLY_DM";
};

const defaultActionForDecisionIntent = (
  intent: SalesDecisionIntent
): SalesActionType => {
  if (intent === "buy") return "CLOSE";
  if (intent === "doubt") return "HANDLE_OBJECTION";
  if (intent === "explore") return "QUALIFY";
  return "ENGAGE";
};

const defaultToneForSegment = ({
  state,
  intent,
  emotion,
}: {
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
}) => {
  if (state === "CONVERTED") return "supportive-next-step";
  if (emotion === "urgent") return "decisive-closer";
  if (emotion === "skeptical" || intent === "doubt") return "confident-proof";
  if (state === "COLD" || intent === "explore") return "curious-human";
  return "human-confident";
};

const defaultStructureForSegment = ({
  state,
  intent,
  emotion,
}: {
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
}) => {
  if (state === "CONVERTED") return "confirm_next_step";
  if (emotion === "urgent" || intent === "buy") return "direct_close";
  if (emotion === "skeptical" || intent === "doubt") return "value_proof_cta";
  if (state === "COLD" || intent === "explore") return "curiosity_hook_question";
  return "value_proof_cta";
};

const buildAggregateForState = (
  snapshot: SalesPerformanceSnapshot,
  state: LeadRevenueState
) =>
  snapshot.byState[state].messages >= 5 ? snapshot.byState[state] : snapshot.active;

const baseScore = (
  aggregate: SalesPerformanceAggregate,
  state: LeadRevenueState
) => {
  const weights = weightsForState(state);

  return (
    aggregate.replyRate * weights.reply +
    aggregate.conversionRate * weights.conversion +
    aggregate.revenuePerMessage * weights.revenue
  );
};

const uniqueValues = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const resolveAllowedCtas = (
  capabilities?: DecisionSelectionInput["capabilities"]
): SalesCTA[] => {
  const allowed = capabilities?.primaryCtas?.length
    ? [...capabilities.primaryCtas]
    : ([
        "REPLY_DM",
        "VIEW_DEMO",
        "BOOK_CALL",
        "BUY_NOW",
        "CAPTURE_LEAD",
        "NONE",
      ] as SalesCTA[]);

  return allowed.filter((cta) => {
    if (cta === "BOOK_CALL" && capabilities?.supportBooking === false) {
      return false;
    }

    if (cta === "BUY_NOW" && capabilities?.supportPaymentLinks === false) {
      return false;
    }

    return true;
  });
};

const scoreVariant = ({
  variant,
  aggregate,
  optimization,
  state,
  intent,
  emotion,
}: {
  variant: SalesMessageVariantContext;
  aggregate: SalesPerformanceAggregate;
  optimization: Awaited<ReturnType<typeof getSalesOptimizationInsights>>;
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
}) => {
  const stat =
    aggregate.variantStats.find((item) => item.variantId === variant.id) ||
    aggregate.variantStats.find((item) => item.variantKey === variant.variantKey);
  let score = stat
    ? stat.replyRate * weightsForState(state).reply +
      stat.conversionRate * weightsForState(state).conversion +
      stat.revenuePerMessage * weightsForState(state).revenue
    : 0;

  if (variant.isPromoted) score += 4;
  score += Math.min(variant.weight || 1, 5);

  if (optimization.topPatterns?.some((pattern) => pattern.includes(variant.variantKey))) {
    score += 5;
  }

  if (intent === "buy" && variant.ctaStyle === "direct-booking") score += 12;
  if (intent === "explore" && variant.ctaStyle === "soft-question") score += 9;
  if (intent === "doubt" && variant.ctaStyle === "proof-backed") score += 11;
  if (emotion === "urgent" && variant.messageLength === "short") score += 5;
  if (emotion === "urgent" && /decisive|closer|confident/i.test(variant.tone)) {
    score += 6;
  }
  if (
    (emotion === "skeptical" || intent === "doubt") &&
    /proof|confident/i.test(variant.tone)
  ) {
    score += 7;
  }
  if ((state === "COLD" || intent === "explore") && variant.messageLength === "short") {
    score += 4;
  }

  return score;
};

const scoreNamedStat = ({
  key,
  stats,
  state,
  baseKey,
  optimizationBoost = 0,
  heuristicBoost = 0,
}: {
  key: string;
  stats: Array<{
    key: string;
    replyRate: number;
    conversionRate: number;
    revenuePerMessage: number;
  }>;
  state: LeadRevenueState;
  baseKey?: string | null;
  optimizationBoost?: number;
  heuristicBoost?: number;
}) => {
  const stat = stats.find((item) => item.key === key);
  let score = stat
    ? stat.replyRate * weightsForState(state).reply +
      stat.conversionRate * weightsForState(state).conversion +
      stat.revenuePerMessage * weightsForState(state).revenue
    : 0;

  if (baseKey && key === baseKey) {
    score += 5;
  }

  score += optimizationBoost;
  score += heuristicBoost;

  return score;
};

const chooseVariant = ({
  variants,
  aggregate,
  optimization,
  state,
  intent,
  emotion,
}: {
  variants: SalesMessageVariantContext[];
  aggregate: SalesPerformanceAggregate;
  optimization: Awaited<ReturnType<typeof getSalesOptimizationInsights>>;
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
}) => {
  return [...variants].sort((left, right) => {
    return (
      scoreVariant({
        variant: right,
        aggregate,
        optimization,
        state,
        intent,
        emotion,
      }) -
      scoreVariant({
        variant: left,
        aggregate,
        optimization,
        state,
        intent,
        emotion,
      })
    );
  })[0] || null;
};

const chooseCTA = ({
  aggregate,
  optimization,
  state,
  intent,
  emotion,
  fallbackCTA,
  allowedCtas,
}: {
  aggregate: SalesPerformanceAggregate;
  optimization: Awaited<ReturnType<typeof getSalesOptimizationInsights>>;
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
  fallbackCTA: SalesCTA;
  allowedCtas: SalesCTA[];
}) => {
  const candidates = uniqueValues([
    ...allowedCtas,
    fallbackCTA,
    optimization.recommendedCTA,
    ...optimization.bestCtas.map((item) => item.cta),
    ...aggregate.ctaStats.map((item) => item.key),
  ]) as SalesCTA[];

  const scored = candidates.map((cta) => ({
    cta,
    score: scoreNamedStat({
      key: cta,
      stats: aggregate.ctaStats,
      state,
      baseKey: fallbackCTA,
      optimizationBoost: optimization.recommendedCTA === cta ? 4 : 0,
      heuristicBoost:
        (intent === "buy" && (cta === "BUY_NOW" || cta === "BOOK_CALL") ? 9 : 0) +
        (intent === "explore" && (cta === "CAPTURE_LEAD" || cta === "VIEW_DEMO") ? 6 : 0) +
        (intent === "doubt" && (cta === "VIEW_DEMO" || cta === "BOOK_CALL") ? 6 : 0) +
        (emotion === "urgent" && (cta === "BUY_NOW" || cta === "BOOK_CALL") ? 5 : 0) +
        (state === "COLD" && cta === "CAPTURE_LEAD" ? 4 : 0),
    }),
  }));

  return scored.sort((left, right) => right.score - left.score)[0]?.cta || fallbackCTA;
};

const chooseTone = ({
  aggregate,
  optimization,
  variant,
  state,
  intent,
  emotion,
  clientTone,
}: {
  aggregate: SalesPerformanceAggregate;
  optimization: Awaited<ReturnType<typeof getSalesOptimizationInsights>>;
  variant: SalesMessageVariantContext | null;
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
  clientTone?: string | null;
}) => {
  const fallbackTone = defaultToneForSegment({
    state,
    intent,
    emotion,
  });
  const candidates = uniqueValues([
    variant?.tone,
    optimization.recommendedTone,
    fallbackTone,
    clientTone,
    ...aggregate.toneStats.map((item) => item.key),
  ]);
  const scored = candidates.map((tone) => ({
    tone,
    score: scoreNamedStat({
      key: tone,
      stats: aggregate.toneStats,
      state,
      baseKey: fallbackTone,
      optimizationBoost: optimization.recommendedTone === tone ? 4 : 0,
      heuristicBoost:
        (emotion === "urgent" && /decisive|closer|confident/i.test(tone) ? 6 : 0) +
        ((emotion === "skeptical" || intent === "doubt") &&
        /proof|confident/i.test(tone)
          ? 7
          : 0) +
        ((state === "COLD" || intent === "explore") &&
        /curious|human/i.test(tone)
          ? 5
          : 0),
    }),
  }));
  const bestTone = scored.sort((left, right) => right.score - left.score)[0]?.tone;

  if (clientTone && bestTone === "human-confident") {
    return clientTone;
  }

  return bestTone || clientTone || fallbackTone;
};

const chooseStructure = ({
  aggregate,
  optimization,
  variant,
  state,
  intent,
  emotion,
}: {
  aggregate: SalesPerformanceAggregate;
  optimization: Awaited<ReturnType<typeof getSalesOptimizationInsights>>;
  variant: SalesMessageVariantContext | null;
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
}) => {
  const fallbackStructure = defaultStructureForSegment({
    state,
    intent,
    emotion,
  });
  const topPattern = optimization.topPatterns?.[0] || null;
  const candidates = uniqueValues([
    variant?.structure,
    fallbackStructure,
    topPattern,
    ...aggregate.structureStats.map((item) => item.key),
  ]);
  const scored = candidates.map((structure) => ({
    structure,
    score: scoreNamedStat({
      key: structure,
      stats: aggregate.structureStats,
      state,
      baseKey: fallbackStructure,
      optimizationBoost: topPattern === structure ? 3 : 0,
      heuristicBoost:
        (intent === "buy" && /close|direct/i.test(structure) ? 8 : 0) +
        ((intent === "doubt" || emotion === "skeptical") &&
        /proof|value/i.test(structure)
          ? 7
          : 0) +
        ((intent === "explore" || state === "COLD") &&
        /curiosity|question/i.test(structure)
          ? 6
          : 0),
    }),
  }));

  return (
    scored.sort((left, right) => right.score - left.score)[0]?.structure ||
    variant?.structure ||
    fallbackStructure
  );
};

const buildRecommendation = ({
  variants,
  snapshot,
  optimization,
  state,
  intent,
  emotion,
}: {
  variants: SalesMessageVariantContext[];
  snapshot: SalesPerformanceSnapshot;
  optimization: Awaited<ReturnType<typeof getSalesOptimizationInsights>>;
  state: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
}): CachedDecisionRecommendation => {
  const aggregate = buildAggregateForState(snapshot, state);
  const variant = chooseVariant({
    variants,
    aggregate,
    optimization,
    state,
    intent,
    emotion,
  });
  const strategy = strategyForState(state);
  const cta = chooseCTA({
    aggregate,
    optimization,
    state,
    intent,
    emotion,
    fallbackCTA: defaultCTAForSegment({ state, intent, emotion }),
    allowedCtas: [
      "REPLY_DM",
      "VIEW_DEMO",
      "BOOK_CALL",
      "BUY_NOW",
      "CAPTURE_LEAD",
      "NONE",
    ],
  });
  const tone = chooseTone({
    aggregate,
    optimization,
    variant,
    state,
    intent,
    emotion,
  });
  const structure = chooseStructure({
    aggregate,
    optimization,
    variant,
    state,
    intent,
    emotion,
  });
  const topPatterns = uniqueValues([
    structure,
    ...optimization.topPatterns,
    ...aggregate.topRevenueMessages
      .slice(0, 3)
      .map((message) => message.structure || message.variantKey || null),
  ]).slice(0, 3);
  const action = defaultActionForDecisionIntent(intent);

  return {
    action,
    priority: getSalesActionPriority(action),
    strategy,
    leadState: state,
    intent,
    emotion,
    variantId: variant?.id || null,
    variantKey: variant?.variantKey || null,
    cta,
    tone,
    structure,
    ctaStyle: variant?.ctaStyle || optimization.recommendedCTAStyle || "single-clear-cta",
    messageLength:
      variant?.messageLength || optimization.recommendedMessageLength || "short",
    replyRate: aggregate.replyRate,
    conversionRate: aggregate.conversionRate,
    revenuePerMessage: aggregate.revenuePerMessage,
    topPatterns,
    guidance:
      optimization.guidance ||
      "Stay human, keep one CTA, and lean into the strongest recent pattern.",
    reasoning: [
      `action:${action.toLowerCase()}`,
      `strategy:${strategy.toLowerCase()}`,
      `state:${state.toLowerCase()}`,
      `intent:${intent}`,
      `emotion:${emotion}`,
      variant?.variantKey ? `variant:${variant.variantKey}` : "variant:none",
      `cta:${cta}`,
      `tone:${tone}`,
      `structure:${structure}`,
    ],
  };
};

const resolveVariantForRecommendation = (
  recommendation: CachedDecisionRecommendation,
  variants: SalesMessageVariantContext[]
) =>
  variants.find(
    (variant) =>
      variant.id === recommendation.variantId ||
      variant.variantKey === recommendation.variantKey
  ) || null;

const normalizeRecommendation = (
  recommendation: CachedDecisionRecommendation
): CachedDecisionRecommendation => {
  const action =
    recommendation.action || defaultActionForDecisionIntent(recommendation.intent);

  return {
    ...recommendation,
    action,
    priority:
      typeof recommendation.priority === "number"
        ? recommendation.priority
        : getSalesActionPriority(action),
  };
};

const readDecisionCache = async (
  scope: DecisionCacheScope
): Promise<DecisionCachePayload | null> => {
  const key = buildCacheKey(scope);
  const memory = decisionCache.get(key);

  if (memory && memory.expiresAt > Date.now()) {
    return memory.payload;
  }

  if (memory) {
    decisionCache.delete(key);
  }

  try {
    const raw = await redis.get(key);

    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw) as DecisionCachePayload;

    decisionCache.set(key, {
      expiresAt: Date.now() + MEMORY_TTL_MS,
      payload,
    });

    return payload;
  } catch (error) {
    logger.debug({ key, error }, "Decision cache read skipped");
    return null;
  }
};

const writeDecisionCache = async (
  scope: DecisionCacheScope,
  payload: DecisionCachePayload
) => {
  const key = buildCacheKey(scope);

  decisionCache.set(key, {
    expiresAt: Date.now() + MEMORY_TTL_MS,
    payload,
  });

  try {
    await writeRedisJsonIfChanged(key, payload, CACHE_TTL_SECONDS);
  } catch (error) {
    logger.debug({ key, error }, "Decision cache write skipped");
  }
};

const computeDecisionCachePayload = async (
  scope: DecisionCacheScope
): Promise<DecisionCachePayload> => {
  const messageType = scope.messageType || "AI_REPLY";
  const [variants, optimization, snapshot] = await Promise.all([
    getMessageVariantPool({
      businessId: scope.businessId,
      clientId: scope.clientId || null,
      messageType,
    }),
    getSalesOptimizationInsights(scope.businessId),
    getSalesPerformanceSnapshot({
      businessId: scope.businessId,
      clientId: scope.clientId || null,
      messageType,
    }),
  ]);

  const byState = STATES.reduce(
    (acc, state) => {
      acc[state] = buildRecommendation({
        variants,
        snapshot,
        optimization,
        state,
        intent: state === "HOT" ? "buy" : "explore",
        emotion: state === "HOT" ? "urgent" : state === "WARM" ? "curious" : "cold",
      });
      return acc;
    },
    {} as Record<LeadRevenueState, CachedDecisionRecommendation>
  );

  const bySegment = STATES.reduce(
    (acc, state) => {
      for (const intent of INTENTS) {
        for (const emotion of EMOTIONS) {
          acc[buildSegmentKey(state, intent, emotion)] = buildRecommendation({
            variants,
            snapshot,
            optimization,
            state,
            intent,
            emotion,
          });
        }
      }

      return acc;
    },
    {} as Record<string, CachedDecisionRecommendation>
  );

  return {
    updatedAt: new Date().toISOString(),
    byState,
    bySegment,
  };
};

const adjustCTAForCapabilities = (
  recommendation: CachedDecisionRecommendation,
  allowedCtas: SalesCTA[]
) => {
  if (allowedCtas.includes(recommendation.cta)) {
    return recommendation.cta;
  }

  return (
    allowedCtas.find((cta) => cta !== "NONE") ||
    allowedCtas[0] ||
    "NONE"
  );
};

const applySalesIntentOverrides = ({
  recommendation,
  salesIntent,
  allowedCtas,
}: {
  recommendation: CachedDecisionRecommendation;
  salesIntent?: SalesIntent | string | null;
  allowedCtas: SalesCTA[];
}): CachedDecisionRecommendation => {
  const normalizedIntent = String(salesIntent || "").trim().toUpperCase();

  if (!normalizedIntent) {
    return recommendation;
  }

  if (normalizedIntent === "PRICING") {
    return {
      ...recommendation,
      action: "SHOW_PRICING",
      priority: getSalesActionPriority("SHOW_PRICING"),
      cta: pickBestAvailableCta(
        ["BOOK_CALL", "VIEW_DEMO", "CAPTURE_LEAD", recommendation.cta],
        allowedCtas
      ),
      tone: "clear-confident",
      structure: "pricing_value_cta",
      guidance:
        "Answer with concrete pricing context first, then drive to one clear next step.",
      reasoning: [...recommendation.reasoning, "sales_intent:pricing"],
    };
  }

  if (normalizedIntent === "BOOKING") {
    return {
      ...recommendation,
      action: "BOOK",
      priority: getSalesActionPriority("BOOK"),
      cta: pickBestAvailableCta(
        ["BOOK_CALL", "VIEW_DEMO", recommendation.cta],
        allowedCtas
      ),
      tone: "decisive-closer",
      structure: "direct_close",
      guidance:
        "The lead wants to book. Remove friction and push the fastest booking CTA.",
      reasoning: [...recommendation.reasoning, "sales_intent:booking"],
    };
  }

  if (normalizedIntent === "PURCHASE") {
    return {
      ...recommendation,
      action: "CLOSE",
      priority: getSalesActionPriority("CLOSE"),
      cta: pickBestAvailableCta(
        ["BUY_NOW", "BOOK_CALL", "VIEW_DEMO", recommendation.cta],
        allowedCtas
      ),
      tone: "decisive-closer",
      structure: "direct_close",
      guidance:
        "The lead is purchase-leaning. Close directly and avoid reopening discovery.",
      reasoning: [...recommendation.reasoning, "sales_intent:purchase"],
    };
  }

  if (normalizedIntent === "OBJECTION") {
    return {
      ...recommendation,
      action: "HANDLE_OBJECTION",
      priority: getSalesActionPriority("HANDLE_OBJECTION"),
      cta: pickBestAvailableCta(
        ["VIEW_DEMO", "BOOK_CALL", "REPLY_DM", recommendation.cta],
        allowedCtas
      ),
      tone: "confident-proof",
      structure: "value_proof_cta",
      guidance:
        "Handle the doubt with proof, specificity, and one next step that lowers risk.",
      reasoning: [...recommendation.reasoning, "sales_intent:objection"],
    };
  }

  if (
    normalizedIntent === "ENGAGEMENT" ||
    normalizedIntent === "QUALIFICATION" ||
    normalizedIntent === "GREETING" ||
    normalizedIntent === "GENERAL"
  ) {
    return {
      ...recommendation,
      action: "QUALIFY",
      priority: getSalesActionPriority("QUALIFY"),
      cta: pickBestAvailableCta(
        ["CAPTURE_LEAD", "REPLY_DM", "VIEW_DEMO", recommendation.cta],
        allowedCtas
      ),
      tone: "human-confident",
      structure: "qualification_cta",
      guidance:
        "Use one sharp qualification move, not a generic opener, then advance the deal.",
      reasoning: [...recommendation.reasoning, "sales_intent:qualification"],
    };
  }

  return recommendation;
};

const applyProgressionOverrides = ({
  recommendation,
  salesIntent,
  progression,
  allowedCtas,
}: {
  recommendation: CachedDecisionRecommendation;
  salesIntent?: SalesIntent | string | null;
  progression?: SalesProgressionState | null;
  allowedCtas: SalesCTA[];
}) => {
  if (!progression) {
    return recommendation;
  }

  const normalizedIntent = String(salesIntent || "").trim().toUpperCase();
  const next = {
    ...recommendation,
    action: progression.currentAction,
    priority: progression.actionPriority,
    reasoning: [
      ...recommendation.reasoning,
      `progression:${progression.funnelPosition}`,
      `user_signal:${progression.userSignal}`,
      progression.loopDetected ? "loop:detected" : "loop:none",
    ],
  };

  if (normalizedIntent === "PRICING") {
    if (progression.currentAction === "SHOW_PRICING") {
      return {
        ...next,
        cta: pickBestAvailableCta(
          ["REPLY_DM", "VIEW_DEMO", "BOOK_CALL", recommendation.cta],
          allowedCtas
        ),
        tone: "clear-confident",
        structure: "pricing_value_cta",
        guidance:
          "Show pricing first, do not re-qualify, and keep the CTA light so the next step stays open.",
      };
    }

    if (progression.currentAction === "SUGGEST_PLAN") {
      return {
        ...next,
        cta: pickBestAvailableCta(
          ["BOOK_CALL", "VIEW_DEMO", "REPLY_DM", recommendation.cta],
          allowedCtas
        ),
        tone: "clear-confident",
        structure: "plan_recommendation_cta",
        guidance:
          "Recommend the best-fit plan directly, explain why it fits, and move to one CTA.",
      };
    }

    if (progression.currentAction === "PUSH_CTA") {
      return {
        ...next,
        cta: pickBestAvailableCta(
          ["BOOK_CALL", "VIEW_DEMO", "BUY_NOW", recommendation.cta],
          allowedCtas
        ),
        tone: "decisive-closer",
        structure: "direct_close",
        guidance:
          "The price is already on the table. Push a clean CTA instead of reopening discovery.",
      };
    }

    if (progression.currentAction === "CLOSE") {
      return {
        ...next,
        cta: pickBestAvailableCta(
          ["BUY_NOW", "BOOK_CALL", "VIEW_DEMO", recommendation.cta],
          allowedCtas
        ),
        tone: "decisive-closer",
        structure: "direct_close",
        guidance:
          "Close decisively. No more qualification or repeated pricing steps.",
      };
    }
  }

  if (progression.currentAction === "BOOK") {
    return {
      ...next,
      cta: pickBestAvailableCta(
        ["BOOK_CALL", "VIEW_DEMO", recommendation.cta],
        allowedCtas
      ),
      tone: "decisive-closer",
      structure: "direct_close",
      guidance:
        "Booking is the next step. Remove friction and send the booking CTA.",
    };
  }

  if (progression.currentAction === "HANDLE_OBJECTION") {
    return {
      ...next,
      cta: pickBestAvailableCta(
        ["VIEW_DEMO", "BOOK_CALL", recommendation.cta],
        allowedCtas
      ),
      tone: "confident-proof",
      structure: "value_proof_cta",
      guidance:
        "Answer the objection directly, add proof, and then move to one CTA.",
    };
  }

  if (progression.currentAction === "QUALIFY") {
    return {
      ...next,
      cta: pickBestAvailableCta(
        ["CAPTURE_LEAD", "REPLY_DM", "VIEW_DEMO", recommendation.cta],
        allowedCtas
      ),
      tone: "human-confident",
      structure: "qualification_cta",
      guidance:
        "Ask one sharp qualification question only if it advances the funnel.",
    };
  }

  if (progression.currentAction === "ENGAGE") {
    return {
      ...next,
      cta: pickBestAvailableCta(
        ["REPLY_DM", "CAPTURE_LEAD", recommendation.cta],
        allowedCtas
      ),
      tone: "human-confident",
      structure: "engage_to_next_step",
      guidance:
        "Keep the conversation moving forward with one lightweight CTA.",
    };
  }

  return next;
};

const applyIntelligenceDecisionAdjustments = ({
  recommendation,
  input,
  allowedCtas,
  intelligence,
}: {
  recommendation: CachedDecisionRecommendation;
  input: DecisionSelectionInput;
  allowedCtas: SalesCTA[];
  intelligence: Awaited<ReturnType<typeof getIntelligenceRuntimeInfluence>> | null;
}) => {
  if (!intelligence) {
    return recommendation;
  }

  const next = {
    ...recommendation,
    reasoning: [...recommendation.reasoning],
  };
  const controls = intelligence.controls.ai;

  if (controls.tone) {
    next.tone = controls.tone;
    next.reasoning.push(`intelligence_tone:${controls.tone}`);
  }

  if (
    controls.forceHumanEscalation &&
    recommendation.intent !== "buy" &&
    recommendation.action !== "HANDLE_OBJECTION"
  ) {
    next.action = "HANDLE_OBJECTION";
    next.priority = Math.max(next.priority, getSalesActionPriority("HANDLE_OBJECTION"));
    next.cta = pickBestAvailableCta(
      ["REPLY_DM", "VIEW_DEMO", recommendation.cta],
      allowedCtas
    );
    next.structure = "value_proof_cta";
    next.guidance =
      "Risk escalation is active. De-escalate, answer with proof, and avoid hard push CTA.";
    next.reasoning.push("intelligence_force_escalation");
  }

  if (controls.urgencyBoost >= 20) {
    next.cta = pickBestAvailableCta(
      ["BUY_NOW", "BOOK_CALL", "VIEW_DEMO", recommendation.cta],
      allowedCtas
    );
    next.messageLength = "short";
    next.reasoning.push(`intelligence_urgency_boost:${controls.urgencyBoost}`);
  } else if (controls.urgencyBoost <= -5) {
    next.messageLength = "medium";
    next.reasoning.push(`intelligence_urgency_relax:${controls.urgencyBoost}`);
  }

  if (
    controls.offerTimingShiftMinutes <= -30 &&
    (recommendation.intent === "buy" || recommendation.intent === "explore")
  ) {
    next.action = recommendation.intent === "buy" ? "CLOSE" : "PUSH_CTA";
    next.priority = Math.max(next.priority, getSalesActionPriority(next.action));
    next.structure = "direct_close";
    next.reasoning.push(
      `intelligence_offer_advance:${controls.offerTimingShiftMinutes}`
    );
  }

  if (
    controls.offerTimingShiftMinutes >= 90 &&
    recommendation.intent !== "buy" &&
    recommendation.action !== "ENGAGE"
  ) {
    next.action = "ENGAGE";
    next.priority = getSalesActionPriority("ENGAGE");
    next.cta = pickBestAvailableCta(
      ["REPLY_DM", "CAPTURE_LEAD", "VIEW_DEMO", recommendation.cta],
      allowedCtas
    );
    next.reasoning.push(
      `intelligence_offer_delay:${controls.offerTimingShiftMinutes}`
    );
  }

  if (controls.escalationAdvanceMinutes >= 45) {
    next.priority = Math.max(next.priority, getSalesActionPriority("HANDLE_OBJECTION"));
    next.reasoning.push(
      `intelligence_escalation_advance:${controls.escalationAdvanceMinutes}`
    );
  }

  if (input.clientData?.aiTone && next.tone === "human-confident") {
    next.tone = input.clientData.aiTone;
  }

  return next;
};

const buildHeuristicDecision = (
  input: DecisionSelectionInput,
  state: LeadRevenueState,
  allowedCtas: SalesCTA[]
): SalesDecisionAction => {
  const recommendation: CachedDecisionRecommendation = {
    action: defaultActionForDecisionIntent(input.intent),
    priority: getSalesActionPriority(defaultActionForDecisionIntent(input.intent)),
    strategy: strategyForState(state),
    leadState: state,
    intent: input.intent,
    emotion: input.emotion,
    cta: adjustCTAForCapabilities(
      {
        action: defaultActionForDecisionIntent(input.intent),
        priority: getSalesActionPriority(
          defaultActionForDecisionIntent(input.intent)
        ),
        strategy: strategyForState(state),
        leadState: state,
        intent: input.intent,
        emotion: input.emotion,
        cta: defaultCTAForSegment({
          state,
          intent: input.intent,
          emotion: input.emotion,
        }),
        tone: defaultToneForSegment({
          state,
          intent: input.intent,
          emotion: input.emotion,
        }),
        structure: defaultStructureForSegment({
          state,
          intent: input.intent,
          emotion: input.emotion,
        }),
        ctaStyle: "single-clear-cta",
        messageLength: "short",
        replyRate: 0,
        conversionRate: 0,
        revenuePerMessage: 0,
        topPatterns: [],
        guidance:
          "Use the default closer playbook because cached recommendations were unavailable.",
        reasoning: [
          "source:heuristic",
          `state:${state.toLowerCase()}`,
          `intent:${input.intent}`,
          `emotion:${input.emotion}`,
        ],
      },
      allowedCtas
    ),
    tone: defaultToneForSegment({
      state,
      intent: input.intent,
      emotion: input.emotion,
    }),
    structure: defaultStructureForSegment({
      state,
      intent: input.intent,
      emotion: input.emotion,
    }),
    ctaStyle: "single-clear-cta",
    messageLength: "short",
    replyRate: 0,
    conversionRate: 0,
    revenuePerMessage: 0,
    topPatterns: [],
    guidance:
      "Use the default closer playbook because cached recommendations were unavailable.",
    reasoning: [
      "source:heuristic",
      `state:${state.toLowerCase()}`,
      `intent:${input.intent}`,
      `emotion:${input.emotion}`,
    ],
  };
  const enforced = applySalesIntentOverrides({
    recommendation,
    salesIntent: input.salesIntent,
    allowedCtas,
  });
  const progressed = applyProgressionOverrides({
    recommendation: enforced,
    salesIntent: input.salesIntent,
    progression: input.progression,
    allowedCtas,
  });

  return {
    ...progressed,
    cta: adjustCTAForCapabilities(progressed, allowedCtas),
    tone:
      input.clientData?.aiTone && progressed.tone === "human-confident"
        ? input.clientData.aiTone
        : progressed.tone,
    variant: null,
  };
};

export const syncDecisionEngineCache = async (
  scope: DecisionCacheScope
) => {
  const payload = await computeDecisionCachePayload(scope);
  await writeDecisionCache(scope, payload);
  return payload;
};

export const invalidateDecisionEngineCache = async ({
  businessId,
  clientId,
  messageType,
}: DecisionCacheScope) => {
  const scopes: DecisionCacheScope[] = messageType
    ? [
        {
          businessId,
          clientId: clientId || null,
          messageType,
        },
        {
          businessId,
          clientId: null,
          messageType,
        },
      ]
    : [
        {
          businessId,
          clientId: clientId || null,
          messageType: "AI_REPLY",
        },
        {
          businessId,
          clientId: null,
          messageType: "AI_REPLY",
        },
        {
          businessId,
          clientId: clientId || null,
          messageType: "FOLLOWUP",
        },
        {
          businessId,
          clientId: null,
          messageType: "FOLLOWUP",
        },
      ];

  for (const scope of scopes) {
    const key = buildCacheKey(scope);
    decisionCache.delete(key);

    try {
      await redis.del(key);
    } catch (error) {
      logger.debug({ key, error }, "Decision cache delete skipped");
    }
  }
};

export const selectBestAction = async (
  input: DecisionSelectionInput
): Promise<SalesDecisionAction> => {
  const messageType = input.messageType || "AI_REPLY";
  const resolvedLeadState =
    input.leadState ||
    (input.leadId ? (await getLeadStateContext(input.leadId)).state : "COLD");
  const state = normalizeLeadState(resolvedLeadState);
  const scope = {
    businessId: input.businessId,
    clientId: input.clientId || null,
    messageType,
  };
  const allowedCtas = resolveAllowedCtas(input.capabilities);

  try {
    let payload = await readDecisionCache(scope);

    if (!payload) {
      payload = await syncDecisionEngineCache(scope);
    }

    const segmentKey = buildSegmentKey(state, input.intent, input.emotion);
    const recommendation = normalizeRecommendation(
      payload.bySegment[segmentKey] || payload.byState[state]
    );
    const enforcedRecommendation = applySalesIntentOverrides({
      recommendation,
      salesIntent: input.salesIntent,
      allowedCtas,
    });
    const progressedRecommendation = applyProgressionOverrides({
      recommendation: enforcedRecommendation,
      salesIntent: input.salesIntent,
      progression: input.progression,
      allowedCtas,
    });
    const intelligence = await getIntelligenceRuntimeInfluence({
      businessId: input.businessId,
      leadId: input.leadId || null,
    }).catch(() => null);
    const intelligenceAdjusted = applyIntelligenceDecisionAdjustments({
      recommendation: progressedRecommendation,
      input,
      allowedCtas,
      intelligence,
    });
    const variants = await getMessageVariantPool({
      businessId: input.businessId,
      clientId: input.clientId || null,
      messageType,
    });
    const finalCTA = adjustCTAForCapabilities(
      intelligenceAdjusted,
      allowedCtas
    );
    const finalTone =
      input.clientData?.aiTone && intelligenceAdjusted.tone === "human-confident"
        ? input.clientData.aiTone
        : intelligenceAdjusted.tone;

    return {
      ...intelligenceAdjusted,
      cta: finalCTA,
      tone: finalTone,
      variant: resolveVariantForRecommendation(intelligenceAdjusted, variants),
    };
  } catch (error) {
    logger.warn(
      {
        businessId: input.businessId,
        leadId: input.leadId || null,
        clientId: input.clientId || null,
        messageType,
        intent: input.intent,
        salesIntent: input.salesIntent || null,
        error,
      },
      "Decision engine degraded to heuristic recommendation"
    );

    const heuristic = buildHeuristicDecision(input, state, allowedCtas);
    const intelligence = await getIntelligenceRuntimeInfluence({
      businessId: input.businessId,
      leadId: input.leadId || null,
    }).catch(() => null);

    if (!intelligence) {
      return heuristic;
    }

    const adjusted = applyIntelligenceDecisionAdjustments({
      recommendation: {
        ...heuristic,
        variantId: heuristic.variant?.id || null,
        variantKey: heuristic.variant?.variantKey || null,
      },
      input,
      allowedCtas,
      intelligence,
    });

    return {
      ...heuristic,
      ...adjusted,
      variant: heuristic.variant,
      cta: adjustCTAForCapabilities(adjusted, allowedCtas),
    };
  }
};
