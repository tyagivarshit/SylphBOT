import assert from "node:assert/strict";
import {
  DEFAULT_SLA_POLICY_MATRIX,
  evaluateSlaPolicy,
  evaluateSlaStatus,
} from "../services/slaPolicy.service";
import type { TestCase } from "./reception.test.helpers";

export const slaPolicyTests: TestCase[] = [
  {
    name: "sla policy applies stricter vip and complaint deadlines deterministically",
    run: () => {
      const now = new Date("2026-04-27T10:00:00.000Z");
      const decision = evaluateSlaPolicy({
        priorityLevel: "HIGH",
        routeDecision: "SUPPORT",
        isVip: true,
        isComplaint: true,
        now,
      });

      assert.equal(
        decision.firstResponseDeadline.toISOString(),
        "2026-04-27T10:10:00.000Z"
      );
      assert.ok(decision.policyKeys.includes("VIP"));
      assert.ok(decision.policyKeys.includes("COMPLAINT"));
    },
  },
  {
    name: "sla policy status moves from warning to breach deterministically",
    run: () => {
      const warning = evaluateSlaStatus({
        deadline: new Date("2026-04-27T10:10:00.000Z"),
        slaKind: "FIRST_RESPONSE",
        totalWindowMinutes: DEFAULT_SLA_POLICY_MATRIX.firstResponseMinutes.HIGH,
        now: new Date("2026-04-27T10:04:00.000Z"),
      });
      const breached = evaluateSlaStatus({
        deadline: new Date("2026-04-27T10:10:00.000Z"),
        slaKind: "FIRST_RESPONSE",
        totalWindowMinutes: DEFAULT_SLA_POLICY_MATRIX.firstResponseMinutes.HIGH,
        now: new Date("2026-04-27T10:12:00.000Z"),
      });

      assert.equal(warning.status, "WARNING");
      assert.equal(warning.eventType, "sla.warning");
      assert.equal(breached.status, "BREACHED");
      assert.equal(breached.eventType, "sla.breached");
      assert.equal(breached.overdueMinutes, 2);
    },
  },
];
