import type {
  RevenueBrainContext,
  RevenueBrainIntentResult,
  RevenueBrainRoute,
} from "../revenueBrain/types";
import type { SalesDecisionAction } from "../salesAgent/types";
import type {
  RevenueConversionObjectionGraph,
  RevenueConversionPersuasionPlan,
  RevenueConversionTrustPlan,
  RevenueConversionUrgencyPlan,
} from "./conversionScore.service";

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalize = (value?: unknown) => String(value || "").trim().toUpperCase();

export const buildBuyerPersuasionProfile = ({
  context,
  route,
  objection,
  trust,
  urgency,
  salesDecision,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  route: RevenueBrainRoute;
  objection: RevenueConversionObjectionGraph;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  salesDecision: SalesDecisionAction;
}): RevenueConversionPersuasionPlan => {
  const qualificationMissing =
    context.salesContext.profile.qualification.missingFields.length;
  const relationshipScore = context.crmIntelligence.relationships.relationshipScore;
  const buyingIntent = context.crmIntelligence.scorecard.buyingIntentScore;
  const valueTier = normalize(context.crmIntelligence.value.valueTier);
  const objectionKey = normalize(objection.primary);

  const trustNeed = clamp(
    35 +
      (objection.requiresTrust ? 35 : 0) +
      (relationshipScore < 55 ? 12 : 0) +
      (trust.level === "strong" ? 18 : trust.level === "light" ? 8 : 0)
  );
  const urgencySensitivity = clamp(
    25 +
      (urgency.level === "critical" ? 40 : urgency.level === "timed" ? 25 : urgency.level === "light" ? 10 : 0) +
      (buyingIntent >= 70 ? 12 : 0)
  );
  const priceSensitivity = clamp(
    28 +
      (objectionKey === "PRICE" ? 42 : 0) +
      (qualificationMissing > 2 ? 8 : 0) -
      (valueTier === "STRATEGIC" ? 10 : 0)
  );
  const proofPreference = clamp(
    30 +
      (objectionKey === "TRUST" ? 34 : 0) +
      (relationshipScore < 60 ? 10 : 0) +
      (context.semanticMemory.hits.length > 0 ? 6 : 0)
  );
  const negotiationLikelihood = clamp(
    18 +
      (objection.requiresNegotiation ? 40 : 0) +
      (objectionKey === "PRICE" ? 16 : 0) +
      (buyingIntent >= 75 ? 6 : 0)
  );

  const archetype =
    proofPreference >= 70
      ? "SKEPTICAL"
      : urgencySensitivity >= 70 || route === "BOOKING"
        ? "DECISIVE"
        : priceSensitivity >= 70
          ? "ANALYTICAL"
          : relationshipScore >= 75
            ? "RELATIONAL"
            : "EXPLORER";

  const recommendedAngle =
    archetype === "SKEPTICAL"
      ? "social_proof"
      : archetype === "DECISIVE"
        ? "urgency"
        : archetype === "RELATIONAL"
          ? "personalization"
          : archetype === "ANALYTICAL"
            ? "value"
            : context.salesContext.optimization.recommendedAngle;
  const recommendedTone =
    archetype === "SKEPTICAL"
      ? "confident-proof"
      : archetype === "DECISIVE"
        ? "decisive-closer"
        : archetype === "RELATIONAL"
          ? "human-confident"
          : archetype === "ANALYTICAL"
            ? "clear-confident"
            : salesDecision.tone || "human-confident";
  const recommendedLength =
    objection.severity === "high" || archetype === "ANALYTICAL"
      ? "medium"
      : "short";
  const strategy =
    objection.primary !== "NONE"
      ? objection.requiresTrust
        ? "PROVE"
        : objection.requiresNegotiation
          ? "REDUCE_FRICTION"
          : "EDUCATE"
      : buyingIntent >= 72 || route === "BOOKING"
        ? "CLOSE"
        : qualificationMissing > 0
          ? "EDUCATE"
          : "REDUCE_FRICTION";
  const structure =
    strategy === "PROVE"
      ? "value_proof_cta"
      : strategy === "CLOSE"
        ? "direct_close"
        : qualificationMissing > 0 && objection.primary === "NONE"
          ? "qualification_cta"
          : salesDecision.structure || "value_proof_cta";
  const tactics = [
    archetype === "SKEPTICAL"
      ? "answer doubt before asking"
      : archetype === "DECISIVE"
        ? "reduce friction fast"
        : archetype === "ANALYTICAL"
          ? "tie value to fit"
          : archetype === "RELATIONAL"
            ? "sound specific and contextual"
            : "keep curiosity moving",
    trust.level !== "none" ? "inject trust before hard CTA" : null,
    urgency.level !== "none" ? "use only signal-based urgency" : null,
    objection.requiresNegotiation ? "reframe scope instead of discounting" : null,
    context.salesContext.optimization.guidance || null,
  ].filter(Boolean) as string[];

  return {
    buyer: {
      archetype,
      trustNeed,
      urgencySensitivity,
      priceSensitivity,
      proofPreference,
      negotiationLikelihood,
      recommendedAngle,
      recommendedTone,
      recommendedLength,
      reason: `archetype:${archetype.toLowerCase()}`,
    },
    strategy,
    angle: recommendedAngle,
    tone: recommendedTone,
    structure,
    tactics,
    reason:
      strategy === "CLOSE"
        ? "high_conversion_readiness_detected"
        : strategy === "PROVE"
          ? "trust_first_persuasion_needed"
          : strategy === "REDUCE_FRICTION"
            ? "friction_reduction_selected"
            : "education_first_selected",
  };
};
