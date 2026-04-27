import { differenceInDays } from "date-fns";
import type {
  AutonomousLeadSnapshot,
  AutonomousOpportunityCandidate,
} from "./types";

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const hasCustomerSignal = (snapshot: AutonomousLeadSnapshot) =>
  Boolean(snapshot.lead.lastConvertedAt) ||
  snapshot.conversions.some((event) =>
    ["payment_completed", "booked_call"].includes(
      String(event.outcome || "").toLowerCase()
    )
  );

export const buildRetentionOpportunity = (
  snapshot: AutonomousLeadSnapshot
): AutonomousOpportunityCandidate | null => {
  if (!hasCustomerSignal(snapshot)) {
    return null;
  }

  const churnRisk = String(snapshot.profile.value.churnRisk || "").toUpperCase();
  const valueTier = String(snapshot.profile.value.valueTier || "").toUpperCase();
  const lastTouchAt =
    snapshot.lead.lastEngagedAt ||
    snapshot.lead.lastMessageAt ||
    snapshot.lead.lastConvertedAt ||
    snapshot.now;
  const daysSinceTouch = differenceInDays(snapshot.now, lastTouchAt);

  if (churnRisk !== "HIGH" && snapshot.profile.value.churnScore < 60) {
    return null;
  }

  const score = clampScore(
    58 +
      Math.min(daysSinceTouch * 1.5, 16) +
      Math.round(snapshot.profile.value.churnScore * 0.22) +
      (valueTier === "STRATEGIC" ? 10 : valueTier === "HIGH" ? 6 : 0)
  );

  return {
    engine: "retention",
    title: "Protect at-risk revenue",
    objective: "Reach out before a high-risk lead or customer silently churns.",
    summary: `Churn risk is ${churnRisk} with ${daysSinceTouch} days since the last meaningful touch.`,
    reason: `churn_risk_${churnRisk.toLowerCase()}_after_${daysSinceTouch}_days`,
    score,
    priority: "high",
    prompt: [
      "Autonomous outreach objective: retention.",
      `Churn risk is ${churnRisk} and the lead has been quiet for ${daysSinceTouch} days.`,
      "Write one proactive outbound DM focused on support, clarity, and removing friction.",
      "Do not pressure for a sale. Offer help, a check-in, or a lightweight next step.",
      "Use empathetic tone and avoid manipulative retention tactics.",
    ].join(" "),
    tags: ["retention", churnRisk.toLowerCase(), valueTier.toLowerCase()],
    metadata: {
      churnRisk,
      churnScore: snapshot.profile.value.churnScore,
      valueTier,
      daysSinceTouch,
    },
  };
};
