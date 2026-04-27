import type { RevenueBrainContext, RevenueBrainRoute } from "../revenueBrain/types";
import type {
  RevenueConversionNegotiationPlan,
  RevenueConversionObjectionGraph,
  RevenueConversionOfferPlan,
  RevenueConversionTrustPlan,
  RevenueConversionUrgencyPlan,
} from "./conversionScore.service";

export const buildOfferPlan = ({
  context,
  route,
  objection,
  trust,
  urgency,
  negotiation,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  objection: RevenueConversionObjectionGraph;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  negotiation: RevenueConversionNegotiationPlan;
}): RevenueConversionOfferPlan => {
  if (route === "BOOKING") {
    return {
      type: "booking_offer",
      headline: "Offer the fastest booking or walkthrough path.",
      riskReversal:
        "Make the booking step feel lightweight and clear about what happens next.",
      incentive: urgency.anchoredToTimeline ? "Match the buyer's stated timeline." : null,
      reason: "booking_route_offer_selected",
    };
  }

  if (objection.primary === "TRUST" || trust.level === "strong") {
    return {
      type: "proof_offer",
      headline: "Offer proof before asking for commitment.",
      riskReversal:
        "Invite a low-risk walkthrough or fit check instead of a hard close.",
      incentive: null,
      reason: "trust_first_offer_selected",
    };
  }

  if (negotiation.mode !== "none" || objection.primary === "PRICE") {
    return {
      type: "scope_reframe",
      headline: "Offer the best-fit path instead of a cheaper promise.",
      riskReversal:
        "Frame the next step as a fit and scope decision, not a purchase trap.",
      incentive: null,
      reason: "scope_reframe_offer_selected",
    };
  }

  if (context.crmIntelligence.behavior.predictedBehavior === "CHURNING") {
    return {
      type: "retention_offer",
      headline: "Offer a short recovery step that restores momentum.",
      riskReversal:
        "Keep the ask small so the lead can re-engage without pressure.",
      incentive: null,
      reason: "retention_offer_selected",
    };
  }

  return {
    type: "standard",
    headline: "Offer the clearest next step that matches the lead's intent.",
    riskReversal:
      urgency.level === "none"
        ? "Keep the CTA easy and reversible."
        : "Keep the CTA fast, but do not add fake pressure.",
    incentive: null,
    reason: "standard_offer_selected",
  };
};
