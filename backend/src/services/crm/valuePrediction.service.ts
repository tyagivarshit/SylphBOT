import type {
  CRMBehaviorPrediction,
  CRMCustomerGraph,
  CRMLeadSignalSnapshot,
  CRMLifecycleAssessment,
  CRMRelationshipMap,
  CRMScoreSeeds,
  CRMValuePrediction,
} from "./leadIntelligence.service";

const clampScore = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalizeText = (value?: unknown) => String(value || "").trim().toUpperCase();

const parseBudgetAmount = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return 0;
  }

  const match = normalized.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|lakh|lakhs)?/i);

  if (!match) {
    return 0;
  }

  let amount = Number(match[1].replace(/,/g, ""));

  if (!Number.isFinite(amount)) {
    return 0;
  }

  const suffix = String(match[2] || "").toLowerCase();

  if (suffix === "k") amount *= 1000;
  if (suffix === "m") amount *= 1000000;
  if (suffix === "lakh" || suffix === "lakhs") amount *= 100000;

  return amount;
};

const getBudgetScore = (amount: number) => {
  if (amount >= 10000) return 18;
  if (amount >= 5000) return 14;
  if (amount >= 2000) return 10;
  if (amount > 0) return 6;
  return 0;
};

export const predictLeadValue = (
  snapshot: CRMLeadSignalSnapshot,
  graph: CRMCustomerGraph,
  lifecycle: CRMLifecycleAssessment,
  behavior: CRMBehaviorPrediction,
  relationships: CRMRelationshipMap,
  seeds: CRMScoreSeeds
): CRMValuePrediction => {
  const budgetAmount = parseBudgetAmount(graph.enrichment.resolvedBudget);
  const objection = normalizeText(snapshot.salesSignals.objection);
  const projectedValue = Math.round(
    budgetAmount > 0
      ? budgetAmount
      : Math.max(
          snapshot.conversionStats.totalValue,
          ((seeds.buyingIntentScore + seeds.qualificationScore + behavior.purchaseLikelihood) /
            3) *
            Math.max(1, snapshot.messageStats.total)
        )
  );
  const churnScore = clampScore(
    behavior.churnLikelihood * 0.72 +
      (lifecycle.stale ? 18 : 0) +
      snapshot.lead.followupCount * 5 +
      (objection === "NOT_INTERESTED" ? 14 : 0) -
      relationships.relationshipScore * 0.08
  );
  const valueScore = clampScore(
    seeds.buyingIntentScore * 0.34 +
      seeds.qualificationScore * 0.2 +
      seeds.engagementScore * 0.1 +
      lifecycle.score * 0.12 +
      relationships.relationshipScore * 0.12 +
      behavior.purchaseLikelihood * 0.12 +
      getBudgetScore(budgetAmount) -
      churnScore * 0.12 +
      (snapshot.appointmentStats.upcomingCount > 0 ? 10 : 0)
  );

  let valueTier = "LOW";

  if (valueScore >= 82 || budgetAmount >= 10000) valueTier = "STRATEGIC";
  else if (valueScore >= 65 || budgetAmount >= 5000) valueTier = "HIGH";
  else if (valueScore >= 45 || budgetAmount >= 1500) valueTier = "MEDIUM";

  const churnRisk =
    churnScore >= 70 ? "HIGH" : churnScore >= 40 ? "MEDIUM" : "LOW";
  const expansionLikelihood = clampScore(
    valueScore * 0.6 +
      relationships.relationshipScore * 0.15 +
      behavior.responseLikelihood * 0.15 -
      churnScore * 0.2 +
      (valueTier === "STRATEGIC" ? 10 : valueTier === "HIGH" ? 6 : 0)
  );

  return {
    valueScore,
    valueTier,
    churnScore,
    churnRisk,
    projectedValue,
    expansionLikelihood,
    reason:
      churnRisk === "HIGH"
        ? "high_value_retention_monitor"
        : valueTier === "STRATEGIC"
          ? "strategic_value_profile"
          : `value_tier:${valueTier.toLowerCase()}`,
  };
};
