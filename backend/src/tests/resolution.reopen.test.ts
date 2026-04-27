import assert from "node:assert/strict";
import prisma from "../config/prisma";
import { createInteractionResolutionService } from "../services/interactionResolution.service";
import type { TestCase } from "./reception.test.helpers";

export const resolutionReopenTests: TestCase[] = [
  {
    name: "resolution service reopens only after resolve and returns to active work",
    run: async () => {
      const originalInteractionFindUnique = (prisma.inboundInteraction as any).findUnique;
      const originalInteractionUpdateMany = (prisma.inboundInteraction as any).updateMany;
      const originalQueueUpdateMany = (prisma.humanWorkQueue as any).updateMany;
      const originalMemoryFindUnique = (prisma.receptionMemory as any).findUnique;
      const originalMemoryUpsert = (prisma.receptionMemory as any).upsert;
      const originalTransaction = (prisma as any).$transaction;
      let interactionState = {
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
        normalizedPayload: {
          message: "Need support",
          language: "en",
        },
        fingerprint: "fp_1",
        intentClass: "SUPPORT",
        urgencyClass: "HIGH",
        sentimentClass: "NEGATIVE",
        spamScore: 0,
        priorityScore: 70,
        priorityLevel: "HIGH",
        routeDecision: "SUPPORT",
        assignedQueueId: "queue_1",
        assignedHumanId: null,
        slaDeadline: new Date("2026-04-27T10:30:00.000Z"),
        lifecycleState: "IN_PROGRESS",
        correlationId: "corr_1",
        traceId: "trace_1",
        metadata: {},
        createdAt: new Date("2026-04-27T10:00:00.000Z"),
        updatedAt: new Date("2026-04-27T10:00:00.000Z"),
      };
      let receptionMemoryState: any = null;

      try {
        (prisma as any).$transaction = async (callback: any) => callback(prisma);
        (prisma.inboundInteraction as any).findUnique = async ({ select }: any) => {
          if (
            select?.lifecycleState &&
            select?.metadata &&
            Object.keys(select).length === 2
          ) {
            return {
              lifecycleState: interactionState.lifecycleState,
              metadata: interactionState.metadata,
            };
          }

          return interactionState;
        };
        (prisma.inboundInteraction as any).updateMany = async ({ data }: any) => {
          interactionState = {
            ...interactionState,
            ...data,
            metadata: {
              ...(interactionState.metadata || {}),
              ...(data.metadata || {}),
            },
          };
          return {
            count: 1,
          };
        };
        (prisma.humanWorkQueue as any).updateMany = async () => ({ count: 1 });
        (prisma.receptionMemory as any).findUnique = async () => receptionMemoryState;
        (prisma.receptionMemory as any).upsert = async ({ create, update }: any) => {
          receptionMemoryState = receptionMemoryState
            ? {
                ...receptionMemoryState,
                ...update,
              }
            : {
                id: "memory_1",
                createdAt: new Date("2026-04-27T10:00:00.000Z"),
                updatedAt: new Date("2026-04-27T10:00:00.000Z"),
                ...create,
              };
          return receptionMemoryState;
        };

        const service = createInteractionResolutionService();
        const resolved = await service.resolve({
          interactionId: interactionState.id,
          resolutionCode: "FIXED",
          resolutionScore: 88,
        });
        const reopened = await service.reopen({
          interactionId: interactionState.id,
          reason: "customer_replied_again",
        });

        assert.equal(resolved.lifecycleState, "RESOLVED");
        assert.equal(reopened.lifecycleState, "REOPENED");
        assert.equal(receptionMemoryState.unresolvedCount, 1);
      } finally {
        (prisma.inboundInteraction as any).findUnique = originalInteractionFindUnique;
        (prisma.inboundInteraction as any).updateMany = originalInteractionUpdateMany;
        (prisma.humanWorkQueue as any).updateMany = originalQueueUpdateMany;
        (prisma.receptionMemory as any).findUnique = originalMemoryFindUnique;
        (prisma.receptionMemory as any).upsert = originalMemoryUpsert;
        (prisma as any).$transaction = originalTransaction;
      }
    },
  },
];
