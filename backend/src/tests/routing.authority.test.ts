import assert from "node:assert/strict";
import {
  createInboxRouterService,
  type InboxRoutingRepository,
  type InboxRoutingDecision,
} from "../services/inboxRouter.service";
import type { InboundInteractionAuthorityRecord } from "../services/reception.shared";
import {
  createInboundInteractionFixture,
  createReceptionEventCollector,
  type TestCase,
} from "./reception.test.helpers";

const createInMemoryRoutingRepository = (
  interaction: InboundInteractionAuthorityRecord
) => {
  let current = {
    ...interaction,
  };

  const repository: InboxRoutingRepository = {
    applyRoutingDecision: async ({
      routing,
    }: {
      interactionId: string;
      routing: InboxRoutingDecision;
    }) => {
      current = {
        ...current,
        lifecycleState: "ROUTED",
        routeDecision: routing.routeDecision,
        priorityScore: routing.priorityScore,
        priorityLevel: routing.priorityLevel,
        slaDeadline: routing.slaDeadline,
      };
      return current;
    },
  };

  return {
    repository,
    getCurrent: () => current,
  };
};

export const routingAuthorityTests: TestCase[] = [
  {
    name: "routing authority persists a single deterministic route decision",
    run: async () => {
      const interaction = createInboundInteractionFixture({
        lifecycleState: "CLASSIFIED",
        intentClass: "BILLING",
        urgencyClass: "HIGH",
      });
      const repository = createInMemoryRoutingRepository(interaction);
      const collector = createReceptionEventCollector();
      const service = createInboxRouterService({
        repository: repository.repository,
        eventWriter: collector.writer,
      });

      const result = await service.applyRouting({
        interaction,
        classification: {
          intentClass: "BILLING",
          urgencyClass: "HIGH",
          sentimentClass: "NEUTRAL",
          spamScore: 0,
          routeHint: "BILLING",
          complaintSeverity: 0,
          reasons: ["intent:BILLING"],
        },
        priority: {
          score: 82,
          level: "CRITICAL",
          reasons: ["urgency:95"],
          components: {
            vipScore: 0,
            churnRisk: 40,
            customerValue: 30,
            urgency: 95,
            unresolvedCount: 0,
            complaintSeverity: 0,
            conversionOpportunity: 0,
            slaRisk: 0,
          },
        },
        sla: {
          priorityLevel: "CRITICAL",
          routeDecision: "BILLING",
          policyKeys: ["FIRST_RESPONSE"],
          firstResponseDeadline: new Date("2026-04-27T10:15:00.000Z"),
          escalationDeadline: new Date("2026-04-27T10:30:00.000Z"),
          reopenDeadline: null,
          effectiveSlaDeadline: new Date("2026-04-27T10:15:00.000Z"),
          reasons: ["policy:FIRST_RESPONSE"],
        },
        references: {
          consent: {
            status: "GRANTED",
            recordId: "consent_1",
          },
        },
      });

      assert.equal(result.routing.routeDecision, "BILLING");
      assert.equal(result.routing.priorityLevel, "CRITICAL");
      assert.equal(repository.getCurrent().lifecycleState, "ROUTED");
      assert.equal(repository.getCurrent().routeDecision, "BILLING");
      assert.equal(collector.events.length, 1);
      assert.equal(collector.events[0].type, "inbound.routed");
    },
  },
];
