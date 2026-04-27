import assert from "node:assert/strict";
import prisma from "../config/prisma";
import * as receptionEvents from "../services/receptionEvent.service";
import { runInboundSlaMonitor } from "../services/inboundSlaMonitor.service";
import type { TestCase } from "./reception.test.helpers";

export const slaWarningTests: TestCase[] = [
  {
    name: "sla monitor emits warning and escalates priority before breach",
    run: async () => {
      const originalQueueFindMany = (prisma.humanWorkQueue as any).findMany;
      const originalQueueFindUnique = (prisma.humanWorkQueue as any).findUnique;
      const originalQueueUpdate = (prisma.humanWorkQueue as any).update;
      const originalQueueGroupBy = (prisma.humanWorkQueue as any).groupBy;
      const originalInteractionFindMany = (prisma.inboundInteraction as any).findMany;
      const originalInteractionFindUnique = (prisma.inboundInteraction as any).findUnique;
      const originalInteractionUpdate = (prisma.inboundInteraction as any).update;
      const originalPublish = (receptionEvents as any).publishReceptionEvent;
      const originalTransaction = (prisma as any).$transaction;
      const events: string[] = [];
      const queueUpdates: any[] = [];
      const interactionUpdates: any[] = [];

      try {
        (prisma.humanWorkQueue as any).findMany = async () => [
          {
            id: "queue_1",
            queueType: "SUPPORT",
            assignedRole: "CUSTOMER_SUPPORT",
            priority: "LOW",
            state: "PENDING",
            slaDeadline: new Date("2026-04-27T10:04:00.000Z"),
            interaction: {
              id: "interaction_1",
              businessId: "business_1",
              leadId: "lead_1",
              clientId: "client_1",
              channel: "WHATSAPP",
              providerMessageId: "wamid.1",
              externalInteractionKey: "inbound:1",
              interactionType: "MESSAGE",
              direction: "INBOUND",
              payload: {},
              normalizedPayload: {},
              fingerprint: "fp_1",
              lifecycleState: "ROUTED",
              intentClass: "SUPPORT",
              urgencyClass: "MEDIUM",
              sentimentClass: "NEUTRAL",
              spamScore: 0,
              priorityScore: 20,
              priorityLevel: "LOW",
              routeDecision: "SUPPORT",
              assignedQueueId: "queue_1",
              assignedHumanId: null,
              slaDeadline: new Date("2026-04-27T10:04:00.000Z"),
              correlationId: "corr_1",
              traceId: "trace_1",
              metadata: {},
              createdAt: new Date("2026-04-27T10:00:00.000Z"),
              updatedAt: new Date("2026-04-27T10:00:00.000Z"),
            },
          },
        ];
        (prisma as any).$transaction = async (callback: any) => callback(prisma);
        (prisma.humanWorkQueue as any).findUnique = async () => ({
          metadata: {},
        });
        (prisma.humanWorkQueue as any).update = async (input: any) => {
          queueUpdates.push(input.data);
          return input;
        };
        (prisma.humanWorkQueue as any).groupBy = async () => [
          {
            queueType: "SUPPORT",
            _count: {
              _all: 1,
            },
          },
        ];
        (prisma.inboundInteraction as any).findMany = async () => [];
        (prisma.inboundInteraction as any).findUnique = async () => ({
          metadata: {},
        });
        (prisma.inboundInteraction as any).update = async (input: any) => {
          interactionUpdates.push(input.data);
          return input;
        };
        (receptionEvents as any).publishReceptionEvent = async (input: any) => {
          events.push(input.event);
          return input;
        };

        const result = await runInboundSlaMonitor({
          now: new Date("2026-04-27T10:00:00.000Z"),
        });

        assert.equal(result.emitted, 1);
        assert.deepEqual(events, ["sla.warning"]);
        assert.equal(interactionUpdates[0].priorityLevel, "MEDIUM");
        assert.equal(queueUpdates[0].priority, "MEDIUM");
      } finally {
        (prisma.humanWorkQueue as any).findMany = originalQueueFindMany;
        (prisma.humanWorkQueue as any).findUnique = originalQueueFindUnique;
        (prisma.humanWorkQueue as any).update = originalQueueUpdate;
        (prisma.humanWorkQueue as any).groupBy = originalQueueGroupBy;
        (prisma.inboundInteraction as any).findMany = originalInteractionFindMany;
        (prisma.inboundInteraction as any).findUnique = originalInteractionFindUnique;
        (prisma.inboundInteraction as any).update = originalInteractionUpdate;
        (receptionEvents as any).publishReceptionEvent = originalPublish;
        (prisma as any).$transaction = originalTransaction;
      }
    },
  },
];
