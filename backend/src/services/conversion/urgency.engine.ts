import type {
  RevenueBrainContext,
  RevenueBrainIntentResult,
  RevenueBrainRoute,
} from "../revenueBrain/types";
import type { RevenueConversionUrgencyPlan } from "./conversionScore.service";

const normalize = (value?: unknown) => String(value || "").trim().toUpperCase();

const resolveTimeline = (context: RevenueBrainContext) =>
  String(context.crmIntelligence.enrichment.resolvedTimeline || "").trim();

const hasAnchoredTimeline = (timeline: string) =>
  /\b(TODAY|TOMORROW|THIS WEEK|NEXT WEEK|ASAP|URGENT|IMMEDIATELY|48 HOURS?)\b/i.test(
    timeline
  );

export const buildUrgencyPlan = ({
  context,
  intent,
  route,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  route: RevenueBrainRoute;
}): RevenueConversionUrgencyPlan => {
  const timeline = resolveTimeline(context);
  const anchoredToTimeline = hasAnchoredTimeline(timeline);
  const predictedUrgency = normalize(context.crmIntelligence.behavior.urgency);
  const buyingIntent = context.crmIntelligence.scorecard.buyingIntentScore;
  const bookingLikelihood = context.crmIntelligence.behavior.bookingLikelihood;
  const purchaseLikelihood = context.crmIntelligence.behavior.purchaseLikelihood;

  if (anchoredToTimeline) {
    return {
      level:
        /TODAY|TOMORROW|IMMEDIATELY|48 HOURS?/i.test(timeline)
          ? "critical"
          : "timed",
      frame:
        route === "BOOKING"
          ? "Use the buyer's own timeline to reduce delay and suggest the fastest booking path."
          : "Use only the buyer's stated timing as the urgency source.",
      anchoredToTimeline: true,
      windowLabel: timeline,
      reason: "buyer_timeline_detected",
    };
  }

  if (
    predictedUrgency === "HIGH" ||
    bookingLikelihood >= 88 ||
    purchaseLikelihood >= 82 ||
    intent.intent === "BOOKING"
  ) {
    return {
      level: route === "BOOKING" ? "timed" : "light",
      frame:
        "Keep momentum by showing the fastest next step, without inventing deadlines or scarcity.",
      anchoredToTimeline: false,
      windowLabel: null,
      reason: "behavioral_urgency_signal_detected",
    };
  }

  if (predictedUrgency === "MEDIUM" || buyingIntent >= 60) {
    return {
      level: "light",
      frame:
        "Keep the CTA prompt and low-friction, but avoid explicit urgency language.",
      anchoredToTimeline: false,
      windowLabel: null,
      reason: "moderate_buying_momentum_detected",
    };
  }

  return {
    level: "none",
    frame:
      "Do not force urgency. Let clarity and fit carry the next step.",
    anchoredToTimeline: false,
    windowLabel: null,
    reason: "urgency_not_justified",
  };
};
