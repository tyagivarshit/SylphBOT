import prisma from "../config/prisma";
import { clampNumber, toRecord } from "./reception.shared";
import { toSafeTimezone } from "./appointment.shared";

type AvailabilityPlannerRepository = {
  listSlots: (input: {
    businessId: string;
    windowStart: Date;
    windowEnd: Date;
  }) => Promise<any[]>;
  listBlockedSlots: (input: {
    businessId: string;
    windowStart: Date;
    windowEnd: Date;
  }) => Promise<any[]>;
  listHumanAvailability: (input: {
    businessId: string;
  }) => Promise<any[]>;
};

const createPrismaAvailabilityPlannerRepository = (): AvailabilityPlannerRepository => ({
  listSlots: ({ businessId, windowStart, windowEnd }) =>
    prisma.availabilitySlot.findMany({
      where: {
        businessId,
        startAt: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: [
        {
          startAt: "asc",
        },
      ],
    }),
  listBlockedSlots: ({ businessId, windowStart, windowEnd }) =>
    prisma.availabilitySlot.findMany({
      where: {
        businessId,
        blocked: true,
        startAt: {
          lt: windowEnd,
        },
        endAt: {
          gt: windowStart,
        },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
      },
    }),
  listHumanAvailability: ({ businessId }) =>
    prisma.humanAvailabilityState.findMany({
      where: {
        businessId,
      },
    }),
});

export type PlannedSlotCandidate = {
  slotId: string;
  slotKey: string;
  startAt: Date;
  endAt: Date;
  score: number;
  reason: string;
  detail: Record<string, unknown>;
};

const scoreSlot = ({
  slot,
  humanMap,
  input,
  now,
}: {
  slot: any;
  humanMap: Map<string, any>;
  input: {
    timezone: string;
    language?: string | null;
    requiredSkills?: string[];
    preferredHumanId?: string | null;
    preferredTeamId?: string | null;
    isVip?: boolean;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    noShowRisk?: number;
    concurrencyCap?: number | null;
  };
  now: Date;
}) => {
  const metadata = toRecord(slot.metadata);
  const human = slot.humanId ? humanMap.get(slot.humanId) : null;
  const requiredSkills = (input.requiredSkills || []).map((skill) =>
    String(skill || "").trim().toLowerCase()
  );
  const slotSkills = Array.isArray(metadata.skills)
    ? metadata.skills.map((skill) => String(skill || "").trim().toLowerCase())
    : [];
  const slotLanguages = Array.isArray(metadata.languages)
    ? metadata.languages.map((value) => String(value || "").trim().toLowerCase())
    : [];
  const requestedLanguage = String(input.language || "").trim().toLowerCase();
  const timezoneMatch = slot.timezone === input.timezone ? 1 : 0;
  const capacity = Math.max(1, Number(slot.capacity || 1));
  const reservedCount = Math.max(0, Number(slot.reservedCount || 0));
  const headroom = clampNumber(((capacity - reservedCount) / capacity) * 100, 0, 100);
  const humanLoadPenalty = human
    ? clampNumber((Number(human.activeLoad || 0) / Math.max(1, Number(human.maxLoad || 1))) * 100, 0, 100)
    : 0;
  const skillCoverage =
    requiredSkills.length === 0
      ? 100
      : clampNumber(
          (requiredSkills.filter((skill) => slotSkills.includes(skill)).length /
            requiredSkills.length) *
            100,
          0,
          100
        );
  const languageCoverage =
    !requestedLanguage
      ? 100
      : slotLanguages.includes(requestedLanguage) ||
        String(human?.language || "").trim().toLowerCase() === requestedLanguage
      ? 100
      : 0;
  const urgencyWeight =
    input.urgency === "CRITICAL"
      ? 1.4
      : input.urgency === "HIGH"
      ? 1.2
      : input.urgency === "MEDIUM"
      ? 1
      : 0.8;
  const minutesUntilStart = Math.max(
    0,
    Math.floor((new Date(slot.startAt).getTime() - now.getTime()) / 60_000)
  );
  const responsivenessScore =
    input.urgency === "LOW"
      ? clampNumber(100 - minutesUntilStart / 30, 0, 100)
      : clampNumber(100 - minutesUntilStart / 15, 0, 100);
  const vipBoost =
    input.isVip &&
    (slot.humanId === input.preferredHumanId || slot.teamId === input.preferredTeamId)
      ? 10
      : 0;
  const noShowRiskPenalty = clampNumber(Number(input.noShowRisk || 0), 0, 100) * 0.12;
  const concurrencyPenalty =
    input.concurrencyCap && reservedCount >= input.concurrencyCap ? 20 : 0;

  const rawScore =
    timezoneMatch * 8 +
    (headroom * 0.22 +
      skillCoverage * 0.22 +
      languageCoverage * 0.14 +
      responsivenessScore * 0.18 +
      (100 - humanLoadPenalty) * 0.14) *
      urgencyWeight +
    vipBoost -
    noShowRiskPenalty -
    concurrencyPenalty;

  const finalScore = clampNumber(rawScore, 0, 100);
  const reason = [
    `headroom:${Math.round(headroom)}`,
    `skill:${Math.round(skillCoverage)}`,
    `language:${Math.round(languageCoverage)}`,
    `urgency:${input.urgency || "MEDIUM"}`,
    `vip_boost:${vipBoost}`,
    `no_show_penalty:${Math.round(noShowRiskPenalty)}`,
  ].join("|");

  return {
    score: finalScore,
    reason,
    detail: {
      timezoneMatch,
      headroom,
      humanLoadPenalty,
      skillCoverage,
      languageCoverage,
      responsivenessScore,
      vipBoost,
      noShowRiskPenalty,
      concurrencyPenalty,
    },
  };
};

export const createAvailabilityPlannerService = ({
  repository = createPrismaAvailabilityPlannerRepository(),
}: {
  repository?: AvailabilityPlannerRepository;
} = {}) => ({
  getRankedSlots: async ({
    businessId,
    windowStart,
    windowEnd,
    timezone,
    language,
    requiredSkills,
    preferredHumanId,
    preferredTeamId,
    isVip = false,
    urgency = "MEDIUM",
    noShowRisk = 0,
    concurrencyCap = null,
    maxResults = 10,
  }: {
    businessId: string;
    windowStart: Date;
    windowEnd: Date;
    timezone: string;
    language?: string | null;
    requiredSkills?: string[];
    preferredHumanId?: string | null;
    preferredTeamId?: string | null;
    isVip?: boolean;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    noShowRisk?: number;
    concurrencyCap?: number | null;
    maxResults?: number;
  }): Promise<PlannedSlotCandidate[]> => {
    const now = new Date();
    const [slots, blockedSlots, humans] = await Promise.all([
      repository.listSlots({
        businessId,
        windowStart,
        windowEnd,
      }),
      repository.listBlockedSlots({
        businessId,
        windowStart,
        windowEnd,
      }),
      repository.listHumanAvailability({
        businessId,
      }),
    ]);
    const humanMap = new Map(humans.map((row) => [row.humanId, row]));
    const safeTimezone = toSafeTimezone(timezone, "UTC");

    const candidates = slots
      .filter((slot) => !slot.blocked)
      .filter((slot) => {
        for (const blocked of blockedSlots) {
          if (blocked.id === slot.id) {
            continue;
          }

          if (blocked.startAt < slot.endAt && blocked.endAt > slot.startAt) {
            return false;
          }
        }

        return true;
      })
      .filter((slot) => {
        if (slot.startAt <= now) {
          return false;
        }

        const capacity = Math.max(1, Number(slot.capacity || 1));
        const reservedCount = Math.max(0, Number(slot.reservedCount || 0));

        return reservedCount < capacity;
      })
      .map((slot) => {
        const score = scoreSlot({
          slot,
          humanMap,
          input: {
            timezone: safeTimezone,
            language,
            requiredSkills,
            preferredHumanId,
            preferredTeamId,
            isVip,
            urgency,
            noShowRisk,
            concurrencyCap,
          },
          now,
        });

        return {
          slotId: slot.id,
          slotKey: slot.slotKey,
          startAt: slot.startAt,
          endAt: slot.endAt,
          score: score.score,
          reason: score.reason,
          detail: score.detail,
        } satisfies PlannedSlotCandidate;
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        const startDelta = left.startAt.getTime() - right.startAt.getTime();

        if (startDelta !== 0) {
          return startDelta;
        }

        return left.slotKey.localeCompare(right.slotKey);
      })
      .slice(0, Math.max(1, maxResults));

    return candidates;
  },
});
