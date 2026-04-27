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

export const buildExpansionOpportunity = (
  snapshot: AutonomousLeadSnapshot
): AutonomousOpportunityCandidate | null => {
  if (!hasCustomerSignal(snapshot)) {
    return null;
  }

  const lastValueEvent =
    snapshot.lead.lastConvertedAt || snapshot.lead.lastBookedAt || snapshot.now;
  const daysSinceValueEvent = differenceInDays(snapshot.now, lastValueEvent);
  const valueTier = String(snapshot.profile.value.valueTier || "").toUpperCase();
  const churnRisk = String(snapshot.profile.value.churnRisk || "").toUpperCase();

  if (daysSinceValueEvent < 5 || churnRisk === "HIGH") {
    return null;
  }

  if (!["HIGH", "STRATEGIC"].includes(valueTier)) {
    return null;
  }

  const score = clampScore(
    52 +
      Math.min(daysSinceValueEvent, 18) +
      Math.round(snapshot.profile.value.valueScore * 0.18) +
      Math.round(snapshot.profile.relationships.relationshipScore * 0.08)
  );

  return {
    engine: "expansion",
    title: "Unlock expansion path",
    objective: "Open an upsell or next-step expansion conversation with an already valuable lead.",
    summary: `High-value lead is eligible for follow-on value after ${daysSinceValueEvent} days since last conversion signal.`,
    reason: `high_value_customer_ready_for_expansion_after_${daysSinceValueEvent}_days`,
    score,
    priority: score >= 78 ? "high" : "medium",
    prompt: [
      "Autonomous outreach objective: expansion.",
      `Lead is already high value (${valueTier}) and last converted ${daysSinceValueEvent} days ago.`,
      `CRM next best action: ${snapshot.profile.behavior.nextBestAction}.`,
      "Write one proactive outbound DM that offers a relevant next step, additional value, or upgrade path.",
      "Keep the tone consultative and useful, never pushy.",
      "Do not invent discounts, guarantees, or product capabilities.",
    ].join(" "),
    tags: ["expansion", valueTier.toLowerCase(), churnRisk.toLowerCase()],
    metadata: {
      daysSinceValueEvent,
      valueTier,
      churnRisk,
    },
  };
};
