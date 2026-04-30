import {
  clampNumber,
  normalizeToken,
  type PriorityLevel,
} from "./reception.shared";

export type PriorityFactors = {
  vipScore?: number | null;
  churnRisk?: string | number | null;
  customerValue?: number | null;
  urgencyClass?: string | null;
  unresolvedCount?: number | null;
  complaintSeverity?: number | null;
  conversionOpportunity?: number | null;
  slaRisk?: number | null;
  intelligencePriorityBoost?: number | null;
};

export type PriorityDecision = {
  score: number;
  level: PriorityLevel;
  reasons: string[];
  components: Record<string, number>;
};

const URGENCY_WEIGHTS: Record<string, number> = {
  LOW: 15,
  MEDIUM: 40,
  HIGH: 70,
  CRITICAL: 95,
};

const CHURN_WEIGHTS: Record<string, number> = {
  LOW: 15,
  MEDIUM: 40,
  HIGH: 70,
  CRITICAL: 90,
};

const resolveRiskValue = (
  value: string | number | null | undefined,
  map: Record<string, number>
) => {
  if (typeof value === "number") {
    return clampNumber(value);
  }

  const normalized = normalizeToken(value, "LOW");
  return map[normalized] ?? map.LOW;
};

const resolvePriorityLevel = (score: number): PriorityLevel => {
  if (score >= 80) {
    return "CRITICAL";
  }

  if (score >= 60) {
    return "HIGH";
  }

  if (score >= 35) {
    return "MEDIUM";
  }

  return "LOW";
};

export const scoreInboundPriority = (
  factors: PriorityFactors
): PriorityDecision => {
  const components = {
    vipScore: clampNumber(Number(factors.vipScore || 0)),
    churnRisk: resolveRiskValue(factors.churnRisk, CHURN_WEIGHTS),
    customerValue: clampNumber(Number(factors.customerValue || 0)),
    urgency: resolveRiskValue(factors.urgencyClass, URGENCY_WEIGHTS),
    unresolvedCount: clampNumber(Number(factors.unresolvedCount || 0) * 18),
    complaintSeverity: clampNumber(Number(factors.complaintSeverity || 0)),
    conversionOpportunity: clampNumber(
      Number(factors.conversionOpportunity || 0)
    ),
    slaRisk: clampNumber(Number(factors.slaRisk || 0)),
    intelligenceBoost: clampNumber(
      Number(factors.intelligencePriorityBoost || 0),
      -40,
      40
    ),
  };

  const score = Math.round(
    components.vipScore * 0.18 +
      components.churnRisk * 0.12 +
      components.customerValue * 0.12 +
      components.urgency * 0.18 +
      components.unresolvedCount * 0.12 +
      components.complaintSeverity * 0.1 +
      components.conversionOpportunity * 0.1 +
      components.slaRisk * 0.08 +
      components.intelligenceBoost * 0.18
  );
  const level = resolvePriorityLevel(score);
  const reasons = Object.entries(components)
    .filter(([, component]) => component >= 45)
    .sort((left, right) => right[1] - left[1])
    .map(([key, component]) => `${key}:${component}`);

  if (!reasons.length) {
    reasons.push("baseline_operational_priority");
  }

  return {
    score,
    level,
    reasons,
    components,
  };
};
