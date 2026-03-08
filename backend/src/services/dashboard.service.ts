import prisma from "../config/prisma";
import { startOfDay, startOfMonth } from "date-fns";
import { Prisma } from "@prisma/client";

export class DashboardService {

  // ======================================
  // DASHBOARD STATS
  // ======================================
  static async getStats(businessId: string) {

    const todayStart = startOfDay(new Date());
    const monthStart = startOfMonth(new Date());

    const baseFilter: Prisma.LeadWhereInput = {
      businessId: businessId
    };

    const [totalLeads, leadsToday, leadsThisMonth] =
      await Promise.all([

        prisma.lead.count({
          where: baseFilter
        }),

        prisma.lead.count({
          where: {
            ...baseFilter,
            createdAt: {
              gte: todayStart
            }
          }
        }),

        prisma.lead.count({
          where: {
            ...baseFilter,
            createdAt: {
              gte: monthStart
            }
          }
        })

      ]);

    return {
      totalLeads,
      leadsToday,
      leadsThisMonth
    };

  }


  // ======================================
  // LEADS LIST (WITH PAGINATION + FILTER)
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
      businessId: businessId
    };

    // Stage Filter
    if (stage) {
      where.stage = stage;
    }

    // Search Filter
    if (search) {

      where.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive"
          }
        },
        {
          phone: {
            contains: search
          }
        },
        {
          email: {
            contains: search,
            mode: "insensitive"
          }
        }
      ];

    }

    const [leads, total] = await Promise.all([

      prisma.lead.findMany({

        where,

        orderBy: {
          createdAt: "desc"
        },

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

      prisma.lead.count({
        where
      })

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
  static async getLeadDetail(
    businessId: string,
    leadId: string
  ) {

    const lead = await prisma.lead.findFirst({

      where: {
        id: leadId,
        businessId: businessId
      },

      include: {
        messages: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }

    });

    if (!lead) {
      throw new Error("Lead not found");
    }

    return lead;

  }

}