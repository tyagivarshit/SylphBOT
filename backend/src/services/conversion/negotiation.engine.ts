import type { RevenueBrainContext } from "../revenueBrain/types";
import type {
  RevenueConversionNegotiationPlan,
  RevenueConversionObjectionGraph,
  RevenueConversionUrgencyPlan,
} from "./conversionScore.service";

const normalize = (value?: unknown) => String(value || "").trim().toUpperCase();

export const buildNegotiationPlan = ({
  context,
  objection,
  urgency,
}: {
  context: RevenueBrainContext;
  objection: RevenueConversionObjectionGraph;
  urgency: RevenueConversionUrgencyPlan;
}): RevenueConversionNegotiationPlan => {
  const budgetKnown = Boolean(context.crmIntelligence.enrichment.resolvedBudget);
  const objectionKey = normalize(objection.primary);

  if (objectionKey !== "PRICE" && !objection.requiresNegotiation) {
    return {
      mode: "none",
      allowDiscount: false,
      askForBudget: false,
      responseGuardrail:
        "Do not negotiate when price is not the active blocker.",
      reason: "negotiation_not_required",
    };
  }

  if (!budgetKnown) {
    return {
      mode: "clarify_scope",
      allowDiscount: false,
      askForBudget: true,
      responseGuardrail:
        "Clarify fit, scope, and budget context before making any commercial move.",
      reason: "budget_context_missing",
    };
  }

  if (urgency.level === "critical" || urgency.level === "timed") {
    return {
      mode: "package_reframe",
      allowDiscount: false,
      askForBudget: false,
      responseGuardrail:
        "Reframe to the fastest practical path. Do not promise discounts or fake urgency.",
      reason: "time_sensitive_scope_reframe",
    };
  }

  return {
    mode: "anchor_value",
    allowDiscount: false,
    askForBudget: false,
    responseGuardrail:
      "Anchor on outcome value, de-risk the next step, and avoid explicit discounting.",
    reason: "value_anchor_selected",
  };
};
