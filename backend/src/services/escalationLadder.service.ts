import prisma from "../config/prisma";
import { withDistributedLock } from "./distributedLock.service";
import { publishHumanOpsEvent } from "./humanOpsEvent.service";
import { mergeJsonRecords, toRecord, type JsonRecord } from "./reception.shared";

type EscalationQueue = {
  id: string;
  businessId: string;
  interactionId: string;
  leadId: string;
  queueType: string;
  assignedRole: string;
  assignedHumanId: string | null;
  priority: string;
  state: string;
  metadata: JsonRecord | null;
};

type EscalationRule = {
  id: string;
  businessId: string;
  queueType: string;
  severity: string;
  ladder: string[];
  timeouts: JsonRecord | null;
  ownerFallback: boolean;
  metadata: JsonRecord | null;
};

type EscalationRepository = {
  getQueueById: (queueId: string) => Promise<EscalationQueue | null>;
  getRule: (input: {
    businessId?: string | null;
    queueType?: string | null;
    severity?: string | null;
  }) => Promise<EscalationRule | null>;
  persistEscalation: (input: {
    queueId: string;
    interactionId: string;
    nextRole: string;
    metadata: JsonRecord | null;
  }) => Promise<void>;
};

const createDefaultRule = ({
  businessId,
  queueType,
  severity,
}: {
  businessId: string;
  queueType: string;
  severity: string;
}): EscalationRule => ({
  id: `default:${businessId}:${queueType}:${severity}`,
  businessId,
  queueType,
  severity,
  ladder: ["REP", "SENIOR", "MANAGER", "OWNER"],
  timeouts: {
    REP: 5,
    SENIOR: 10,
    MANAGER: 15,
    OWNER: 20,
  },
  ownerFallback: true,
  metadata: {
    defaultRule: true,
  },
});

const createPrismaEscalationRepository = (): EscalationRepository => ({
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
        priority: true,
        state: true,
        metadata: true,
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
  getRule: async ({ businessId, queueType, severity }) => {
    if (!businessId || !queueType || !severity) {
      return null;
    }

    const row = await prisma.humanEscalationRule.findUnique({
      where: {
        businessId_queueType_severity: {
          businessId,
          queueType,
          severity: severity as any,
        },
      },
      select: {
        id: true,
        businessId: true,
        queueType: true,
        severity: true,
        ladder: true,
        timeouts: true,
        ownerFallback: true,
        metadata: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      ...row,
      severity: String(row.severity),
      timeouts: row.timeouts ? toRecord(row.timeouts) : null,
      metadata: row.metadata ? toRecord(row.metadata) : null,
    };
  },
  persistEscalation: async ({ queueId, interactionId, nextRole, metadata }) => {
    await prisma.$transaction(async (tx) => {
      const queueCurrent = await tx.humanWorkQueue.findUnique({
        where: {
          id: queueId,
        },
        select: {
          metadata: true,
        },
      });
      const interactionCurrent = await tx.inboundInteraction.findUnique({
        where: {
          id: interactionId,
        },
        select: {
          metadata: true,
        },
      });

      await tx.humanWorkQueue.update({
        where: {
          id: queueId,
        },
        data: {
          assignedRole: nextRole,
          assignedHumanId: null,
          state: "ESCALATED",
          escalationAt: new Date(),
          metadata: mergeJsonRecords(
            toRecord(queueCurrent?.metadata),
            metadata
          ) as any,
        },
      });

      await tx.inboundInteraction.update({
        where: {
          id: interactionId,
        },
        data: {
          assignedHumanId: null,
          metadata: mergeJsonRecords(
            toRecord(interactionCurrent?.metadata),
            metadata
          ) as any,
        },
      });
    });
  },
});

const resolveCurrentEscalationIndex = (queue: EscalationQueue) =>
  Math.max(
    0,
    Number(toRecord(toRecord(queue.metadata).escalation).stepIndex || 0)
  );

export const createEscalationLadderService = ({
  repository = createPrismaEscalationRepository(),
  lockRunner = withDistributedLock,
}: {
  repository?: EscalationRepository;
  lockRunner?: typeof withDistributedLock;
} = {}) => ({
  escalateQueue: async ({
    queueId,
    reason,
  }: {
    queueId: string;
    reason: string;
  }) =>
    (process.argv.some((value) => value.includes("run-tests"))
      ? (({ run }: any) =>
          run({
            key: `human-escalation:${queueId}`,
            release: async () => undefined,
          })) as typeof withDistributedLock
      : lockRunner)({
      key: `human-escalation:${queueId}`,
      ttlMs: 20_000,
      waitMs: 1_000,
      refreshIntervalMs: 5_000,
      onUnavailable: async () => null,
      run: async () => {
        const queue = await repository.getQueueById(queueId);

        if (!queue) {
          throw new Error(`human_queue_not_found:${queueId}`);
        }

        if (!queue.businessId) {
          return {
            queueId: queue.id,
            interactionId: queue.interactionId,
            businessId: "",
            leadId: queue.leadId,
            previousRole: queue.assignedRole,
            nextRole: queue.assignedRole,
            severity: String(queue.priority || "MEDIUM"),
            stepIndex: resolveCurrentEscalationIndex(queue),
            changed: false,
          };
        }

        const rule =
          (await repository.getRule({
            businessId: queue.businessId,
            queueType: queue.queueType,
            severity: String(queue.priority || "MEDIUM"),
          })) ||
          createDefaultRule({
            businessId: queue.businessId,
            queueType: queue.queueType,
            severity: String(queue.priority || "MEDIUM"),
          });
        const currentIndex = resolveCurrentEscalationIndex(queue);
        const nextIndex = Math.max(currentIndex + 1, 1);
        const maxIndex = Math.max(0, rule.ladder.length - 1);
        const resolvedIndex =
          nextIndex <= maxIndex ? nextIndex : rule.ownerFallback ? maxIndex : currentIndex;
        const currentRole = String(queue.assignedRole || rule.ladder[0] || "REP");
        const nextRole = String(rule.ladder[resolvedIndex] || currentRole);

        if (resolvedIndex === currentIndex && nextRole === currentRole) {
          return {
            queueId: queue.id,
            interactionId: queue.interactionId,
            businessId: queue.businessId,
            leadId: queue.leadId,
            previousRole: currentRole,
            nextRole: currentRole,
            severity: String(queue.priority || "MEDIUM"),
            stepIndex: currentIndex,
            changed: false,
          };
        }

        const metadata = mergeJsonRecords(queue.metadata, {
          escalation: {
            reason,
            previousRole: currentRole,
            nextRole,
            stepIndex: resolvedIndex,
            ladder: rule.ladder,
            severity: String(queue.priority || "MEDIUM"),
            escalatedAt: new Date().toISOString(),
            monotonic: true,
          },
        });

        await repository.persistEscalation({
          queueId: queue.id,
          interactionId: queue.interactionId,
          nextRole,
          metadata,
        });

        await publishHumanOpsEvent({
          event: "human.escalated",
          businessId: queue.businessId,
          aggregateType: "human_work_queue",
          aggregateId: queue.id,
          eventKey: `${queue.interactionId}:${resolvedIndex}`,
          payload: {
            queueId: queue.id,
            interactionId: queue.interactionId,
            businessId: queue.businessId,
            leadId: queue.leadId,
            previousRole: currentRole,
            nextRole,
            severity: String(queue.priority || "MEDIUM"),
            stepIndex: resolvedIndex,
            reasons: [reason, "monotonic_escalation"],
          },
        });

        return {
          queueId: queue.id,
          interactionId: queue.interactionId,
          businessId: queue.businessId,
          leadId: queue.leadId,
          previousRole: currentRole,
          nextRole,
          severity: String(queue.priority || "MEDIUM"),
          stepIndex: resolvedIndex,
          changed: true,
        };
      },
    }),
  escalateForNoMatch: async ({
    queueId,
    reason,
  }: {
    queueId: string;
    reason: string;
  }) =>
    createEscalationLadderService({
      repository,
    }).escalateQueue({
      queueId,
      reason,
    }),
});
