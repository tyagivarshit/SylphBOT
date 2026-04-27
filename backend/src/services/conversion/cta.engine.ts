import type { RevenueBrainContext, RevenueBrainRoute } from "../revenueBrain/types";
import type { SalesCTA, SalesDecisionAction } from "../salesAgent/types";
import type {
  RevenueConversionCtaPlan,
  RevenueConversionExperimentPlan,
  RevenueConversionObjectionGraph,
  RevenueConversionPersuasionPlan,
  RevenueConversionTrustPlan,
  RevenueConversionUrgencyPlan,
} from "./conversionScore.service";

const unique = (values: SalesCTA[]) => Array.from(new Set(values));

const allowedCtas = (context: RevenueBrainContext) =>
  context.salesContext.capabilities.primaryCtas.length
    ? context.salesContext.capabilities.primaryCtas
    : ([
        "REPLY_DM",
        "VIEW_DEMO",
        "BOOK_CALL",
        "BUY_NOW",
        "CAPTURE_LEAD",
        "NONE",
      ] as SalesCTA[]);

const ctaLabel = (cta: SalesCTA) => {
  if (cta === "BUY_NOW") return "Buy Now";
  if (cta === "BOOK_CALL") return "Book Call";
  if (cta === "VIEW_DEMO") return "View Demo";
  if (cta === "CAPTURE_LEAD") return "Capture Lead";
  if (cta === "REPLY_DM") return "Reply";
  return "No CTA";
};

const scoreCta = ({
  cta,
  route,
  context,
  salesDecision,
  objection,
  persuasion,
  trust,
  urgency,
}: {
  cta: SalesCTA;
  route: RevenueBrainRoute;
  context: RevenueBrainContext;
  salesDecision: SalesDecisionAction;
  objection: RevenueConversionObjectionGraph;
  persuasion: RevenueConversionPersuasionPlan;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
}) => {
  let score =
    (cta === salesDecision.cta ? 18 : 0) +
    (context.salesContext.optimization.recommendedCTA === cta ? 10 : 0) +
    (context.salesContext.optimization.bestCtas.some((item) => item.cta === cta)
      ? 8
      : 0);

  if (route === "BOOKING" && cta === "BOOK_CALL") score += 28;
  if (route === "BOOKING" && cta === "VIEW_DEMO") score += 8;
  if (persuasion.buyer.archetype === "DECISIVE" && cta === "BUY_NOW") score += 14;
  if (persuasion.buyer.archetype === "SKEPTICAL" && cta === "VIEW_DEMO") score += 18;
  if (persuasion.buyer.archetype === "EXPLORER" && cta === "REPLY_DM") score += 9;
  if (persuasion.buyer.archetype === "ANALYTICAL" && cta === "VIEW_DEMO") score += 11;
  if (persuasion.buyer.archetype === "RELATIONAL" && cta === "BOOK_CALL") score += 10;

  if (trust.level === "strong" && cta === "VIEW_DEMO") score += 14;
  if (trust.level === "strong" && cta === "BUY_NOW") score -= 18;
  if (objection.shouldDownshiftCTA && cta === "BUY_NOW") score -= 22;
  if (objection.shouldDownshiftCTA && cta === "BOOK_CALL") score -= 8;
  if (objection.primary === "NOT_INTERESTED" && cta !== "REPLY_DM") score -= 24;

  if (urgency.level === "critical" && (cta === "BOOK_CALL" || cta === "BUY_NOW")) {
    score += 10;
  }

  if (urgency.level === "none" && cta === "BUY_NOW") {
    score -= 8;
  }

  return score;
};

export const buildDynamicCtaPlan = ({
  context,
  route,
  salesDecision,
  objection,
  persuasion,
  trust,
  urgency,
  experiment,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  salesDecision: SalesDecisionAction;
  objection: RevenueConversionObjectionGraph;
  persuasion: RevenueConversionPersuasionPlan;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  experiment: RevenueConversionExperimentPlan;
}): RevenueConversionCtaPlan => {
  const candidates = unique([
    ...allowedCtas(context),
    salesDecision.cta,
    context.salesContext.optimization.recommendedCTA,
    ...context.salesContext.optimization.bestCtas.map((item) => item.cta),
  ].filter(Boolean) as SalesCTA[]);

  const ranked = candidates
    .map((cta) => ({
      cta,
      score: scoreCta({
        cta,
        route,
        context,
        salesDecision,
        objection,
        persuasion,
        trust,
        urgency,
      }),
      reason:
        cta === salesDecision.cta
          ? "base_sales_decision"
          : context.salesContext.optimization.recommendedCTA === cta
            ? "optimizer_recommendation"
            : "deterministic_conversion_scoring",
    }))
    .sort((left, right) => right.score - left.score);

  const winner = ranked[0] || {
    cta: salesDecision.cta,
    score: 0,
    reason: "fallback_base_cta",
  };

  return {
    cta: winner.cta,
    style:
      experiment.ctaStyle ||
      (winner.cta === "BOOK_CALL" || winner.cta === "BUY_NOW"
        ? "single-clear-cta"
        : trust.level === "strong"
          ? "proof-backed"
          : "soft-question"),
    label: ctaLabel(winner.cta),
    score: winner.score,
    candidates: ranked.slice(0, 5),
    reason: winner.reason,
  };
};
