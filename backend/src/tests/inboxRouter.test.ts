import assert from "node:assert/strict";
import { resolveInboxRouting } from "../services/inboxRouter.service";
import type { PriorityDecision } from "../services/priorityEngine.service";
import type { ReceptionClassification } from "../services/receptionClassifier.service";
import { evaluateSlaPolicy } from "../services/slaPolicy.service";
import {
  createInboundInteractionFixture,
  createReceptionMemoryFixture,
  type TestCase,
} from "./reception.test.helpers";

const criticalPriority: PriorityDecision = {
  score: 88,
  level: "CRITICAL",
  reasons: ["vipScore:90", "urgency:95"],
  components: {
    vipScore: 90,
    churnRisk: 70,
    customerValue: 80,
    urgency: 95,
    unresolvedCount: 54,
    complaintSeverity: 85,
    conversionOpportunity: 50,
    slaRisk: 90,
  },
};

export const inboxRouterTests: TestCase[] = [
  {
    name: "inbox router escalates critical repeated complaints",
    run: () => {
      const interaction = createInboundInteractionFixture();
      const classification: ReceptionClassification = {
        intentClass: "COMPLAINT",
        urgencyClass: "CRITICAL",
        sentimentClass: "NEGATIVE",
        spamScore: 0.05,
        routeHint: "SUPPORT",
        complaintSeverity: 90,
        reasons: ["intent:COMPLAINT", "urgency:CRITICAL"],
      };
      const routing = resolveInboxRouting({
        interaction,
        classification,
        priority: criticalPriority,
        sla: evaluateSlaPolicy({
          priorityLevel: criticalPriority.level,
          routeDecision: "SUPPORT",
          isComplaint: true,
          now: new Date("2026-04-27T10:00:00.000Z"),
        }),
        receptionMemory: createReceptionMemoryFixture({
          unresolvedCount: 2,
          complaintCount: 1,
        }),
        references: {
          consent: {
            status: "GRANTED",
            recordId: "consent_1",
          },
        },
      });

      assert.equal(routing.routeDecision, "ESCALATION");
      assert.equal(routing.requiresHumanQueue, true);
      assert.ok(routing.slaDeadline instanceof Date);
    },
  },
  {
    name: "inbox router quarantines spam interactions",
    run: () => {
      const interaction = createInboundInteractionFixture();
      const classification: ReceptionClassification = {
        intentClass: "SPAM",
        urgencyClass: "LOW",
        sentimentClass: "NEUTRAL",
        spamScore: 0.98,
        routeHint: "SPAM_BIN",
        complaintSeverity: 0,
        reasons: ["spam_threshold_exceeded"],
      };
      const routing = resolveInboxRouting({
        interaction,
        classification,
        priority: {
          score: 8,
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
        sla: evaluateSlaPolicy({
          priorityLevel: "LOW",
          routeDecision: "SPAM_BIN",
          now: new Date("2026-04-27T10:00:00.000Z"),
        }),
        references: {
          consent: {
            status: "GRANTED",
            recordId: "consent_1",
          },
        },
      });

      assert.equal(routing.routeDecision, "SPAM_BIN");
      assert.equal(routing.slaDeadline, null);
    },
  },
];
