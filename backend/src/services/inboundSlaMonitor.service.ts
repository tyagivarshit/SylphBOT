import prisma from "../config/prisma";
import { acquireDistributedLock } from "./distributedLock.service";
import {
  INBOUND_INTERACTION_SELECT,
  toInboundInteractionRecord,
} from "./interactionNormalizer.service";
import {
  buildReceptionEventDedupeKey,
  publishReceptionEvent,
} from "./receptionEvent.service";
import {
  evaluateSlaStatus,
  type SlaPolicyKey,
} from "./slaPolicy.service";
import {
  incrementReceptionMetric,
  setReceptionQueueDepth,
} from "./receptionMetrics.service";
import {
  mergeJsonRecords,
  toRecord,
  type InboxRouteTarget,
  type PriorityLevel,
} from "./reception.shared";
import {
  resolveHumanQueueAssignment,
  upsertHumanQueueAssignmentInTx,
} from "./humanQueue.service";

const INBOUND_SLA_MONITOR_LEADER_KEY = "inbound-sla-monitor:leader";
const INBOUND_SLA_MONITOR_LEASE_MS = 90_000;
const INBOUND_SLA_MONITOR_REFRESH_MS = 30_000;

const globalForInboundSlaMonitor = globalThis as typeof globalThis & {
  __sylphInboundSlaMonitorRun?: Promise<any> | null;
};

const PRIORITY_ORDER: PriorityLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const PRIORITY_SCORES: Record<PriorityLevel, number> = {
  LOW: 20,
  MEDIUM: 45,
  HIGH: 70,
  CRITICAL: 95,
};

const escalatePriorityLevel = (current: PriorityLevel | null | undefined) => {
  const index = Math.max(0, PRIORITY_ORDER.indexOf(current || "LOW"));
  return PRIORITY_ORDER[Math.min(PRIORITY_ORDER.length - 1, index + 1)];
};

const buildSlaCheckpointKey = ({
  eventType,
  deadline,
}: {
  eventType: "sla.warning" | "sla.breached";
  deadline: Date;
}) => `${eventType}:${deadline.toISOString()}`;

const updateQueueDepths = async () => {
  const grouped = await prisma.humanWorkQueue.groupBy({
    by: ["queueType"],
    where: {
      state: {
        in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ESCALATED"],
      },
    },
    _count: {
      _all: true,
    },
  });

  for (const row of grouped) {
    setReceptionQueueDepth(row.queueType, row._count._all);
  }
};

const loadHumanQueueCandidates = async () =>
  prisma.humanWorkQueue.findMany({
    where: {
      state: {
        in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ESCALATED"],
      },
      slaDeadline: {
        not: null,
      },
    },
    include: {
      interaction: {
        select: INBOUND_INTERACTION_SELECT,
      },
    },
  });

const loadInteractionCandidatesWithoutQueue = async () =>
  prisma.inboundInteraction.findMany({
    where: {
      routeDecision: {
        not: null,
      },
      humanWorkQueue: null,
      slaDeadline: {
        not: null,
      },
      lifecycleState: {
        in: ["ROUTED", "IN_PROGRESS", "REOPENED"] as any,
      },
    },
    select: INBOUND_INTERACTION_SELECT,
  });

const emitSlaEvent = async ({
  event,
  interaction,
  queueId,
  deadline,
  remainingMinutes,
  overdueMinutes,
  priorityLevel,
  routeDecision,
  slaKind,
  now,
}: {
  event: "sla.warning" | "sla.breached";
  interaction: ReturnType<typeof toInboundInteractionRecord>;
  queueId: string | null;
  deadline: Date;
  remainingMinutes?: number | null;
  overdueMinutes?: number | null;
  priorityLevel: PriorityLevel;
  routeDecision: InboxRouteTarget;
  slaKind: SlaPolicyKey;
  now: Date;
}) =>
  publishReceptionEvent({
    event,
    businessId: interaction.businessId,
    aggregateType: "inbound_interaction",
    aggregateId: interaction.id,
    eventKey: `${interaction.externalInteractionKey}:${event}:${deadline.toISOString()}`,
    dedupeKey: buildReceptionEventDedupeKey({
      event,
      aggregateId: interaction.id,
      eventKey: `${interaction.externalInteractionKey}:${event}:${deadline.toISOString()}`,
    }),
    payload:
      event === "sla.warning"
        ? {
            interactionId: interaction.id,
            businessId: interaction.businessId,
            leadId: interaction.leadId,
            queueId,
            slaKind,
            deadline: deadline.toISOString(),
            remainingMinutes: remainingMinutes || 0,
            priorityLevel,
            routeDecision,
            traceId: interaction.traceId,
          }
        : {
            interactionId: interaction.id,
            businessId: interaction.businessId,
            leadId: interaction.leadId,
            queueId,
            slaKind,
            deadline: deadline.toISOString(),
            breachedAt: now.toISOString(),
            overdueMinutes: overdueMinutes || 0,
            priorityLevel,
            routeDecision,
            traceId: interaction.traceId,
          },
  });

const buildCheckpointMetadata = ({
  eventType,
  deadline,
  priorityLevel,
  routeDecision,
  now,
}: {
  eventType: "sla.warning" | "sla.breached";
  deadline: Date;
  priorityLevel: PriorityLevel;
  routeDecision: InboxRouteTarget;
  now: Date;
}) => ({
  slaMonitor: {
    lastEventType: eventType,
    lastEventKey: buildSlaCheckpointKey({
      eventType,
      deadline,
    }),
    lastDeadline: deadline.toISOString(),
    lastPriorityLevel: priorityLevel,
    lastRouteDecision: routeDecision,
    lastProcessedAt: now.toISOString(),
  },
});

const isQueueRoute = (routeDecision: InboxRouteTarget | null | undefined) =>
  Boolean(
    routeDecision &&
      !["REVENUE_BRAIN", "SPAM_BIN"].includes(routeDecision)
  );

const processQueuedCandidate = async ({
  queue,
  now,
}: {
  queue: any;
  now: Date;
}) => {
  const interaction = toInboundInteractionRecord(queue.interaction);
  const deadline = queue.slaDeadline || interaction.slaDeadline;

  if (!(deadline instanceof Date)) {
    return null;
  }

  const totalWindowMinutes = Math.max(
    1,
    Math.ceil((deadline.getTime() - interaction.createdAt.getTime()) / 60_000)
  );
  const status = evaluateSlaStatus({
    deadline,
    slaKind: "FIRST_RESPONSE",
    now,
    totalWindowMinutes,
  });

  if (!status.eventType) {
    return null;
  }

  const nextPriority = escalatePriorityLevel(queue.priority);
  const nextRouteDecision: InboxRouteTarget =
    status.status === "BREACHED" && nextPriority === "CRITICAL"
      ? "OWNER"
      : (interaction.routeDecision || "HUMAN_QUEUE");
  const checkpoint = buildCheckpointMetadata({
    eventType: status.eventType,
    deadline,
    priorityLevel: nextPriority,
    routeDecision: nextRouteDecision,
    now,
  });

  const persisted = await prisma.$transaction(async (tx) => {
    const currentInteraction = await tx.inboundInteraction.findUnique({
      where: {
        id: interaction.id,
      },
      select: {
        metadata: true,
      },
    });
    const currentQueue = await tx.humanWorkQueue.findUnique({
      where: {
        id: queue.id,
      },
      select: {
        metadata: true,
      },
    });
    const currentCheckpoint = String(
      toRecord(toRecord(currentInteraction?.metadata).slaMonitor).lastEventKey || ""
    ).trim();
    const nextCheckpoint = String(checkpoint.slaMonitor.lastEventKey || "").trim();

    if (currentCheckpoint && currentCheckpoint === nextCheckpoint) {
      return null;
    }

    const updatedInteraction = await tx.inboundInteraction.update({
      where: {
        id: interaction.id,
      },
      data: {
        priorityLevel: nextPriority,
        priorityScore: PRIORITY_SCORES[nextPriority],
        routeDecision: nextRouteDecision,
        metadata: mergeJsonRecords(
          toRecord(currentInteraction?.metadata),
          checkpoint
        ) as any,
      },
      select: INBOUND_INTERACTION_SELECT,
    });

    await tx.humanWorkQueue.update({
      where: {
        id: queue.id,
      },
      data: {
        priority: nextPriority,
        queueType: nextRouteDecision === "OWNER" ? "OWNER_REVIEW" : queue.queueType,
        assignedRole: nextRouteDecision === "OWNER" ? "OWNER" : queue.assignedRole,
        state:
          status.status === "BREACHED"
            ? "ESCALATED"
            : queue.state === "ESCALATED"
            ? "ESCALATED"
            : queue.state,
        metadata: mergeJsonRecords(
          toRecord(currentQueue?.metadata),
          checkpoint
        ) as any,
      },
    });

    return toInboundInteractionRecord(updatedInteraction);
  });

  if (!persisted) {
    return null;
  }

  await emitSlaEvent({
    event: status.eventType,
    interaction: persisted,
    queueId: queue.id,
    deadline,
    remainingMinutes: status.remainingMinutes,
    overdueMinutes: status.overdueMinutes,
    priorityLevel: nextPriority,
    routeDecision: nextRouteDecision,
    slaKind: status.slaKind || "FIRST_RESPONSE",
    now,
  });

  incrementReceptionMetric(
    status.eventType === "sla.warning"
      ? "sla_warning_total"
      : "sla_breach_total"
  );

  return {
    interactionId: interaction.id,
    eventType: status.eventType,
    priorityLevel: nextPriority,
    routeDecision: nextRouteDecision,
  };
};

const processQueueLessCandidate = async ({
  row,
  now,
}: {
  row: any;
  now: Date;
}) => {
  const interaction = toInboundInteractionRecord(row);
  const deadline = interaction.slaDeadline;

  if (!(deadline instanceof Date)) {
    return null;
  }

  const totalWindowMinutes = Math.max(
    1,
    Math.ceil((deadline.getTime() - interaction.createdAt.getTime()) / 60_000)
  );
  const status = evaluateSlaStatus({
    deadline,
    slaKind: "FIRST_RESPONSE",
    now,
    totalWindowMinutes,
  });

  if (!status.eventType) {
    return null;
  }

  const nextPriority = escalatePriorityLevel(interaction.priorityLevel);
  const nextRouteDecision: InboxRouteTarget =
    status.status === "BREACHED" && nextPriority === "CRITICAL"
      ? "OWNER"
      : isQueueRoute(interaction.routeDecision)
      ? (interaction.routeDecision as InboxRouteTarget)
      : "HUMAN_QUEUE";
  const checkpoint = buildCheckpointMetadata({
    eventType: status.eventType,
    deadline,
    priorityLevel: nextPriority,
    routeDecision: nextRouteDecision,
    now,
  });

  const persisted = await prisma.$transaction(async (tx) => {
    const current = await tx.inboundInteraction.findUnique({
      where: {
        id: interaction.id,
      },
      select: INBOUND_INTERACTION_SELECT,
    });

    if (!current) {
      return null;
    }

    const currentInteraction = toInboundInteractionRecord(current);
    const currentCheckpoint = String(
      toRecord(toRecord(currentInteraction.metadata).slaMonitor).lastEventKey || ""
    ).trim();
    const nextCheckpoint = String(checkpoint.slaMonitor.lastEventKey || "").trim();

    if (currentCheckpoint && currentCheckpoint === nextCheckpoint) {
      return null;
    }

    const updatedInteractionRow = await tx.inboundInteraction.update({
      where: {
        id: interaction.id,
      },
      data: {
        priorityLevel: nextPriority,
        priorityScore: PRIORITY_SCORES[nextPriority],
        routeDecision: nextRouteDecision,
        metadata: mergeJsonRecords(currentInteraction.metadata, checkpoint) as any,
      },
      select: INBOUND_INTERACTION_SELECT,
    });

    const updatedInteraction = toInboundInteractionRecord(updatedInteractionRow);
    const assignment = resolveHumanQueueAssignment({
      interaction: updatedInteraction,
      classification: {
        intentClass: updatedInteraction.intentClass || "GENERAL",
        urgencyClass: updatedInteraction.urgencyClass || "HIGH",
        sentimentClass: updatedInteraction.sentimentClass || "NEUTRAL",
        spamScore: updatedInteraction.spamScore,
        routeHint: nextRouteDecision,
        complaintSeverity: 0,
        reasons: [
          status.eventType === "sla.breached"
            ? "sla_breach_escalation"
            : "sla_warning_escalation",
        ],
      },
      routing: {
        routeDecision: nextRouteDecision,
        priorityScore: PRIORITY_SCORES[nextPriority],
        priorityLevel: nextPriority,
        slaDeadline: deadline,
        requiresHumanQueue: true,
        reasons: [
          status.eventType === "sla.breached"
            ? "sla_breach_escalation"
            : "sla_warning_escalation",
        ],
      },
      metadata: checkpoint,
      now,
    });

    if (!assignment) {
      throw new Error(`sla_assignment_missing:${interaction.id}`);
    }

    const queue = await upsertHumanQueueAssignmentInTx({
      tx,
      interactionId: updatedInteraction.id,
      leadId: updatedInteraction.leadId,
      businessId: updatedInteraction.businessId,
      assignment,
      metadata: checkpoint,
    });

    return {
      interaction: queue.interaction,
      queueId: queue.queue.id,
    };
  });

  if (!persisted) {
    return null;
  }

  await emitSlaEvent({
    event: status.eventType,
    interaction: persisted.interaction,
    queueId: persisted.queueId,
    deadline,
    remainingMinutes: status.remainingMinutes,
    overdueMinutes: status.overdueMinutes,
    priorityLevel: nextPriority,
    routeDecision: nextRouteDecision,
    slaKind: status.slaKind || "FIRST_RESPONSE",
    now,
  });

  incrementReceptionMetric(
    status.eventType === "sla.warning"
      ? "sla_warning_total"
      : "sla_breach_total"
  );

  return {
    interactionId: interaction.id,
    eventType: status.eventType,
    priorityLevel: nextPriority,
    routeDecision: nextRouteDecision,
  };
};

export const runInboundSlaMonitor = async ({
  now = new Date(),
}: {
  now?: Date;
} = {}) => {
  const [queues, queueLessInteractions] = await Promise.all([
    loadHumanQueueCandidates(),
    loadInteractionCandidatesWithoutQueue(),
  ]);
  const results: Array<{
    interactionId: string;
    eventType: "sla.warning" | "sla.breached";
    priorityLevel: PriorityLevel;
    routeDecision: InboxRouteTarget;
  }> = [];

  for (const queue of queues) {
    const result = await processQueuedCandidate({
      queue,
      now,
    });

    if (result) {
      results.push(result);
    }
  }

  for (const row of queueLessInteractions) {
    const result = await processQueueLessCandidate({
      row,
      now,
    });

    if (result) {
      results.push(result);
    }
  }

  await updateQueueDepths();

  return {
    monitoredQueues: queues.length,
    monitoredInteractions: queueLessInteractions.length,
    emitted: results.length,
    results,
  };
};

export const runInboundSlaMonitorAsLeader = async ({
  runner,
  ...options
}: {
  now?: Date;
  runner?: typeof runInboundSlaMonitor;
} = {}) => {
  if (globalForInboundSlaMonitor.__sylphInboundSlaMonitorRun) {
    return null;
  }

  const lock = await acquireDistributedLock({
    key: INBOUND_SLA_MONITOR_LEADER_KEY,
    ttlMs: INBOUND_SLA_MONITOR_LEASE_MS,
    refreshIntervalMs: INBOUND_SLA_MONITOR_REFRESH_MS,
    waitMs: 0,
  });

  if (!lock) {
    return null;
  }

  if (globalForInboundSlaMonitor.__sylphInboundSlaMonitorRun) {
    await lock.release().catch(() => undefined);
    return null;
  }

  const execute = runner || runInboundSlaMonitor;
  const runPromise = execute(options);
  globalForInboundSlaMonitor.__sylphInboundSlaMonitorRun = runPromise;

  try {
    return await runPromise;
  } finally {
    if (globalForInboundSlaMonitor.__sylphInboundSlaMonitorRun === runPromise) {
      globalForInboundSlaMonitor.__sylphInboundSlaMonitorRun = null;
    }

    await lock.release().catch(() => undefined);
  }
};
