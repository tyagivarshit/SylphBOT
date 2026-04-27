import assert from "node:assert/strict";
import { resolveInboxRouting } from "../services/inboxRouter.service";
import {
  createInboundInteractionFixture,
  type TestCase,
} from "./reception.test.helpers";

export const spamFailClosedTests: TestCase[] = [
  {
    name: "spam routing fail-closes into tracked spam bin authority",
    run: () => {
      const interaction = createInboundInteractionFixture({
        lifecycleState: "CLASSIFIED",
      });

      const routing = resolveInboxRouting({
        interaction,
        classification: {
          intentClass: "SPAM",
          urgencyClass: "LOW",
          sentimentClass: "NEUTRAL",
          spamScore: 0.97,
          routeHint: "SPAM_BIN",
          complaintSeverity: 0,
          reasons: ["spam_threshold_exceeded"],
        },
        priority: {
          score: 9,
          level: "LOW",
          reasons: ["baseline_operational_priority"],
          components: {
            vipScore: 0,
            churnRisk: 0,
            customerValue: 0,
            urgency: 0,
            unresolvedCount: 0,
            complaintSeverity: 0,
            conversionOpportunity: 0,
            slaRisk: 0,
          },
        },
        sla: {
          priorityLevel: "LOW",
          routeDecision: "SPAM_BIN",
          policyKeys: ["FIRST_RESPONSE"],
          firstResponseDeadline: new Date("2026-04-27T11:00:00.000Z"),
          escalationDeadline: new Date("2026-04-27T12:00:00.000Z"),
          reopenDeadline: null,
          effectiveSlaDeadline: new Date("2026-04-27T11:00:00.000Z"),
          reasons: ["policy:FIRST_RESPONSE"],
        },
      });

      assert.equal(routing.routeDecision, "SPAM_BIN");
      assert.equal(routing.requiresHumanQueue, false);
      assert.equal(routing.slaDeadline, null);
    },
  },
];
