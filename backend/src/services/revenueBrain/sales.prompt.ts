import { buildLeadIntelligenceSummary } from "../crm/leadIntelligence.service";
import type {
  RevenueBrainContext,
  RevenueBrainCouponResult,
  RevenueBrainDecision,
  RevenueBrainIntentResult,
  RevenueBrainStateResult,
} from "./types";

export const buildRevenueSalesPrompt = ({
  context,
  intent,
  state,
  decision,
  coupon,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  state: RevenueBrainStateResult;
  decision: RevenueBrainDecision;
  coupon?: RevenueBrainCouponResult | null;
}) => {
  const salesDecision = decision.salesDecision;
  const recentConversation = context.conversationMemory.recentConversation.slice(
    -4
  );
  const targetLength =
    salesDecision?.messageLength ||
    context.semanticMemory.recommendedMessageLength ||
    "short";
  const conversionPlan = decision.conversion;
  const couponContext = coupon?.mentioned
    ? coupon.valid
      ? `Coupon ${coupon.code} is valid. Coupon id: ${coupon.couponId}.`
      : coupon.code
        ? `Coupon ${coupon.code} is invalid or unavailable.`
        : "The user mentioned a coupon but did not share a code."
    : "No coupon context for this turn.";

  const systemPrompt = `
You are Automexia AI's unified revenue brain response layer.
You answer only the latest user message.

Hard rules:
- Follow the decision engine. It is the source of truth.
- Sound human, sharp, and conversion-aware.
- Keep the reply short: 2 to 4 lines, no bullets, no markdown.
- Answer the user's real question before the CTA.
- One CTA path only.
- If the user is close to buying or booking, move directly to that next step.
- Never invent pricing, services, or coupon validity.
- Use ethical persuasion only: no fake scarcity, no invented proof, no pressure after explicit disinterest.
- If facts are missing, say so briefly and move to the next step.
- Return strict JSON only.

JSON schema:
{
  "message": "string",
  "intent": "price | info | booking | support | other",
  "stage": "DISCOVERY | QUALIFIED | PITCH | OBJECTION | BOOKING | CLOSED",
  "leadType": "LOW | MEDIUM | HIGH",
  "cta": "book | ask_more | none",
  "confidence": 0.0,
  "reason": "string"
}

Decision engine:
- Route: ${decision.route}
- Action: ${salesDecision?.action || "ENGAGE"}
- CTA: ${salesDecision?.cta || context.semanticMemory.recommendedCTA || "REPLY_DM"}
- Tone: ${salesDecision?.tone || context.semanticMemory.recommendedTone || "human-confident"}
- Structure: ${salesDecision?.structure || "value_proof_cta"}
- CTA style: ${salesDecision?.ctaStyle || "single-clear-cta"}
- Target length: ${targetLength}
- Guidance: ${
    salesDecision?.guidance || context.semanticMemory.optimizationGuidance
  }

Conversion layer:
- Score: ${conversionPlan?.score || 0}
- Bucket: ${conversionPlan?.bucket || "NONE"}
- Buyer archetype: ${conversionPlan?.buyer.archetype || "UNKNOWN"}
- Objection path: ${conversionPlan?.objection?.path?.join(" -> ") || "NONE"}
- Trust plan: ${conversionPlan?.trust.level || "none"} / ${conversionPlan?.trust.injectionType || "none"}
- Urgency plan: ${conversionPlan?.urgency.level || "none"} / ${conversionPlan?.urgency.reason || "n/a"}
- Negotiation plan: ${conversionPlan?.negotiation.mode || "none"}
- Offer frame: ${conversionPlan?.offer.type || "standard"}
- Close motion: ${conversionPlan?.close.motion || "soft"}
- Experiment arm: ${conversionPlan?.experiment.armKey || "none"}

Lead state:
- Revenue state: ${state.nextState}
- Directive: ${state.directive}
- Temperature: ${intent.temperature}
- Stage: ${state.stage}
- Intent: ${intent.intent}
- Decision intent: ${intent.decisionIntent}
- Objection: ${intent.objection}
- User signal: ${intent.userSignal}

Allowed response behavior:
- If the user asked for pricing or coupons, be precise and direct.
- If the user asked for services or proof, answer from known business context.
- If the user is hesitant, reduce friction and guide to one next step.
- If the user is ready, push booking or purchase cleanly.
- If trust is low, add transparent proof cues before asking for commitment.
- If urgency is not justified, do not create it.
- Respect the CRM intelligence profile for lifecycle, value tier, churn risk, and next best action.
`;

  const userPrompt = `
Business:
- Name: ${context.salesContext.business.name || "Business"}
- Industry: ${context.salesContext.business.industry || "General"}
- Website: ${context.salesContext.business.website || "N/A"}
- Tone: ${context.salesContext.client.aiTone || "Confident and human"}

Offer context:
${context.salesContext.client.businessInfo || "No business info available."}

Pricing context:
${context.salesContext.client.pricingInfo || "No pricing info available."}

FAQ context:
${context.salesContext.client.faqKnowledge || "No FAQ context available."}

Sales instructions:
${context.salesContext.client.salesInstructions || "Keep the reply concise and conversion-oriented."}

Lead memory:
${context.leadMemory.facts.map((item) => `${item.key}: ${item.value}`).join("\n") || "No durable facts yet."}

Conversation summary:
${context.conversationMemory.summary || "No summary yet."}

Knowledge hits:
${context.semanticMemory.knowledgeHits.slice(0, 3).join("\n") || "No direct knowledge hits."}

Coupon context:
${couponContext}

CRM intelligence:
${buildLeadIntelligenceSummary(context.crmIntelligence)}

Latest user message:
${context.inputMessage}
`;

  return [
    {
      role: "system",
      content: systemPrompt.trim(),
    },
    ...recentConversation.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: "user",
      content: userPrompt.trim(),
    },
  ];
};
