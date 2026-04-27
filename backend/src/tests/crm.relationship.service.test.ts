import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCustomerGraph } from "../services/crm/customerGraph.service";
import { mapLeadRelationships } from "../services/crm/relationship.service";
import { createLeadIntelligenceSnapshot } from "./crm.test.helpers";

test("relationship map includes business, client, memory, and analytics edges", () => {
  const snapshot = createLeadIntelligenceSnapshot({
    relatedLeads: [
      {
        id: "lead_2",
        name: "Aarav Duplicate",
        email: null,
        phone: "+919999999999",
        instagramId: null,
        platform: "WHATSAPP",
      },
    ],
  });
  const graph = buildCustomerGraph(snapshot);
  const relationships = mapLeadRelationships(
    snapshot,
    graph,
    {
      stage: "OPPORTUNITY",
      status: "ACTIVE",
      score: 84,
      nextLeadStage: "READY_TO_BUY",
      nextRevenueState: "HOT",
      nextAIStage: "HOT",
      reason: "stage:opportunity",
      daysSinceLastTouch: 0,
      stale: false,
      lastLifecycleAt: snapshot.now,
    },
    {
      engagementScore: 66,
      qualificationScore: 82,
      buyingIntentScore: 100,
    }
  );

  assert.equal(relationships.health, "STRONG");
  assert.ok(relationships.edgeCount >= 6);
  assert.equal(relationships.strongestEdge?.targetType, "BUSINESS");
  assert.ok(
    relationships.edges.some((edge) => edge.targetType === "PEER_LEAD")
  );
  assert.ok(
    relationships.edges.some((edge) => edge.targetType === "ANALYTICS")
  );
});
