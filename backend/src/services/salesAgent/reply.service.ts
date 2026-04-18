import OpenAI from "openai";
import { selectBestAction } from "./decisionEngine.service";
import { buildSalesAgentContext } from "./intelligence.service";
import { recordSalesReplyEvent } from "./optimizer.service";
import { persistSalesProgressionState } from "./progression.service";
import { cacheSalesReplyState } from "./replyCache.service";
import {
  buildFallbackSalesReply,
  buildSalesAgentMessages,
  enforceSalesReplyGuardrails,
  parseSalesAgentReply,
} from "./prompt.service";
import {
  buildRecoverySalesReply,
  getFallbackAngle,
  getFallbackCta,
} from "./replyGuardrails.service";
import type {
  SalesActionType,
  SalesAgentReply,
  SalesDecisionAction,
  SalesProgressionState,
} from "./types";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

type ReplyInput = {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
  source?: string | null;
  preview?: boolean;
};

const SALES_ACTIONS = new Set<SalesActionType>([
  "SHOW_PRICING",
  "SUGGEST_PLAN",
  "PUSH_CTA",
  "CLOSE",
  "BOOK",
  "HANDLE_OBJECTION",
  "QUALIFY",
  "ENGAGE",
]);

const getReplyMetaRecord = (reply: SalesAgentReply) =>
  reply.meta && typeof reply.meta === "object"
    ? (reply.meta as Record<string, unknown>)
    : {};

const resolveActionOverride = (reply: SalesAgentReply): SalesActionType | null => {
  const action = String(getReplyMetaRecord(reply).actionOverride || "")
    .trim()
    .toUpperCase();

  return SALES_ACTIONS.has(action as SalesActionType)
    ? (action as SalesActionType)
    : null;
};

const clampPricingStep = (value: unknown): 0 | 1 | 2 | 3 | 4 | null => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(Math.round(value), 4)) as 0 | 1 | 2 | 3 | 4;
};

const resolveEffectiveDecision = (
  decision: SalesDecisionAction,
  reply: SalesAgentReply
): SalesDecisionAction => {
  const meta = getReplyMetaRecord(reply);
  const actionOverride = resolveActionOverride(reply);

  if (!actionOverride) {
    return decision;
  }

  return {
    ...decision,
    action: actionOverride,
    priority:
      typeof meta.actionPriorityOverride === "number"
        ? meta.actionPriorityOverride
        : decision.priority,
  };
};

const resolveEffectiveProgression = ({
  progression,
  decision,
  reply,
}: {
  progression: SalesProgressionState;
  decision: SalesDecisionAction;
  reply: SalesAgentReply;
}): SalesProgressionState => {
  const meta = getReplyMetaRecord(reply);
  const pricingStepOverride = clampPricingStep(meta.pricingStepOverride);

  return {
    ...progression,
    currentAction: decision.action,
    actionPriority: decision.priority,
    funnelPosition:
      typeof meta.funnelPositionOverride === "string"
        ? meta.funnelPositionOverride
        : progression.funnelPosition,
    pricingStep: pricingStepOverride ?? progression.pricingStep,
    loopDetected:
      typeof meta.loopDetectedOverride === "boolean"
        ? meta.loopDetectedOverride
        : progression.loopDetected,
    shouldAdvance:
      progression.shouldAdvance || Boolean(resolveActionOverride(reply)),
  };
};

const buildReplyResult = ({
  context,
  decision,
  variant,
  reply,
  mode,
}: {
  context: Awaited<ReturnType<typeof buildSalesAgentContext>>;
  decision: SalesDecisionAction;
  variant: SalesDecisionAction["variant"];
  reply: SalesAgentReply;
  mode?: string | null;
}) => {
  const effectiveDecision = resolveEffectiveDecision(decision, reply);
  const effectiveProgression = resolveEffectiveProgression({
    progression: context.progression,
    decision: effectiveDecision,
    reply,
  });
  const replyMeta = getReplyMetaRecord(reply);

  return {
    effectiveDecision,
    effectiveProgression,
    finalReply: {
      ...reply,
      meta: {
        ...replyMeta,
        planKey: context.planKey,
        temperature: context.profile.temperature,
        stage: context.profile.stage,
        leadState: context.leadState.state,
        intent: context.profile.intent,
        decisionIntent: context.profile.intentCategory,
        emotion: context.profile.emotion,
        objection: context.profile.objection.type,
        qualificationMissing: context.profile.qualification.missingFields,
        userSignal: context.profile.userSignal,
        progression: effectiveProgression,
        variantId: variant?.id || null,
        variantKey: variant?.variantKey || null,
        variantLabel: variant?.label || null,
        variantTone: effectiveDecision.tone || variant?.tone || null,
        variantCTAStyle: effectiveDecision.ctaStyle || variant?.ctaStyle || null,
        variantMessageLength:
          effectiveDecision.messageLength || variant?.messageLength || null,
        decisionStrategy: effectiveDecision.strategy || null,
        decisionTone: effectiveDecision.tone || null,
        decisionAction: effectiveDecision.action || null,
        decisionPriority: effectiveDecision.priority || null,
        decisionCTA: effectiveDecision.cta || null,
        decisionCTAStyle: effectiveDecision.ctaStyle || null,
        decisionStructure: effectiveDecision.structure || null,
        decisionMessageLength: effectiveDecision.messageLength || null,
        decisionGuidance: effectiveDecision.guidance || null,
        intentDirective: context.profile.intentDirective,
        topPatterns: effectiveDecision.topPatterns || [],
        messageType: "AI_REPLY",
        ...(mode ? { mode } : {}),
      },
    } as SalesAgentReply,
  };
};

const persistReplySideEffects = async ({
  input,
  context,
  reply,
  decision,
  progression,
  variant,
}: {
  input: ReplyInput;
  context: Awaited<ReturnType<typeof buildSalesAgentContext>>;
  reply: SalesAgentReply;
  decision: SalesDecisionAction;
  progression: SalesProgressionState;
  variant: SalesDecisionAction["variant"];
}) => {
  if (input.preview) {
    return;
  }

  await persistSalesProgressionState({
    leadId: input.leadId,
    intent: context.profile.intent,
    summary: context.memory.summary,
    progression,
    reply,
    decision,
  }).catch(() => {});

  await cacheSalesReplyState({
    leadId: input.leadId,
    decision,
    progression,
    reply,
  }).catch(() => {});

  await recordSalesReplyEvent({
    businessId: input.businessId,
    leadId: input.leadId,
    planKey: context.planKey,
    cta: reply.cta,
    angle: reply.angle,
    stage: context.profile.stage,
    temperature: context.profile.temperature,
    intent: context.profile.intent,
    decisionIntent: context.profile.intentCategory,
    emotion: context.profile.emotion,
    objection: context.profile.objection.type,
    userSignal: context.profile.userSignal,
    platform: context.lead.platform || null,
    source: input.source || "AI_ROUTER",
    variantId: variant?.id || null,
    variantKey: variant?.variantKey || null,
    variantTone: decision.tone || variant?.tone || null,
    variantCTAStyle: decision.ctaStyle || variant?.ctaStyle || null,
    variantMessageLength: decision.messageLength || variant?.messageLength || null,
    decisionStrategy: decision.strategy || null,
    decisionTone: decision.tone || null,
    decisionStructure: decision.structure || null,
    leadState: context.leadState.state,
    action: decision.action || null,
    actionPriority: decision.priority || null,
    funnelPosition: progression.funnelPosition,
  });
};

const toSentence = (value?: string | null, maxLength = 140) => {
  const text = String(value || "").trim().replace(/\s+/g, " ");

  if (!text) {
    return "";
  }

  const trimmed = text.slice(0, maxLength).trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const isGreetingOnlyMessage = (message: string) =>
  /^(hi|hello|hey|hii|yo|namaste|hola|hello there|hey there)$/i.test(
    String(message || "").trim()
  );

const isInappropriateMessage = (message: string) =>
  /\b(fuck|fucking|shit|bitch|idiot|stupid|chutiya|madarchod|bhosdike|gandu|mc|bc|randi|gaand)\b/i.test(
    String(message || "")
  );

const isDirectInfoQuestion = (message: string) =>
  String(message || "").includes("?") ||
  /\b(what|which|how|can you|tell me|share|show me|details|detail|info|information|about|services|service|pricing|price|cost|package|plan|process|kya|kaise|kitna)\b/i.test(
    String(message || "")
  );

const extractSnippet = (
  value?: string | null,
  matcher?: RegExp,
  maxLength = 140
) => {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  const preferred =
    (matcher ? lines.find((line) => matcher.test(line)) : null) || lines[0];

  return preferred ? toSentence(preferred, maxLength) : null;
};

const extractPricingSnippet = (context: Awaited<ReturnType<typeof buildSalesAgentContext>>) =>
  extractSnippet(
    context.client.pricingInfo,
    /(rs\.?|inr|\$|usd|price|pricing|package|plan|starting|starts|investment|charges)/i
  );

const extractPlanSnippet = (context: Awaited<ReturnType<typeof buildSalesAgentContext>>) =>
  extractSnippet(
    context.client.pricingInfo,
    /plan|package|starter|growth|pro|elite|premium|recommended|best/i
  );

const extractKnowledgeSnippet = (
  context: Awaited<ReturnType<typeof buildSalesAgentContext>>
) =>
  extractSnippet(
    context.knowledge.find((item) =>
      /price|pricing|service|offer|process|result|review|proof|book|call|support|works/i.test(
        item
      )
    ) ||
      context.client.faqKnowledge ||
      context.client.businessInfo,
    undefined
  );

const buildInstantSalesReply = (
  context: Awaited<ReturnType<typeof buildSalesAgentContext>> & {
    decision: SalesDecisionAction;
    variant: SalesDecisionAction["variant"];
  }
): SalesAgentReply | null => {
  const message = String(context.inboundMessage || "").trim();
  const action = context.decision.action;
  const fallbackCta = getFallbackCta(context);
  const pricingSnippet = extractPricingSnippet(context);
  const planSnippet = extractPlanSnippet(context);
  const knowledgeSnippet = extractKnowledgeSnippet(context);

  if (!message) {
    return null;
  }

  if (isInappropriateMessage(message)) {
    return {
      message:
        "I’m here to help with business questions, pricing, or booking.\nWhat do you want to know?",
      cta: "REPLY_DM",
      angle: "value",
      reason: "instant_boundary",
    };
  }

  if (isGreetingOnlyMessage(message)) {
    return {
      message:
        "Hey, happy to help.\nTell me if you want pricing, services, or booking first.",
      cta: "REPLY_DM",
      angle: "personalization",
      reason: "instant_greeting",
    };
  }

  if (context.profile.intent === "PRICING" && pricingSnippet) {
    if (action === "SHOW_PRICING") {
      return {
        message: `${pricingSnippet}\nWant the best-fit option for your use case?`,
        cta: "REPLY_DM",
        angle: "value",
        reason: "instant_pricing",
      };
    }

    if (action === "SUGGEST_PLAN") {
      return {
        message: `${
          planSnippet ||
          pricingSnippet ||
          "Based on what you asked, I’d point you to the best-fit option, not the biggest package."
        }\nWant me to point you to the right one?`,
        cta: "REPLY_DM",
        angle: "value",
        reason: "instant_plan",
      };
    }

    if (action === "PUSH_CTA" || action === "CLOSE") {
      const cta =
        context.decision.cta === "BUY_NOW" || context.decision.cta === "BOOK_CALL"
          ? context.decision.cta
          : fallbackCta;
      const line2 =
        cta === "BUY_NOW"
          ? "Want the payment link?"
          : "Want the fastest next step from here?";

      return {
        message: `${
          planSnippet || pricingSnippet || "You already have the main pricing context."
        }\n${line2}`,
        cta,
        angle: "urgency",
        reason: "instant_pricing_close",
      };
    }
  }

  if (context.profile.intent === "BOOKING") {
    const cta =
      context.decision.cta === "BOOK_CALL" ? "BOOK_CALL" : fallbackCta;

    return {
      message:
        cta === "BOOK_CALL"
          ? "You sound ready for the next step.\nWant the booking link?"
          : "You sound ready for the next step.\nWant the fastest next option?",
      cta,
      angle: "urgency",
      reason: "instant_booking",
    };
  }

  if (context.profile.intent === "PURCHASE") {
    const cta =
      context.decision.cta === "BUY_NOW" ? "BUY_NOW" : fallbackCta;

    return {
      message:
        cta === "BUY_NOW"
          ? "You already sound close to decision.\nWant the payment link?"
          : "You already sound close to decision.\nWant the fastest next option?",
      cta,
      angle: "urgency",
      reason: "instant_purchase",
    };
  }

  if (isDirectInfoQuestion(message) && knowledgeSnippet) {
    return {
      message: `${knowledgeSnippet}\nWant the best-fit option for your use case next?`,
      cta: "REPLY_DM",
      angle: getFallbackAngle(context),
      reason: "instant_knowledge",
    };
  }

  return null;
};

const createAIReply = async (input: ReplyInput): Promise<SalesAgentReply> => {
  const context = await buildSalesAgentContext(input);
  const decision = await selectBestAction({
    businessId: input.businessId,
    leadId: input.leadId,
    clientId: context.client.id || null,
    messageType: "AI_REPLY",
    leadState: context.leadState.state,
    intent: context.profile.intentCategory,
    salesIntent: context.profile.intent,
    progression: context.progression,
    emotion: context.profile.emotion,
    clientData: context.client,
    capabilities: context.capabilities,
  });
  const variant = decision?.variant || null;
  const optimizedContext = {
    ...context,
    decision,
    variant,
  };
  const instantReply = buildInstantSalesReply(optimizedContext);

  if (instantReply) {
    const result = buildReplyResult({
      context,
      decision,
      variant,
      reply: enforceSalesReplyGuardrails(instantReply, optimizedContext),
      mode: "instant",
    });

    await persistReplySideEffects({
      input,
      context,
      reply: result.finalReply,
      decision: result.effectiveDecision,
      progression: result.effectiveProgression,
      variant,
    });

    return result.finalReply;
  }

  const promptMessages = buildSalesAgentMessages(optimizedContext);

  try {
    const response = await groq.chat.completions.create({
      model: process.env.SALES_AGENT_MODEL || "llama-3.1-8b-instant",
      temperature: optimizedContext.planKey === "ELITE" ? 0.35 : 0.28,
      max_tokens: optimizedContext.planKey === "ELITE" ? 180 : 140,
      messages: promptMessages as any,
    });

    const rawReply =
      response.choices?.[0]?.message?.content?.trim() || "";
    const parsed =
      parseSalesAgentReply(rawReply, optimizedContext) ||
      buildFallbackSalesReply(optimizedContext);
    const finalReply = enforceSalesReplyGuardrails(parsed, optimizedContext);
    const result = buildReplyResult({
      context,
      decision,
      variant,
      reply: finalReply,
    });

    await persistReplySideEffects({
      input,
      context,
      reply: result.finalReply,
      decision: result.effectiveDecision,
      progression: result.effectiveProgression,
      variant,
    });

    return result.finalReply;
  } catch {
    const fallback = buildFallbackSalesReply(optimizedContext);
    const finalReply = enforceSalesReplyGuardrails(fallback, optimizedContext);
    const result = buildReplyResult({
      context,
      decision,
      variant,
      reply: finalReply,
      mode: "fallback",
    });

    await persistReplySideEffects({
      input,
      context,
      reply: result.finalReply,
      decision: result.effectiveDecision,
      progression: result.effectiveProgression,
      variant,
    });

    return result.finalReply;
  }
};

export const generateSalesAgentReply = async (input: ReplyInput) =>
  createAIReply(input);

export const buildSalesAgentRecoveryReply = (message?: string | null) =>
  buildRecoverySalesReply(message);
