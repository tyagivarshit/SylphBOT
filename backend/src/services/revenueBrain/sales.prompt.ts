import { buildLeadIntelligenceSummary } from "../crm/leadIntelligence.service";
import type {
  RevenueBrainContext,
  RevenueBrainCouponResult,
  RevenueBrainDecision,
  RevenueBrainIntentResult,
  RevenueBrainStateResult,
} from "./types";
import { container } from "../../runtime/core";

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

  const decisionEngine = `
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
`.trim();

  const conversionLayer = `
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
`.trim();

  const leadState = `
- Revenue state: ${state.nextState}
- Directive: ${state.directive}
- Temperature: ${intent.temperature}
- Stage: ${state.stage}
- Intent: ${intent.intent}
- Decision intent: ${intent.decisionIntent}
- Objection: ${intent.objection}
- User signal: ${intent.userSignal}
`.trim();

  const compiler = container.resolve<any>("IPromptCompiler");
  const compiled = compiler.compile(
    context.salesContext.client.id || "default_tenant",
    "revenue_sales_prompt",
    "1.0.0",
    {
      input: "",
    },
    {
      decisionEngine,
      conversionLayer,
      leadState,
      businessName: context.salesContext.business.name || "Business",
      businessIndustry: context.salesContext.business.industry || "General",
      businessWebsite: context.salesContext.business.website || "N/A",
      businessTone: context.salesContext.client.aiTone || "Confident and human",
      offerContext: context.salesContext.client.businessInfo || "No business info available.",
      pricingContext: context.salesContext.client.pricingInfo || "No pricing info available.",
      faqContext: context.salesContext.client.faqKnowledge || "No FAQ context available.",
      salesInstructions: context.salesContext.client.salesInstructions || "Keep the reply concise and conversion-oriented.",
      leadMemory: context.leadMemory.facts.map((item) => `${item.key}: ${item.value}`).join("\n") || "No durable facts yet.",
      conversationSummary: context.conversationMemory.summary || "No summary yet.",
      knowledgeHits: context.semanticMemory.knowledgeHits.slice(0, 3).join("\n") || "No direct knowledge hits.",
      couponContext,
      crmIntelligence: buildLeadIntelligenceSummary(context.crmIntelligence),
      inputMessage: context.inputMessage,
    }
  );

  return [
    {
      role: "system",
      content: compiled.system,
    },
    ...recentConversation.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: "user",
      content: compiled.user,
    },
  ];
};
