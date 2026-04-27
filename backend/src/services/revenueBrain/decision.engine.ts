import { selectBestAction } from "../salesAgent/decisionEngine.service";
import { resolveRevenueConversionStrategy } from "../conversion/conversionScore.service";
import { buildRevenueBrainToolPlan } from "./toolPlan.service";
import type {
  RevenueBrainContext,
  RevenueBrainDecision,
  RevenueBrainIntentResult,
  RevenueBrainStateResult,
} from "./types";

const ESCALATION_PATTERN =
  /\b(human|real person|agent|owner|representative|team member|someone real|call me)\b/i;

const BOOKING_PATTERN =
  /\b(book|booking|schedule|slot|appointment|meeting|demo|consult|call)\b/i;

const COUPON_PATTERN =
  /\b(coupon|promo|discount|offer code|coupon code|promo code)\b/i;

const BOOKING_STATES = new Set([
  "BOOKING_SELECTION",
  "BOOKING_CONFIRMATION",
  "RESCHEDULE_FLOW",
]);

const hasRelationshipEdge = (
  context: RevenueBrainContext,
  targetType: string
) =>
  context.crmIntelligence.relationships.edges.some(
    (edge) => edge.targetType === targetType
  );

const resolveSalesDecision = (context: RevenueBrainContext) =>
  selectBestAction({
    businessId: context.businessId,
    leadId: context.leadId,
    clientId: context.salesContext.client.id || null,
    messageType: "AI_REPLY",
    leadState: context.salesContext.leadState.state,
    intent: context.salesContext.profile.intentCategory,
    salesIntent: context.salesContext.profile.intent,
    progression: context.salesContext.progression,
    emotion: context.salesContext.profile.emotion,
    clientData: {
      aiTone: context.salesContext.client.aiTone,
      businessInfo: context.salesContext.client.businessInfo,
      pricingInfo: context.salesContext.client.pricingInfo,
      faqKnowledge: context.salesContext.client.faqKnowledge,
      salesInstructions: context.salesContext.client.salesInstructions,
    },
    capabilities: {
      primaryCtas: context.salesContext.capabilities.primaryCtas,
      supportBooking: context.salesContext.capabilities.supportBooking,
      supportPaymentLinks: context.salesContext.capabilities.supportPaymentLinks,
    },
  });

export const resolveRevenueBrainDecision = async ({
  context,
  intent,
  state,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  state: RevenueBrainStateResult;
}): Promise<RevenueBrainDecision> => {
  const reasoning: string[] = [];
  const message = context.inputMessage;
  const normalizedMessage = message.toLowerCase();
  const couponRequested = COUPON_PATTERN.test(message);
  const crmProfile = context.crmIntelligence;

  if (crmProfile.value.valueTier === "HIGH" || crmProfile.value.valueTier === "STRATEGIC") {
    reasoning.push(`crm_value:${crmProfile.value.valueTier.toLowerCase()}`);
  }

  if (crmProfile.value.churnRisk === "HIGH") {
    reasoning.push("crm_retention_watch");
  }

  if (crmProfile.behavior.predictedBehavior === "BOOKING_READY") {
    reasoning.push("crm_booking_ready");
  }

  if (hasRelationshipEdge(context, "REFERRAL")) {
    reasoning.push("relationship_referral_edge");
  }

  if (hasRelationshipEdge(context, "TRUST")) {
    reasoning.push("relationship_trust_edge");
  }

  if (hasRelationshipEdge(context, "COMPANY") || hasRelationshipEdge(context, "BUSINESS")) {
    reasoning.push("relationship_company_edge");
  }

  if (!state.shouldReply) {
    reasoning.push("human_takeover_active");
    const route = "NO_REPLY" as const;
    return {
      route,
      salesDecision: null,
      conversion: null,
      reasoning,
      couponRequested,
      toolPlan: buildRevenueBrainToolPlan({
        decision: {
          route,
          salesDecision: null,
          conversion: null,
          reasoning,
          couponRequested,
          toolPlan: [],
        },
        route,
        hasReply: false,
      }),
    };
  }

  if (ESCALATION_PATTERN.test(message)) {
    reasoning.push("user_requested_human_handoff");
    const route = "ESCALATE" as const;

    return {
      route,
      salesDecision: null,
      conversion: null,
      reasoning,
      couponRequested,
      toolPlan: buildRevenueBrainToolPlan({
        decision: {
          route,
          salesDecision: null,
          conversion: null,
          reasoning,
          couponRequested,
          toolPlan: [],
        },
        route,
        hasReply: true,
      }),
    };
  }

  if (
    BOOKING_STATES.has(String(state.conversationStateName || "").trim()) ||
    intent.intent === "BOOKING" ||
    BOOKING_PATTERN.test(normalizedMessage)
  ) {
    reasoning.push("booking_route_selected");
    const baseSalesDecision = await resolveSalesDecision(context);
    const route = "BOOKING" as const;
    const resolved = resolveRevenueConversionStrategy({
      context,
      intent,
      state,
      route,
      salesDecision: baseSalesDecision,
    });
    const salesDecision = resolved.salesDecision;
    const conversion = resolved.conversion;
    const finalReasoning = conversion
      ? Array.from(new Set([...reasoning, ...conversion.reasoning]))
      : reasoning;

    return {
      route,
      salesDecision,
      conversion,
      reasoning: finalReasoning,
      couponRequested,
      toolPlan: buildRevenueBrainToolPlan({
        decision: {
          route,
          salesDecision,
          conversion,
          reasoning: finalReasoning,
          couponRequested,
          toolPlan: [],
        },
        route,
        hasReply: true,
      }),
    };
  }

  const baseSalesDecision = await resolveSalesDecision(context);
  const route = "SALES" as const;
  const resolved = resolveRevenueConversionStrategy({
    context,
    intent,
    state,
    route,
    salesDecision: baseSalesDecision,
  });
  const salesDecision = resolved.salesDecision;
  const conversion = resolved.conversion;

  reasoning.push(`sales_action:${salesDecision?.action || baseSalesDecision.action}`);
  const finalReasoning = conversion
    ? Array.from(new Set([...reasoning, ...conversion.reasoning]))
    : reasoning;

  return {
    route,
    salesDecision,
    conversion,
    reasoning: finalReasoning,
    couponRequested,
    toolPlan: buildRevenueBrainToolPlan({
      decision: {
        route,
        salesDecision,
        conversion,
        reasoning: finalReasoning,
        couponRequested,
        toolPlan: [],
      },
      route,
      hasReply: true,
    }),
  };
};
