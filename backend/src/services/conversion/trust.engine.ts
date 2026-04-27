import type {
  RevenueBrainContext,
  RevenueBrainIntentResult,
} from "../revenueBrain/types";
import type {
  RevenueConversionObjectionGraph,
  RevenueConversionTrustPlan,
} from "./conversionScore.service";

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const hasFaq = (context: RevenueBrainContext) =>
  String(context.salesContext.client.faqKnowledge || "").trim().length > 0;

const hasCompanyContext = (context: RevenueBrainContext) =>
  context.crmIntelligence.relationships.edges.some(
    (edge) => edge.targetType === "COMPANY" || edge.targetType === "BUSINESS"
  );

const hasReferralEdge = (context: RevenueBrainContext) =>
  context.crmIntelligence.relationships.edges.some(
    (edge) => edge.targetType === "REFERRAL"
  );

const hasTrustEdge = (context: RevenueBrainContext) =>
  context.crmIntelligence.relationships.edges.some(
    (edge) => edge.targetType === "TRUST"
  );

export const buildTrustPlan = ({
  context,
  intent,
  objection,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  objection: RevenueConversionObjectionGraph;
}): RevenueConversionTrustPlan => {
  let score =
    context.crmIntelligence.relationships.relationshipScore * 0.45 +
    context.crmIntelligence.enrichment.profileCompleteness * 0.15 +
    (hasCompanyContext(context) ? 10 : 0) +
    (hasReferralEdge(context) ? 12 : 0) +
    (hasTrustEdge(context) ? 8 : 0) +
    (hasFaq(context) ? 6 : 0);

  if (objection.requiresTrust) {
    score += 12;
  }

  if (String(intent.objection || "").trim().toUpperCase() === "TRUST") {
    score += 8;
  }

  score = clamp(score);

  const injections: string[] = [];
  const signalKeys: string[] = [];

  if (hasReferralEdge(context)) {
    injections.push("Reference warm relationship context only if already known.");
    signalKeys.push("relationship:referral");
  }

  if (hasCompanyContext(context)) {
    injections.push("Use concrete company or business context to sound specific.");
    signalKeys.push("relationship:company");
  }

  if (hasFaq(context)) {
    injections.push("Answer with factual specificity from FAQ or pricing context.");
    signalKeys.push("faq:specificity");
  }

  if (context.semanticMemory.hits.length > 0) {
    injections.push("Ground reassurance in retrieved knowledge, not vague claims.");
    signalKeys.push("knowledge:retrieved");
  }

  if (objection.requiresTrust || score < 50) {
    injections.push("Make the next step transparent so the lead knows what to expect.");
    signalKeys.push("process:transparent");
  }

  const level =
    objection.requiresTrust || score < 45
      ? "strong"
      : score < 65
        ? "light"
        : "none";

  const injectionType =
    level === "none"
      ? "none"
      : hasReferralEdge(context)
        ? "relationship_proof"
        : hasFaq(context)
          ? "faq_specificity"
          : hasCompanyContext(context)
            ? "company_context"
            : objection.requiresTrust
              ? "transparent_process"
              : "risk_reversal";

  return {
    level,
    injectionType,
    injections,
    signalKeys,
    score,
    reason:
      level === "strong"
        ? "trust_gap_or_trust_objection_detected"
        : level === "light"
          ? "trust_support_recommended"
          : "trust_not_primary_constraint",
  };
};
