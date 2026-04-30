import prisma from "../config/prisma";
import { clampNumber, mergeJsonRecords, toRecord, type JsonRecord } from "./reception.shared";

export const HUMAN_AVAILABILITY_STATES = [
  "OFFLINE",
  "AVAILABLE",
  "BUSY",
  "OVERLOADED",
  "AWAY",
] as const;

export type HumanAvailabilityStateValue = (typeof HUMAN_AVAILABILITY_STATES)[number];

export type HumanAvailabilityAuthorityRecord = {
  id: string;
  businessId: string;
  humanId: string;
  state: HumanAvailabilityStateValue;
  activeLoad: number;
  maxLoad: number;
  timezone: string | null;
  language: string | null;
  skillScore: number;
  responseScore: number;
  lastSeenAt: Date | null;
  metadata: JsonRecord | null;
  updatedAt: Date;
};

export type AvailabilityEngineRepository = {
  upsert: (input: {
    businessId: string;
    humanId: string;
    state?: HumanAvailabilityStateValue | null;
    activeLoad?: number;
    maxLoad?: number;
    timezone?: string | null;
    language?: string | null;
    skillScore?: number;
    responseScore?: number;
    metadata?: JsonRecord | null;
    lastSeenAt?: Date | null;
  }) => Promise<HumanAvailabilityAuthorityRecord>;
  find: (input: {
    businessId: string;
    humanId: string;
  }) => Promise<HumanAvailabilityAuthorityRecord | null>;
  listByBusiness: (businessId: string) => Promise<HumanAvailabilityAuthorityRecord[]>;
};

const toAvailabilityRecord = (row: any): HumanAvailabilityAuthorityRecord => ({
  id: row.id,
  businessId: row.businessId,
  humanId: row.humanId,
  state: row.state,
  activeLoad: Number(row.activeLoad || 0),
  maxLoad: Math.max(1, Number(row.maxLoad || 1)),
  timezone: row.timezone || null,
  language: row.language || null,
  skillScore: Number(row.skillScore || 0),
  responseScore: Number(row.responseScore || 0),
  lastSeenAt: row.lastSeenAt || null,
  metadata: row.metadata ? toRecord(row.metadata) : null,
  updatedAt: row.updatedAt,
});

const normalizeAvailabilityState = ({
  requestedState,
  activeLoad,
  maxLoad,
}: {
  requestedState?: HumanAvailabilityStateValue | null;
  activeLoad: number;
  maxLoad: number;
}): HumanAvailabilityStateValue => {
  if (requestedState === "OFFLINE" || requestedState === "AWAY") {
    return requestedState;
  }

  const utilization = maxLoad > 0 ? activeLoad / maxLoad : 1;

  if (utilization >= 1) {
    return "OVERLOADED";
  }

  if (utilization >= 0.75) {
    return "BUSY";
  }

  return requestedState === "AVAILABLE" ? "AVAILABLE" : "AVAILABLE";
};

const createPrismaAvailabilityEngineRepository = (): AvailabilityEngineRepository => ({
  upsert: async ({
    businessId,
    humanId,
    state,
    activeLoad,
    maxLoad,
    timezone,
    language,
    skillScore,
    responseScore,
    metadata,
    lastSeenAt,
  }) => {
    const current = await prisma.humanAvailabilityState.findUnique({
      where: {
        businessId_humanId: {
          businessId,
          humanId,
        },
      },
      select: {
        activeLoad: true,
        maxLoad: true,
        metadata: true,
      },
    });
    const resolvedActiveLoad = Math.max(
      0,
      Number(activeLoad ?? current?.activeLoad ?? 0)
    );
    const resolvedMaxLoad = Math.max(1, Number(maxLoad ?? current?.maxLoad ?? 1));
    const resolvedState = normalizeAvailabilityState({
      requestedState: state,
      activeLoad: resolvedActiveLoad,
      maxLoad: resolvedMaxLoad,
    });

    const row = await prisma.humanAvailabilityState.upsert({
      where: {
        businessId_humanId: {
          businessId,
          humanId,
        },
      },
      update: {
        state: resolvedState as any,
        activeLoad: resolvedActiveLoad,
        maxLoad: resolvedMaxLoad,
        timezone: timezone === undefined ? undefined : timezone,
        language: language === undefined ? undefined : language,
        skillScore:
          skillScore === undefined
            ? undefined
            : clampNumber(Number(skillScore), 0, 100),
        responseScore:
          responseScore === undefined
            ? undefined
            : clampNumber(Number(responseScore), 0, 100),
        lastSeenAt: lastSeenAt === undefined ? undefined : lastSeenAt,
        metadata:
          metadata === undefined
            ? undefined
            : (mergeJsonRecords(toRecord(current?.metadata), metadata) as any),
      },
      create: {
        businessId,
        humanId,
        state: resolvedState as any,
        activeLoad: resolvedActiveLoad,
        maxLoad: resolvedMaxLoad,
        timezone: timezone || null,
        language: language || null,
        skillScore: clampNumber(Number(skillScore || 0), 0, 100),
        responseScore: clampNumber(Number(responseScore || 0), 0, 100),
        lastSeenAt: lastSeenAt === undefined ? new Date() : lastSeenAt,
        metadata: metadata ? (metadata as any) : undefined,
      },
      select: {
        id: true,
        businessId: true,
        humanId: true,
        state: true,
        activeLoad: true,
        maxLoad: true,
        timezone: true,
        language: true,
        skillScore: true,
        responseScore: true,
        lastSeenAt: true,
        metadata: true,
        updatedAt: true,
      },
    });

    return toAvailabilityRecord(row);
  },
  find: async ({ businessId, humanId }) => {
    const row = await prisma.humanAvailabilityState.findUnique({
      where: {
        businessId_humanId: {
          businessId,
          humanId,
        },
      },
      select: {
        id: true,
        businessId: true,
        humanId: true,
        state: true,
        activeLoad: true,
        maxLoad: true,
        timezone: true,
        language: true,
        skillScore: true,
        responseScore: true,
        lastSeenAt: true,
        metadata: true,
        updatedAt: true,
      },
    });

    return row ? toAvailabilityRecord(row) : null;
  },
  listByBusiness: async (businessId) => {
    const rows = await prisma.humanAvailabilityState.findMany({
      where: {
        businessId,
      },
      select: {
        id: true,
        businessId: true,
        humanId: true,
        state: true,
        activeLoad: true,
        maxLoad: true,
        timezone: true,
        language: true,
        skillScore: true,
        responseScore: true,
        lastSeenAt: true,
        metadata: true,
        updatedAt: true,
      },
    });

    return rows.map(toAvailabilityRecord);
  },
});

export const createAvailabilityEngineService = ({
  repository = createPrismaAvailabilityEngineRepository(),
}: {
  repository?: AvailabilityEngineRepository;
} = {}) => ({
  heartbeat: async ({
    businessId,
    humanId,
    language,
    timezone,
    maxLoad,
    metadata,
  }: {
    businessId: string;
    humanId: string;
    language?: string | null;
    timezone?: string | null;
    maxLoad?: number;
    metadata?: JsonRecord | null;
  }) =>
    repository.upsert({
      businessId,
      humanId,
      state: "AVAILABLE",
      language,
      timezone,
      maxLoad,
      lastSeenAt: new Date(),
      metadata,
    }),
  setState: async ({
    businessId,
    humanId,
    state,
    metadata,
  }: {
    businessId: string;
    humanId: string;
    state: HumanAvailabilityStateValue;
    metadata?: JsonRecord | null;
  }) =>
    repository.upsert({
      businessId,
      humanId,
      state,
      lastSeenAt: new Date(),
      metadata,
    }),
  reserveSlot: async ({
    businessId,
    humanId,
  }: {
    businessId: string;
    humanId: string;
  }) => {
    const current = await repository.find({
      businessId,
      humanId,
    });

    if (!current) {
      return repository.upsert({
        businessId,
        humanId,
        state: "OVERLOADED",
        activeLoad: 1,
        maxLoad: 1,
      });
    }

    return repository.upsert({
      businessId,
      humanId,
      activeLoad: current.activeLoad + 1,
      maxLoad: current.maxLoad,
      state: current.state,
      metadata: current.metadata,
      lastSeenAt: new Date(),
    });
  },
  releaseSlot: async ({
    businessId,
    humanId,
  }: {
    businessId: string;
    humanId: string;
  }) => {
    const current = await repository.find({
      businessId,
      humanId,
    });

    if (!current) {
      return null;
    }

    return repository.upsert({
      businessId,
      humanId,
      activeLoad: Math.max(0, current.activeLoad - 1),
      maxLoad: current.maxLoad,
      state: current.state,
      metadata: current.metadata,
      lastSeenAt: new Date(),
    });
  },
  listAssignable: async ({ businessId }: { businessId: string }) =>
    repository.listByBusiness(businessId).then((rows) =>
      rows.filter(
        (row) =>
          !["OFFLINE", "AWAY"].includes(row.state) && row.activeLoad < row.maxLoad
      )
    ),
});
