import prisma from "../config/prisma";
import {
  RECEPTION_EVENT_TYPES,
  type ReceptionEventEnvelope,
} from "./receptionEvent.service";
import { HUMAN_OPS_EVENT_TYPES } from "./humanOpsEvent.service";
import { createHumanPerformanceService } from "./humanPerformance.service";

type InteractionProjectionState = {
  routeDecision: string | null;
  priorityLevel: string | null;
  resolved: boolean;
  reopened: boolean;
  vipWaiting: boolean;
};

export const getInboxDashboardProjection = async ({
  businessId,
}: {
  businessId?: string | null;
} = {}) => {
  const events = await prisma.eventOutbox.findMany({
    where: {
      eventType: {
        in: [
          ...RECEPTION_EVENT_TYPES,
          ...HUMAN_OPS_EVENT_TYPES,
        ],
      },
      ...(businessId ? { businessId } : {}),
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      payload: true,
      eventType: true,
    },
  });
  const interactionState = new Map<string, InteractionProjectionState>();
  const queueState = new Map<
    string,
    { queueType: string; state: string; assignedRole: string }
  >();
  let slaWarning = 0;
  let slaBreach = 0;
  let spamVolume = 0;
  let resolvedCount = 0;
  let reopenedCount = 0;

  for (const row of events) {
    const envelope = row.payload as ReceptionEventEnvelope;
    const payload = envelope.payload as Record<string, any>;
    const interactionId = String(payload.interactionId || "");

    if (row.eventType === "inbound.classified" && Number(payload.spamScore || 0) >= 0.85) {
      spamVolume += 1;
    }

    if (row.eventType === "inbound.routed" && interactionId) {
      const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
      interactionState.set(interactionId, {
        routeDecision: String(payload.routeDecision || ""),
        priorityLevel: String(payload.priorityLevel || ""),
        resolved: false,
        reopened: false,
        vipWaiting: reasons.some((reason: unknown) =>
          String(reason || "").startsWith("vipScore:")
        ),
      });

      if (payload.routeDecision === "SPAM_BIN") {
        spamVolume += 1;
      }
    }

    if (row.eventType === "human.assigned") {
      queueState.set(String(payload.queueId || envelope.aggregateId), {
        queueType: String(payload.queueType || "UNKNOWN"),
        state: String(payload.state || "PENDING"),
        assignedRole: String(payload.assignedRole || "UNKNOWN"),
      });
    }

    if (row.eventType === "sla.warning") {
      slaWarning += 1;
    }

    if (row.eventType === "sla.breached") {
      slaBreach += 1;
    }

    if (row.eventType === "interaction.resolved" && interactionId) {
      const current = interactionState.get(interactionId);

      if (current) {
        current.resolved = true;
        current.reopened = false;
        interactionState.set(interactionId, current);
      }

      resolvedCount += 1;
    }

    if (row.eventType === "human.resolved" && interactionId) {
      const current = interactionState.get(interactionId) || {
        routeDecision: "HUMAN_QUEUE",
        priorityLevel: "MEDIUM",
        resolved: false,
        reopened: false,
        vipWaiting: false,
      };
      current.resolved = true;
      current.reopened = false;
      interactionState.set(interactionId, current);
      resolvedCount += 1;
    }

    if (row.eventType === "handoff.closed" && interactionId) {
      const current = interactionState.get(interactionId) || {
        routeDecision: "HUMAN_QUEUE",
        priorityLevel: "MEDIUM",
        resolved: false,
        reopened: false,
        vipWaiting: false,
      };
      current.resolved = true;
      current.reopened = false;
      interactionState.set(interactionId, current);
    }

    if (row.eventType === "interaction.reopened" && interactionId) {
      const current = interactionState.get(interactionId) || {
        routeDecision: "HUMAN_QUEUE",
        priorityLevel: "MEDIUM",
        resolved: false,
        reopened: false,
        vipWaiting: false,
      };
      current.reopened = true;
      current.resolved = false;
      interactionState.set(interactionId, current);

      reopenedCount += 1;
    }
  }

  const openInteractions = Array.from(interactionState.values()).filter(
    (state) =>
      !state.resolved &&
      state.routeDecision &&
      state.routeDecision !== "SPAM_BIN"
  );
  const queueEntries = Array.from(queueState.values()).filter(
    (queue) => !["RESOLVED", "CLOSED"].includes(queue.state)
  );
  const humanWorkload = queueEntries.reduce<Record<string, number>>((state, queue) => {
    state[queue.queueType] = (state[queue.queueType] || 0) + 1;
    return state;
  }, {});

  return {
    openQueues: queueEntries.length,
    slaRisk: {
      warnings: slaWarning,
      breaches: slaBreach,
    },
    criticalUnresolved: openInteractions.filter(
      (state) => state.priorityLevel === "CRITICAL"
    ).length,
    humanWorkload,
    spamVolume,
    vipWaiting: openInteractions.filter((state) => state.vipWaiting).length,
    reopenRate:
      resolvedCount > 0 ? reopenedCount / Math.max(1, resolvedCount) : 0,
  };
};

export const getOwnerCopilotProjection = async ({
  businessId,
  emitEvent = false,
}: {
  businessId: string;
  emitEvent?: boolean;
}) => {
  const performance = createHumanPerformanceService();
  return performance.buildOwnerCopilotFeed({
    businessId,
    emitEvent,
  });
};
