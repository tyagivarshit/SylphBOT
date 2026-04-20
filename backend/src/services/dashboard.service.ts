import prisma from "../config/prisma";
import { startOfDay, startOfMonth, subDays, format } from "date-fns";
import { Prisma } from "@prisma/client";
import { getPlanKey } from "../config/plan.config";
import { getPricingPlanLabel } from "../config/pricing.config";
import { getUsageOverview } from "./usage.service";

export class DashboardService {

  /* ======================================
     📊 DASHBOARD STATS (SaaS PRO)
  ====================================== */
  static async getStats(businessId: string) {
    try {
      const now = new Date();
      const todayStart = startOfDay(now);
      const monthStart = startOfMonth(now);

      const baseFilter: Prisma.LeadWhereInput = { businessId };

      /* 🔥 SUBSCRIPTION (SAFE FALLBACK) */
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        include: { plan: true },
      });

      const planKey = getPlanKey(subscription?.plan || null);

      /* ======================================
      PARALLEL QUERIES (FAST)
      ====================================== */

      const [
        totalLeads,
        leadsToday,
        leadsThisMonth,
        messagesToday,
        qualifiedLeads,
        usageOverview,
      ] = await Promise.all([

        prisma.lead.count({ where: baseFilter }),

        prisma.lead.count({
          where: {
            ...baseFilter,
            createdAt: { gte: todayStart },
          },
        }),

        prisma.lead.count({
          where: {
            ...baseFilter,
            createdAt: { gte: monthStart },
          },
        }),

        prisma.message.count({
          where: {
            lead: { businessId },
            createdAt: { gte: todayStart },
          },
        }),

        /* 🔥 AI usage (temporary metric) */
        prisma.lead.count({
          where: {
            ...baseFilter,
            stage: "QUALIFIED",
          },
        }),

        getUsageOverview(businessId),
      ]);

      const [chartData, messagesChart, activity] = await Promise.all([
        this.getLeadsGrowth(businessId),
        this.getMessagesGrowth(businessId),
        this.getRecentActivity(businessId),
      ]);

      /* ======================================
      🔥 USAGE ENGINE
      ====================================== */

      const aiCallsUsed = usageOverview.usage.ai.used;
      const aiLimit = usageOverview.usage.ai.dailyLimit;
      const isUnlimited = aiLimit === -1;
      const usagePercent =
        isUnlimited || aiLimit <= 0 ? 0 : aiCallsUsed / aiLimit;
      const nearLimit = usageOverview.warning;

      /* ======================================
      FINAL RESPONSE
      ====================================== */

      return {
        totalLeads: totalLeads || 0,
        leadsToday: leadsToday || 0,
        leadsThisMonth: leadsThisMonth || 0,
        messagesToday: messagesToday || 0,

        /* 🔥 USAGE */
        aiCallsUsed: aiCallsUsed || 0,
        aiCallsLimit: aiLimit,
        usagePercent,
        nearLimit,
        isUnlimited,

        /* 🔥 PLAN */
        plan: getPricingPlanLabel(planKey),
        planKey,
        aiCallsRemaining: usageOverview.ai.remaining ?? 0,
        warning: usageOverview.warning,
        warningMessage: usageOverview.warningMessage,

        /* 📊 */
        qualifiedLeads: qualifiedLeads || 0,
        chartData: chartData || [],
        messagesChart: messagesChart || [],
        recentActivity: activity || [],
      };

    } catch (error) {
      console.error("❌ SERVICE ERROR (getStats):", error);

      /* 🔥 NEVER BREAK DASHBOARD */
      return {
        totalLeads: 0,
        leadsToday: 0,
        leadsThisMonth: 0,
        messagesToday: 0,

        aiCallsUsed: 0,
        aiCallsLimit: 0,
        usagePercent: 0,
        nearLimit: false,
        isUnlimited: false,
        aiCallsRemaining: 0,
        warning: false,
        warningMessage: null,

        plan: "FREE",
        planKey: "FREE_LOCKED",

        qualifiedLeads: 0,
        chartData: [],
        messagesChart: [],
        recentActivity: [],
      };
    }
  }

  /* ======================================
     👥 LEADS LIST
  ====================================== */
  static async getLeadsList(
    businessId: string,
    page: number,
    limit: number,
    stage?: string,
    search?: string
  ) {
    try {
      const skip = (page - 1) * limit;

      const where: Prisma.LeadWhereInput = { businessId };

      if (stage) where.stage = stage;

      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { email: { contains: search, mode: "insensitive" } },
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
            lastMessageAt: true,
          },
        }),

        prisma.lead.count({ where }),
      ]);

      return {
        leads: leads || [],
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };

    } catch (error) {
      console.error("❌ SERVICE ERROR (getLeadsList):", error);

      return {
        leads: [],
        pagination: {
          total: 0,
          page: 1,
          limit,
          totalPages: 0,
        },
      };
    }
  }

  /* ======================================
     🔍 LEAD DETAIL
  ====================================== */
  static async getLeadDetail(businessId: string, leadId: string) {
    try {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, businessId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      return lead || null;

    } catch (error) {
      console.error("❌ SERVICE ERROR (getLeadDetail):", error);
      return null;
    }
  }

  /* ======================================
     ✏️ UPDATE LEAD STAGE
  ====================================== */
  static async updateLeadStage(
    businessId: string,
    leadId: string,
    stage: string
  ) {
    try {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, businessId },
      });

      if (!lead) return null;

      return prisma.lead.update({
        where: { id: leadId },
        data: { stage },
      });

    } catch (error) {
      console.error("❌ SERVICE ERROR (updateLeadStage):", error);
      return null;
    }
  }

  /* ======================================
     📈 LEADS GROWTH
  ====================================== */
  static async getLeadsGrowth(businessId: string) {
    try {
      const today = new Date();
      const startDate = subDays(today, 6);

      const leads = await prisma.lead.findMany({
        where: {
          businessId,
          createdAt: { gte: startDate },
        },
        select: { createdAt: true },
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
          leads: map[day],
        }));

    } catch {
      return [];
    }
  }

  /* ======================================
     💬 MESSAGES GROWTH
  ====================================== */
  static async getMessagesGrowth(businessId: string) {
    try {
      const today = new Date();
      const startDate = subDays(today, 6);

      const messages = await prisma.message.findMany({
        where: {
          lead: { businessId },
          createdAt: { gte: startDate },
        },
        select: { createdAt: true },
      });

      const map: Record<string, number> = {};

      for (let i = 0; i < 7; i++) {
        const day = format(subDays(today, i), "EEE");
        map[day] = 0;
      }

      messages.forEach((msg) => {
        const day = format(msg.createdAt, "EEE");
        if (map[day] !== undefined) map[day]++;
      });

      return Object.keys(map)
        .reverse()
        .map((day) => ({
          date: day,
          messages: map[day],
        }));

    } catch {
      return [];
    }
  }

  /* ======================================
     🕒 RECENT ACTIVITY
  ====================================== */
  static async getRecentActivity(businessId: string) {
    try {
      const leads = await prisma.lead.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          platform: true,
          createdAt: true,
        },
      });

      return leads.map((lead) => ({
        id: lead.id,
        text: `New lead from ${lead.platform} (${lead.name || "Unknown"})`,
        time: lead.createdAt,
      }));

    } catch {
      return [];
    }
  }

  /* ======================================
     📊 ACTIVE CONVERSATIONS
  ====================================== */
  static async getActiveConversations(businessId: string) {
    try {
      const leads = await prisma.lead.findMany({
        where: {
          businessId,
          lastMessageAt: { not: null },
        },
        select: { unreadCount: true },
      });

      return {
        active: leads.length,
        waitingReplies: leads.filter((l) => l.unreadCount > 0).length,
        resolved: leads.filter((l) => l.unreadCount === 0).length,
      };

    } catch {
      return {
        active: 0,
        waitingReplies: 0,
        resolved: 0,
      };
    }
  }
}
