import assert from "node:assert/strict";
import prisma from "../config/prisma";
import { getInboxDashboardProjection } from "../services/inboxDashboardProjection.service";
import {
  buildReceptionEventEnvelope,
} from "../services/receptionEvent.service";
import type { TestCase } from "./reception.test.helpers";

export const dashboardProjectionTests: TestCase[] = [
  {
    name: "dashboard projection is derived only from reception outbox events",
    run: async () => {
      const originalFindMany = (prisma.eventOutbox as any).findMany;

      try {
        (prisma.eventOutbox as any).findMany = async () => [
          {
            eventType: "inbound.routed",
            payload: buildReceptionEventEnvelope({
              event: "inbound.routed",
              aggregateType: "inbound_interaction",
              aggregateId: "interaction_1",
              payload: {
                interactionId: "interaction_1",
                businessId: "business_1",
                leadId: "lead_1",
                routeDecision: "SUPPORT",
                priorityScore: 90,
                priorityLevel: "CRITICAL",
                slaDeadline: "2026-04-27T10:15:00.000Z",
                lifecycleState: "ROUTED",
                requiresHumanQueue: true,
                reasons: ["vipScore:85"],
                traceId: "trace_1",
              },
            }),
          },
          {
            eventType: "human.assigned",
            payload: buildReceptionEventEnvelope({
              event: "human.assigned",
              aggregateType: "human_work_queue",
              aggregateId: "queue_1",
              payload: {
                queueId: "queue_1",
                interactionId: "interaction_1",
                businessId: "business_1",
                leadId: "lead_1",
                routeDecision: "SUPPORT",
                queueType: "SUPPORT",
                assignedRole: "CUSTOMER_SUPPORT",
                assignedHumanId: null,
                state: "PENDING",
                priority: "CRITICAL",
                slaDeadline: "2026-04-27T10:15:00.000Z",
                escalationAt: "2026-04-27T10:10:00.000Z",
                traceId: "trace_1",
              },
            }),
          },
          {
            eventType: "sla.warning",
            payload: buildReceptionEventEnvelope({
              event: "sla.warning",
              aggregateType: "inbound_interaction",
              aggregateId: "interaction_1",
              payload: {
                interactionId: "interaction_1",
                businessId: "business_1",
                leadId: "lead_1",
                queueId: "queue_1",
                slaKind: "FIRST_RESPONSE",
                deadline: "2026-04-27T10:15:00.000Z",
                remainingMinutes: 4,
                priorityLevel: "CRITICAL",
                routeDecision: "SUPPORT",
                traceId: "trace_1",
              },
            }),
          },
          {
            eventType: "interaction.reopened",
            payload: buildReceptionEventEnvelope({
              event: "interaction.reopened",
              aggregateType: "reception_memory",
              aggregateId: "memory_1",
              payload: {
                interactionId: "interaction_1",
                businessId: "business_1",
                leadId: "lead_1",
                queueId: "queue_1",
                lifecycleState: "REOPENED",
                reopenedAt: "2026-04-27T11:00:00.000Z",
                reason: "follow_up_needed",
                traceId: "trace_1",
              },
            }),
          },
        ];

        const projection = await getInboxDashboardProjection({
          businessId: "business_1",
        });

        assert.equal(projection.openQueues, 1);
        assert.equal(projection.slaRisk.warnings, 1);
        assert.equal(projection.criticalUnresolved, 1);
        assert.equal(projection.spamVolume, 0);
        assert.equal(projection.vipWaiting, 1);
        assert.ok(projection.reopenRate >= 0);
      } finally {
        (prisma.eventOutbox as any).findMany = originalFindMany;
      }
    },
  },
];
