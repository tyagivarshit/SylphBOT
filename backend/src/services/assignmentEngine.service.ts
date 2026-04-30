import prisma from "../config/prisma";
import { publishHumanOpsEvent } from "./humanOpsEvent.service";
import {
  createAvailabilityEngineService,
  type HumanAvailabilityAuthorityRecord,
} from "./availabilityEngine.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { mergeJsonRecords, toRecord, type JsonRecord } from "./reception.shared";

export type AssignmentScoreBreakdown = {
  skillMatch: number;
  language: number;
  availability: number;
  activeLoad: number;
  responseScore: number;
  continuity: number;
  vipWeighting: number;
  slaUrgency: number;
  escalationAuthority: number;
  priorityWeight: number;
  total: number;
  reasons: string[];
};

export type AssignmentCandidate = {
  humanId: string;
  roleKey: string;
  permissions: string[];
  channels: string[];
  expertiseTags: string[];
  escalationAuthority: number;
  priorityWeight: number;
  availability: HumanAvailabilityAuthorityRecord;
  score: AssignmentScoreBreakdown;
};

export type AssignmentResult =
  | {
      assigned: true;
      queueId: string;
      interactionId: string;
      businessId: string;
      leadId: string;
      assignedHumanId: string;
      assignedRole: string;
      score: AssignmentScoreBreakdown;
    }
  | {
      assigned: false;
      queueId: string;
      interactionId: string;
      businessId: string;
      leadId: string;
      reason: string;
    };

type QueueRow = {
  id: string;
  businessId: string;
  interactionId: string;
  leadId: string;
  queueType: string;
  assignedRole: string;
  assignedHumanId: string | null;
  state: string;
  priority: string;
  slaDeadline: Date | null;
  metadata: JsonRecord | null;
  createdAt: Date;
};

type InteractionRow = {
  id: string;
  channel: string;
  priorityLevel: string | null;
  intentClass: string | null;
  urgencyClass: string | null;
  normalizedPayload: unknown;
  metadata: JsonRecord | null;
  createdAt: Date;
};

type RoleCapabilityRow = {
  roleKey: string;
  permissions: string[];
  channels: string[];
  expertiseTags: string[];
  escalationAuthority: number;
  maxConcurrency: number;
  priorityWeight: number;
  metadata: JsonRecord | null;
};

type ReceptionMemoryRow = {
  preferredAgentId: string | null;
  vipScore: number;
};

type AssignmentEngineRepository = {
  getQueueById: (queueId: string) => Promise<QueueRow | null>;
  getInteractionById: (interactionId: string) => Promise<InteractionRow | null>;
  getReceptionMemory: (leadId: string) => Promise<ReceptionMemoryRow | null>;
  listRoleCapabilities: (input: {
    businessId: string;
    roleKey?: string | null;
  }) => Promise<RoleCapabilityRow[]>;
  listAvailability: (businessId: string) => Promise<HumanAvailabilityAuthorityRecord[]>;
  persistAssignment: (input: {
    queueId: string;
    interactionId: string;
    businessId: string;
    assignedHumanId: string;
    assignedRole: string;
    metadata: JsonRecord | null;
  }) => Promise<void>;
};

const priorityWeightMap: Record<string, number> = {
  LOW: 4,
  MEDIUM: 8,
  HIGH: 12,
  CRITICAL: 18,
};

const urgencyWeightMap: Record<string, number> = {
  LOW: 2,
  MEDIUM: 6,
  HIGH: 10,
  CRITICAL: 14,
};

const availabilityScoreMap: Record<string, number> = {
  AVAILABLE: 16,
  BUSY: 8,
  OVERLOADED: 0,
  AWAY: -10,
  OFFLINE: -20,
};

const intersectCount = (left: string[], right: string[]) => {
  const rightSet = new Set(right.map((entry) => entry.toUpperCase()));
  return left.filter((entry) => rightSet.has(entry.toUpperCase())).length;
};

const scoreCandidate = ({
  candidate,
  capability,
  interaction,
  memory,
  queue,
  runtimeInfluence,
}: {
  candidate: HumanAvailabilityAuthorityRecord;
  capability: RoleCapabilityRow;
  interaction: InteractionRow;
  memory: ReceptionMemoryRow | null;
  queue: QueueRow;
  runtimeInfluence?: Awaited<ReturnType<typeof getIntelligenceRuntimeInfluence>> | null;
}): AssignmentScoreBreakdown => {
  const normalizedPayload = toRecord(interaction.normalizedPayload);
  const language = String(normalizedPayload.language || "").trim().toUpperCase();
  const intentTokens = [
    String(interaction.intentClass || "").toUpperCase(),
    String(queue.queueType || "").toUpperCase(),
    String(interaction.urgencyClass || "").toUpperCase(),
  ].filter(Boolean);
  const skillOverlap = intersectCount(capability.expertiseTags || [], intentTokens);
  const skillMatch = Math.min(20, skillOverlap * 10);

  const languageScore =
    language && String(candidate.language || "").trim().toUpperCase() === language
      ? 12
      : language
      ? 0
      : 4;

  const availabilityScore =
    availabilityScoreMap[String(candidate.state || "OFFLINE").toUpperCase()] ?? -20;

  const utilization =
    candidate.maxLoad > 0 ? candidate.activeLoad / candidate.maxLoad : 1;
  const loadBalanceBias = Number(
    runtimeInfluence?.controls.assignment.loadBalanceBias || 0
  );
  const loadScore = Math.max(
    -12,
    Math.round((1 - utilization) * (14 + loadBalanceBias * 0.15))
  );

  const responseScore = Math.round((Number(candidate.responseScore || 0) / 100) * 14);
  const continuity = memory?.preferredAgentId === candidate.humanId ? 10 : 0;
  const vipWeighting = memory && memory.vipScore >= 70 ? 8 : 0;
  const slaUrgency =
    (priorityWeightMap[String(interaction.priorityLevel || queue.priority).toUpperCase()] ||
      0) +
    (urgencyWeightMap[String(interaction.urgencyClass || "").toUpperCase()] || 0);
  const escalationAuthority = Math.max(0, Number(capability.escalationAuthority || 0));
  const escalationBoost = Math.max(
    0,
    Number(runtimeInfluence?.controls.assignment.escalationBoost || 0)
  );
  const priorityWeight = Math.max(
    0,
    Math.round(Number(capability.priorityWeight || 0) / 20) +
      Math.round(escalationBoost / 8)
  );

  const reasons: string[] = [
    `skill:${skillMatch}`,
    `language:${languageScore}`,
    `availability:${availabilityScore}`,
    `load:${loadScore}`,
    `response:${responseScore}`,
    `continuity:${continuity}`,
    `vip:${vipWeighting}`,
    `sla:${slaUrgency}`,
    `authority:${escalationAuthority}`,
    `role_priority:${priorityWeight}`,
  ];
  const total =
    skillMatch +
    languageScore +
    availabilityScore +
    loadScore +
    responseScore +
    continuity +
    vipWeighting +
    slaUrgency +
    escalationAuthority +
    priorityWeight;

  return {
    skillMatch,
    language: languageScore,
    availability: availabilityScore,
    activeLoad: loadScore,
    responseScore,
    continuity,
    vipWeighting,
    slaUrgency,
    escalationAuthority,
    priorityWeight,
    total,
    reasons,
  };
};

const createPrismaAssignmentEngineRepository = (): AssignmentEngineRepository => ({
  getQueueById: async (queueId) => {
    const row = await prisma.humanWorkQueue.findUnique({
      where: { id: queueId },
      select: {
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
        metadata: true,
        createdAt: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      ...row,
      metadata: row.metadata ? toRecord(row.metadata) : null,
    };
  },
  getInteractionById: async (interactionId) => {
    const row = await prisma.inboundInteraction.findUnique({
      where: { id: interactionId },
      select: {
        id: true,
        channel: true,
        priorityLevel: true,
        intentClass: true,
        urgencyClass: true,
        normalizedPayload: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      ...row,
      metadata: row.metadata ? toRecord(row.metadata) : null,
    };
  },
  getReceptionMemory: async (leadId) => {
    const row = await prisma.receptionMemory.findUnique({
      where: {
        leadId,
      },
      select: {
        preferredAgentId: true,
        vipScore: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      preferredAgentId: row.preferredAgentId || null,
      vipScore: Number(row.vipScore || 0),
    };
  },
  listRoleCapabilities: async ({ businessId, roleKey }) => {
    const rows = await prisma.humanRoleCapability.findMany({
      where: {
        businessId,
        ...(roleKey ? { roleKey } : {}),
      },
      select: {
        roleKey: true,
        permissions: true,
        channels: true,
        expertiseTags: true,
        escalationAuthority: true,
        maxConcurrency: true,
        priorityWeight: true,
        metadata: true,
      },
    });

    return rows.map((row) => ({
      roleKey: row.roleKey,
      permissions: row.permissions,
      channels: row.channels,
      expertiseTags: row.expertiseTags,
      escalationAuthority: Number(row.escalationAuthority || 0),
      maxConcurrency: Math.max(1, Number(row.maxConcurrency || 1)),
      priorityWeight: Number(row.priorityWeight || 100),
      metadata: row.metadata ? toRecord(row.metadata) : null,
    }));
  },
  listAvailability: async (businessId) =>
    createAvailabilityEngineService().listAssignable({
      businessId,
    }),
  persistAssignment: async ({
    queueId,
    interactionId,
    businessId,
    assignedHumanId,
    assignedRole,
    metadata,
  }) => {
    await prisma.$transaction(async (tx) => {
      const currentQueue = await tx.humanWorkQueue.findUnique({
        where: { id: queueId },
        select: { metadata: true },
      });
      const currentInteraction = await tx.inboundInteraction.findUnique({
        where: { id: interactionId },
        select: { metadata: true },
      });

      await tx.humanWorkQueue.update({
        where: { id: queueId },
        data: {
          assignedHumanId,
          assignedRole,
          state: "ASSIGNED",
          metadata: mergeJsonRecords(
            toRecord(currentQueue?.metadata),
            metadata
          ) as any,
        },
      });

      await tx.inboundInteraction.update({
        where: { id: interactionId },
        data: {
          assignedHumanId,
          metadata: mergeJsonRecords(
            toRecord(currentInteraction?.metadata),
            metadata
          ) as any,
        },
      });

      const availability = await tx.humanAvailabilityState.findUnique({
        where: {
          businessId_humanId: {
            businessId,
            humanId: assignedHumanId,
          },
        },
        select: {
          businessId: true,
          humanId: true,
          activeLoad: true,
          maxLoad: true,
        },
      });

      if (availability) {
        const nextLoad = Math.min(
          Math.max(0, Number(availability.activeLoad || 0) + 1),
          Math.max(1, Number(availability.maxLoad || 1))
        );

        await tx.humanAvailabilityState.update({
          where: {
            businessId_humanId: {
              businessId: availability.businessId,
              humanId: availability.humanId,
            },
          },
          data: {
            activeLoad: nextLoad,
            state:
              nextLoad >= Math.max(1, Number(availability.maxLoad || 1))
                ? ("OVERLOADED" as any)
                : nextLoad >= Math.ceil(Math.max(1, Number(availability.maxLoad || 1)) * 0.75)
                ? ("BUSY" as any)
                : ("AVAILABLE" as any),
          },
        });
      }
    });
  },
});

type AssignmentEscalationAdapter = {
  escalateForNoMatch: (input: {
    queueId: string;
    reason: string;
  }) => Promise<void>;
};

export const createAssignmentEngineService = ({
  repository = createPrismaAssignmentEngineRepository(),
  escalationAdapter,
}: {
  repository?: AssignmentEngineRepository;
  escalationAdapter?: AssignmentEscalationAdapter;
} = {}) => ({
  assignQueue: async ({
    queueId,
    forceRoleKey,
  }: {
    queueId: string;
    forceRoleKey?: string | null;
  }): Promise<AssignmentResult> => {
    const queue = await repository.getQueueById(queueId);

    if (!queue) {
      throw new Error(`human_queue_not_found:${queueId}`);
    }

    const interaction = await repository.getInteractionById(queue.interactionId);

    if (!interaction) {
      throw new Error(`interaction_not_found:${queue.interactionId}`);
    }

    if (
      queue.assignedHumanId &&
      ["ASSIGNED", "IN_PROGRESS", "ESCALATED"].includes(String(queue.state))
    ) {
      return {
        assigned: true,
        queueId: queue.id,
        interactionId: queue.interactionId,
        businessId: queue.businessId,
        leadId: queue.leadId,
        assignedHumanId: queue.assignedHumanId,
        assignedRole: queue.assignedRole,
        score: {
          skillMatch: 0,
          language: 0,
          availability: 0,
          activeLoad: 0,
          responseScore: 0,
          continuity: 10,
          vipWeighting: 0,
          slaUrgency: 0,
          escalationAuthority: 0,
          priorityWeight: 0,
          total: 10,
          reasons: ["continuity_existing_assignment"],
        },
      };
    }

    const runtimeInfluence = await getIntelligenceRuntimeInfluence({
      businessId: queue.businessId,
      leadId: queue.leadId,
    }).catch(() => null);

    const targetRoleKey = String(forceRoleKey || queue.assignedRole || "").trim();
    const capabilities = await repository.listRoleCapabilities({
      businessId: queue.businessId,
      roleKey: targetRoleKey || undefined,
    });

    if (!capabilities.length) {
      if (escalationAdapter) {
        await escalationAdapter.escalateForNoMatch({
          queueId,
          reason: "role_capability_missing",
        });
      }

      return {
        assigned: false,
        queueId: queue.id,
        interactionId: queue.interactionId,
        businessId: queue.businessId,
        leadId: queue.leadId,
        reason: "role_capability_missing",
      };
    }

    const memory = await repository.getReceptionMemory(queue.leadId);
    const availability = await repository.listAvailability(queue.businessId);
    const channel = String(interaction.channel || "").toUpperCase();
    const scoredCandidates: AssignmentCandidate[] = [];

    for (const capability of capabilities) {
      const candidatesForRole = availability.filter((candidate) => {
        if (String(candidate.state).toUpperCase() === "OFFLINE") {
          return false;
        }

        if (candidate.activeLoad >= candidate.maxLoad) {
          return false;
        }

        const supportedChannels = (capability.channels || []).map((entry) =>
          String(entry).toUpperCase()
        );
        return !supportedChannels.length || supportedChannels.includes(channel);
      });

      for (const candidate of candidatesForRole) {
        const score = scoreCandidate({
          candidate,
          capability,
          interaction,
          memory,
          queue,
          runtimeInfluence,
        });

        scoredCandidates.push({
          humanId: candidate.humanId,
          roleKey: capability.roleKey,
          permissions: capability.permissions,
          channels: capability.channels,
          expertiseTags: capability.expertiseTags,
          escalationAuthority: capability.escalationAuthority,
          priorityWeight: capability.priorityWeight,
          availability: candidate,
          score,
        });
      }
    }

    scoredCandidates.sort((left, right) => {
      if (right.score.total !== left.score.total) {
        return right.score.total - left.score.total;
      }

      if (right.score.responseScore !== left.score.responseScore) {
        return right.score.responseScore - left.score.responseScore;
      }

      return left.humanId.localeCompare(right.humanId);
    });

    const winner = scoredCandidates[0];

    if (!winner || winner.score.total < 0) {
      if (escalationAdapter) {
        await escalationAdapter.escalateForNoMatch({
          queueId,
          reason: "no_eligible_human_candidate",
        });
      }

      return {
        assigned: false,
        queueId: queue.id,
        interactionId: queue.interactionId,
        businessId: queue.businessId,
        leadId: queue.leadId,
        reason: "no_eligible_human_candidate",
      };
    }

    const assignmentMetadata = mergeJsonRecords(queue.metadata, {
      deterministicAssignment: {
        assignedAt: new Date().toISOString(),
        assignedHumanId: winner.humanId,
        assignedRole: winner.roleKey,
        score: winner.score.total,
        reasons: winner.score.reasons,
        createdAt: queue.createdAt.toISOString(),
      },
    });

    await repository.persistAssignment({
      queueId: queue.id,
      interactionId: queue.interactionId,
      businessId: queue.businessId,
      assignedHumanId: winner.humanId,
      assignedRole: winner.roleKey,
      metadata: assignmentMetadata,
    });

    await publishHumanOpsEvent({
      event: "human.assigned.deterministic",
      businessId: queue.businessId,
      aggregateType: "human_work_queue",
      aggregateId: queue.id,
      eventKey: `${queue.interactionId}:${winner.humanId}`,
      payload: {
        queueId: queue.id,
        interactionId: queue.interactionId,
        businessId: queue.businessId,
        leadId: queue.leadId,
        assignedHumanId: winner.humanId,
        assignedRole: winner.roleKey,
        score: winner.score.total,
        reasons: winner.score.reasons,
        createdAt: queue.createdAt.toISOString(),
      },
    });

    return {
      assigned: true,
      queueId: queue.id,
      interactionId: queue.interactionId,
      businessId: queue.businessId,
      leadId: queue.leadId,
      assignedHumanId: winner.humanId,
      assignedRole: winner.roleKey,
      score: winner.score,
    };
  },
});
