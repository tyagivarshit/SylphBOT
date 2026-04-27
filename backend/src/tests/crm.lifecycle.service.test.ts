import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCustomerGraph } from "../services/crm/customerGraph.service";
import { assessLeadLifecycle } from "../services/crm/lifecycle.service";
import { createLeadIntelligenceSnapshot } from "./crm.test.helpers";

test("lifecycle marks long-stale followup-heavy leads as at risk", () => {
  const snapshot = createLeadIntelligenceSnapshot({
    lead: {
      followupCount: 2,
      lastMessageAt: new Date("2026-04-10T09:00:00.000Z"),
      lastEngagedAt: new Date("2026-04-10T09:00:00.000Z"),
      lastClickedAt: null,
    } as any,
    messageStats: {
      total: 2,
      userCount: 1,
      aiCount: 1,
      latestUserMessage: "Will think later.",
      latestAIMessage: "Happy to help.",
      latestUserMessageAt: new Date("2026-04-10T09:00:00.000Z"),
      latestAIMessageAt: new Date("2026-04-10T08:00:00.000Z"),
      recentQuestionCount: 0,
    },
    salesSignals: {
      objection: "LATER",
      temperature: "WARM",
      intent: "GENERAL",
      intentCategory: "doubt",
      qualificationMissing: ["budget", "timeline"],
    } as any,
    conversions: [],
    conversionStats: {
      total: 0,
      openedCount: 0,
      clickedCount: 0,
      bookedCount: 0,
      paymentCount: 0,
      repliedCount: 0,
      lastConversionAt: null,
      totalValue: 0,
    },
    followups: {
      schedule: [],
      currentAction: "schedule",
    },
    analytics: {
      aiReplyCount: 1,
      followupMessageCount: 2,
      lastTrackedReplyAt: new Date("2026-04-10T08:00:00.000Z"),
    },
  });
  const graph = buildCustomerGraph(snapshot);
  const lifecycle = assessLeadLifecycle(snapshot, graph, {
    engagementScore: 22,
    qualificationScore: 36,
    buyingIntentScore: 28,
  });

  assert.equal(lifecycle.stage, "AT_RISK");
  assert.equal(lifecycle.status, "RECOVERY");
  assert.equal(lifecycle.nextLeadStage, "INTERESTED");
  assert.equal(lifecycle.stale, true);
});

test("lifecycle keeps booked leads in booked state", () => {
  const snapshot = createLeadIntelligenceSnapshot({
    appointments: [
      {
        id: "appt_1",
        status: "CONFIRMED",
        startTime: new Date("2026-04-27T10:00:00.000Z"),
        endTime: new Date("2026-04-27T10:30:00.000Z"),
      },
    ],
    appointmentStats: {
      total: 1,
      upcomingCount: 1,
      completedCount: 0,
      nextAppointmentAt: new Date("2026-04-27T10:00:00.000Z"),
    },
  });
  const graph = buildCustomerGraph(snapshot);
  const lifecycle = assessLeadLifecycle(snapshot, graph, {
    engagementScore: 65,
    qualificationScore: 78,
    buyingIntentScore: 92,
  });

  assert.equal(lifecycle.stage, "BOOKED");
  assert.equal(lifecycle.status, "ACTIVE");
  assert.equal(lifecycle.nextLeadStage, "BOOKED_CALL");
  assert.equal(lifecycle.nextRevenueState, "HOT");
});
