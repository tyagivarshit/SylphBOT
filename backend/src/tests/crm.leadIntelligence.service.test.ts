import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLeadIntelligenceFromSnapshot } from "../services/crm/leadIntelligence.service";
import { createLeadIntelligenceSnapshot } from "./crm.test.helpers";

test("lead intelligence scoring stays deterministic for a booking-ready lead", () => {
  const snapshot = createLeadIntelligenceSnapshot();
  const profile = buildLeadIntelligenceFromSnapshot(snapshot, {
    source: "TEST",
  });

  assert.equal(profile.lifecycle.stage, "OPPORTUNITY");
  assert.equal(profile.behavior.predictedBehavior, "BOOKING_READY");
  assert.equal(profile.segments.primarySegment, "booking_ready");
  assert.equal(profile.value.valueTier, "STRATEGIC");
  assert.equal(profile.scorecard.engagementScore, 73);
  assert.equal(profile.scorecard.qualificationScore, 100);
  assert.equal(profile.scorecard.buyingIntentScore, 100);
  assert.equal(profile.scorecard.compositeScore, 100);
});
