import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCustomerGraph } from "../services/crm/customerGraph.service";
import { assessLeadLifecycle } from "../services/crm/lifecycle.service";
import { mapLeadRelationships } from "../services/crm/relationship.service";
import { predictLeadBehavior } from "../services/crm/behavior.service";
import { predictLeadValue } from "../services/crm/valuePrediction.service";
import { createLeadIntelligenceSnapshot } from "./crm.test.helpers";

test("behavior and value model prioritize fast followup for high-value churn risk", () => {
  const snapshot = createLeadIntelligenceSnapshot({
    lead: {
      followupCount: 2,
      lastMessageAt: new Date("2026-04-17T09:00:00.000Z"),
      lastEngagedAt: new Date("2026-04-17T09:00:00.000Z"),
    } as any,
    salesSignals: {
      objection: "LATER",
      intent: "PRICING",
      intentCategory: "doubt",
      temperature: "WARM",
    } as any,
    followups: {
      schedule: [],
      currentAction: "schedule",
    },
    messageStats: {
      total: 3,
      userCount: 1,
      aiCount: 2,
      latestUserMessage: "Will think and maybe come back later.",
      latestAIMessage: "Want me to hold a slot?",
      latestUserMessageAt: new Date("2026-04-17T09:00:00.000Z"),
      latestAIMessageAt: new Date("2026-04-17T08:00:00.000Z"),
      recentQuestionCount: 0,
    },
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
    analytics: {
      aiReplyCount: 2,
      followupMessageCount: 2,
      lastTrackedReplyAt: new Date("2026-04-17T08:00:00.000Z"),
    },
  });
  const graph = buildCustomerGraph(snapshot);
  const seeds = {
    engagementScore: 38,
    qualificationScore: 74,
    buyingIntentScore: 64,
  };
  const lifecycle = assessLeadLifecycle(snapshot, graph, seeds);
  const relationships = mapLeadRelationships(snapshot, graph, lifecycle, seeds);
  const behavior = predictLeadBehavior(
    snapshot,
    graph,
    lifecycle,
    relationships,
    seeds
  );
  const value = predictLeadValue(
    snapshot,
    graph,
    lifecycle,
    behavior,
    relationships,
    seeds
  );

  assert.equal(lifecycle.stage, "AT_RISK");
  assert.equal(behavior.predictedBehavior, "CHURNING");
  assert.equal(behavior.nextBestAction, "TRIGGER_RETENTION_FOLLOWUP");
  assert.equal(value.valueTier, "HIGH");
  assert.equal(value.churnRisk, "HIGH");
  assert.ok(value.valueScore >= 60);
});
