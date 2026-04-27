import assert from "node:assert/strict";
import prisma from "../config/prisma";
import * as receptionQueue from "../queues/receptionRuntime.queue";
import { receiveInboundInteraction } from "../services/receptionIntake.service";
import type { TestCase } from "./reception.test.helpers";

const buildStoredInteraction = (create: any) => ({
  id: "interaction_1",
  businessId: create.businessId,
  leadId: create.leadId,
  clientId: create.clientId || null,
  channel: create.channel,
  providerMessageId: create.providerMessageId || null,
  externalInteractionKey: create.externalInteractionKey,
  interactionType: create.interactionType,
  direction: "INBOUND",
  payload: create.payload,
  normalizedPayload: null,
  fingerprint: null,
  lifecycleState: create.lifecycleState || "RECEIVED",
  intentClass: null,
  urgencyClass: null,
  sentimentClass: null,
  spamScore: 0,
  priorityScore: 0,
  priorityLevel: null,
  routeDecision: null,
  assignedQueueId: null,
  assignedHumanId: null,
  slaDeadline: null,
  correlationId: create.correlationId || null,
  traceId: create.traceId || null,
  metadata: create.metadata || {},
  createdAt: new Date("2026-04-27T10:00:00.000Z"),
  updatedAt: new Date("2026-04-27T10:00:00.000Z"),
});

export const inboundIdempotencyTests: TestCase[] = [
  {
    name: "inbound intake is idempotent on external interaction authority key",
    run: async () => {
      const originalFindUnique = (prisma.inboundInteraction as any).findUnique;
      const originalUpsert = (prisma.inboundInteraction as any).upsert;
      const originalEnqueueNormalization = (receptionQueue as any).enqueueInboundNormalization;
      const originalEnqueueClassification = (receptionQueue as any).enqueueInboundClassification;
      const originalEnqueueRouting = (receptionQueue as any).enqueueInboundRouting;
      const originalEnqueueBridge = (receptionQueue as any).enqueueRevenueBrainBridge;
      const store = new Map<string, any>();
      const queueCalls: string[] = [];

      try {
        (receptionQueue as any).enqueueInboundNormalization = async (payload: any) => {
          queueCalls.push(`normalize:${payload.externalInteractionKey}`);
          return payload;
        };
        (receptionQueue as any).enqueueInboundClassification = async (payload: any) => {
          queueCalls.push(`classify:${payload.externalInteractionKey}`);
          return payload;
        };
        (receptionQueue as any).enqueueInboundRouting = async (payload: any) => {
          queueCalls.push(`route:${payload.externalInteractionKey}`);
          return payload;
        };
        (receptionQueue as any).enqueueRevenueBrainBridge = async (payload: any) => {
          queueCalls.push(`bridge:${payload.externalInteractionKey}`);
          return payload;
        };
        (prisma.inboundInteraction as any).findUnique = async ({ where }: any) => {
          if (where.externalInteractionKey) {
            const row = store.get(where.externalInteractionKey);
            return row
              ? {
                  id: row.id,
                  metadata: row.metadata,
                }
              : null;
          }

          return null;
        };
        (prisma.inboundInteraction as any).upsert = async ({ where, update, create }: any) => {
          const existing = store.get(where.externalInteractionKey);

          if (existing) {
            const updated = {
              ...existing,
              ...update,
              updatedAt: new Date("2026-04-27T10:01:00.000Z"),
            };
            store.set(where.externalInteractionKey, updated);
            return updated;
          }

          const created = buildStoredInteraction(create);
          store.set(where.externalInteractionKey, created);
          return created;
        };

        const command = {
          businessId: "business_1",
          leadId: "lead_1",
          clientId: "client_1",
          adapter: "WHATSAPP" as const,
          payload: {
            messages: [
              {
                id: "wamid.idempotent",
                from: "+919999999999",
                timestamp: "2026-04-27T10:00:00.000Z",
                text: {
                  body: "Can I see pricing?",
                },
              },
            ],
            contacts: [
              {
                wa_id: "+919999999999",
                profile: {
                  name: "Aarav",
                },
              },
            ],
          },
          traceId: "trace_1",
          correlationId: "corr_1",
        };

        const first = await receiveInboundInteraction(command);
        const second = await receiveInboundInteraction(command);

        assert.equal(first.interaction.id, second.interaction.id);
        assert.equal(first.created, true);
        assert.equal(second.created, false);
        assert.equal(store.size, 1);
        assert.equal(queueCalls.length, 2);
        assert.equal(queueCalls[0], queueCalls[1]);
      } finally {
        (prisma.inboundInteraction as any).findUnique = originalFindUnique;
        (prisma.inboundInteraction as any).upsert = originalUpsert;
        (receptionQueue as any).enqueueInboundNormalization = originalEnqueueNormalization;
        (receptionQueue as any).enqueueInboundClassification = originalEnqueueClassification;
        (receptionQueue as any).enqueueInboundRouting = originalEnqueueRouting;
        (receptionQueue as any).enqueueRevenueBrainBridge = originalEnqueueBridge;
      }
    },
  },
];
