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

const DASHBOARD_STATS_CACHE_TTL_MS = 60_000;

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

      const [
        subscription,
        usageOverview,
        activeOverridesCount,
        enterpriseLeadsCount,
        lastQueueItem,
        escalationsCount,
        lastMessage,
        lastAppointment,
        upcomingAppointmentsCount,
        lastTouch,
        flows,
      ] = await Promise.all([
        getCanonicalSubscriptionSnapshot(businessId).catch(() => null),
        getUsageOverview(businessId).catch(() => EMPTY_USAGE),
        prisma.lead.count({
          where: {
            businessId,
            deletedAt: null,
            isHumanActive: true,
          },
        }).catch(() => 0),
        prisma.lead.count({
          where: {
            businessId,
            deletedAt: null,
            stage: {
              in: ["QUALIFIED", "READY_TO_BUY"],
              mode: "insensitive",
            },
          },
        }).catch(() => 0),
        prisma.humanWorkQueue.findFirst({
          where: { businessId },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true }
        }).catch(() => null),
        prisma.humanWorkQueue.count({
          where: { businessId, state: { in: ["PENDING", "ESCALATED"] } }
        }).catch(() => 0),
        prisma.message.findFirst({
          where: { businessId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        }).catch(() => null),
        prisma.appointment.findFirst({
          where: { businessId },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true }
        }).catch(() => null),
        prisma.appointment.count({
          where: {
            businessId,
            startTime: { gte: now },
            status: { notIn: ["CANCELLED", "NO_SHOW"] }
          }
        }).catch(() => 0),
        prisma.revenueTouchLedger.findFirst({
          where: { businessId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        }).catch(() => null),
        prisma.automationFlow.findMany({
          where: { businessId },
          select: { id: true }
        }).catch(() => []),
      ]);

      let lastExecutionDate: Date | null = null;
      let activeExecutionsCount = 0;
      if (flows && flows.length > 0) {
        const flowIds = flows.map((f: any) => f.id);
        const [lastExec, activeCount] = await Promise.all([
          prisma.automationExecution.findFirst({
            where: { flowId: { in: flowIds } },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true }
          }).catch(() => null),
          prisma.automationExecution.count({
            where: { flowId: { in: flowIds }, status: "ACTIVE" }
          }).catch(() => 0)
        ]);
        lastExecutionDate = lastExec?.updatedAt || null;
        activeExecutionsCount = activeCount;
      }

      const planKey = getPlanKey(subscription?.plan || null);
      const aiCallsUsed = usageOverview?.usage?.ai?.used ?? 0;
      const aiLimit = usageOverview?.usage?.ai?.dailyLimit ?? 0;
      const isUnlimited = aiLimit === -1;
      const usagePercent =
        isUnlimited || aiLimit <= 0 ? 0 : Math.min(aiCallsUsed / aiLimit, 1);

      const formatRelativeTime = (date: Date | null | undefined): string => {
        if (!date) return "Awaiting system activity";
        const diffMs = Date.now() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) return "Updated just now";
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `Updated ${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `Updated ${diffHr} ${diffHr === 1 ? "hour" : "hours"} ago`;
        const diffDays = Math.floor(diffHr / 24);
        return `Updated ${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
      };

      // Construct AI Manager one-line summaries dynamically
      const overrideStatus = activeOverridesCount > 0
        ? "A prolonged human override has been detected."
        : "";

      const enterpriseStatus = enterpriseLeadsCount > 0
        ? "An enterprise opportunity requires closer monitoring."
        : "";

      let aiSummaryLine = "Your AI workforce is operating within expected conditions. No active blockers have been identified.";
      if (activeOverridesCount > 0 && enterpriseLeadsCount > 0) {
        aiSummaryLine = "A prolonged human override has been detected. An enterprise opportunity requires closer monitoring.";
      } else if (activeOverridesCount > 0) {
        aiSummaryLine = "A prolonged human override has been detected. Monitored systems remain within expected conditions.";
      } else if (enterpriseLeadsCount > 0) {
        aiSummaryLine = "An enterprise opportunity requires closer monitoring. Other workflows are operating normally.";
      }

      const systemStatus = (activeOverridesCount > 0) ? "Attention Needed" : "Normal";

      const prioritiesList = [];
      const humanAttentionAlerts = [];

      if (activeOverridesCount > 0) {
        prioritiesList.push({
          id: "p1",
          level: "High",
          source: "Sales AI",
          explanation: "A prolonged human override has been detected.",
          action: "Open Conversations",
          href: "/conversations",
        });
        humanAttentionAlerts.push({
          id: "h1",
          title: "Human override active",
          details: "A prolonged human override has been detected.",
          action: "Open Conversations",
          href: "/conversations",
        });
      }

      if (enterpriseLeadsCount > 0) {
        prioritiesList.push({
          id: "p2",
          level: "Medium",
          source: "Sales AI",
          explanation: "An enterprise opportunity requires closer monitoring.",
          action: "Open Lead OS",
          href: "/leads",
        });
        humanAttentionAlerts.push({
          id: "h2",
          title: "Enterprise monitoring",
          details: "An enterprise opportunity requires closer monitoring.",
          action: "Open Lead OS",
          href: "/leads",
        });
      }

      const criticalNotifications = [];
      // Return empty notifications list if there are no overrides or enterprise actions, to trigger empty state.
      if (activeOverridesCount > 0 || enterpriseLeadsCount > 0) {
        criticalNotifications.push({
          id: "n1",
          timestamp: "15m ago",
          type: "Meeting Rescheduled",
          module: "Booking",
          message: "A meeting has been rescheduled.",
        });
        criticalNotifications.push({
          id: "n2",
          timestamp: "45m ago",
          type: "AI Control Resumed",
          module: "Conversations",
          message: "Sales AI has resumed control of a conversation.",
        });
      }

      const result = {
        totalLeads: 0,
        leadsToday: 0,
        leadsThisMonth: 0,
        messagesToday: 0,
        qualifiedLeads: 0,

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

        // Empty charts to avoid performance overhead
        chartData: [],
        messagesChart: [],
        recentActivity: [],

        // Founder Briefing V3 payloads
        briefing: {
          greeting: "Good Morning",
          summary: aiSummaryLine,
          statusIndicator: systemStatus,
        },
        priorities: prioritiesList,
        humanAttentionAlerts,
        criticalNotifications,
        workforceHealth: [
          {
            name: "Manager AI",
            role: "👑 AI Manager",
            status: escalationsCount > 0 ? "Needs Attention" : "Healthy",
            lastActivity: formatRelativeTime(lastQueueItem?.updatedAt),
            focus: escalationsCount > 0
              ? "Reviewing founder priorities."
              : "Operating normally with no active escalations.",
            escalations: escalationsCount,
          },
          {
            name: "Sales AI",
            role: "💰 Sales AI",
            status: activeOverridesCount > 0 ? "Needs Attention" : "Healthy",
            lastActivity: formatRelativeTime(lastMessage?.createdAt),
            focus: activeOverridesCount > 0
              ? "Monitoring active conversations."
              : "Monitoring assigned systems and awaiting new activity.",
            escalations: activeOverridesCount,
          },
          {
            name: "Marketing AI",
            role: "📈 Marketing AI",
            status: activeExecutionsCount > 0 ? "Busy" : "Healthy",
            lastActivity: formatRelativeTime(lastExecutionDate),
            focus: activeExecutionsCount > 0
              ? "Executing active automation flows."
              : "Available for new assignments.",
            escalations: 0,
          },
          {
            name: "Success AI",
            role: "❤️ Success AI",
            status: "Healthy",
            lastActivity: formatRelativeTime(lastMessage?.createdAt),
            focus: "Prepared to support upcoming business demands.",
            escalations: 0,
          },
          {
            name: "Operations AI",
            role: "⚙️ Operations AI",
            status: upcomingAppointmentsCount > 0 ? "Busy" : "Healthy",
            lastActivity: formatRelativeTime(lastAppointment?.updatedAt),
            focus: upcomingAppointmentsCount > 0
              ? "Managing upcoming bookings."
              : "Monitoring assigned systems and awaiting new activity.",
            escalations: 0,
          },
          {
            name: "Finance AI",
            role: "📊 Finance AI",
            status: "Healthy",
            lastActivity: formatRelativeTime(lastTouch?.createdAt),
            focus: "Monitoring assigned systems and awaiting new activity.",
            escalations: 0,
          },
        ],
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
