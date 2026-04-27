import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import {
  publishReceptionEvent,
  type ReceptionEventWriter,
} from "./receptionEvent.service";
import type { ReceptionClassification } from "./receptionClassifier.service";
import {
  clampNumber,
  mergeJsonRecords,
  toRecord,
  type InboundInteractionAuthorityRecord,
  type JsonRecord,
  type ReceptionContextReferences,
  type ReceptionMemoryAuthorityRecord,
} from "./reception.shared";

export type ReceptionMemoryUpdateContext = {
  interaction: InboundInteractionAuthorityRecord;
  classification?: ReceptionClassification | null;
  references?: ReceptionContextReferences | null;
  communicationPreference?: JsonRecord | null;
  preferredAgentId?: string | null;
  resolutionCode?: string | null;
  resolutionScore?: number | null;
  reopenReason?: string | null;
  now?: Date;
};

export type ReceptionMemoryRepository = {
  getByLeadId: (leadId: string) => Promise<ReceptionMemoryAuthorityRecord | null>;
  upsertMemory: (input: {
    businessId: string;
    leadId: string;
    memory: Omit<ReceptionMemoryAuthorityRecord, "id" | "createdAt" | "updatedAt">;
  }) => Promise<ReceptionMemoryAuthorityRecord>;
};

type ReceptionMemoryMode = "INBOUND" | "RESOLVED" | "REOPENED";

const toReceptionMemoryRecord = (row: any): ReceptionMemoryAuthorityRecord => ({
  id: row.id,
  businessId: row.businessId,
  leadId: row.leadId,
  unresolvedCount: Number(row.unresolvedCount || 0),
  complaintCount: Number(row.complaintCount || 0),
  repeatIssueFingerprint: row.repeatIssueFingerprint || null,
  preferredAgentId: row.preferredAgentId || null,
  preferredChannel: row.preferredChannel || null,
  lastResolutionScore:
    typeof row.lastResolutionScore === "number" ? row.lastResolutionScore : null,
  escalationRisk: Number(row.escalationRisk || 0),
  abuseRisk: Number(row.abuseRisk || 0),
  vipScore: Number(row.vipScore || 0),
  communicationPreference: row.communicationPreference
    ? toRecord(row.communicationPreference)
    : null,
  metadata: row.metadata ? toRecord(row.metadata) : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const buildDefaultMemory = ({
  businessId,
  leadId,
}: {
  businessId: string;
  leadId: string;
}): Omit<ReceptionMemoryAuthorityRecord, "id" | "createdAt" | "updatedAt"> => ({
  businessId,
  leadId,
  unresolvedCount: 0,
  complaintCount: 0,
  repeatIssueFingerprint: null,
  preferredAgentId: null,
  preferredChannel: null,
  lastResolutionScore: null,
  escalationRisk: 0,
  abuseRisk: 0,
  vipScore: 0,
  communicationPreference: null,
  metadata: null,
});

const deriveEscalationRisk = ({
  unresolvedCount,
  complaintCount,
  vipScore,
  abuseRisk,
  lastResolutionScore,
}: {
  unresolvedCount: number;
  complaintCount: number;
  vipScore: number;
  abuseRisk: number;
  lastResolutionScore: number | null;
}) =>
  clampNumber(
    unresolvedCount * 18 +
      complaintCount * 14 +
      (vipScore >= 70 ? 10 : 0) +
      (abuseRisk >= 60 ? 10 : 0) +
      (lastResolutionScore !== null && lastResolutionScore < 60
        ? 60 - lastResolutionScore
        : 0)
  );

const deriveAbuseRisk = ({
  current,
  classification,
}: {
  current: number;
  classification?: ReceptionClassification | null;
}) => {
  if (!classification) {
    return current;
  }

  if (classification.intentClass === "ABUSE") {
    return 95;
  }

  return Math.max(current, Math.round(classification.spamScore * 100));
};

export const reduceReceptionMemory = ({
  current,
  context,
  mode,
}: {
  current: Omit<ReceptionMemoryAuthorityRecord, "id" | "createdAt" | "updatedAt">;
  context: ReceptionMemoryUpdateContext;
  mode: ReceptionMemoryMode;
}) => {
  const normalizedPayload = toRecord(context.interaction.normalizedPayload);
  const currentMetadata = toRecord(current.metadata);
  const isSameInteractionReplay =
    currentMetadata.lastInteractionId === context.interaction.id &&
    currentMetadata.lastMemoryEvent === mode;
  const vipScore = Math.max(
    Number(current.vipScore || 0),
    Number(context.references?.crmProfile?.vipScore || 0),
    Number(context.references?.crmProfile?.valueScore || 0)
  );
  const unresolvedCount =
    isSameInteractionReplay
      ? current.unresolvedCount
      : mode === "INBOUND" || mode === "REOPENED"
      ? current.unresolvedCount + 1
      : Math.max(0, current.unresolvedCount - 1);
  const complaintCount =
    !isSameInteractionReplay &&
    mode === "INBOUND" &&
    (context.classification?.intentClass === "COMPLAINT" ||
      context.interaction.interactionType === "REVIEW")
      ? current.complaintCount + 1
      : current.complaintCount;
  const lastResolutionScore =
    mode === "RESOLVED" && typeof context.resolutionScore === "number"
      ? clampNumber(context.resolutionScore)
      : current.lastResolutionScore;
  const abuseRisk = deriveAbuseRisk({
    current: current.abuseRisk,
    classification: context.classification,
  });
  const repeatIssueFingerprint =
    isSameInteractionReplay || mode === "RESOLVED"
      ? current.repeatIssueFingerprint
      : context.classification?.intentClass === "COMPLAINT" ||
        context.classification?.intentClass === "SUPPORT" ||
        mode === "REOPENED"
      ? context.interaction.fingerprint
      : current.repeatIssueFingerprint;
  const communicationPreference =
    mergeJsonRecords(current.communicationPreference, context.communicationPreference, {
      lastInboundChannel: context.interaction.channel,
      lastInboundLanguage: normalizedPayload.language || null,
    }) || null;
  const metadata =
    mergeJsonRecords(current.metadata, {
      lastInteractionId: context.interaction.id,
      lastMemoryEvent: mode,
      lastResolutionCode: context.resolutionCode || null,
      lastReopenReason: context.reopenReason || null,
    }) || null;
  const escalationRisk = deriveEscalationRisk({
    unresolvedCount,
    complaintCount,
    vipScore,
    abuseRisk,
    lastResolutionScore,
  });

  return {
    businessId: current.businessId,
    leadId: current.leadId,
    unresolvedCount,
    complaintCount,
    repeatIssueFingerprint,
    preferredAgentId: context.preferredAgentId || current.preferredAgentId,
    preferredChannel: context.interaction.channel,
    lastResolutionScore,
    escalationRisk,
    abuseRisk,
    vipScore,
    communicationPreference,
    metadata,
  };
};

export const createPrismaReceptionMemoryRepository =
  (): ReceptionMemoryRepository => ({
    getByLeadId: async (leadId) => {
      const row = await prisma.receptionMemory.findUnique({
        where: {
          leadId,
        },
      });

      return row ? toReceptionMemoryRecord(row) : null;
    },
    upsertMemory: async ({ businessId, leadId, memory }) => {
      const row = await prisma.receptionMemory.upsert({
        where: {
          leadId,
        },
        update: {
          unresolvedCount: memory.unresolvedCount,
          complaintCount: memory.complaintCount,
          repeatIssueFingerprint: memory.repeatIssueFingerprint,
          preferredAgentId: memory.preferredAgentId,
          preferredChannel: memory.preferredChannel || undefined,
          lastResolutionScore: memory.lastResolutionScore,
          escalationRisk: memory.escalationRisk,
          abuseRisk: memory.abuseRisk,
          vipScore: memory.vipScore,
          communicationPreference: memory.communicationPreference as Prisma.InputJsonValue,
          metadata: memory.metadata as Prisma.InputJsonValue,
        },
        create: {
          businessId,
          leadId,
          unresolvedCount: memory.unresolvedCount,
          complaintCount: memory.complaintCount,
          repeatIssueFingerprint: memory.repeatIssueFingerprint,
          preferredAgentId: memory.preferredAgentId,
          preferredChannel: memory.preferredChannel || undefined,
          lastResolutionScore: memory.lastResolutionScore,
          escalationRisk: memory.escalationRisk,
          abuseRisk: memory.abuseRisk,
          vipScore: memory.vipScore,
          communicationPreference: memory.communicationPreference as Prisma.InputJsonValue,
          metadata: memory.metadata as Prisma.InputJsonValue,
        },
      });

      return toReceptionMemoryRecord(row);
    },
  });

export const createReceptionMemoryService = ({
  repository = createPrismaReceptionMemoryRepository(),
  eventWriter = publishReceptionEvent,
}: {
  repository?: ReceptionMemoryRepository;
  eventWriter?: ReceptionEventWriter;
} = {}) => {
  const loadCurrent = async (context: ReceptionMemoryUpdateContext) => {
    const existing = await repository.getByLeadId(context.interaction.leadId);

    return (
      existing || buildDefaultMemory({
        businessId: context.interaction.businessId,
        leadId: context.interaction.leadId,
      })
    );
  };

  return {
    reduce: reduceReceptionMemory,
    recordInbound: async (context: ReceptionMemoryUpdateContext) => {
      const current = await loadCurrent(context);
      const next = reduceReceptionMemory({
        current,
        context,
        mode: "INBOUND",
      });

      return repository.upsertMemory({
        businessId: context.interaction.businessId,
        leadId: context.interaction.leadId,
        memory: next,
      });
    },
    recordResolution: async (context: ReceptionMemoryUpdateContext) => {
      const current = await loadCurrent(context);
      const next = reduceReceptionMemory({
        current,
        context,
        mode: "RESOLVED",
      });
      const memory = await repository.upsertMemory({
        businessId: context.interaction.businessId,
        leadId: context.interaction.leadId,
        memory: next,
      });

      await eventWriter({
        event: "interaction.resolved",
        businessId: context.interaction.businessId,
        aggregateType: "reception_memory",
        aggregateId: memory.id,
        eventKey: `${context.interaction.externalInteractionKey}:resolved`,
        payload: {
          interactionId: context.interaction.id,
          businessId: context.interaction.businessId,
          leadId: context.interaction.leadId,
          queueId: context.interaction.assignedQueueId,
          resolutionCode: context.resolutionCode || null,
          lifecycleState: "RESOLVED",
          resolvedAt: (context.now || new Date()).toISOString(),
          resolutionScore:
            typeof context.resolutionScore === "number"
              ? clampNumber(context.resolutionScore)
              : null,
          traceId: context.interaction.traceId,
        },
      });

      return memory;
    },
    recordReopen: async (context: ReceptionMemoryUpdateContext) => {
      const current = await loadCurrent(context);
      const next = reduceReceptionMemory({
        current,
        context,
        mode: "REOPENED",
      });
      const memory = await repository.upsertMemory({
        businessId: context.interaction.businessId,
        leadId: context.interaction.leadId,
        memory: next,
      });

      await eventWriter({
        event: "interaction.reopened",
        businessId: context.interaction.businessId,
        aggregateType: "reception_memory",
        aggregateId: memory.id,
        eventKey: `${context.interaction.externalInteractionKey}:reopened`,
        payload: {
          interactionId: context.interaction.id,
          businessId: context.interaction.businessId,
          leadId: context.interaction.leadId,
          queueId: context.interaction.assignedQueueId,
          lifecycleState: "REOPENED",
          reopenedAt: (context.now || new Date()).toISOString(),
          reason: context.reopenReason || "reopened",
          traceId: context.interaction.traceId,
        },
      });

      return memory;
    },
  };
};
