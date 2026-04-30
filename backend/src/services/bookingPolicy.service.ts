import prisma from "../config/prisma";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { clampNumber, toRecord, type JsonRecord } from "./reception.shared";

export type CanonicalAppointmentPolicy = {
  id: string | null;
  businessId: string;
  meetingType: string;
  duration: number;
  buffer: number;
  cooldown: number;
  prep: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  vipOverride: JsonRecord | null;
  ownerEscalationOverride: JsonRecord | null;
  maxReschedules: number;
  cancelWindowMinutes: number;
  depositRequired: boolean;
  depositAmount: number | null;
  graceWindowMinutes: number;
  noShowRetryPolicy: JsonRecord | null;
  followupRules: JsonRecord | null;
  metadata: JsonRecord | null;
};

type PolicyRepository = {
  findByMeetingType: (input: {
    businessId: string;
    meetingType: string;
  }) => Promise<any | null>;
};

const DEFAULT_POLICY: Omit<CanonicalAppointmentPolicy, "businessId" | "meetingType"> = {
  id: null,
  duration: 30,
  buffer: 5,
  cooldown: 5,
  prep: 10,
  priority: "MEDIUM",
  vipOverride: null,
  ownerEscalationOverride: null,
  maxReschedules: 2,
  cancelWindowMinutes: 60,
  depositRequired: false,
  depositAmount: null,
  graceWindowMinutes: 10,
  noShowRetryPolicy: {
    maxRetries: 2,
    retryAfterMinutes: 60,
  },
  followupRules: {
    suggestFollowupWithinDays: 14,
  },
  metadata: null,
};

const normalizePolicyRow = ({
  businessId,
  meetingType,
  row,
}: {
  businessId: string;
  meetingType: string;
  row: any | null;
}): CanonicalAppointmentPolicy => {
  if (!row) {
    return {
      ...DEFAULT_POLICY,
      businessId,
      meetingType,
    };
  }

  return {
    id: row.id,
    businessId,
    meetingType,
    duration: Math.max(5, Number(row.duration || DEFAULT_POLICY.duration)),
    buffer: Math.max(0, Number(row.buffer || DEFAULT_POLICY.buffer)),
    cooldown: Math.max(0, Number(row.cooldown || DEFAULT_POLICY.cooldown)),
    prep: Math.max(0, Number(row.prep || DEFAULT_POLICY.prep)),
    priority: (row.priority || DEFAULT_POLICY.priority) as CanonicalAppointmentPolicy["priority"],
    vipOverride: toRecord(row.vipOverride),
    ownerEscalationOverride: toRecord(row.ownerEscalationOverride),
    maxReschedules: Math.max(
      0,
      Number(row.maxReschedules ?? DEFAULT_POLICY.maxReschedules)
    ),
    cancelWindowMinutes: Math.max(
      0,
      Number(row.cancelWindowMinutes ?? DEFAULT_POLICY.cancelWindowMinutes)
    ),
    depositRequired: Boolean(row.depositRequired),
    depositAmount:
      row.depositAmount === null || row.depositAmount === undefined
        ? null
        : Math.max(0, Number(row.depositAmount || 0)),
    graceWindowMinutes: Math.max(
      0,
      Number(row.graceWindowMinutes ?? DEFAULT_POLICY.graceWindowMinutes)
    ),
    noShowRetryPolicy: toRecord(row.noShowRetryPolicy),
    followupRules: toRecord(row.followupRules),
    metadata: toRecord(row.metadata),
  };
};

const createPrismaPolicyRepository = (): PolicyRepository => ({
  findByMeetingType: ({ businessId, meetingType }) =>
    prisma.appointmentPolicy.findUnique({
      where: {
        businessId_meetingType: {
          businessId,
          meetingType,
        },
      },
    }),
});

export const evaluateReschedulePolicy = ({
  policy,
  rescheduleCount,
  isVip = false,
  isOwnerEscalation = false,
}: {
  policy: CanonicalAppointmentPolicy;
  rescheduleCount: number;
  isVip?: boolean;
  isOwnerEscalation?: boolean;
}) => {
  if (isOwnerEscalation) {
    return {
      allowed: true,
      reason: "owner_escalation_override",
    };
  }

  const vipMax =
    Number(toRecord(policy.vipOverride).maxReschedules ?? policy.maxReschedules) ||
    policy.maxReschedules;
  const maxAllowed = isVip ? Math.max(policy.maxReschedules, vipMax) : policy.maxReschedules;

  if (rescheduleCount >= maxAllowed) {
    return {
      allowed: false,
      reason: "max_reschedule_limit_reached",
      maxAllowed,
    };
  }

  return {
    allowed: true,
    reason: "policy_ok",
    maxAllowed,
  };
};

export const evaluateCancellationPolicy = ({
  policy,
  startAt,
  now = new Date(),
  isVip = false,
  isOwnerEscalation = false,
}: {
  policy: CanonicalAppointmentPolicy;
  startAt: Date | null;
  now?: Date;
  isVip?: boolean;
  isOwnerEscalation?: boolean;
}) => {
  if (!startAt) {
    return {
      allowed: true,
      reason: "unscheduled_booking",
      lateCancel: false,
      requiresDepositForfeit: false,
    };
  }

  if (isOwnerEscalation) {
    return {
      allowed: true,
      reason: "owner_escalation_override",
      lateCancel: false,
      requiresDepositForfeit: false,
    };
  }

  const vipCancelWindow =
    Number(toRecord(policy.vipOverride).cancelWindowMinutes ?? policy.cancelWindowMinutes) ||
    policy.cancelWindowMinutes;
  const cancelWindowMinutes = isVip
    ? Math.max(0, Math.min(policy.cancelWindowMinutes, vipCancelWindow))
    : policy.cancelWindowMinutes;
  const minutesUntilStart = Math.floor((startAt.getTime() - now.getTime()) / 60_000);
  const lateCancel = minutesUntilStart < cancelWindowMinutes;

  return {
    allowed: true,
    reason: lateCancel ? "late_cancel" : "policy_ok",
    lateCancel,
    minutesUntilStart,
    requiresDepositForfeit: lateCancel && Boolean(policy.depositRequired),
  };
};

export const resolveReminderCadence = ({
  noShowRisk,
  isVip = false,
  aggression = 0,
}: {
  noShowRisk: number;
  isVip?: boolean;
  aggression?: number;
}) => {
  const normalizedRisk = clampNumber(noShowRisk, 0, 100);
  const normalizedAggression = clampNumber(aggression, 0, 3);
  const cadence = [
    "24H",
    "2H",
    "30M",
    "5M",
  ];

  if (normalizedRisk >= 60 || normalizedAggression >= 2) {
    cadence.unshift("48H");
  }

  if (normalizedRisk >= 82 || normalizedAggression >= 3) {
    cadence.unshift("72H");
  }

  if (isVip || normalizedAggression >= 2.5) {
    cadence.push("WHITE_GLOVE");
  }

  return cadence;
};

export const createBookingPolicyService = ({
  repository = createPrismaPolicyRepository(),
}: {
  repository?: PolicyRepository;
} = {}) => ({
  resolvePolicy: async ({
    businessId,
    meetingType,
  }: {
    businessId: string;
    meetingType: string;
  }) => {
    const basePolicy = normalizePolicyRow({
      businessId,
      meetingType,
      row: await repository.findByMeetingType({
        businessId,
        meetingType,
      }),
    });
    const runtime = await getIntelligenceRuntimeInfluence({
      businessId,
    }).catch(() => null);

    if (!runtime) {
      return basePolicy;
    }

    const tightenedRescheduleLimit = Math.max(
      0,
      Math.round(
        basePolicy.maxReschedules - runtime.controls.booking.noShowMitigationLevel
      )
    );
    const cancelWindowBoost = Math.round(
      runtime.controls.booking.noShowMitigationLevel * 30
    );

    return {
      ...basePolicy,
      priority:
        runtime.controls.crm.priorityDelta >= 20
          ? "HIGH"
          : basePolicy.priority,
      depositRequired:
        basePolicy.depositRequired || runtime.controls.booking.depositRequired,
      depositAmount:
        basePolicy.depositAmount !== null
          ? basePolicy.depositAmount
          : runtime.controls.booking.depositRequired
          ? Math.max(500, Math.round(2500 * runtime.controls.commerce.priceMultiplier))
          : null,
      maxReschedules:
        runtime.controls.booking.depositRequired || runtime.controls.booking.noShowMitigationLevel > 1
          ? tightenedRescheduleLimit
          : basePolicy.maxReschedules,
      cancelWindowMinutes: Math.max(
        basePolicy.cancelWindowMinutes,
        basePolicy.cancelWindowMinutes + cancelWindowBoost
      ),
      metadata: {
        ...toRecord(basePolicy.metadata),
        intelligencePolicyVersion: runtime.policyVersion,
        intelligenceGeneratedAt: runtime.generatedAt,
        intelligenceNoShowMitigation: runtime.controls.booking.noShowMitigationLevel,
      },
    };
  },
});
