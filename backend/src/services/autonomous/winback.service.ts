import { differenceInDays } from "date-fns";
import type {
  AutonomousLeadSnapshot,
  AutonomousOpportunityCandidate,
} from "./types";

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const hasPriorBuyingSignal = (snapshot: AutonomousLeadSnapshot) =>
  Boolean(snapshot.lead.lastBookedAt) ||
  Boolean(snapshot.lead.lastClickedAt) ||
  snapshot.conversions.some((event) =>
    ["link_clicked", "booked_call", "opened", "replied"].includes(
      String(event.outcome || "").toLowerCase()
    )
  ) ||
  snapshot.profile.scorecard.buyingIntentScore >= 55;

const getLastTouchAt = (snapshot: AutonomousLeadSnapshot) =>
  snapshot.lead.lastEngagedAt ||
  snapshot.lead.lastMessageAt ||
  snapshot.lead.lastClickedAt ||
  snapshot.lead.createdAt ||
  snapshot.now;

export const buildWinbackOpportunity = (
  snapshot: AutonomousLeadSnapshot
): AutonomousOpportunityCandidate | null => {
  const lastTouchAt = getLastTouchAt(snapshot);
  const staleDays = differenceInDays(snapshot.now, lastTouchAt);
  const converted = Boolean(snapshot.lead.lastConvertedAt);

  if (staleDays < 10 || converted || !hasPriorBuyingSignal(snapshot)) {
    return null;
  }

  const score = clampScore(
    48 +
      Math.min(staleDays * 1.5, 18) +
      Math.round(snapshot.profile.scorecard.buyingIntentScore * 0.22) +
      Math.round(snapshot.profile.value.valueScore * 0.08)
  );

  return {
    engine: "winback",
    title: "Win back warm intent",
    objective: "Recover a lead that showed buying motion but stalled before conversion.",
    summary: `Lead showed prior buying intent and has gone quiet for ${staleDays} days.`,
    reason: `prior_buying_signal_with_${staleDays}_day_gap`,
    score,
    priority: score >= 75 ? "high" : "medium",
    prompt: [
      "Autonomous outreach objective: win back a lead that was previously engaged.",
      `Lead has been quiet for ${staleDays} days after showing buying intent.`,
      `CRM objection profile: ${snapshot.profile.behavior.predictedBehavior}.`,
      "Write one proactive outbound DM that reconnects with context, lowers friction, and offers a simple next step.",
      "If booking readiness is high, make the booking path feel lightweight and optional.",
      "Avoid guilt, pressure, or false urgency.",
    ].join(" "),
    tags: ["winback", "high_intent", snapshot.profile.behavior.predictedBehavior.toLowerCase()],
    metadata: {
      staleDays,
      buyingIntentScore: snapshot.profile.scorecard.buyingIntentScore,
      valueScore: snapshot.profile.value.valueScore,
    },
  };
};
