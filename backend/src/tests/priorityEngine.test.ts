import assert from "node:assert/strict";
import { scoreInboundPriority } from "../services/priorityEngine.service";
import type { TestCase } from "./reception.test.helpers";

export const priorityEngineTests: TestCase[] = [
  {
    name: "priority engine elevates compound vip complaint risk to critical",
    run: () => {
      const decision = scoreInboundPriority({
        vipScore: 90,
        churnRisk: "HIGH",
        customerValue: 85,
        urgencyClass: "CRITICAL",
        unresolvedCount: 3,
        complaintSeverity: 88,
        conversionOpportunity: 70,
        slaRisk: 95,
      });

      assert.equal(decision.level, "CRITICAL");
      assert.ok(decision.score >= 80);
      assert.ok(decision.reasons.some((reason) => reason.startsWith("vipScore:")));
    },
  },
  {
    name: "priority engine keeps low-signal inbound work at low priority",
    run: () => {
      const decision = scoreInboundPriority({
        vipScore: 5,
        churnRisk: "LOW",
        customerValue: 10,
        urgencyClass: "LOW",
        unresolvedCount: 0,
        complaintSeverity: 0,
        conversionOpportunity: 15,
        slaRisk: 5,
      });

      assert.equal(decision.level, "LOW");
      assert.ok(decision.score < 35);
    },
  },
];
