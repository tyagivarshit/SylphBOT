import prisma from "../config/prisma";
import { startOfDay, startOfMonth, subDays, format } from "date-fns";
import { Prisma } from "@prisma/client";

export class DashboardService {

  // ======================================
  // DASHBOARD STATS
  // ======================================
  static async getStats(businessId: string) {

    const todayStart = startOfDay(new Date());
    const monthStart = startOfMonth(new Date());

    const baseFilter: Prisma.LeadWhereInput = {
      businessId
    };

    const [
      totalLeads,
      leadsToday,
      leadsThisMonth,
      newLeads,
      qualifiedLeads,
      wonLeads
    ] = await Promise.all([

      prisma.lead.count({ where: baseFilter }),

      prisma.lead.count({
        where: {
          ...baseFilter,
          createdAt: { gte: todayStart }
        }
      }),

      prisma.lead.count({
        where: {
          ...baseFilter,
          createdAt: { gte: monthStart }
        }
      }),

      prisma.lead.count({
        where: {
          ...baseFilter,
          stage: "NEW"
        }
      }),

      prisma.lead.count({
        where: {
          ...baseFilter,
          stage: "QUALIFIED"
        }
      }),

      prisma.lead.count({
        where: {
          ...baseFilter,
          stage: "WON"
        }
      })

    ]);

    const [chartData, activity] = await Promise.all([
      this.getLeadsGrowth(businessId),
      this.getRecentActivity(businessId)
    ]);

    return {
      totalLeads,
      leadsToday,
      leadsThisMonth,
      newLeads,
      qualifiedLeads,
      wonLeads,
      aiCallsUsed: 0,
      aiCallsLimit: 1000,
      chartData,
      recentActivity: activity
    };
  }


  // ======================================
  // LEADS LIST
  // ======================================
  static async getLeadsList(
    businessId: string,
    page: number,
    limit: number,
    stage?: string,
    search?: string
  ) {

    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {
      businessId
    };

    if (stage) {
      where.stage = stage;
    }

    if (search) {

      where.OR = [
        {
          name: { contains: search, mode: "insensitive" }
        },
        {
          phone: { contains: search }
        },
        {
          email: { contains: search, mode: "insensitive" }
        }
      ];

    }

    const [leads, total] = await Promise.all([

      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          stage: true,
          platform: true,
          createdAt: true,
          lastMessageAt: true
        }
      }),

      prisma.lead.count({ where })

    ]);

    return {
      leads,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }


  // ======================================
  // LEAD DETAIL
  // ======================================
  static async getLeadDetail(businessId: string, leadId: string) {

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, businessId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!lead) throw new Error("Lead not found");

    return lead;
  }


  // ======================================
  // UPDATE LEAD STAGE
  // ======================================
  static async updateLeadStage(
    businessId: string,
    leadId: string,
    stage: string
  ) {

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, businessId }
    });

    if (!lead) throw new Error("Lead not found");

    return prisma.lead.update({
      where: { id: leadId },
      data: { stage }
    });
  }


  // ======================================
  // LEADS GROWTH (CHART)
  // ======================================
  static async getLeadsGrowth(businessId: string) {

    const today = new Date();
    const startDate = subDays(today, 6);

    const leads = await prisma.lead.findMany({
      where: {
        businessId,
        createdAt: { gte: startDate }
      },
      select: { createdAt: true }
    });

    const map: Record<string, number> = {};

    for (let i = 0; i < 7; i++) {
      const day = format(subDays(today, i), "EEE");
      map[day] = 0;
    }

    leads.forEach((lead) => {

      const day = format(lead.createdAt, "EEE");

      if (map[day] !== undefined) map[day]++;

    });

    return Object.keys(map)
      .reverse()
      .map((day) => ({
        date: day,
        leads: map[day]
      }));
  }


  // ======================================
  // RECENT ACTIVITY
  // ======================================
  static async getRecentActivity(businessId: string) {

    const leads = await prisma.lead.findMany({

      where: { businessId },

      orderBy: { createdAt: "desc" },

      take: 5,

      select: {
        id: true,
        name: true,
        platform: true,
        createdAt: true
      }

    });

    return leads.map((lead) => ({

      id: lead.id,

      text: `New lead from ${lead.platform} (${lead.name || "Unknown"})`,

      time: lead.createdAt

    }));
  }

}