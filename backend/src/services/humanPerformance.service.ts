import prisma from "../config/prisma";
import { publishHumanOpsEvent } from "./humanOpsEvent.service";

export type OwnerCopilotFeedProjection = {
  businessId: string;
  overloadedReps: number;
  assignmentLatencyMsP95: number;
  escalationHotspots: Array<{ queueType: string; openEscalations: number }>;
  closureQuality: {
    averageResolutionScore: number;
    sampleSize: number;
  };
  queueImbalance: {
    queueDepths: Record<string, number>;
    imbalanceScore: number;
  };
  unresolvedCriticals: number;
  generatedAt: string;
};

const computePercentile = (values: number[], percentile: number) => {
  if (!values.length) {
    return 0;
  }

  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * ordered.length) - 1)
  );
  return ordered[index];
};

const toTimestamp = (value: unknown) => {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

export const createHumanPerformanceService = () => ({
  buildOwnerCopilotFeed: async ({
    businessId,
    now = new Date(),
    emitEvent = false,
  }: {
    businessId: string;
    now?: Date;
    emitEvent?: boolean;
  }): Promise<OwnerCopilotFeedProjection> => {
    const [availability, queues, outboxRows, memories] = await Promise.all([
      prisma.humanAvailabilityState.findMany({
        where: {
          businessId,
        },
        select: {
          state: true,
        },
      }),
      prisma.humanWorkQueue.findMany({
        where: {
          businessId,
        },
        select: {
          queueType: true,
          state: true,
          priority: true,
          createdAt: true,
          metadata: true,
        },
      }),
      prisma.eventOutbox.findMany({
        where: {
          businessId,
          eventType: {
            in: ["human.assigned.deterministic"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 2000,
        select: {
          createdAt: true,
          payload: true,
        },
      }),
      prisma.receptionMemory.findMany({
        where: {
          businessId,
        },
        select: {
          lastResolutionScore: true,
        },
      }),
    ]);

    const overloadedReps = availability.filter(
      (row) => String(row.state || "").toUpperCase() === "OVERLOADED"
    ).length;
    const assignmentLatencies = outboxRows
      .map((row) => {
        const payload = row.payload as Record<string, any>;
        const occurredAtMs = toTimestamp(payload?.occurredAt) || row.createdAt.getTime();
        const assignmentPayload = (payload?.payload || {}) as Record<string, any>;
        const createdAtMs = toTimestamp(assignmentPayload?.createdAt);

        return createdAtMs ? Math.max(0, occurredAtMs - createdAtMs) : null;
      })
      .filter((value): value is number => typeof value === "number");
    const assignmentLatencyMsP95 = computePercentile(assignmentLatencies, 95);
    const queueDepths = queues.reduce<Record<string, number>>((state, queue) => {
      if (["RESOLVED", "CLOSED"].includes(String(queue.state || "").toUpperCase())) {
        return state;
      }

      const key = String(queue.queueType || "UNKNOWN");
      state[key] = (state[key] || 0) + 1;
      return state;
    }, {});
    const depthValues = Object.values(queueDepths);
    const imbalanceScore =
      depthValues.length <= 1
        ? 0
        : Math.max(...depthValues) - Math.min(...depthValues);
    const escalationHotspotMap = queues.reduce<Record<string, number>>(
      (state, queue) => {
        if (String(queue.state || "").toUpperCase() !== "ESCALATED") {
          return state;
        }

        const key = String(queue.queueType || "UNKNOWN");
        state[key] = (state[key] || 0) + 1;
        return state;
      },
      {}
    );
    const escalationHotspots = Object.entries(escalationHotspotMap)
      .map(([queueType, openEscalations]) => ({
        queueType,
        openEscalations,
      }))
      .sort((left, right) => right.openEscalations - left.openEscalations);
    const resolutionScores = memories
      .map((memory) => memory.lastResolutionScore)
      .filter((score): score is number => typeof score === "number");
    const averageResolutionScore = resolutionScores.length
      ? resolutionScores.reduce((sum, score) => sum + score, 0) /
        resolutionScores.length
      : 0;
    const unresolvedCriticals = queues.filter(
      (queue) =>
        String(queue.priority || "").toUpperCase() === "CRITICAL" &&
        !["RESOLVED", "CLOSED"].includes(String(queue.state || "").toUpperCase())
    ).length;
    const projection: OwnerCopilotFeedProjection = {
      businessId,
      overloadedReps,
      assignmentLatencyMsP95,
      escalationHotspots,
      closureQuality: {
        averageResolutionScore,
        sampleSize: resolutionScores.length,
      },
      queueImbalance: {
        queueDepths,
        imbalanceScore,
      },
      unresolvedCriticals,
      generatedAt: now.toISOString(),
    };

    if (emitEvent) {
      await publishHumanOpsEvent({
        event: "owner.copilot.updated",
        businessId,
        aggregateType: "owner_copilot_feed",
        aggregateId: businessId,
        eventKey: now.toISOString(),
        payload: {
          businessId,
          overloadedReps: projection.overloadedReps,
          unresolvedCriticals: projection.unresolvedCriticals,
          queueImbalanceScore: projection.queueImbalance.imbalanceScore,
          assignmentLatencyMsP95: projection.assignmentLatencyMsP95,
        },
      });
    }

    return projection;
  },
});
