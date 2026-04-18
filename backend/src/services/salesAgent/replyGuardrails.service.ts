import type {
  SalesActionType,
  SalesAgentContext,
  SalesAgentReply,
  SalesAngle,
  SalesCTA,
} from "./types";

const GENERIC_REPLY_PATTERNS = [
  /tell me your goal/i,
  /tell me what you want help with/i,
  /tell me what outcome you want/i,
  /what are you trying to get done/i,
  /^i got your message\b/i,
  /^got you\b/i,
  /^makes sense\b/i,
];

const normalizeComparable = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toSentence = (value?: string | null) => {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const sanitizeMessage = (value: string) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/!{2,}/g, "!")
    .replace(/\bguaranteed\b/gi, "designed")
    .replace(/\blimited time only\b/gi, "worth deciding soon")
    .trim();

const clampMessageLength = (message: string, maxLength: number) => {
  if (message.length <= maxLength) {
    return message;
  }

  return `${message.slice(0, maxLength - 1).trim()}...`;
};

const normalizeReplyLines = (value: string) => {
  const cleaned = sanitizeMessage(value);

  if (!cleaned) {
    return [];
  }

  const explicitLines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (explicitLines.length > 1) {
    return explicitLines;
  }

  const sentences =
    cleaned
      .match(/[^.!?]+[.!?]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) || [];

  if (sentences.length <= 1) {
    return explicitLines;
  }

  return [sentences[0], sentences.slice(1).join(" ").trim()].filter(Boolean);
};

const extractQuestion = (message: string) =>
  sanitizeMessage(message).match(/[^?]+\?/g)?.[0]?.trim() || null;

const extractRecentAssistantQuestions = (context: SalesAgentContext) =>
  context.memory.conversation
    .filter((item) => item.role === "assistant")
    .map((item) => extractQuestion(item.content))
    .filter(Boolean)
    .slice(-3) as string[];

const isQuestionRepeated = (
  context: SalesAgentContext,
  question?: string | null
) => {
  const normalized = normalizeComparable(String(question || ""));

  if (!normalized) {
    return false;
  }

  return extractRecentAssistantQuestions(context).some((item) => {
    const existing = normalizeComparable(item);
    return existing === normalized || existing.includes(normalized);
  });
};

const isVagueQuestion = (question?: string | null) =>
  /goal|what do you want|what outcome|trying to get done|help with/i.test(
    String(question || "")
  );

const isGenericMessage = (message: string) =>
  GENERIC_REPLY_PATTERNS.some((pattern) => pattern.test(message));

const extractPricingSnippet = (value?: string | null) => {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const preferred =
    lines.find((line) =>
      /(₹|rs\.?|inr|\$|usd|price|pricing|package|plan|starting|starts)/i.test(
        line
      )
    ) || lines[0];

  return toSentence(preferred.slice(0, 140));
};

const extractProofSnippet = (context: SalesAgentContext) => {
  const sources = [
    ...context.knowledge,
    ...String(context.client.faqKnowledge || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean),
  ];

  const hit = sources.find((line) =>
    /client|case|result|review|proof|testimonial|outcome|trusted|worked/i.test(
      line
    )
  );

  return hit ? toSentence(hit.slice(0, 140)) : null;
};

const extractPlanSnippet = (value?: string | null) => {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  const hint = lines.find((line) =>
    /plan|package|starter|growth|pro|elite|premium|best for|recommended/i.test(
      line
    )
  );

  return hint ? toSentence(hint.slice(0, 140)) : null;
};

const extractBusinessSnippet = (value?: string | null) => {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  const hint =
    lines.find((line) =>
      /service|services|offer|help|business|company|speciali|work|solution|support/i.test(
        line
      )
    ) || lines[0];

  return hint ? toSentence(hint.slice(0, 140)) : null;
};

const extractKnowledgeSnippet = (context: SalesAgentContext) => {
  const businessSnippet = extractBusinessSnippet(context.client.businessInfo);
  const knowledgeHit = context.knowledge.find((line) =>
    /price|pricing|service|offer|process|result|review|proof|book|call|support|works/i.test(
      line
    )
  );

  return knowledgeHit
    ? toSentence(knowledgeHit.slice(0, 140))
    : businessSnippet;
};

const isGreetingOnlyMessage = (message: string) =>
  /^(hi|hello|hey|hii|yo|namaste|hola|hello there|hey there)$/i.test(
    String(message || "").trim()
  );

const isDirectInfoMessage = (message: string) =>
  String(message || "").includes("?") ||
  /\b(what|which|how|can you|tell me|share|show|details|info|information|about|services|service|price|pricing|cost|package|plan|kya|kaise|kitna)\b/i.test(
    String(message || "")
  );

export const getFallbackAngle = (context: SalesAgentContext): SalesAngle => {
  if (context.profile.intentDirective?.angle) {
    return context.profile.intentDirective.angle;
  }

  if (context.decision?.structure?.includes("proof")) return "social_proof";
  if (context.decision?.structure?.includes("direct")) return "urgency";
  if (context.profile.objection.type === "TRUST") return "social_proof";
  if (context.profile.temperature === "HOT") return "urgency";
  if (context.profile.temperature === "WARM") return "value";
  return context.optimization.recommendedAngle || "personalization";
};

export const getFallbackCta = (context: SalesAgentContext): SalesCTA => {
  const candidates: SalesCTA[] = [
    context.decision?.cta || "NONE",
    context.profile.intentDirective?.cta || "NONE",
    context.optimization.recommendedCTA || "NONE",
    ...context.capabilities.primaryCtas,
    context.profile.temperature === "HOT" ? "BOOK_CALL" : "CAPTURE_LEAD",
    "REPLY_DM",
  ];

  return candidates.find((cta) => cta && cta !== "NONE") || "REPLY_DM";
};

const advanceAction = (action: SalesActionType): SalesActionType => {
  if (action === "SHOW_PRICING") return "SUGGEST_PLAN";
  if (action === "SUGGEST_PLAN") return "PUSH_CTA";
  if (action === "PUSH_CTA") return "CLOSE";
  if (action === "HANDLE_OBJECTION") return "PUSH_CTA";
  if (action === "QUALIFY") return "PUSH_CTA";
  if (action === "ENGAGE") return "QUALIFY";
  return action;
};

const funnelPositionForAction = (action: SalesActionType) => {
  if (action === "SHOW_PRICING") return "pricing_shown";
  if (action === "SUGGEST_PLAN") return "plan_suggested";
  if (action === "PUSH_CTA") return "cta_pushed";
  if (action === "CLOSE") return "closing";
  if (action === "BOOK") return "booking";
  if (action === "HANDLE_OBJECTION") return "objection_handling";
  if (action === "QUALIFY") return "qualification";
  return "engagement";
};

const actionPriorityForGuardrail = (action: SalesActionType) => {
  if (action === "SHOW_PRICING" || action === "CLOSE") return 100;
  if (action === "SUGGEST_PLAN") return 95;
  if (action === "PUSH_CTA") return 92;
  if (action === "BOOK") return 90;
  if (action === "HANDLE_OBJECTION") return 70;
  if (action === "QUALIFY") return 50;
  return 30;
};

const pricingStepForAction = (
  action: SalesActionType,
  currentStep: number
): 0 | 1 | 2 | 3 | 4 => {
  if (action === "SHOW_PRICING") return 1;
  if (action === "SUGGEST_PLAN") return 2;
  if (action === "PUSH_CTA") return 3;
  if (action === "CLOSE" || action === "BOOK") return 4;
  return Math.max(0, Math.min(currentStep, 4)) as 0 | 1 | 2 | 3 | 4;
};

const pickGuardrailCta = (
  context: SalesAgentContext,
  action: SalesActionType
): SalesCTA => {
  const allowed = context.capabilities.primaryCtas?.length
    ? context.capabilities.primaryCtas
    : ([
        "REPLY_DM",
        "VIEW_DEMO",
        "BOOK_CALL",
        "BUY_NOW",
        "CAPTURE_LEAD",
      ] as SalesCTA[]);
  const candidatesByAction: Record<SalesActionType, SalesCTA[]> = {
    SHOW_PRICING: ["REPLY_DM", "VIEW_DEMO", "BOOK_CALL", context.decision?.cta || "NONE"],
    SUGGEST_PLAN: ["BOOK_CALL", "VIEW_DEMO", "REPLY_DM", context.decision?.cta || "NONE"],
    PUSH_CTA: ["BOOK_CALL", "VIEW_DEMO", "BUY_NOW", context.decision?.cta || "NONE"],
    CLOSE: ["BUY_NOW", "BOOK_CALL", "VIEW_DEMO", context.decision?.cta || "NONE"],
    BOOK: ["BOOK_CALL", "VIEW_DEMO", context.decision?.cta || "NONE"],
    HANDLE_OBJECTION: ["VIEW_DEMO", "BOOK_CALL", "REPLY_DM", context.decision?.cta || "NONE"],
    QUALIFY: ["CAPTURE_LEAD", "REPLY_DM", "VIEW_DEMO", context.decision?.cta || "NONE"],
    ENGAGE: ["REPLY_DM", "CAPTURE_LEAD", context.decision?.cta || "NONE"],
  };

  return (
    candidatesByAction[action].find(
      (cta) => cta !== "NONE" && allowed.includes(cta)
    ) || getFallbackCta(context)
  );
};

const pickGuardrailTone = (
  action: SalesActionType,
  fallback?: string | null
) => {
  if (action === "SHOW_PRICING" || action === "SUGGEST_PLAN") {
    return "clear-confident";
  }

  if (action === "PUSH_CTA" || action === "CLOSE" || action === "BOOK") {
    return "decisive-closer";
  }

  if (action === "HANDLE_OBJECTION") {
    return "confident-proof";
  }

  return fallback || "human-confident";
};

const pickGuardrailStructure = (
  action: SalesActionType,
  fallback?: string | null
) => {
  if (action === "SHOW_PRICING") return "pricing_value_cta";
  if (action === "SUGGEST_PLAN") return "plan_recommendation_cta";
  if (action === "PUSH_CTA" || action === "CLOSE" || action === "BOOK") {
    return "direct_close";
  }

  if (action === "HANDLE_OBJECTION") return "value_proof_cta";
  if (action === "QUALIFY") return "qualification_cta";
  return fallback || "engage_to_next_step";
};

const getReplyMeta = (reply: SalesAgentReply) =>
  reply.meta && typeof reply.meta === "object"
    ? (reply.meta as Record<string, unknown>)
    : {};

const buildGuardrailContext = (
  context: SalesAgentContext,
  issues: string[]
) => {
  const currentAction = context.decision?.action || context.progression.currentAction;
  const shouldAdvanceAction =
    context.progression.loopDetected ||
    issues.includes("repeated_response") ||
    issues.includes("no_progression");

  if (!shouldAdvanceAction) {
    return {
      context,
      actionAdvanced: false,
    };
  }

  const nextAction = advanceAction(currentAction);

  if (nextAction === currentAction) {
    return {
      context,
      actionAdvanced: false,
    };
  }

  const nextPriority = actionPriorityForGuardrail(nextAction);
  const nextPricingStep = pricingStepForAction(
    nextAction,
    context.progression.pricingStep
  );

  return {
    actionAdvanced: true,
    context: {
      ...context,
      decision: context.decision
        ? {
            ...context.decision,
            action: nextAction,
            priority: nextPriority,
            cta: pickGuardrailCta(context, nextAction),
            tone: pickGuardrailTone(nextAction, context.decision.tone),
            structure: pickGuardrailStructure(
              nextAction,
              context.decision.structure
            ),
          }
        : context.decision,
      progression: {
        ...context.progression,
        currentAction: nextAction,
        actionPriority: nextPriority,
        funnelPosition: funnelPositionForAction(nextAction),
        pricingStep: nextPricingStep,
        loopDetected: true,
        shouldAdvance: false,
      },
    },
  };
};

const applyGuardrailOverrides = (
  reply: SalesAgentReply,
  context: SalesAgentContext,
  issues: string[],
  options?: {
    actionAdvanced?: boolean;
  }
): SalesAgentReply => {
  const meta = {
    ...getReplyMeta(reply),
    guardrailIssues: issues,
  };

  if (!options?.actionAdvanced) {
    return {
      ...reply,
      meta,
    };
  }

  const action = context.decision?.action || context.progression.currentAction;
  const priority =
    context.decision?.priority || context.progression.actionPriority;

  return {
    ...reply,
    meta: {
      ...meta,
      actionOverride: action,
      actionPriorityOverride: priority,
      funnelPositionOverride: context.progression.funnelPosition,
      pricingStepOverride: context.progression.pricingStep,
      loopDetectedOverride: context.progression.loopDetected,
    },
  };
};

const buildQualificationCtaLine = (context: SalesAgentContext) => {
  const field = context.profile.qualification.missingFields[0] || "need";
  const map: Record<string, { question: string; statement: string }> = {
    budget: {
      question: "What budget range are you working with?",
      statement: "Reply with your budget range and I'll narrow it down.",
    },
    timeline: {
      question: "How soon do you want this live?",
      statement: "Reply with your timeline and I'll map the best next step.",
    },
    intentSignal: {
      question: "Which matters most first: leads, sales, or delivery?",
      statement: "Reply with what matters most first: leads, sales, or delivery.",
    },
    need: {
      question: "Which matters most first: leads, sales, or delivery?",
      statement: "Reply with what matters most first: leads, sales, or delivery.",
    },
  };
  const selected = map[field] || map.need;

  return isQuestionRepeated(context, selected.question)
    ? selected.statement
    : selected.question;
};

const buildCtaLine = (context: SalesAgentContext, cta: SalesCTA) => {
  const intent = String(context.profile.intent || "").toUpperCase();
  const action = context.decision?.action || context.progression.currentAction;
  const inboundMessage = context.inboundMessage;

  if (intent === "GREETING" || isGreetingOnlyMessage(inboundMessage)) {
    return "Tell me if you want pricing, services, or booking first.";
  }

  if (
    isDirectInfoMessage(inboundMessage) &&
    action !== "BOOK" &&
    action !== "CLOSE" &&
    action !== "PUSH_CTA"
  ) {
    return "Want the best-fit option for your use case next?";
  }

  if (cta === "BUY_NOW") {
    return intent === "PURCHASE"
      ? "Want the payment link?"
      : "Want the cleanest payment option?";
  }

  if (cta === "BOOK_CALL") {
    return intent === "BOOKING"
      ? "Want the booking link?"
      : "Want the fastest booking option?";
  }

  if (cta === "VIEW_DEMO") {
    return intent === "OBJECTION"
      ? "Want the proof walkthrough?"
      : "Want the quick walkthrough?";
  }

  if (action === "BOOK") {
    return "Reply and I'll send the booking option.";
  }

  if (action === "SHOW_PRICING") {
    return "Reply and I'll break down the most relevant pricing.";
  }

  if (action === "SUGGEST_PLAN") {
    return "Reply and I'll point you to the best-fit option.";
  }

  if (action === "PUSH_CTA" || action === "CLOSE") {
    return "Reply and I'll send the fastest next step.";
  }

  return buildQualificationCtaLine(context);
};

const buildValueLine = (context: SalesAgentContext, cta: SalesCTA) => {
  const pricingSnippet = extractPricingSnippet(context.client.pricingInfo);
  const proofSnippet = extractProofSnippet(context);
  const knowledgeSnippet = extractKnowledgeSnippet(context);
  const intent = context.profile.intent;

  if (intent === "PRICING") {
    return (
      pricingSnippet ||
      "I can break down the best-fit package without wasting time."
    );
  }

  if (intent === "BOOKING") {
    return "You already sound booking-ready, so the fastest move is the right slot.";
  }

  if (intent === "PURCHASE") {
    return cta === "BUY_NOW"
      ? "You sound ready, so the cleanest move is the payment link."
      : "You sound ready, so the fastest move is locking the next step now.";
  }

  if (intent === "OBJECTION") {
    if (proofSnippet) {
      return proofSnippet;
    }

    if (context.profile.objection.type === "PRICE") {
      return "The right package should make the value obvious, not just look cheaper.";
    }

    if (context.profile.objection.type === "TRUST") {
      return "The fastest way to remove doubt is clear proof, not more fluff.";
    }

    return "Fair question. The best buyers usually decide once the proof and fit are clear.";
  }

  if (
    intent === "ENGAGEMENT" ||
    intent === "QUALIFICATION" ||
    intent === "GREETING"
  ) {
    if (intent === "GREETING") {
      return "Hey, happy to help with this.";
    }

    if (knowledgeSnippet && isDirectInfoMessage(context.inboundMessage)) {
      return knowledgeSnippet;
    }

    if (context.profile.intentDirective.qualificationCue === "budget range") {
      return "I can narrow this fast once I know the budget range.";
    }

    if (context.profile.intentDirective.qualificationCue === "timeline") {
      return "I can point you to the right option once I know the timeline.";
    }

    return "I can point you to the right fit without dragging this out.";
  }

  if (knowledgeSnippet && isDirectInfoMessage(context.inboundMessage)) {
    return knowledgeSnippet;
  }

  if (context.decision?.structure?.includes("proof") && proofSnippet) {
    return proofSnippet;
  }

  if (context.profile.temperature === "HOT") {
    return "You already have enough signal to move this forward fast.";
  }

  return "I can keep this simple and move you to the right next step.";
};

const buildSuggestedPlanLine = (context: SalesAgentContext) => {
  const planSnippet = extractPlanSnippet(context.client.pricingInfo);

  if (planSnippet) {
    return planSnippet;
  }

  if (context.profile.qualification.budget && context.profile.qualification.timeline) {
    return `Based on your budget and timeline, the best-fit option is the plan that gets you live fast without overbuying.`;
  }

  return "Based on what you've shared, the best-fit option is the one that gets results fastest without extra complexity.";
};

const buildActionDrivenReplyMessage = (
  context: SalesAgentContext,
  options?: {
    alternate?: boolean;
  }
) => {
  const cta = getFallbackCta(context);
  const action = context.decision?.action || context.progression.currentAction;
  const alternate = Boolean(options?.alternate);

  if (action === "SHOW_PRICING") {
    const line1 =
      extractPricingSnippet(context.client.pricingInfo)
        ? alternate
          ? `Quick pricing view: ${extractPricingSnippet(context.client.pricingInfo)}`
          : extractPricingSnippet(context.client.pricingInfo)
        : alternate
          ? "Here is the clean pricing view so you can judge fit fast."
          : "Here is the pricing context so you can see the fit quickly.";

    return normalizeReplyLines([line1, buildCtaLine(context, cta)].join("\n"))
      .slice(0, 2)
      .join("\n");
  }

  if (action === "SUGGEST_PLAN") {
    const line1 = alternate
      ? `${buildSuggestedPlanLine(context)} That is the one I'd lean toward first.`
      : `${buildSuggestedPlanLine(context)} That is the strongest fit from what you've shared.`;

    return normalizeReplyLines([line1, buildCtaLine(context, cta)].join("\n"))
      .slice(0, 2)
      .join("\n");
  }

  if (action === "PUSH_CTA") {
    const line1 = alternate
      ? "You already have enough context, so the cleanest move is the next step now."
      : "The best next step is locking this in now instead of looping on details.";

    return normalizeReplyLines([line1, buildCtaLine(context, cta)].join("\n"))
      .slice(0, 2)
      .join("\n");
  }

  if (action === "CLOSE") {
    const line1 = alternate
      ? "You are already at decision point, so I'd move on the next step now."
      : "You already have enough signal to decide, so the fastest move is the next step now.";

    return normalizeReplyLines([line1, buildCtaLine(context, cta)].join("\n"))
      .slice(0, 2)
      .join("\n");
  }

  if (action === "BOOK") {
    const line1 = alternate
      ? "No need to reopen this. The fastest path is the booking step."
      : "You sound booking-ready, so the cleanest move is the booking step.";

    return normalizeReplyLines([line1, buildCtaLine(context, cta)].join("\n"))
      .slice(0, 2)
      .join("\n");
  }

  if (action === "HANDLE_OBJECTION") {
    const line1 =
      extractProofSnippet(context)
        ? alternate
          ? `Quick proof point: ${extractProofSnippet(context)}`
          : extractProofSnippet(context)
        : alternate
          ? "Fair pushback. The right proof should make the next step obvious."
          : "Fair concern. The fastest way to clear it is specific proof, not more fluff.";

    return normalizeReplyLines([line1, buildCtaLine(context, cta)].join("\n"))
      .slice(0, 2)
      .join("\n");
  }

  if (action === "QUALIFY") {
    const line1 = alternate
      ? "I can narrow this fast with one sharp detail."
      : buildValueLine(context, cta);

    return normalizeReplyLines([line1, buildCtaLine(context, cta)].join("\n"))
      .slice(0, 2)
      .join("\n");
  }

  return normalizeReplyLines(
    [
      alternate
        ? "I can move this forward without dragging it out."
        : buildValueLine(context, cta),
      buildCtaLine(context, cta),
    ].join("\n")
  )
    .slice(0, 2)
    .join("\n");
};

export const buildFallbackReplyMessage = (context: SalesAgentContext) => {
  return buildActionDrivenReplyMessage(context);
};

const matchesIntent = (
  message: string,
  cta: SalesCTA,
  context: SalesAgentContext
) => {
  const text = normalizeComparable(message);
  const intent = context.profile.intent;

  if (intent === "PRICING") {
    return /price|pricing|package|plan|investment|cost|starting/.test(text);
  }

  if (intent === "BOOKING") {
    return /book|booking|schedule|slot|call|meeting|demo/.test(text) || cta === "BOOK_CALL";
  }

  if (intent === "PURCHASE") {
    return /pay|payment|checkout|invoice|buy/.test(text) || cta === "BUY_NOW";
  }

  if (intent === "OBJECTION") {
    return /proof|review|case|result|fit|trust|value|risk/.test(text) || cta === "VIEW_DEMO";
  }

  return /\?$/.test(message.trim()) || /reply with|share|fit|next step/.test(text);
};

const validateReply = (reply: SalesAgentReply, context: SalesAgentContext) => {
  const message = sanitizeMessage(reply.message);
  const lines = normalizeReplyLines(message);
  const question = extractQuestion(message);
  const issues: string[] = [];
  const currentAction = context.decision?.action || context.progression.currentAction;

  if (!message) issues.push("empty");
  if (reply.cta === "NONE") issues.push("missing_cta");
  if (lines.length > 2) issues.push("too_many_lines");
  if ((message.match(/\?/g) || []).length > 1) issues.push("too_many_questions");
  if (isGenericMessage(message)) issues.push("generic");
  if (question && isVagueQuestion(question)) issues.push("vague_question");
  if (question && isQuestionRepeated(context, question)) {
    issues.push("repeated_question");
  }
  if (!matchesIntent(message, reply.cta, context)) issues.push("intent_mismatch");
  if (
    normalizeComparable(message) &&
    normalizeComparable(message) === context.progression.lastReplyNormalized
  ) {
    issues.push("repeated_response");
  }
  if (
    context.progression.shouldAdvance &&
    context.progression.previousIntent === context.profile.intent &&
    context.progression.lastAction &&
    context.progression.lastAction === currentAction
  ) {
    issues.push("no_progression");
  }

  return issues;
};

export const finalizeSalesReply = (
  reply: SalesAgentReply,
  context: SalesAgentContext,
  maxLength: number
): SalesAgentReply => {
  const fallback = (
    targetContext: SalesAgentContext,
    alternate = false
  ): SalesAgentReply => ({
    message: buildActionDrivenReplyMessage(targetContext, {
      alternate,
    }),
    cta: getFallbackCta(targetContext),
    angle: getFallbackAngle(targetContext),
    reason: "fallback",
  });
  const normalized: SalesAgentReply = {
    ...reply,
    message: clampMessageLength(
      normalizeReplyLines(reply.message).slice(0, 2).join("\n"),
      maxLength
    ),
    cta: getFallbackCta(context),
    angle: getFallbackAngle(context),
  };
  const issues = validateReply(normalized, context);

  if (issues.length) {
    const { context: guardrailContext, actionAdvanced } = buildGuardrailContext(
      context,
      issues
    );
    const preferAlternate =
      actionAdvanced ||
      context.progression.loopDetected ||
      issues.includes("repeated_response") ||
      issues.includes("repeated_question");
    const guarded = applyGuardrailOverrides(
      {
        ...fallback(guardrailContext, preferAlternate),
        reason: `guardrail:${issues.join(",")}`,
      },
      guardrailContext,
      issues,
      {
        actionAdvanced,
      }
    );
    const refinedIssues = validateReply(guarded, guardrailContext);

    if (!refinedIssues.length) {
      return guarded;
    }

    return applyGuardrailOverrides(
      {
        ...fallback(guardrailContext, true),
        reason: `guardrail:${issues.join(",")}`,
      },
      guardrailContext,
      Array.from(new Set([...issues, ...refinedIssues])),
      {
        actionAdvanced,
      }
    );
  }

  return normalized;
};

export const buildRecoverySalesReply = (
  message?: string | null
): SalesAgentReply => {
  const text = String(message || "").trim().toLowerCase();

  if (isGreetingOnlyMessage(text)) {
    return {
      message:
        "Hey, happy to help.\nTell me if you want pricing, services, or booking first.",
      cta: "REPLY_DM",
      angle: "personalization",
      reason: "recovery",
    };
  }

  if (/book|booking|schedule|slot|call|meeting|demo/.test(text)) {
    return {
      message:
        "I can send the fastest booking option without the back-and-forth.\nWant the booking link?",
      cta: "BOOK_CALL",
      angle: "urgency",
      reason: "recovery",
    };
  }

  if (/buy|purchase|pay|payment|checkout|invoice|link/.test(text)) {
    return {
      message:
        "You sound close, so the cleanest move is the payment path.\nWant the payment link?",
      cta: "BUY_NOW",
      angle: "urgency",
      reason: "recovery",
    };
  }

  if (/price|pricing|cost|fees|package|plan/.test(text)) {
    return {
      message:
        "I can break down the most relevant package without wasting time.\nWant the pricing breakdown?",
      cta: "REPLY_DM",
      angle: "value",
      reason: "recovery",
    };
  }

  if (/expensive|trust|proof|review|not sure|later|maybe/.test(text)) {
    return {
      message:
        "Fair question. The fastest way to clear that up is a proof-backed answer.\nWant the proof breakdown?",
      cta: "VIEW_DEMO",
      angle: "social_proof",
      reason: "recovery",
    };
  }

  return {
    message:
      "I can help with pricing, services, or the best next step.\nTell me what you want first.",
    cta: "REPLY_DM",
    angle: "value",
    reason: "recovery",
  };
};
