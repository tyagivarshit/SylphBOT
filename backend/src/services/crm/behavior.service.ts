import type {
  CRMBehaviorPrediction,
  CRMCustomerGraph,
  CRMLeadSignalSnapshot,
  CRMLifecycleAssessment,
  CRMRelationshipMap,
  CRMScoreSeeds,
} from "./leadIntelligence.service";

const clampScore = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalizeText = (value?: unknown) => String(value || "").trim().toUpperCase();

const hasUrgentTimeline = (timeline?: string | null) =>
  /\b(TODAY|TOMORROW|THIS WEEK|ASAP|URGENT|IMMEDIATELY|48 HOURS?)\b/i.test(
    String(timeline || "")
  );

const hoursBetween = (from?: Date | null, to?: Date | null) => {
  if (!from || !to) {
    return null;
  }

  return Math.max(0, (to.getTime() - from.getTime()) / (60 * 60 * 1000));
};

export const predictLeadBehavior = (
  snapshot: CRMLeadSignalSnapshot,
  graph: CRMCustomerGraph,
  lifecycle: CRMLifecycleAssessment,
  relationships: CRMRelationshipMap,
  seeds: CRMScoreSeeds
): CRMBehaviorPrediction => {
  const objection = normalizeText(snapshot.salesSignals.objection);
  const lastTouchHours = hoursBetween(graph.enrichment.lastTouchAt, snapshot.now);
  const responseLikelihood = clampScore(
    seeds.engagementScore * 0.55 +
      relationships.relationshipScore * 0.2 +
      seeds.buyingIntentScore * 0.15 +
      (lastTouchHours !== null
        ? lastTouchHours <= 12
          ? 12
          : lastTouchHours <= 48
            ? 6
            : -8
        : 0) +
      (snapshot.messageStats.recentQuestionCount > 0 ? 8 : 0) -
      (objection === "NOT_INTERESTED" ? 24 : 0)
  );
  const bookingLikelihood = clampScore(
    seeds.buyingIntentScore * 0.65 +
      seeds.qualificationScore * 0.15 +
      relationships.relationshipScore * 0.1 +
      (snapshot.appointmentStats.upcomingCount > 0 ? 24 : 0) +
      (snapshot.conversionStats.clickedCount > 0 ? 12 : 0) +
      (hasUrgentTimeline(graph.enrichment.resolvedTimeline) ? 8 : 0)
  );
  const purchaseLikelihood = clampScore(
    seeds.buyingIntentScore * 0.6 +
      seeds.qualificationScore * 0.14 +
      seeds.engagementScore * 0.1 +
      relationships.relationshipScore * 0.08 +
      (graph.enrichment.resolvedBudget ? 8 : 0) +
      (snapshot.conversionStats.paymentCount > 0 ? 20 : 0)
  );
  const churnLikelihood = clampScore(
    (100 - seeds.engagementScore) * 0.45 +
      snapshot.lead.followupCount * 10 +
      (lifecycle.stale ? 24 : 0) +
      (objection === "LATER" || objection === "TIME" ? 8 : 0) +
      (objection === "NOT_INTERESTED" ? 18 : 0) +
      (snapshot.messageStats.aiCount > snapshot.messageStats.userCount ? 8 : 0) -
      relationships.relationshipScore * 0.12 -
      bookingLikelihood * 0.1
  );
  const behaviorScore = clampScore(
    (responseLikelihood + bookingLikelihood + purchaseLikelihood + (100 - churnLikelihood)) /
      4
  );

  let predictedBehavior = "NEEDS_NURTURE";
  let nextBestAction = "SHARE_VALUE_AND_QUALIFY";

  if (lifecycle.stage === "CONVERTED") {
    predictedBehavior = "POST_CONVERSION";
    nextBestAction = "CONFIRM_NEXT_STEPS";
  } else if (snapshot.lead.isHumanActive) {
    predictedBehavior = "HUMAN_OWNED";
    nextBestAction = "PAUSE_AUTOMATION";
  } else if (snapshot.appointmentStats.upcomingCount > 0 || bookingLikelihood >= 85) {
    predictedBehavior = "BOOKING_READY";
    nextBestAction = "SEND_BOOKING_LINK";
  } else if (churnLikelihood >= 70) {
    predictedBehavior = "CHURNING";
    nextBestAction = "TRIGGER_RETENTION_FOLLOWUP";
  } else if (purchaseLikelihood >= 72) {
    predictedBehavior = "CLOSE_READY";
    nextBestAction = "PUSH_PAYMENT_OR_BOOKING";
  } else if (seeds.buyingIntentScore >= 48 || normalizeText(snapshot.salesSignals.intent) === "PRICING") {
    predictedBehavior = "PRICE_EVALUATION";
    nextBestAction = "ANSWER_PRICING_AND_QUALIFY";
  } else if (responseLikelihood < 40) {
    predictedBehavior = "FOLLOWUP_RECOVERY";
    nextBestAction = "SHORT_PROOF_FOLLOWUP";
  }

  const urgency =
    hasUrgentTimeline(graph.enrichment.resolvedTimeline) || bookingLikelihood >= 80
      ? "HIGH"
      : responseLikelihood >= 60 || purchaseLikelihood >= 60
        ? "MEDIUM"
        : "LOW";
  const followupIntensity =
    lifecycle.stage === "CONVERTED" ||
    lifecycle.stage === "BOOKED" ||
    snapshot.lead.isHumanActive
      ? "pause"
      : churnLikelihood >= 70 && bookingLikelihood >= 45
        ? "fast"
        : urgency === "MEDIUM" || urgency === "HIGH"
          ? "normal"
          : "light";

  return {
    predictedBehavior,
    nextBestAction,
    behaviorScore,
    responseLikelihood,
    bookingLikelihood,
    purchaseLikelihood,
    churnLikelihood,
    urgency,
    followupIntensity,
    reason:
      predictedBehavior === "BOOKING_READY"
        ? "booking_signal_above_threshold"
        : predictedBehavior === "CHURNING"
          ? "retention_risk_above_threshold"
          : predictedBehavior === "CLOSE_READY"
            ? "purchase_signal_above_threshold"
            : `behavior:${predictedBehavior.toLowerCase()}`,
  };
};
