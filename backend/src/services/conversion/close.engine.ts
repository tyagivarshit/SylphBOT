import type { RevenueBrainContext, RevenueBrainRoute } from "../revenueBrain/types";
import type {
  RevenueConversionClosePlan,
  RevenueConversionCtaPlan,
  RevenueConversionObjectionGraph,
  RevenueConversionTrustPlan,
  RevenueConversionUrgencyPlan,
} from "./conversionScore.service";

export const buildClosePlan = ({
  context,
  route,
  score,
  objection,
  trust,
  urgency,
  cta,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  score: number;
  objection: RevenueConversionObjectionGraph;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  cta: RevenueConversionCtaPlan;
}): RevenueConversionClosePlan => {
  if (context.crmIntelligence.behavior.predictedBehavior === "HUMAN_OWNED") {
    return {
      motion: "handoff",
      pressureCap: "low",
      closingDirective: "Do not close. Defer cleanly to the human owner.",
      reason: "human_takeover_detected",
    };
  }

  if (objection.primary === "NOT_INTERESTED") {
    return {
      motion: "soft",
      pressureCap: "low",
      closingDirective:
        "Use a respectful, low-pressure opt-in instead of a conversion push.",
      reason: "explicit_disinterest_caps_pressure",
    };
  }

  if (
    route === "BOOKING" ||
    (score >= 82 &&
      objection.primary === "NONE" &&
      trust.level !== "strong" &&
      (cta.cta === "BOOK_CALL" || cta.cta === "BUY_NOW"))
  ) {
    return {
      motion: "direct",
      pressureCap: urgency.level === "critical" ? "medium" : "low",
      closingDirective:
        "Close directly with one concrete next step and no extra branches.",
      reason: "direct_close_justified",
    };
  }

  if (score >= 62 && objection.severity !== "high") {
    return {
      motion: "assumptive",
      pressureCap: "low",
      closingDirective:
        "Assume forward motion gently by framing the next step as the logical continuation.",
      reason: "assumptive_close_selected",
    };
  }

  return {
    motion: "soft",
    pressureCap: "low",
    closingDirective:
      "Keep the close soft and buyer-safe until trust or objection risk drops.",
    reason: "soft_close_selected",
  };
};
