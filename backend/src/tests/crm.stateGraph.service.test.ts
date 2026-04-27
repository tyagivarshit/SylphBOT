import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLeadIntelligenceFromSnapshot } from "../services/crm/leadIntelligence.service";
import { createLeadIntelligenceSnapshot } from "./crm.test.helpers";

test("unified state keeps booked leads separate from converted leads", () => {
  const snapshot = createLeadIntelligenceSnapshot({
    lead: {
      stage: "BOOKED_CALL",
      revenueState: "HOT",
      lastBookedAt: new Date("2026-04-26T11:50:00.000Z"),
      lastConvertedAt: null,
    } as any,
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
  const profile = buildLeadIntelligenceFromSnapshot(snapshot, {
    source: "TEST",
  });

  assert.equal(profile.stateGraph.lifecycle.stage, "BOOKED");
  assert.equal(profile.stateGraph.commercial.state, "HOT");
  assert.equal(profile.stateGraph.conversion.state, "BOOKED");
  assert.equal(profile.stateGraph.consistency.isConsistent, true);
});
