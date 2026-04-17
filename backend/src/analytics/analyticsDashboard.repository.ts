import prisma from "../config/prisma";

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

export type AnalyticsTrackedMessageRecord = {
  id: string;
  messageId: string;
  leadId: string;
  variantId: string | null;
  cta: string | null;
  angle: string | null;
  leadState: string | null;
  messageType: string;
  sentAt: Date;
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
    where: {
      businessId,
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    select: leadSelect,
  });
}

export async function getAllLeads(
  businessId: string
): Promise<AnalyticsLeadRecord[]> {
  return prisma.lead.findMany({
    where: { businessId },
    select: leadSelect,
  });
}

export async function getMessagesInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsMessageRecord[]> {
  return prisma.message.findMany({
    where: {
      lead: {
        businessId,
      },
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: messageSelect,
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
    select: conversionEventSelect,
  });
}

export async function getTrackedMessagesInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsTrackedMessageRecord[]> {
  return prisma.salesMessageTracking.findMany({
    where: {
      businessId,
      sentAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      message: {
        select: {
          content: true,
        },
      },
      variant: {
        select: {
          variantKey: true,
          label: true,
          tone: true,
          ctaStyle: true,
          messageLength: true,
        },
      },
    },
  });
}

export async function getAppointmentsInRange(
  businessId: string,
  start: Date,
  end: Date
): Promise<AnalyticsAppointmentRecord[]> {
  return prisma.appointment.findMany({
    where: {
      businessId,
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    select: appointmentSelect,
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
    select: appointmentSelect,
  });
}

export async function getAllLeadAppointments(
  businessId: string
): Promise<AnalyticsAppointmentRecord[]> {
  return prisma.appointment.findMany({
    where: {
      businessId,
      leadId: {
        not: null,
      },
    },
    select: appointmentSelect,
  });
}
