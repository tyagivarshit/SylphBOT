import crypto from "crypto";
import type { RevenueBrainContext, RevenueBrainRoute } from "../revenueBrain/types";
import type { SalesDecisionAction } from "../salesAgent/types";
import type {
  RevenueConversionExperimentPlan,
  RevenueConversionObjectionGraph,
  RevenueConversionPersuasionPlan,
} from "./conversionScore.service";

const hashBucket = (input: string) => {
  const digest = crypto.createHash("sha1").update(input).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 100;
};

export const buildExperimentPlan = ({
  context,
  route,
  salesDecision,
  persuasion,
  objection,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  salesDecision: SalesDecisionAction;
  persuasion: RevenueConversionPersuasionPlan;
  objection: RevenueConversionObjectionGraph;
}): RevenueConversionExperimentPlan => {
  const variant = salesDecision.variant;

  if (variant) {
    return {
      armKey: variant.variantKey,
      label: variant.label,
      variantId: variant.id,
      variantKey: variant.variantKey,
      ctaStyle: variant.ctaStyle,
      messageLength:
        variant.messageLength === "medium" ? "medium" : "short",
      confidence: 0.88,
      reason: "existing_ab_variant_selected_by_sales_engine",
    };
  }

  const bucket = hashBucket(
    [
      context.businessId,
      context.leadId,
      route,
      persuasion.buyer.archetype,
      objection.primary,
    ].join(":")
  );

  if (objection.primary === "TRUST" || persuasion.buyer.proofPreference >= 65) {
    return {
      armKey: bucket < 50 ? "proof_stack" : "proof_then_demo",
      label: bucket < 50 ? "Proof Stack" : "Proof Then Demo",
      variantId: null,
      variantKey: null,
      ctaStyle: "proof-backed",
      messageLength: "medium",
      confidence: 0.56,
      reason: "deterministic_proof_experiment_selected",
    };
  }

  if (route === "BOOKING" || persuasion.buyer.urgencySensitivity >= 70) {
    return {
      armKey: bucket < 50 ? "direct_booking" : "fast_path_close",
      label: bucket < 50 ? "Direct Booking" : "Fast Path Close",
      variantId: null,
      variantKey: null,
      ctaStyle: "direct-booking",
      messageLength: "short",
      confidence: 0.54,
      reason: "deterministic_booking_experiment_selected",
    };
  }

  if (persuasion.buyer.priceSensitivity >= 65) {
    return {
      armKey: bucket < 50 ? "value_scope" : "fit_reframe",
      label: bucket < 50 ? "Value Scope" : "Fit Reframe",
      variantId: null,
      variantKey: null,
      ctaStyle: "soft-question",
      messageLength: "medium",
      confidence: 0.52,
      reason: "deterministic_price_experiment_selected",
    };
  }

  return {
    armKey: bucket < 50 ? "single_clear_cta" : "personalized_question",
    label: bucket < 50 ? "Single Clear CTA" : "Personalized Question",
    variantId: null,
    variantKey: null,
    ctaStyle: bucket < 50 ? "single-clear-cta" : "soft-question",
    messageLength: "short",
    confidence: 0.5,
    reason: "deterministic_default_experiment_selected",
  };
};
