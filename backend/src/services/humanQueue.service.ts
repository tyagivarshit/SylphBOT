import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import {
  INBOUND_INTERACTION_SELECT,
  toInboundInteractionRecord,
} from "./interactionNormalizer.service";
import {
  publishReceptionEvent,
  type ReceptionEventWriter,
} from "./receptionEvent.service";
import type { InboxRoutingDecision } from "./inboxRouter.service";
import type { ReceptionClassification } from "./receptionClassifier.service";
import {
  mergeJsonRecords,
  toRecord,
  type HumanWorkQueueAuthorityRecord,
  type HumanWorkQueueState,
  type InboundInteractionAuthorityRecord,
  type JsonRecord,
  type PriorityLevel,
} from "./reception.shared";
import { createAssignmentEngineService } from "./assignmentEngine.service";
import { createEscalationLadderService } from "./escalationLadder.service";
import { enforceSecurityGovernanceInfluence } from "./security/securityGovernanceOS.service";

export type HumanQueueAssignmentDecision = {
  queueType: string;
  assignedRole: string;
  assignedHumanId: string | null;
  state: HumanWorkQueueState;
  priority: PriorityLevel;
  slaDeadline: Date | null;
  escalationAt: Date | null;
  reasons: string[];
};

export type HumanQueueAssignmentContext = {
  interaction: InboundInteractionAuthorityRecord;
  classification: ReceptionClassification;
  routing: InboxRoutingDecision;
  assignedHumanId?: string | null;
  metadata?: JsonRecord | null;
  now?: Date;
};

export type HumanQueueRepository = {
  upsertAssignment: (input: {
    interactionId: string;
    leadId: string;
    businessId: string;
    assignment: HumanQueueAssignmentDecision;
    assignedHumanId?: string | null;
    metadata?: JsonRecord | null;
  }) => Promise<{
    queue: HumanWorkQueueAuthorityRecord;
    interaction: InboundInteractionAuthorityRecord;
  }>;
};

type HumanQueueTx = Prisma.TransactionClient | typeof prisma;

const HUMAN_WORK_QUEUE_SELECT = {
  id: true,
  businessId: true,
  interactionId: true,
  leadId: true,
  queueType: true,
  assignedRole: true,
  assignedHumanId: true,
  state: true,
  priority: true,
  slaDeadline: true,
  escalationAt: true,
  resolutionCode: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const;

const toHumanWorkQueueRecord = (row: any): HumanWorkQueueAuthorityRecord => ({
  id: row.id,
  businessId: row.businessId,
  interactionId: row.interactionId,
  leadId: row.leadId,
  queueType: row.queueType,
  assignedRole: row.assignedRole,
  assignedHumanId: row.assignedHumanId || null,
  state: row.state,
  priority: row.priority,
  slaDeadline: row.slaDeadline || null,
  escalationAt: row.escalationAt || null,
  resolutionCode: row.resolutionCode || null,
  metadata: row.metadata ? toRecord(row.metadata) : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const buildEscalationAt = (slaDeadline: Date | null, now: Date) => {
  if (!(slaDeadline instanceof Date)) {
    return null;
  }

  const totalMinutes = Math.max(
    5,
    Math.ceil((slaDeadline.getTime() - now.getTime()) / 60_000)
  );
  const leadTimeMinutes = Math.max(5, Math.min(20, Math.ceil(totalMinutes * 0.25)));

  return new Date(slaDeadline.getTime() - leadTimeMinutes * 60_000);
};

export const upsertHumanQueueAssignmentInTx = async ({
  tx,
  interactionId,
  leadId,
  businessId,
  assignment,
  assignedHumanId,
  metadata,
}: {
  tx: HumanQueueTx;
  interactionId: string;
  leadId: string;
  businessId: string;
  assignment: HumanQueueAssignmentDecision;
  assignedHumanId?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const currentQueue = await tx.humanWorkQueue.findUnique({
    where: {
      interactionId,
    },
    select: {
      metadata: true,
    },
  });
  const currentInteraction = await tx.inboundInteraction.findUnique({
    where: {
      id: interactionId,
    },
    select: {
      metadata: true,
    },
  });

  const queue = await tx.humanWorkQueue.upsert({
    where: {
      interactionId,
    },
    update: {
      queueType: assignment.queueType,
      assignedRole: assignment.assignedRole,
      assignedHumanId: assignedHumanId || assignment.assignedHumanId,
      state: assignment.state,
      priority: assignment.priority,
      slaDeadline: assignment.slaDeadline,
      escalationAt: assignment.escalationAt,
      metadata: mergeJsonRecords(toRecord(currentQueue?.metadata), metadata, {
        queueAssignment: {
          queueType: assignment.queueType,
          assignedRole: assignment.assignedRole,
          assignedHumanId: assignedHumanId || assignment.assignedHumanId,
          state: assignment.state,
          priority: assignment.priority,
          reasons: assignment.reasons,
        },
      }) as Prisma.InputJsonValue,
    },
    create: {
      businessId,
      interactionId,
      leadId,
      queueType: assignment.queueType,
      assignedRole: assignment.assignedRole,
      assignedHumanId: assignedHumanId || assignment.assignedHumanId,
      state: assignment.state,
      priority: assignment.priority,
      slaDeadline: assignment.slaDeadline,
      escalationAt: assignment.escalationAt,
      metadata: mergeJsonRecords(metadata, {
        queueAssignment: {
          queueType: assignment.queueType,
          assignedRole: assignment.assignedRole,
          assignedHumanId: assignedHumanId || assignment.assignedHumanId,
          state: assignment.state,
          priority: assignment.priority,
          reasons: assignment.reasons,
        },
      }) as Prisma.InputJsonValue,
    },
    select: HUMAN_WORK_QUEUE_SELECT,
  });

  const interaction = await tx.inboundInteraction.update({
    where: {
      id: interactionId,
    },
    data: {
      assignedQueueId: queue.id,
      assignedHumanId: assignedHumanId || assignment.assignedHumanId,
      metadata: mergeJsonRecords(toRecord(currentInteraction?.metadata), {
        currentQueueAssignment: {
          queueId: queue.id,
          queueType: assignment.queueType,
          assignedRole: assignment.assignedRole,
          assignedHumanId: assignedHumanId || assignment.assignedHumanId,
        },
      }) as Prisma.InputJsonValue,
    },
    select: INBOUND_INTERACTION_SELECT,
  });

  return {
    queue: toHumanWorkQueueRecord(queue),
    interaction: toInboundInteractionRecord(interaction),
  };
};

export const resolveHumanQueueAssignment = ({
  interaction,
  classification,
  routing,
  assignedHumanId = null,
  now = new Date(),
}: HumanQueueAssignmentContext): HumanQueueAssignmentDecision | null => {
  if (["REVENUE_BRAIN", "SPAM_BIN"].includes(routing.routeDecision)) {
    return null;
  }

  let queueType = "GENERAL_RECEPTION";
  let assignedRole = "RECEPTIONIST";

  switch (routing.routeDecision) {
    case "BILLING":
      queueType = "BILLING";
      assignedRole = "BILLING_SPECIALIST";
      break;
    case "APPOINTMENTS":
      queueType = "APPOINTMENTS";
      assignedRole = "APPOINTMENT_COORDINATOR";
      break;
    case "OWNER":
      queueType = "OWNER_REVIEW";
      assignedRole = "OWNER";
      break;
    case "ESCALATION":
      queueType = "ESCALATION";
      assignedRole = "OPERATIONS_LEAD";
      break;
    case "SUPPORT":
      queueType = "SUPPORT";
      assignedRole = "CUSTOMER_SUPPORT";
      break;
    case "HUMAN_QUEUE":
      queueType =
        classification.intentClass === "BILLING"
          ? "BILLING"
          : classification.intentClass === "APPOINTMENTS"
          ? "APPOINTMENTS"
          : "SUPPORT";
      assignedRole =
        queueType === "BILLING"
          ? "BILLING_SPECIALIST"
          : queueType === "APPOINTMENTS"
          ? "APPOINTMENT_COORDINATOR"
          : "CUSTOMER_SUPPORT";
      break;
    default:
      break;
  }

  return {
    queueType,
    assignedRole,
    assignedHumanId,
    state: assignedHumanId ? "ASSIGNED" : "PENDING",
    priority: routing.priorityLevel,
    slaDeadline: routing.slaDeadline,
    escalationAt: buildEscalationAt(routing.slaDeadline, now),
    reasons: [
      `route:${routing.routeDecision}`,
      `queue_type:${queueType}`,
      `assigned_role:${assignedRole}`,
    ],
  };
};

export const createPrismaHumanQueueRepository = (): HumanQueueRepository => ({
  upsertAssignment: async ({
    interactionId,
    leadId,
    businessId,
    assignment,
    assignedHumanId,
    metadata,
  }) =>
    prisma.$transaction((tx) =>
      upsertHumanQueueAssignmentInTx({
        tx,
        interactionId,
        leadId,
        businessId,
        assignment,
        assignedHumanId,
        metadata,
      })
    ),
});

export const createHumanQueueService = ({
  repository = createPrismaHumanQueueRepository(),
  eventWriter = publishReceptionEvent,
  deterministicAssignment = false,
}: {
  repository?: HumanQueueRepository;
  eventWriter?: ReceptionEventWriter;
  deterministicAssignment?: boolean;
} = {}) => ({
  resolveAssignment: resolveHumanQueueAssignment,
  ensureAssignment: async (context: HumanQueueAssignmentContext) => {
    const assignment = resolveHumanQueueAssignment(context);

    if (!assignment) {
      return null;
    }

    await enforceSecurityGovernanceInfluence({
      domain: "HUMAN",
      action: "messages:enqueue",
      businessId: context.interaction.businessId,
      tenantId: context.interaction.businessId,
      actorId: context.assignedHumanId || "human_queue_runtime",
      actorType: "SERVICE",
      role: "SERVICE",
      permissions: ["messages:enqueue"],
      scopes: ["WRITE"],
      resourceType: "HUMAN_WORK_QUEUE",
      resourceId: context.interaction.id,
      resourceTenantId: context.interaction.businessId,
      purpose: "HUMAN_ASSIGNMENT",
      metadata: {
        routeDecision: context.routing.routeDecision,
      },
    });

    const persisted = await repository.upsertAssignment({
      interactionId: context.interaction.id,
      leadId: context.interaction.leadId,
      businessId: context.interaction.businessId,
      assignment,
      assignedHumanId: context.assignedHumanId,
      metadata: context.metadata,
    });
    let resolvedQueue = persisted.queue;

    if (deterministicAssignment && !resolvedQueue.assignedHumanId) {
      const escalationLadder = createEscalationLadderService();
      const assignmentEngine = createAssignmentEngineService({
        escalationAdapter: {
          escalateForNoMatch: async ({ queueId, reason }) => {
            await escalationLadder.escalateForNoMatch({
              queueId,
              reason,
            });
          },
        },
      });
      const assignmentResult = await assignmentEngine.assignQueue({
        queueId: resolvedQueue.id,
      });

      if (assignmentResult.assigned) {
        resolvedQueue = {
          ...resolvedQueue,
          assignedHumanId: assignmentResult.assignedHumanId,
          assignedRole: assignmentResult.assignedRole,
          state: "ASSIGNED",
          metadata: mergeJsonRecords(resolvedQueue.metadata, {
            deterministicAssignment: {
              score: assignmentResult.score.total,
              reasons: assignmentResult.score.reasons,
            },
          }),
        };
      }
    }

    await eventWriter({
      event: "human.assigned",
      businessId: persisted.interaction.businessId,
      aggregateType: "human_work_queue",
      aggregateId: persisted.queue.id,
      eventKey: persisted.interaction.externalInteractionKey,
      payload: {
        queueId: persisted.queue.id,
        interactionId: persisted.interaction.id,
        businessId: persisted.interaction.businessId,
        leadId: persisted.interaction.leadId,
        routeDecision: context.routing.routeDecision,
        queueType: resolvedQueue.queueType,
        assignedRole: resolvedQueue.assignedRole,
        assignedHumanId: resolvedQueue.assignedHumanId,
        state: resolvedQueue.state,
        priority: resolvedQueue.priority,
        slaDeadline: resolvedQueue.slaDeadline
          ? resolvedQueue.slaDeadline.toISOString()
          : null,
        escalationAt: resolvedQueue.escalationAt
          ? resolvedQueue.escalationAt.toISOString()
          : null,
        traceId: persisted.interaction.traceId,
      },
    });

    return {
      assignment,
      queue: resolvedQueue,
      interaction: persisted.interaction,
    };
  },
});
