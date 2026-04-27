import { differenceInDays } from "date-fns";
import type {
  AutonomousLeadSnapshot,
  AutonomousOpportunityCandidate,
} from "./types";

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const getLastTouchAt = (snapshot: AutonomousLeadSnapshot) =>
  snapshot.lead.lastEngagedAt ||
  snapshot.lead.lastMessageAt ||
  snapshot.lead.createdAt ||
  snapshot.now;

export const buildLeadRevivalOpportunity = (
  snapshot: AutonomousLeadSnapshot
): AutonomousOpportunityCandidate | null => {
  const lastTouchAt = getLastTouchAt(snapshot);
  const staleDays = differenceInDays(snapshot.now, lastTouchAt);
  const bookedOrConverted = Boolean(
    snapshot.lead.lastBookedAt || snapshot.lead.lastConvertedAt
  );

  if (staleDays < 7 || bookedOrConverted) {
    return null;
  }

  const lifecycleStage = String(snapshot.profile.lifecycle.stage || "").toUpperCase();
  const relationshipScore = snapshot.profile.relationships.relationshipScore;
  const score = clampScore(
    44 +
      Math.min(staleDays * 2, 22) +
      Math.round(snapshot.profile.scorecard.engagementScore * 0.12) +
      Math.round(relationshipScore * 0.08)
  );

  if (lifecycleStage === "DISQUALIFIED") {
    return null;
  }

  return {
    engine: "lead_revival",
    title: "Revive dormant lead",
    objective: "Restart a stalled conversation with a low-friction reason to reply.",
    summary: `Lead has been quiet for ${staleDays} days and still shows ${snapshot.profile.behavior.responseLikelihood}% response likelihood.`,
    reason: `stale_for_${staleDays}_days_with_${snapshot.profile.lifecycle.stage.toLowerCase()}_lifecycle`,
    score,
    priority: staleDays >= 14 ? "high" : "medium",
    prompt: [
      "Autonomous outreach objective: revive a dormant lead.",
      `Lead has been inactive for ${staleDays} days.`,
      `CRM next best action: ${snapshot.profile.behavior.nextBestAction}.`,
      "Write one proactive outbound DM that feels helpful, concise, and human.",
      "Use a low-pressure re-engagement angle, ask one easy question, and do not mention inactivity tracking.",
      "Do not use fake urgency or manipulative scarcity.",
    ].join(" "),
    tags: ["revival", "stale_lead", snapshot.profile.lifecycle.stage.toLowerCase()],
    metadata: {
      staleDays,
      responseLikelihood: snapshot.profile.behavior.responseLikelihood,
      relationshipScore,
    },
  };
};
