import { differenceInDays } from "date-fns";
import type {
  AutonomousLeadSnapshot,
  AutonomousOpportunityCandidate,
} from "./types";

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const hasPositiveOutcome = (snapshot: AutonomousLeadSnapshot) =>
  Boolean(snapshot.lead.lastConvertedAt) ||
  snapshot.conversions.some((event) =>
    ["payment_completed", "booked_call"].includes(
      String(event.outcome || "").toLowerCase()
    )
  );

export const buildReferralOpportunity = (
  snapshot: AutonomousLeadSnapshot
): AutonomousOpportunityCandidate | null => {
  if (!hasPositiveOutcome(snapshot)) {
    return null;
  }

  const churnRisk = String(snapshot.profile.value.churnRisk || "").toUpperCase();
  const relationshipScore = snapshot.profile.relationships.relationshipScore;
  const lastPositiveAt =
    snapshot.lead.lastConvertedAt || snapshot.lead.lastBookedAt || snapshot.now;
  const daysSincePositiveEvent = differenceInDays(snapshot.now, lastPositiveAt);

  if (daysSincePositiveEvent < 7 || churnRisk === "HIGH" || relationshipScore < 60) {
    return null;
  }

  const score = clampScore(
    46 +
      Math.min(daysSincePositiveEvent, 14) +
      Math.round(relationshipScore * 0.22) +
      Math.round((100 - snapshot.profile.value.churnScore) * 0.1)
  );

  return {
    engine: "referral",
    title: "Ask for warm referral",
    objective: "Turn a positive outcome into a gentle referral or introduction request.",
    summary: `Healthy post-conversion relationship with ${relationshipScore}% relationship strength.`,
    reason: `healthy_relationship_ready_for_referral_after_${daysSincePositiveEvent}_days`,
    score,
    priority: score >= 72 ? "medium" : "low",
    prompt: [
      "Autonomous outreach objective: referral.",
      `The lead had a positive outcome ${daysSincePositiveEvent} days ago and relationship strength is ${relationshipScore}.`,
      "Write one proactive outbound DM that thanks them, reinforces value, and gently invites a referral or introduction if it feels natural.",
      "Keep it optional, respectful, and never guilt-based.",
    ].join(" "),
    tags: ["referral", "post_value", churnRisk.toLowerCase()],
    metadata: {
      daysSincePositiveEvent,
      relationshipScore,
      churnRisk,
    },
  };
};
