import prisma from "../../config/prisma";
import { buildMemoryContext, updateMemory } from "../aiMemoryEngine.service";
import { getSystemClient } from "../clientScope.service";
import { generateConversationSummary } from "../conversationSummary.service";
import { searchKnowledge } from "../knowledgeSearch.service";
import { getSalesOptimizationInsights } from "./optimizer.service";
import { getSalesCapabilityProfile, resolveSalesPlanKey } from "./policy.service";
import { buildSalesProgressionState } from "./progression.service";
import {
  getLeadStateDirective,
  updateLeadState,
} from "./leadState.service";
import type {
  SalesAgentContext,
  LeadRevenueState,
  SalesCTA,
  SalesDecisionIntent,
  SalesEmotion,
  SalesIntent,
  SalesIntentDirective,
  SalesLeadProfile,
  SalesLeadTemperature,
  SalesObjectionProfile,
  SalesQualificationState,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeText = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase();

const isGreetingOnly = (text: string) =>
  /^(hi|hello|hey|hii|yo|namaste|hola|hello there|hey there)$/i.test(
    text.trim()
  );

const hasStrongBuyingSignal = (text: string) =>
  /\b(ready|let s do it|go ahead|send (me )?(the )?(payment|checkout|booking|buy|link)|book it|book me|sign me up|start now|start today|how do i pay|pay now|buy now)\b/.test(
    text
  );

const isDirectInfoRequest = (text: string) =>
  text.includes("?") ||
  /\b(what|which|how|can you|do you|does it|tell me|share|show me|explain|details|detail|info|information|about|services|service|pricing|price|cost|package|plan|process|works|kya|kaise|kitna)\b/.test(
    text
  );

const detectIntent = (message: string): SalesIntent => {
  const text = normalizeText(message);

  if (!text) return "GENERAL";
  if (isGreetingOnly(text)) return "GREETING";
  if (
    /price|pricing|cost|fees|package|packages|plan|plans|investment|charges/.test(
      text
    )
  )
    return "PRICING";
  if (/book|booking|schedule|slot|call|meeting|demo/.test(text))
    return "BOOKING";
  if (/buy|purchase|pay|payment|checkout|invoice|link/.test(text))
    return "PURCHASE";
  if (/not interested|later|think|thinking|expensive|trust|proof|review/.test(text))
    return "OBJECTION";
  if (/follow up|checking in|reminder/.test(text)) return "FOLLOW_UP";
  if (
    /what do you do|what do you offer|services|service|about|how it works|how does it work|process|workflow|information|info/.test(
      text
    )
  ) {
    return "GENERAL";
  }
  if (/need|looking for|want|help me|tell me more|details/.test(text))
    return "QUALIFICATION";
  if (/comment|dm|link|send info/.test(text)) return "ENGAGEMENT";

  return "GENERAL";
};

const detectObjection = (message: string): SalesObjectionProfile => {
  const text = normalizeText(message);

  if (/too expensive|expensive|costly|price high|out of budget/.test(text)) {
    return {
      type: "PRICE",
      label: "price objection",
      strategy:
        "Anchor on value, reduce perceived risk, and guide toward the best-fit option instead of defending price.",
    };
  }

  if (/trust|proof|review|legit|real/.test(text)) {
    return {
      type: "TRUST",
      label: "trust objection",
      strategy:
        "Use social proof, specificity, and reassurance without sounding desperate.",
    };
  }

  if (/busy|no time|later today|later this week|timing/.test(text)) {
    return {
      type: "TIME",
      label: "time objection",
      strategy:
        "Lower friction and offer the fastest next step with a clear reason to act now.",
    };
  }

  if (/think later|will think|later|not now|maybe later/.test(text)) {
    return {
      type: "LATER",
      label: "delay objection",
      strategy:
        "Keep momentum, create a light urgency cue, and make the next action feel easy.",
    };
  }

  if (/not interested|stop|leave me|don't want/.test(text)) {
    return {
      type: "NOT_INTERESTED",
      label: "disengaged",
      strategy:
        "Respect the tone, re-open curiosity briefly, and avoid over-pushing.",
    };
  }

  return {
    type: "NONE",
    label: "no objection",
    strategy:
      "Keep the reply focused on the best next step and move the lead closer to a CTA.",
  };
};

const classifyDecisionIntent = ({
  message,
  intent,
  objection,
}: {
  message: string;
  intent: SalesIntent;
  objection: SalesObjectionProfile;
}): SalesDecisionIntent => {
  const text = normalizeText(message);

  if (
    intent === "PURCHASE" ||
    intent === "BOOKING" ||
    /buy|purchase|pay|checkout|invoice|book|schedule|ready|start today|let's do it/.test(
      text
    )
  ) {
    return "buy";
  }

  if (
    objection.type === "NOT_INTERESTED" ||
    /not interested|stop|leave me|later maybe|no thanks/.test(text)
  ) {
    return "ignore";
  }

  if (
    objection.type !== "NONE" ||
    intent === "OBJECTION" ||
    /expensive|proof|trust|review|not sure|can i think|later|maybe/.test(text)
  ) {
    return "doubt";
  }

  if (intent === "PRICING") {
    if (/price|pricing|cost/.test(text)) {
  return "buy";
}
  return "buy"; // 🔥 CRITICAL FIX
}

if (intent === ("BOOKING" as SalesIntent) || intent === ("PURCHASE" as SalesIntent)) {
  return "buy";
}

if (intent === "QUALIFICATION" || intent === "ENGAGEMENT") {
  return "explore";
}

if (intent === "GREETING") {
  return "explore";
}

  return "explore";
};

const classifyEmotion = ({
  message,
  intentCategory,
  objection,
}: {
  message: string;
  intentCategory: SalesDecisionIntent;
  objection: SalesObjectionProfile;
}): SalesEmotion => {
  const text = normalizeText(message);

  if (/urgent|asap|today|right now|immediately|now|quickly/.test(text)) {
    return "urgent";
  }

  if (
    objection.type === "PRICE" ||
    objection.type === "TRUST" ||
    objection.type === "LATER" ||
    /not sure|skeptical|trust|proof|review|worth it|guarantee/.test(text)
  ) {
    return "skeptical";
  }

  if (
    intentCategory === "explore" ||
    /curious|interested|tell me more|details|how|what/.test(text)
  ) {
    return "curious";
  }

  return "cold";
};

const resolveIntentCategory = ({
  message,
  intent,
  objection,
}: {
  message: string;
  intent: SalesIntent;
  objection: SalesObjectionProfile;
}) => {
  const text = normalizeText(message);

  if (
    intent === "PURCHASE" ||
    intent === "BOOKING" ||
    hasStrongBuyingSignal(text)
  ) {
    return "buy" as const;
  }

  if (
    objection.type === "NOT_INTERESTED" ||
    /not interested|stop|leave me|later maybe|no thanks/.test(text)
  ) {
    return "ignore" as const;
  }

  if (
    objection.type !== "NONE" ||
    intent === "OBJECTION" ||
    /expensive|proof|trust|review|not sure|can i think|later|maybe/.test(text)
  ) {
    return "doubt" as const;
  }

  if (intent === "PRICING") {
    return hasStrongBuyingSignal(text) ? ("buy" as const) : ("explore" as const);
  }

  if (isDirectInfoRequest(text)) {
    return "explore" as const;
  }

  return "explore" as const;
};

const extractBudget = (text: string) => {
  const match = text.match(
    /(?:rs\.?|inr|\$|usd)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|lakh|lakhs)?/i
  );

  if (!match) return null;

  return match[0];
};

const extractTimeline = (text: string) => {
  const match = text.match(
    /\b(today|tomorrow|this week|next week|this month|next month|asap|urgent|immediately|48 hours?)\b/i
  );

  return match?.[0] || null;
};

const extractNeed = (text: string) => {
  const patterns = [
    /need\s+(.+?)(?:\.|,|$)/i,
    /looking for\s+(.+?)(?:\.|,|$)/i,
    /want\s+(.+?)(?:\.|,|$)/i,
    /help with\s+(.+?)(?:\.|,|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
};

const extractQualification = (
  message: string,
  memory: string,
  summary: string,
  planKey: string
): SalesQualificationState => {
  const combined = [message, memory, summary].filter(Boolean).join(" \n ");

  const qualification: SalesQualificationState = {
    need: extractNeed(combined),
    budget: extractBudget(combined),
    timeline: extractTimeline(combined),
    intentSignal: detectIntent(message),
    missingFields: [],
  };

  const required =
    planKey === "BASIC"
      ? ["need", "intentSignal"]
      : ["need", "budget", "timeline", "intentSignal"];

  qualification.missingFields = required.filter((key) => {
    return !qualification[key as keyof SalesQualificationState];
  });

  return qualification;
};

const pickSupportedCta = (
  candidates: SalesCTA[],
  primaryCtas: SalesCTA[]
): SalesCTA => {
  for (const candidate of candidates) {
    if (candidate !== "NONE" && primaryCtas.includes(candidate)) {
      return candidate;
    }
  }

  return primaryCtas.find((cta) => cta !== "NONE") || "REPLY_DM";
};

const qualificationCueLabel = (field?: string | null) => {
  if (field === "budget") return "budget range";
  if (field === "timeline") return "timeline";
  if (field === "intentSignal") return "priority";
  return field === "need" ? "main outcome" : null;
};

const buildIntentDirective = ({
  intent,
  objection,
  qualification,
  capabilities,
}: {
  intent: SalesIntent;
  objection: SalesObjectionProfile;
  qualification: SalesQualificationState;
  capabilities: Awaited<ReturnType<typeof getSalesCapabilityProfile>>;
}): SalesIntentDirective => {
  const qualificationCue = qualificationCueLabel(
    qualification.missingFields[0] || null
  );
  const bookingCta = pickSupportedCta(
    ["BOOK_CALL", "VIEW_DEMO", "REPLY_DM"],
    capabilities.primaryCtas
  );
  const purchaseCta = pickSupportedCta(
    ["BUY_NOW", "BOOK_CALL", "VIEW_DEMO", "REPLY_DM"],
    capabilities.primaryCtas
  );
  const pricingCta = pickSupportedCta(
    ["BOOK_CALL", "VIEW_DEMO", "CAPTURE_LEAD", "REPLY_DM"],
    capabilities.primaryCtas
  );
  const proofCta = pickSupportedCta(
    ["VIEW_DEMO", "BOOK_CALL", "REPLY_DM"],
    capabilities.primaryCtas
  );
  const qualificationCta = pickSupportedCta(
    ["CAPTURE_LEAD", "REPLY_DM", "VIEW_DEMO"],
    capabilities.primaryCtas
  );

  if (intent === "PRICING") {
    return {
      primaryGoal: "Share concrete pricing context and move to a clear next step.",
      responseRule:
        "Answer the pricing question first with the clearest available pricing or starting point, then guide to one next step.",
      cta: pricingCta,
      angle: "value",
      qualificationCue,
    };
  }

  if (intent === "BOOKING") {
    return {
      primaryGoal: "Move the lead to a booking link or confirmed slot.",
      responseRule:
        "Do not re-qualify a booking-ready lead. Push the fastest booking CTA available.",
      cta: bookingCta,
      angle: "urgency",
    };
  }

  if (intent === "PURCHASE") {
    return {
      primaryGoal: "Close with the cleanest payment or commitment path.",
      responseRule:
        "Skip vague discovery. Move straight to the buying CTA with confidence.",
      cta: purchaseCta,
      angle: "urgency",
    };
  }

  if (intent === "OBJECTION") {
    return {
      primaryGoal: "Handle the objection with proof and one next step.",
      responseRule:
        "Acknowledge the doubt, answer it directly, and follow with a proof-backed CTA.",
      cta: proofCta,
      angle: "social_proof",
      proofCue: objection.strategy,
    };
  }

  if (intent === "GREETING") {
    return {
      primaryGoal: "Greet briefly and open the most useful business path.",
      responseRule:
        "Greet once, stay short, and offer pricing, services, or booking instead of jumping into qualification.",
      cta: pickSupportedCta(
        ["REPLY_DM", "CAPTURE_LEAD", "VIEW_DEMO"],
        capabilities.primaryCtas
      ),
      angle: "personalization",
    };
  }

  if (
    intent === "ENGAGEMENT" ||
    intent === "QUALIFICATION"
  ) {
    return {
      primaryGoal: "Answer clearly, then qualify only when it genuinely helps the next step.",
      responseRule:
        "If the user asked a direct question, answer it first. Ask one specific qualification question only if the answer is still missing.",
      cta: qualificationCta,
      angle: "personalization",
      qualificationCue,
    };
  }

  return {
    primaryGoal: "Answer the current message clearly and steer the lead toward the best next step.",
    responseRule:
      "Stay brief, answer first, and use a single next step only after the answer is useful.",
    cta: qualificationCta,
    angle: qualificationCue ? "personalization" : "value",
    qualificationCue,
  };
};

const computeScoreDelta = ({
  message,
  intent,
  objection,
  messageCount,
}: {
  message: string;
  intent: SalesIntent;
  objection: SalesObjectionProfile;
  messageCount: number;
}) => {
  const text = normalizeText(message);
  let score = 0;

  if (intent === "PRICING") score += 8;
  if (intent === "BOOKING") score += 14;
  if (intent === "PURCHASE") score += 18;
  if (intent === "QUALIFICATION") score += 6;
  if (intent === "ENGAGEMENT") score += 4;

  if (/demo|call|schedule|slot/.test(text)) score += 8;
  if (/buy|pay|checkout|invoice|start today/.test(text)) score += 12;
  if (/price|budget|cost/.test(text)) score += 6;
  if (/urgent|asap|today|now/.test(text)) score += 5;
  if (text.split(/\s+/).length > 12) score += 2;

  if (objection.type === "PRICE") score += 2;
  if (objection.type === "TRUST") score += 1;
  if (objection.type === "TIME") score -= 1;
  if (objection.type === "LATER") score -= 2;
  if (objection.type === "NOT_INTERESTED") score -= 8;

  if (messageCount >= 6) score += 2;

  return score;
};

const getTemperature = (score: number): SalesLeadTemperature => {
  if (score >= 18) return "HOT";
  if (score >= 8) return "WARM";
  return "COLD";
};

const getLeadStage = ({
  temperature,
  objection,
  qualification,
}: {
  temperature: SalesLeadTemperature;
  objection: SalesObjectionProfile;
  qualification: SalesQualificationState;
}) => {
  if (objection.type === "NOT_INTERESTED") return "COOLING";
  if (temperature === "HOT" && qualification.missingFields.length <= 1) {
    return "READY_TO_BUY";
  }

  if (temperature === "HOT") return "QUALIFIED";
  if (temperature === "WARM") return "INTERESTED";
  return "NEW";
};

const getLeadType = (temperature: SalesLeadTemperature) => {
  if (temperature === "HOT") return "hot";
  if (temperature === "WARM") return "warm";
  return "cold";
};

const temperatureFromRevenueState = (
  state: LeadRevenueState
): SalesLeadTemperature => {
  if (state === "HOT" || state === "CONVERTED") return "HOT";
  if (state === "WARM") return "WARM";
  return "COLD";
};

const countUnansweredQuestions = (conversation: Array<{ content: string }>) =>
  conversation.reduce((count, item) => {
    return item.content.includes("?") ? count + 1 : count;
  }, 0);

const mergeTrainingText = (
  primary?: string | null,
  fallback?: string | null
) => {
  const values = [primary, fallback]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  if (!values.length) {
    return null;
  }

  return Array.from(new Set(values)).join("\n\n");
};

export const buildSalesAgentContext = async ({
  businessId,
  leadId,
  message,
  plan,
}: {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
}): Promise<SalesAgentContext> => {
  const [
    leadRecord,
    systemClient,
    memoryContext,
    optimization,
    messageCount,
  ] = await Promise.all([
    prisma.lead.findUnique({
      where: {
        id: leadId,
      },
      include: {
        business: {
          include: {
            subscription: {
              include: {
                plan: true,
              },
            },
          },
        },
        client: true,
      },
    }),
    getSystemClient(businessId),
    buildMemoryContext(leadId),
    getSalesOptimizationInsights(businessId),
    prisma.message.count({
      where: {
        leadId,
      },
    }),
  ]);

  const leadClient = leadRecord?.client?.isActive ? leadRecord.client : null;
  const knowledgeResults = await searchKnowledge(businessId, message, {
    clientId: leadClient?.id || null,
    includeShared: true,
  });

  const planKey = resolveSalesPlanKey(
    plan || leadRecord?.business?.subscription?.plan || null
  );
  const capabilities = getSalesCapabilityProfile(planKey);
  const rawIntent = detectIntent(message);
  const { effectiveIntent, progression } = await buildSalesProgressionState({
    leadId,
    rawIntent,
    message,
    summary: memoryContext.summary,
  });
  const intent = effectiveIntent;
  const objection = detectObjection(message);
  const intentCategory = resolveIntentCategory({
    message,
    intent,
    objection,
  });
  const emotion = classifyEmotion({
    message,
    intentCategory,
    objection,
  });
  const qualification = extractQualification(
    message,
    memoryContext.memory,
    memoryContext.summary,
    planKey
  );
  const intentDirective = buildIntentDirective({
    intent,
    objection,
    qualification,
    capabilities,
  });

  const currentScore = Number(leadRecord?.leadScore || 0);
  const scoreDelta = computeScoreDelta({
    message,
    intent,
    objection,
    messageCount,
  });
  const leadScore = clamp(currentScore + scoreDelta, 0, 100);
  const temperature = getTemperature(leadScore);
  const stage = getLeadStage({
    temperature,
    objection,
    qualification,
  });

  const profile: SalesLeadProfile = {
    leadScore,
    scoreDelta,
    temperature,
    leadType: getLeadType(temperature),
    stage,
    intent,
    intentCategory,
    emotion,
    userSignal: progression.userSignal,
    objection,
    qualification,
    intentDirective,
    unansweredQuestionCount: countUnansweredQuestions(
      memoryContext.conversation
    ),
  };

  await prisma.lead.update({
    where: {
      id: leadId,
    },
    data: {
      leadScore,
      aiStage: temperature,
      stage,
      intent,
    },
  });

  const leadState = await updateLeadState({
    businessId,
    leadId,
    message,
    intent,
    absoluteLeadScore: leadScore,
    preferredStage: stage,
    preferredAiStage: temperature,
    source: "AI_INTELLIGENCE",
    metadata: {
      objection: objection.type,
      emotion,
      intentCategory,
      qualificationMissing: qualification.missingFields,
    },
  }).catch(() => ({
    state: temperature as LeadRevenueState,
    previousState: temperature as LeadRevenueState,
    leadScore,
    stage,
    aiStage: temperature,
    directive: getLeadStateDirective(temperature as LeadRevenueState),
  }));

  profile.temperature = temperatureFromRevenueState(leadState.state);
  profile.stage = leadState.stage;
  profile.leadScore = leadState.leadScore;

  void updateMemory(leadId, message).catch(() => {});

  if (messageCount > 0 && messageCount % 10 === 0) {
    void generateConversationSummary(leadId).catch(() => {});
  }

  return {
    businessId,
    leadId,
    inboundMessage: message,
    planKey,
    capabilities,
    business: {
      name: leadRecord?.business?.name || null,
      industry: leadRecord?.business?.industry || null,
      website: leadRecord?.business?.website || null,
      timezone: leadRecord?.business?.timezone || null,
    },
    client: {
      id: leadClient?.id || null,
      aiTone: leadClient?.aiTone || systemClient.aiTone || null,
      businessInfo: mergeTrainingText(
        leadClient?.businessInfo,
        systemClient.businessInfo
      ),
      pricingInfo: mergeTrainingText(
        leadClient?.pricingInfo,
        systemClient.pricingInfo
      ),
      faqKnowledge: mergeTrainingText(
        leadClient?.faqKnowledge,
        systemClient.faqKnowledge
      ),
      salesInstructions: mergeTrainingText(
        leadClient?.salesInstructions,
        systemClient.salesInstructions
      ),
    },
    lead: {
      name: leadRecord?.name || null,
      phone: leadRecord?.phone || null,
      email: leadRecord?.email || null,
      platform: leadRecord?.platform || null,
      stage: leadRecord?.stage || null,
      aiStage: leadRecord?.aiStage || null,
      revenueState: leadState.state,
      leadScore: leadState.leadScore,
      intent: leadRecord?.intent || null,
      lastMessageAt: leadRecord?.lastMessageAt || null,
      followupCount: leadRecord?.followupCount || 0,
    },
    memory: {
      summary: memoryContext.summary || "",
      memory: memoryContext.memory || "",
      conversation: (memoryContext.conversation || []).map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content,
      })),
    },
    knowledge: knowledgeResults.map((item) => item.content).slice(0, 4),
    profile,
    progression,
    optimization,
    leadState: {
      state: leadState.state,
      directive: leadState.directive,
      reason: null,
    },
  };
};
