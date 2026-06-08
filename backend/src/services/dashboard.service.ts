import { Prisma } from "@prisma/client";
import { addDays, format, startOfDay, startOfMonth, subDays } from "date-fns";
import prisma from "../config/prisma";
import { getPlanKey } from "../config/plan.config";
import { getPricingPlanLabel } from "../config/pricing.config";
import { getUsageOverview } from "./usage.service";
import { getCanonicalSubscriptionSnapshot } from "./subscriptionAuthority.service";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { isRequestLifecycleAborted } from "../utils/requestLifecycle";

type UsageOverviewSafe = {
  warning: boolean;
  warningMessage: string | null;
  ai: {
    usedToday: number;
    limit: number;
    remaining: number | null;
  };
  usage: {
    ai: {
      used: number;
      dailyLimit: number;
    };
  };
};

const EMPTY_USAGE: UsageOverviewSafe = {
  warning: false,
  warningMessage: null,
  ai: {
    usedToday: 0,
    limit: 0,
    remaining: 0,
  },
  usage: {
    ai: {
      used: 0,
      dailyLimit: 0,
    },
  },
};

const DASHBOARD_STATS_CACHE_TTL_MS = 8_000;

const dashboardStatsCache = new Map<
  string,
  {
    value?: Record<string, unknown>;
    expiresAt: number;
    promise?: Promise<Record<string, unknown>>;
  }
>();

const getSettledValue = <T>(result: PromiseSettledResult<T>, fallback: T) =>
  result.status === "fulfilled" ? result.value : fallback;

export class DashboardService {
  static async getStats(businessId: string, req?: any) {
    const nowMs = Date.now();
    const cached = dashboardStatsCache.get(businessId);

    if (cached?.value && cached.expiresAt > nowMs) {
      emitPerformanceMetric({
        name: "CACHE_HIT",
        businessId,
        route: "dashboard_stats",
        metadata: {
          cache: "memory_dashboard_stats",
        },
      });
      return cached.value;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    emitPerformanceMetric({
      name: "CACHE_MISS",
      businessId,
      route: "dashboard_stats",
      metadata: {
        cache: "memory_dashboard_stats",
      },
    });

    const computePromise = (async () => {
      if (req && isRequestLifecycleAborted({ req })) {
        throw new Error("request_aborted:dashboard_stats_preflight");
      }
      const startedAt = Date.now();
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);

    const baseFilter: Prisma.LeadWhereInput = { businessId, deletedAt: null };

    const [subscription, coreMetrics, usageOverview, timeline] = await Promise.all([
      getCanonicalSubscriptionSnapshot(businessId).catch(() => null),
      Promise.allSettled([
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
            lead: { businessId, deletedAt: null },
            createdAt: { gte: todayStart },
          },
        }),
        prisma.lead.count({
          where: {
            ...baseFilter,
            stage: {
              in: ["QUALIFIED", "READY_TO_BUY", "WON"],
              mode: "insensitive",
            },
          },
        }),
      ]),
      getUsageOverview(businessId).catch(() => EMPTY_USAGE),
      Promise.allSettled([
        this.getLeadsGrowth(businessId, req),
        this.getMessagesGrowth(businessId, req),
        this.getRecentActivity(businessId, req),
      ]),
    ]);

    const planKey = getPlanKey(subscription?.plan || null);
    const aiCallsUsed = usageOverview?.usage?.ai?.used ?? 0;
    const aiLimit = usageOverview?.usage?.ai?.dailyLimit ?? 0;
    const isUnlimited = aiLimit === -1;
    const usagePercent =
      isUnlimited || aiLimit <= 0 ? 0 : Math.min(aiCallsUsed / aiLimit, 1);

      const result = {
      totalLeads: getSettledValue(coreMetrics[0], 0),
      leadsToday: getSettledValue(coreMetrics[1], 0),
      leadsThisMonth: getSettledValue(coreMetrics[2], 0),
      messagesToday: getSettledValue(coreMetrics[3], 0),
      qualifiedLeads: getSettledValue(coreMetrics[4], 0),

      aiCallsUsed,
      aiCallsLimit: aiLimit,
      aiCallsRemaining: usageOverview?.ai?.remaining ?? 0,
      usagePercent,
      nearLimit: Boolean(usageOverview?.warning),
      warning: Boolean(usageOverview?.warning),
      warningMessage: usageOverview?.warningMessage || null,
      isUnlimited,

      plan: getPricingPlanLabel(planKey),
      planKey,
      premiumLocked: planKey === "LOCKED" || planKey === "FREE_LOCKED",

      chartData: getSettledValue(timeline[0], []),
      messagesChart: getSettledValue(timeline[1], []),
      recentActivity: getSettledValue(timeline[2], []),
      };

      const durationMs = Date.now() - startedAt;
      emitPerformanceMetric({
        name: "PROJECTION_MS",
        value: durationMs,
        businessId,
        route: "dashboard_stats",
      });
      if (durationMs >= 700) {
        emitPerformanceMetric({
          name: "DB_SLOW",
          value: durationMs,
          businessId,
          route: "dashboard_stats",
        });
      }

      dashboardStatsCache.set(businessId, {
        value: result,
        expiresAt: Date.now() + DASHBOARD_STATS_CACHE_TTL_MS,
      });

      return result;
    })().finally(() => {
      const latest = dashboardStatsCache.get(businessId);
      if (latest?.promise) {
        dashboardStatsCache.set(businessId, {
          value: latest.value,
          expiresAt: latest.expiresAt,
        });
      }
    });

    dashboardStatsCache.set(businessId, {
      value: cached?.value,
      expiresAt: cached?.expiresAt || 0,
      promise: computePromise,
    });

    return computePromise;
  }

  static async getLeadsList(
    businessId: string,
    page: number,
    limit: number,
    stage?: string,
    search?: string,
    req?: any
  ) {
    if (req && isRequestLifecycleAborted({ req })) {
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
    try {
      const skip = (page - 1) * limit;
      const where: Prisma.LeadWhereInput = { businessId };

      if (stage) {
        where.stage = stage;
      }

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
        leads,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Dashboard getLeadsList error", error);
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

  static async getLeadDetail(businessId: string, leadId: string, req?: any) {
    if (req && isRequestLifecycleAborted({ req })) {
      return null;
    }
    try {
      return await prisma.lead.findFirst({
        where: { id: leadId, businessId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("Dashboard getLeadDetail error", error);
      return null;
    }
  }

  static async updateLeadStage(
    businessId: string,
    leadId: string,
    stage: string,
    req?: any
  ) {
    if (req && isRequestLifecycleAborted({ req })) {
      return null;
    }
    try {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, businessId },
        select: { id: true },
      });

      if (!lead) {
        return null;
      }

      return await prisma.lead.update({
        where: { id: leadId },
        data: { stage },
      });
    } catch (error) {
      console.error("Dashboard updateLeadStage error", error);
      return null;
    }
  }

  static async getLeadsGrowth(businessId: string, req?: any) {
    if (req && isRequestLifecycleAborted({ req })) {
      return [];
    }
    const today = startOfDay(new Date());

    try {
      const days = Array.from({ length: 7 }, (_, index) => {
        const dayStart = startOfDay(subDays(today, 6 - index));
        const dayEnd = addDays(dayStart, 1);
        return {
          label: format(dayStart, "EEE"),
          dayStart,
          dayEnd,
        };
      });

      const oldestDayStart = days[0]?.dayStart || today;
      const newestDayEnd = days[days.length - 1]?.dayEnd || addDays(today, 1);
      const rows = await prisma.lead.findMany({
        where: {
          businessId,
          deletedAt: null,
          createdAt: {
            gte: oldestDayStart,
            lt: newestDayEnd,
          },
        },
        select: {
          createdAt: true,
        },
      });
      const dailyCounts = rows.reduce<Record<string, number>>((acc, row) => {
        const key = startOfDay(row.createdAt).toISOString();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      return days.map((day) => ({
        date: day.label,
        leads: dailyCounts[day.dayStart.toISOString()] || 0,
      }));
    } catch (error) {
      console.error("Dashboard getLeadsGrowth error", error);
      return [];
    }
  }

  static async getMessagesGrowth(businessId: string, req?: any) {
    if (req && isRequestLifecycleAborted({ req })) {
      return [];
    }
    const today = startOfDay(new Date());

    try {
      const days = Array.from({ length: 7 }, (_, index) => {
        const dayStart = startOfDay(subDays(today, 6 - index));
        const dayEnd = addDays(dayStart, 1);
        return {
          label: format(dayStart, "EEE"),
          dayStart,
          dayEnd,
        };
      });

      const oldestDayStart = days[0]?.dayStart || today;
      const newestDayEnd = days[days.length - 1]?.dayEnd || addDays(today, 1);
      const rows = await prisma.message.findMany({
        where: {
          lead: { businessId, deletedAt: null },
          createdAt: {
            gte: oldestDayStart,
            lt: newestDayEnd,
          },
        },
        select: {
          createdAt: true,
        },
      });
      const dailyCounts = rows.reduce<Record<string, number>>((acc, row) => {
        const key = startOfDay(row.createdAt).toISOString();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      return days.map((day) => ({
        date: day.label,
        messages: dailyCounts[day.dayStart.toISOString()] || 0,
      }));
    } catch (error) {
      console.error("Dashboard getMessagesGrowth error", error);
      return [];
    }
  }

  static async getRecentActivity(businessId: string, req?: any) {
    if (req && isRequestLifecycleAborted({ req })) {
      return [];
    }
    try {
      const leads = await prisma.lead.findMany({
        where: { businessId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          platform: true,
          createdAt: true,
        },
      });

      return leads.map((lead) => {
        const leadName = String(lead.name || "").trim();
        const displayName = leadName || lead.id.slice(-6);

        return {
          id: lead.id,
          text: `New lead from ${lead.platform} (${displayName})`,
          time: lead.createdAt,
        };
      });
    } catch (error) {
      console.error("Dashboard getRecentActivity error", error);
      return [];
    }
  }

  static async getActiveConversations(businessId: string, req?: any) {
    if (req && isRequestLifecycleAborted({ req })) {
      return {
        active: 0,
        waitingReplies: 0,
        resolved: 0,
      };
    }
    try {
      const [active, waitingReplies] = await Promise.all([
        prisma.lead.count({
          where: {
            businessId,
            deletedAt: null,
            lastMessageAt: { not: null },
          },
        }),
        prisma.lead.count({
          where: {
            businessId,
            deletedAt: null,
            lastMessageAt: { not: null },
            unreadCount: { gt: 0 },
          },
        }),
      ]);

      return {
        active,
        waitingReplies,
        resolved: Math.max(active - waitingReplies, 0),
      };
    } catch (error) {
      console.error("Dashboard getActiveConversations error", error);
      return {
        active: 0,
        waitingReplies: 0,
        resolved: 0,
      };
    }
  }
}
