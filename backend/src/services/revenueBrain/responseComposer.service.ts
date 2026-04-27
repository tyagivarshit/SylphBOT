import OpenAI from "openai";
import { buildFallbackStructuredSalesOutput } from "../salesAgent/output.service";
import {
  buildFallbackSalesReply,
  enforceSalesReplyGuardrails,
} from "../salesAgent/prompt.service";
import type { SalesAgentReply, SalesAngle, SalesCTA } from "../salesAgent/types";
import { buildRevenueSalesPrompt } from "./sales.prompt";
import {
  buildResponsePayload,
  parseStrictJson,
  responseCtaFromSalesCta,
  structuredOutputFromPayload,
  validateRevenueBrainResponsePayload,
} from "./schemaValidator.service";
import type {
  RevenueBrainContext,
  RevenueBrainCouponResult,
  RevenueBrainDecision,
  RevenueBrainIntentResult,
  RevenueBrainReply,
  RevenueBrainResponsePayload,
  RevenueBrainRoute,
  RevenueBrainStateResult,
} from "./types";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const MODEL_NAME = process.env.REVENUE_BRAIN_MODEL || "llama-3.1-8b-instant";

const resolveAngle = ({
  context,
  decision,
}: {
  context: RevenueBrainContext;
  decision: RevenueBrainDecision;
}): SalesAngle => {
  if (decision.conversion?.persuasion.angle) {
    return decision.conversion.persuasion.angle;
  }

  if (
    decision.salesDecision?.variant?.tone &&
    /proof/i.test(decision.salesDecision.variant.tone)
  ) {
    return "social_proof";
  }

  return decision.salesDecision?.leadState === "HOT"
    ? "urgency"
    : context.salesContext.profile.intentDirective.angle ||
        context.semanticMemory.recommendedAngle ||
        "value";
};

const resolveSalesCta = ({
  payload,
  decision,
}: {
  payload: RevenueBrainResponsePayload;
  decision: RevenueBrainDecision;
}): SalesCTA => {
  if (payload.cta === "none") {
    return "NONE";
  }

  if (payload.cta === "book") {
    if (decision.salesDecision?.cta === "BUY_NOW") {
      return "BUY_NOW";
    }

    return "BOOK_CALL";
  }

  if (decision.salesDecision?.cta && decision.salesDecision.cta !== "NONE") {
    return decision.salesDecision.cta;
  }

  if (decision.conversion?.cta.cta && decision.conversion.cta.cta !== "NONE") {
    return decision.conversion.cta.cta;
  }

  return "REPLY_DM";
};

const buildFallbackPayload = ({
  context,
  decision,
}: {
  context: RevenueBrainContext;
  decision: RevenueBrainDecision;
}) => {
  const fallbackReply = buildFallbackSalesReply({
    ...context.salesContext,
    decision: decision.salesDecision,
    variant: decision.salesDecision?.variant || null,
  });
  const structured = buildFallbackStructuredSalesOutput(fallbackReply);

  return buildResponsePayload({
    message: fallbackReply.message,
    intent: structured.intent,
    stage: structured.stage,
    leadType: structured.leadType,
    cta: structured.cta,
    confidence: structured.confidence,
    reason: fallbackReply.reason || structured.reason,
  });
};

const finalizeReply = ({
  context,
  decision,
  route,
  payload,
  latencyMs,
}: {
  context: RevenueBrainContext;
  decision: RevenueBrainDecision;
  route: RevenueBrainRoute;
  payload: RevenueBrainResponsePayload;
  latencyMs: number;
}): RevenueBrainReply => {
  const replyCta = resolveSalesCta({
    payload,
    decision,
  });
  const reply: SalesAgentReply = enforceSalesReplyGuardrails(
    {
      message: payload.message,
      cta: replyCta,
      angle: resolveAngle({
        context,
        decision,
      }),
      reason: payload.reason,
      confidence: payload.confidence,
    },
    {
      ...context.salesContext,
      decision: decision.salesDecision,
      variant: decision.salesDecision?.variant || null,
    }
  );
  const structured = structuredOutputFromPayload({
    ...payload,
    message: reply.message,
    cta: responseCtaFromSalesCta(reply.cta),
  });

  return {
    message: reply.message,
    cta: reply.cta,
    angle: reply.angle,
    reason: reply.reason || payload.reason,
    confidence: payload.confidence,
    structured,
    source: route,
    latencyMs,
    traceId: context.traceId,
    meta: {
      route,
      source: route,
      latencyMs,
      traceId: context.traceId,
      messageType: "AI_REPLY",
      leadState: context.salesContext.leadState.state,
      nextLeadState: context.leadMemory.revenueState,
      stateTransition: {
        from: context.leadMemory.revenueState,
        to: context.salesContext.leadState.state,
      },
      variantId: decision.salesDecision?.variant?.id || null,
      variantKey: decision.salesDecision?.variant?.variantKey || null,
      decisionAction: decision.salesDecision?.action || null,
      decisionStrategy: decision.salesDecision?.strategy || null,
      decisionTone: decision.salesDecision?.tone || null,
      decisionStructure: decision.salesDecision?.structure || null,
      decisionCTA: decision.salesDecision?.cta || null,
      decisionCTAStyle: decision.salesDecision?.ctaStyle || null,
      decisionMessageLength: decision.salesDecision?.messageLength || null,
      conversionScore: decision.conversion?.score || null,
      conversionBucket: decision.conversion?.bucket || null,
      objectionPath: decision.conversion?.objection.path || [],
      trustLevel: decision.conversion?.trust.level || null,
      trustInjectionType: decision.conversion?.trust.injectionType || null,
      urgencyLevel: decision.conversion?.urgency.level || null,
      urgencyReason: decision.conversion?.urgency.reason || null,
      negotiationMode: decision.conversion?.negotiation.mode || null,
      offerType: decision.conversion?.offer.type || null,
      closeMotion: decision.conversion?.close.motion || null,
      experimentArm: decision.conversion?.experiment.armKey || null,
      experimentVariantId: decision.conversion?.experiment.variantId || null,
      experimentVariantKey: decision.conversion?.experiment.variantKey || null,
      knowledgeHitIds: context.semanticMemory.hits.map((hit) => hit.id),
      knowledgeHitCount: context.semanticMemory.hits.length,
      knowledgeSources: context.semanticMemory.hits.map((hit) => hit.sourceType),
      memoryFactCount: context.salesContext.memory.facts.length,
      freshMemoryFactCount: context.salesContext.memory.facts.filter(
        (fact) => !fact.stale
      ).length,
      crmCompositeScore: context.crmIntelligence.scorecard.compositeScore,
      crmValueTier: context.crmIntelligence.value.valueTier,
      crmChurnRisk: context.crmIntelligence.value.churnRisk,
      crmLifecycleStage: context.crmIntelligence.lifecycle.stage,
      crmPrimarySegment: context.crmIntelligence.segments.primarySegment,
      crmNextBestAction: context.crmIntelligence.behavior.nextBestAction,
      confidence: payload.confidence,
    },
  };
};

export const composeRevenueSalesReply = async ({
  context,
  intent,
  state,
  decision,
  coupon,
  beforeAIReply,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  state: RevenueBrainStateResult;
  decision: RevenueBrainDecision;
  coupon?: RevenueBrainCouponResult | null;
  beforeAIReply?: (() => Promise<{ finalize?: () => Promise<void>; release?: () => Promise<void> } | void>) | undefined;
}): Promise<RevenueBrainReply> => {
  const startedAt = Date.now();
  const fallback = buildFallbackPayload({
    context,
    decision,
  });
  let reservation:
    | { finalize?: () => Promise<void>; release?: () => Promise<void> }
    | undefined;
  let apiCallCompleted = false;
  let rawPayload: unknown = null;

  try {
    if (beforeAIReply) {
      reservation = (await beforeAIReply()) || undefined;
    }

    const completion = await groq.chat.completions.create({
      model: MODEL_NAME,
      temperature: 0,
      response_format: {
        type: "json_object",
      } as any,
      messages: buildRevenueSalesPrompt({
        context,
        intent,
        state,
        decision,
        coupon,
      }) as any,
    } as any);

    apiCallCompleted = true;
    await reservation?.finalize?.();

    rawPayload = parseStrictJson(
      completion.choices?.[0]?.message?.content?.trim() || ""
    );
  } catch {
    if (!apiCallCompleted) {
      await reservation?.release?.().catch(() => undefined);
    }
  }

  const payload = validateRevenueBrainResponsePayload(rawPayload, fallback);

  return finalizeReply({
    context,
    decision,
    route: "SALES",
    payload,
    latencyMs: Date.now() - startedAt,
  });
};

export const buildDeterministicRevenueReply = ({
  context,
  route,
  message,
  cta,
  angle,
  reason,
  confidence = 0.95,
  decision,
  extraMeta,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  message: string;
  cta: SalesCTA;
  angle: SalesAngle;
  reason: string;
  confidence?: number;
  decision: RevenueBrainDecision;
  extraMeta?: Record<string, unknown>;
}): RevenueBrainReply => {
  const startedAt = Date.now();
  const reply: SalesAgentReply = enforceSalesReplyGuardrails(
    {
      message,
      cta,
      angle,
      reason,
      confidence,
    },
    {
      ...context.salesContext,
      decision: decision.salesDecision,
      variant: decision.salesDecision?.variant || null,
    }
  );
  const structured = buildFallbackStructuredSalesOutput(reply);

  return {
    message: reply.message,
    cta: reply.cta,
    angle: reply.angle,
    reason: reply.reason || reason,
    confidence,
    structured,
    source: route,
    latencyMs: Date.now() - startedAt,
    traceId: context.traceId,
    meta: {
      route,
      source: route,
      latencyMs: Date.now() - startedAt,
      traceId: context.traceId,
      messageType: "AI_REPLY",
      leadState: context.salesContext.leadState.state,
      nextLeadState: context.leadMemory.revenueState,
      decisionAction: decision.salesDecision?.action || null,
      decisionStrategy: decision.salesDecision?.strategy || null,
      decisionCTA: decision.salesDecision?.cta || null,
      decisionTone: decision.salesDecision?.tone || null,
      decisionStructure: decision.salesDecision?.structure || null,
      decisionCTAStyle: decision.salesDecision?.ctaStyle || null,
      decisionMessageLength: decision.salesDecision?.messageLength || null,
      variantId: decision.salesDecision?.variant?.id || null,
      variantKey: decision.salesDecision?.variant?.variantKey || null,
      conversionScore: decision.conversion?.score || null,
      conversionBucket: decision.conversion?.bucket || null,
      objectionPath: decision.conversion?.objection.path || [],
      trustLevel: decision.conversion?.trust.level || null,
      trustInjectionType: decision.conversion?.trust.injectionType || null,
      urgencyLevel: decision.conversion?.urgency.level || null,
      urgencyReason: decision.conversion?.urgency.reason || null,
      negotiationMode: decision.conversion?.negotiation.mode || null,
      offerType: decision.conversion?.offer.type || null,
      closeMotion: decision.conversion?.close.motion || null,
      experimentArm: decision.conversion?.experiment.armKey || null,
      experimentVariantId: decision.conversion?.experiment.variantId || null,
      experimentVariantKey: decision.conversion?.experiment.variantKey || null,
      knowledgeHitIds: context.semanticMemory.hits.map((hit) => hit.id),
      knowledgeHitCount: context.semanticMemory.hits.length,
      knowledgeSources: context.semanticMemory.hits.map((hit) => hit.sourceType),
      memoryFactCount: context.salesContext.memory.facts.length,
      freshMemoryFactCount: context.salesContext.memory.facts.filter(
        (fact) => !fact.stale
      ).length,
      crmCompositeScore: context.crmIntelligence.scorecard.compositeScore,
      crmValueTier: context.crmIntelligence.value.valueTier,
      crmChurnRisk: context.crmIntelligence.value.churnRisk,
      crmLifecycleStage: context.crmIntelligence.lifecycle.stage,
      crmPrimarySegment: context.crmIntelligence.segments.primarySegment,
      crmNextBestAction: context.crmIntelligence.behavior.nextBestAction,
      ...extraMeta,
    },
  };
};
