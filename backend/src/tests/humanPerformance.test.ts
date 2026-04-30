import assert from "node:assert/strict";
import prisma from "../config/prisma";
import { createHumanPerformanceService } from "../services/humanPerformance.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const humanPerformanceTests: TestCase[] = [
  {
    name: "owner copilot projection is derived-only and highlights overload and imbalance",
    run: async () => {
      const originalAvailabilityFindMany = (prisma.humanAvailabilityState as any).findMany;
      const originalQueueFindMany = (prisma.humanWorkQueue as any).findMany;
      const originalOutboxFindMany = (prisma.eventOutbox as any).findMany;
      const originalMemoryFindMany = (prisma.receptionMemory as any).findMany;

      try {
        (prisma.humanAvailabilityState as any).findMany = async () => [
          { state: "OVERLOADED" },
          { state: "AVAILABLE" },
          { state: "OVERLOADED" },
        ];
        (prisma.humanWorkQueue as any).findMany = async () => [
          {
            queueType: "SUPPORT",
            state: "ESCALATED",
            priority: "CRITICAL",
            createdAt: new Date("2026-04-28T11:00:00.000Z"),
            metadata: {},
          },
          {
            queueType: "SUPPORT",
            state: "ASSIGNED",
            priority: "HIGH",
            createdAt: new Date("2026-04-28T11:00:00.000Z"),
            metadata: {},
          },
          {
            queueType: "BILLING",
            state: "PENDING",
            priority: "MEDIUM",
            createdAt: new Date("2026-04-28T11:00:00.000Z"),
            metadata: {},
          },
        ];
        (prisma.eventOutbox as any).findMany = async () => [
          {
            createdAt: new Date("2026-04-28T11:20:00.000Z"),
            payload: {
              occurredAt: "2026-04-28T11:20:00.000Z",
              payload: {
                createdAt: "2026-04-28T11:00:00.000Z",
              },
            },
          },
          {
            createdAt: new Date("2026-04-28T11:25:00.000Z"),
            payload: {
              occurredAt: "2026-04-28T11:25:00.000Z",
              payload: {
                createdAt: "2026-04-28T11:00:00.000Z",
              },
            },
          },
        ];
        (prisma.receptionMemory as any).findMany = async () => [
          {
            lastResolutionScore: 0.9,
          },
          {
            lastResolutionScore: 0.7,
          },
        ];

        const service = createHumanPerformanceService();
        const projection = await service.buildOwnerCopilotFeed({
          businessId: "business_1",
        });

        assert.equal(projection.overloadedReps, 2);
        assert.equal(projection.unresolvedCriticals, 1);
        assert.equal(projection.queueImbalance.imbalanceScore, 1);
        assert.equal(projection.escalationHotspots[0].queueType, "SUPPORT");
        assert.ok(projection.assignmentLatencyMsP95 >= 1_200_000);
        assert.ok(projection.closureQuality.averageResolutionScore > 0.7);
      } finally {
        (prisma.humanAvailabilityState as any).findMany = originalAvailabilityFindMany;
        (prisma.humanWorkQueue as any).findMany = originalQueueFindMany;
        (prisma.eventOutbox as any).findMany = originalOutboxFindMany;
        (prisma.receptionMemory as any).findMany = originalMemoryFindMany;
      }
    },
  },
];
