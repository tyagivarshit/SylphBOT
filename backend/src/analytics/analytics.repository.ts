import prisma from "../config/prisma";

export const countLeads = (businessId: string, start: Date, end: Date) => {
  return prisma.lead.count({
    where: {
      businessId,
      createdAt: { gte: start, lte: end }
    }
  });
};

// 🔥 messages → via lead relation
export const countMessages = async (businessId: string, start: Date, end: Date) => {
  return prisma.message.count({
    where: {
      lead: {
        businessId
      },
      createdAt: { gte: start, lte: end }
    }
  });
};

export const countAIReplies = async (businessId: string, start: Date, end: Date) => {
  return prisma.message.count({
    where: {
      sender: "AI",
      lead: {
        businessId
      },
      createdAt: { gte: start, lte: end }
    }
  });
};

export const countBookings = (businessId: string, start: Date, end: Date) => {
  return prisma.appointment.count({
    where: {
      businessId,
      createdAt: { gte: start, lte: end }
    }
  });
};

// 🔥 MongoDB aggregation (NO SQL RAW)
export const getLeadsGroupedByDate = async (
  businessId: string,
  start: Date,
  end: Date
) => {
  const data = await prisma.lead.findMany({
    where: {
      businessId,
      createdAt: { gte: start, lte: end }
    },
    select: {
      createdAt: true
    }
  });

  const grouped: Record<string, number> = {};

  data.forEach((item) => {
    const date = item.createdAt.toISOString().split("T")[0];
    grouped[date] = (grouped[date] || 0) + 1;
  });

  return Object.entries(grouped).map(([date, count]) => ({
    date,
    count
  }));
};

export const getFunnelStats = async (businessId: string) => {
  const [leads, interested, qualified, booked] = await Promise.all([
    prisma.lead.count({ where: { businessId } }),
    prisma.lead.count({ where: { businessId, stage: "INTERESTED" } }),
    prisma.lead.count({ where: { businessId, stage: "QUALIFIED" } }),
    prisma.appointment.count({ where: { businessId } })
  ]);

  return { leads, interested, qualified, booked };
};

export const getTopSources = async (businessId: string) => {
  const leads = await prisma.lead.findMany({
    where: { businessId },
    select: { platform: true }
  });

  const map: Record<string, number> = {};

  leads.forEach((l) => {
    map[l.platform] = (map[l.platform] || 0) + 1;
  });

  return Object.entries(map).map(([key, value]) => ({
    _id: key,
    count: value
  }));
};
