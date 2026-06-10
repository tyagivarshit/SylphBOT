import prisma from "../config/prisma";
import { listRevenueTouchTrackingRows } from "../services/revenueTouchLedger.service";

const ANALYTICS_SUPPORTED_WINDOW_DAYS = [7, 30, 90] as const;
const ANALYTICS_MAX_LOOKBACK_DAYS = 90;
const ANALYTICS_LEGACY_COMPARISON_LOOKBACK_DAYS = ANALYTICS_MAX_LOOKBACK_DAYS * 2;
const ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS = {
  7: 1000,
  30: 3000,
  90: 8000,
} as const;

const ANALYTICS_MAX_LEADS_RANGE_ROWS = ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS[90];
const ANALYTICS_MAX_MESSAGES_RANGE_ROWS = ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS[90];
const ANALYTICS_MAX_CONVERSION_EVENT_ROWS = 6000;
const ANALYTICS_MAX_REVENUE_EVENT_ROWS = 6000;
const ANALYTICS_MAX_APPOINTMENT_RANGE_ROWS = ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS[90];
const ANALYTICS_MAX_APPOINTMENT_BY_LEAD_ROWS = ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS[90];
const ANALYTICS_MAX_APPOINTMENT_ALL_ROWS = ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS[90];
const ACTIVE_BOOKING_STATUSES: string[] = [
  "CONFIRMED",
  "RESCHEDULED",
  "CHECKED_IN",
  "COMPLETED",
  "FOLLOWUP_BOOKED",
  "REMINDER_SENT",
];
const QUALIFIED_STAGES: string[] = ["QUALIFIED", "READY_TO_BUY", "WON"];
const READY_STAGES: string[] = ["READY_TO_BUY", "WON"];

export type AnalyticsLeadRecord = {
  id: string;
  createdAt: Date;
  platform: string;
  stage: string;
  aiStage: string | null;
  intent: string | null;
  leadScore: number;
  unreadCount: number;
  followupCount: number;
  isHumanActive: boolean;
  lastMessageAt: Date | null;
};

export type AnalyticsMessageRecord = {
  leadId: string;
  sender: string;
  createdAt: Date;
};

export type AnalyticsConversionEventRecord = {
  id: string;
  leadId: string;
  messageId: string | null;
  variantId: string | null;
  outcome: string;
  value: number | null;
  occurredAt: Date;
};

export type AnalyticsRevenueBrainEventRecord = {
  type: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

export type AnalyticsTrackedMessageRecord = {
  id: string;
  messageId: string;
  leadId: string;
  variantId: string | null;
  source: string;
  cta: string | null;
  angle: string | null;
  leadState: string | null;
  messageType: string;
  sentAt: Date;
  metadata?: unknown;
  message: {
    content: string;
  };
  variant: {
    variantKey: string;
    label: string;
    tone: string;
    ctaStyle: string;
    messageLength: string;
  } | null;
};

export type AnalyticsAppointmentRecord = {
  leadId: string | null;
  status: string;
  createdAt: Date;
  startTime: Date;
};

export type AnalyticsBusinessProfile = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  teamSize: string | null;
  timezone: string | null;
};

export type AnalyticsLeadSummary = {
  total: number;
  unreadBacklog: number;
  unreadQualifiedLeads: number;
  hotLeadCount: number;
  activeConversations: number;
  humanTakeoverCount: number;
  totalFollowups: number;
  averageFollowups: number;
  qualifiedLeadCount: number;
  readyLeadCount: number;
};

export type AnalyticsDistributionCount = {
  key: string;
  count: number;
};

const leadSelect = {
  id: true,
  createdAt: true,
  platform: true,
  stage: true,
  aiStage: true,
  intent: true,
  leadScore: true,
  unreadCount: true,
  followupCount: true,
  isHumanActive: true,
  lastMessageAt: true,
} as const;

const messageSelect = {
  leadId: true,
  sender: true,
  createdAt: true,
} as const;

const conversionEventSelect = {
  id: true,
  leadId: true,
  messageId: true,
  variantId: true,
  outcome: true,
  value: true,
  occurredAt: true,
} as const;

const appointmentSelect = {
  leadId: true,
  status: true,
  createdAt: true,
  startTime: true,
} as const;

function getBoundedAnalyticsStart(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function getAnalyticsWindowDays(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay) + 1;
}

function getAnalyticsRowLimit(start: Date, end: Date) {
  const days = getAnalyticsWindowDays(start, end);

  if (days <= ANALYTICS_SUPPORTED_WINDOW_DAYS[0]) {
    return ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS[7];
  }

  if (days <= ANALYTICS_SUPPORTED_WINDOW_DAYS[1]) {
    return ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS[30];
  }

  return ANALYTICS_ROW_LIMITS_BY_WINDOW_DAYS[90];
}

function qualifiedLeadWhere() {
  return {
    stage: {
      in: QUALIFIED_STAGES,
    },
  };
}

function readyLeadWhere() {
  return {
    OR: [
      {
        stage: {
          in: READY_STAGES,
        },
      },
      { aiStage: "HOT" },
      {
        leadScore: {
          gte: 8,
        },
      },
    ],
  };
}

function hotLeadWhere() {
  return readyLeadWhere();
}

function warmLeadWhere() {
  return {
    AND: [
      {
        NOT: hotLeadWhere(),
      },
      {
        OR: [
          { aiStage: "WARM" },
          {
            leadScore: {
              gte: 4,
            },
          },
          { stage: "INTERESTED" },
        ],
      },
    ],
  };
}

function baseLeadWhere(businessId: string, start?: Date, end?: Date) {
  return {
    businessId,
    deletedAt: null,
    ...(start || end
      ? {
          createdAt: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          },
        }
      : {}),
  };
}

function baseAppointmentWhere(businessId: string, start?: Date, end?: Date) {
  return {
    businessId,
    ...(start || end
      ? {
          createdAt: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          },
        }
      : {}),
  };
}

export async function getBusinessProfile(
  businessId: string
): Promise<AnalyticsBusinessProfile | null> {
  return prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      industry: true,
      website: true,
      teamSize: true,
      timezone: true,
    },
  });
}

export async function getLeadsInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsLeadRecord[]> {
  return prisma.lead.findMany({
    where: baseLeadWhere(businessId, start, end),
    orderBy: {
      createdAt: "desc",
    },
    select: leadSelect,
    take: Math.min(getAnalyticsRowLimit(start, end), ANALYTICS_MAX_LEADS_RANGE_ROWS),
  });
}

export async function getAllLeads(
  businessId: string
): Promise<AnalyticsLeadRecord[]> {
  const start = getBoundedAnalyticsStart(ANALYTICS_LEGACY_COMPARISON_LOOKBACK_DAYS);

  return prisma.lead.findMany({
    where: baseLeadWhere(businessId, start),
    orderBy: {
      createdAt: "desc",
    },
    select: leadSelect,
    take: ANALYTICS_MAX_LEADS_RANGE_ROWS,
  });
}

export async function getLeadSummaries(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsLeadSummary> {
  const where = baseLeadWhere(businessId, start, end);

  const [
    total,
    unreadBacklog,
    unreadQualifiedLeads,
    hotLeadCount,
    activeConversations,
    humanTakeoverCount,
    qualifiedLeadCount,
    readyLeadCount,
    followupAggregate,
  ] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { ...where, unreadCount: { gt: 0 } } }),
    prisma.lead.count({
      where: {
        ...where,
        unreadCount: { gt: 0 },
        ...qualifiedLeadWhere(),
      },
    }),
    prisma.lead.count({ where: { ...where, ...hotLeadWhere() } }),
    prisma.lead.count({ where: { ...where, lastMessageAt: { not: null } } }),
    prisma.lead.count({ where: { ...where, isHumanActive: true } }),
    prisma.lead.count({ where: { ...where, ...qualifiedLeadWhere() } }),
    prisma.lead.count({ where: { ...where, ...readyLeadWhere() } }),
    prisma.lead.aggregate({
      where,
      _sum: {
        followupCount: true,
      },
    }),
  ]);
  const totalFollowups = followupAggregate._sum.followupCount || 0;

  return {
    total,
    unreadBacklog,
    unreadQualifiedLeads,
    hotLeadCount,
    activeConversations,
    humanTakeoverCount,
    totalFollowups,
    averageFollowups: total ? totalFollowups / total : 0,
    qualifiedLeadCount,
    readyLeadCount,
  };
}

export async function getHotLeadCount(
  businessId: string,
  start: Date,
  end: Date
): Promise<number> {
  return prisma.lead.count({
    where: {
      ...baseLeadWhere(businessId, start, end),
      ...hotLeadWhere(),
    },
  });
}

export async function getUnreadBacklogCount(
  businessId: string,
  start: Date,
  end: Date
): Promise<number> {
  return prisma.lead.count({
    where: {
      ...baseLeadWhere(businessId, start, end),
      unreadCount: {
        gt: 0,
      },
    },
  });
}

export async function getQualifiedLeadCount(
  businessId: string,
  start: Date,
  end: Date
): Promise<number> {
  return prisma.lead.count({
    where: {
      ...baseLeadWhere(businessId, start, end),
      ...qualifiedLeadWhere(),
    },
  });
}

export async function getStageDistributionCounts(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsDistributionCount[]> {
  const rows = await prisma.lead.groupBy({
    by: ["stage"],
    where: baseLeadWhere(businessId, start, end),
    _count: {
      _all: true,
    },
  });

  return rows.map((row) => ({
    key: (row.stage || "NEW").toUpperCase(),
    count: row._count._all,
  }));
}

export async function getTemperatureDistributionCounts(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsDistributionCount[]> {
  const where = baseLeadWhere(businessId, start, end);
  const [total, hot, warm] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { ...where, ...hotLeadWhere() } }),
    prisma.lead.count({ where: { ...where, ...warmLeadWhere() } }),
  ]);

  return [
    { key: "HOT", count: hot },
    { key: "WARM", count: warm },
    { key: "COLD", count: Math.max(total - hot - warm, 0) },
  ];
}

export async function getIntentDistributionCounts(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsDistributionCount[]> {
  const rows = await prisma.lead.groupBy({
    by: ["intent"],
    where: {
      ...baseLeadWhere(businessId, start, end),
      intent: {
        not: null,
      },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        intent: "desc",
      },
    },
    take: 6,
  });

  return rows.map((row) => ({
    key: (row.intent || "GENERAL").toUpperCase(),
    count: row._count._all,
  }));
}

export async function getMessagesInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsMessageRecord[]> {
  return prisma.message.findMany({
    where: {
      businessId,
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: messageSelect,
    take: Math.min(
      getAnalyticsRowLimit(start, end),
      ANALYTICS_MAX_MESSAGES_RANGE_ROWS
    ),
  });
}

export async function getConversionEventsInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsConversionEventRecord[]> {
  return prisma.conversionEvent.findMany({
    where: {
      businessId,
      occurredAt: {
        gte: start,
        lte: end,
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
    select: conversionEventSelect,
    take: ANALYTICS_MAX_CONVERSION_EVENT_ROWS,
  });
}

export async function getTrackedMessagesInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsTrackedMessageRecord[]> {
  return listRevenueTouchTrackingRows({
    businessId,
    start,
    end,
  }) as Promise<AnalyticsTrackedMessageRecord[]>;
}

export async function getRevenueBrainAnalyticsInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsRevenueBrainEventRecord[]> {
  return prisma.analytics.findMany({
    where: {
      businessId,
      type: {
        in: [
          "REVENUE_BRAIN_COMPLETED",
          "REVENUE_BRAIN_FAILED",
          "REVENUE_BRAIN_TOOL",
        ],
      },
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    select: {
      type: true,
      meta: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: ANALYTICS_MAX_REVENUE_EVENT_ROWS,
  }) as Promise<AnalyticsRevenueBrainEventRecord[]>;
}

export async function getAppointmentsInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsAppointmentRecord[]> {
  return prisma.appointment.findMany({
    where: baseAppointmentWhere(businessId, start, end),
    orderBy: {
      createdAt: "desc",
    },
    select: appointmentSelect,
    take: Math.min(
      getAnalyticsRowLimit(start, end),
      ANALYTICS_MAX_APPOINTMENT_RANGE_ROWS
    ),
  });
}

export async function getAppointmentsForLeadIds(
  leadIds: string[]
): Promise<AnalyticsAppointmentRecord[]> {
  if (leadIds.length === 0) {
    return [];
  }

  return prisma.appointment.findMany({
    where: {
      leadId: {
        in: leadIds,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: appointmentSelect,
    take: ANALYTICS_MAX_APPOINTMENT_BY_LEAD_ROWS,
  });
}

export async function getAllLeadAppointments(
  businessId: string
): Promise<AnalyticsAppointmentRecord[]> {
  const start = getBoundedAnalyticsStart(ANALYTICS_LEGACY_COMPARISON_LOOKBACK_DAYS);

  return prisma.appointment.findMany({
    where: {
      ...baseAppointmentWhere(businessId, start),
      leadId: {
        not: null,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: appointmentSelect,
    take: ANALYTICS_MAX_APPOINTMENT_ALL_ROWS,
  });
}

export async function getBookedLeadIds(
  businessId: string,
  start: Date,
  end: Date,
  leadIds?: string[]
): Promise<string[]> {
  if (leadIds && leadIds.length === 0) {
    return [];
  }

  const rows = await prisma.appointment.groupBy({
    by: ["leadId"],
    where: {
      ...baseAppointmentWhere(businessId, start, end),
      leadId: {
        not: null,
        ...(leadIds ? { in: leadIds } : {}),
      },
      status: {
        in: [...ACTIVE_BOOKING_STATUSES],
      },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      leadId: "asc",
    },
    take: getAnalyticsRowLimit(start, end),
  });

  return rows
    .map((row) => row.leadId)
    .filter((leadId): leadId is string => Boolean(leadId));
}

export async function getBookedMeetingCount(
  businessId: string,
  start: Date,
  end: Date
): Promise<number> {
  return prisma.appointment.count({
    where: {
      ...baseAppointmentWhere(businessId, start, end),
      status: {
        in: [...ACTIVE_BOOKING_STATUSES],
      },
    },
  });
}

export async function getAppointmentStatusDistribution(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsDistributionCount[]> {
  const rows = await prisma.appointment.groupBy({
    by: ["status"],
    where: baseAppointmentWhere(businessId, start, end),
    _count: {
      _all: true,
    },
  });

  return rows.map((row) => ({
    key: (row.status || "UNKNOWN").toUpperCase(),
    count: row._count._all,
  }));
}

export async function getAllAppointments(
  businessId: string
): Promise<AnalyticsAppointmentRecord[]> {
  const start = getBoundedAnalyticsStart(ANALYTICS_LEGACY_COMPARISON_LOOKBACK_DAYS);

  return prisma.appointment.findMany({
    where: baseAppointmentWhere(businessId, start),
    orderBy: {
      createdAt: "desc",
    },
    select: appointmentSelect,
    take: ANALYTICS_MAX_APPOINTMENT_ALL_ROWS,
  });
}
