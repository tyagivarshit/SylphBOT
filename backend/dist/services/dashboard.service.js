"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const date_fns_1 = require("date-fns");
const prisma_1 = __importDefault(require("../config/prisma"));
const plan_config_1 = require("../config/plan.config");
const pricing_config_1 = require("../config/pricing.config");
const usage_service_1 = require("./usage.service");
const subscriptionAuthority_service_1 = require("./subscriptionAuthority.service");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const requestLifecycle_1 = require("../utils/requestLifecycle");
const EMPTY_USAGE = {
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
const DASHBOARD_STATS_CACHE_TTL_MS = 60000;
const dashboardStatsCache = new Map();
const getSettledValue = (result, fallback) => result.status === "fulfilled" ? result.value : fallback;
class DashboardService {
    static async getStats(businessId, req) {
        const nowMs = Date.now();
        const cached = dashboardStatsCache.get(businessId);
        if (cached?.value && cached.expiresAt > nowMs) {
            (0, performanceMetrics_1.emitPerformanceMetric)({
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
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "CACHE_MISS",
            businessId,
            route: "dashboard_stats",
            metadata: {
                cache: "memory_dashboard_stats",
            },
        });
        const computePromise = (async () => {
            if (req && (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
                throw new Error("request_aborted:dashboard_stats_preflight");
            }
            const startedAt = Date.now();
            const now = new Date();
            const todayStart = (0, date_fns_1.startOfDay)(now);
            const [subscription, usageOverview, activeOverridesCount, enterpriseLeadsCount, lastQueueItem, escalationsCount, lastMessage, lastAppointment, upcomingAppointmentsCount, lastTouch, flows,] = await Promise.all([
                (0, subscriptionAuthority_service_1.getCanonicalSubscriptionSnapshot)(businessId).catch(() => null),
                (0, usage_service_1.getUsageOverview)(businessId).catch(() => EMPTY_USAGE),
                prisma_1.default.lead.count({
                    where: {
                        businessId,
                        deletedAt: null,
                        isHumanActive: true,
                    },
                }).catch(() => 0),
                prisma_1.default.lead.count({
                    where: {
                        businessId,
                        deletedAt: null,
                        stage: {
                            in: ["QUALIFIED", "READY_TO_BUY"],
                            mode: "insensitive",
                        },
                    },
                }).catch(() => 0),
                prisma_1.default.humanWorkQueue.findFirst({
                    where: { businessId },
                    orderBy: { updatedAt: "desc" },
                    select: { updatedAt: true }
                }).catch(() => null),
                prisma_1.default.humanWorkQueue.count({
                    where: { businessId, state: { in: ["PENDING", "ESCALATED"] } }
                }).catch(() => 0),
                prisma_1.default.message.findFirst({
                    where: { businessId },
                    orderBy: { createdAt: "desc" },
                    select: { createdAt: true }
                }).catch(() => null),
                prisma_1.default.appointment.findFirst({
                    where: { businessId },
                    orderBy: { updatedAt: "desc" },
                    select: { updatedAt: true }
                }).catch(() => null),
                prisma_1.default.appointment.count({
                    where: {
                        businessId,
                        startTime: { gte: now },
                        status: { notIn: ["CANCELLED", "NO_SHOW"] }
                    }
                }).catch(() => 0),
                prisma_1.default.revenueTouchLedger.findFirst({
                    where: { businessId },
                    orderBy: { createdAt: "desc" },
                    select: { createdAt: true }
                }).catch(() => null),
                prisma_1.default.automationFlow.findMany({
                    where: { businessId },
                    select: { id: true }
                }).catch(() => []),
            ]);
            let lastExecutionDate = null;
            let activeExecutionsCount = 0;
            if (flows && flows.length > 0) {
                const flowIds = flows.map((f) => f.id);
                const [lastExec, activeCount] = await Promise.all([
                    prisma_1.default.automationExecution.findFirst({
                        where: { flowId: { in: flowIds } },
                        orderBy: { updatedAt: "desc" },
                        select: { updatedAt: true }
                    }).catch(() => null),
                    prisma_1.default.automationExecution.count({
                        where: { flowId: { in: flowIds }, status: "ACTIVE" }
                    }).catch(() => 0)
                ]);
                lastExecutionDate = lastExec?.updatedAt || null;
                activeExecutionsCount = activeCount;
            }
            const planKey = (0, plan_config_1.getPlanKey)(subscription?.plan || null);
            const aiCallsUsed = usageOverview?.usage?.ai?.used ?? 0;
            const aiLimit = usageOverview?.usage?.ai?.dailyLimit ?? 0;
            const isUnlimited = aiLimit === -1;
            const usagePercent = isUnlimited || aiLimit <= 0 ? 0 : Math.min(aiCallsUsed / aiLimit, 1);
            const formatRelativeTime = (date) => {
                if (!date)
                    return "Awaiting system activity";
                const diffMs = Date.now() - date.getTime();
                const diffSec = Math.floor(diffMs / 1000);
                if (diffSec < 60)
                    return "Updated just now";
                const diffMin = Math.floor(diffSec / 60);
                if (diffMin < 60)
                    return `Updated ${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
                const diffHr = Math.floor(diffMin / 60);
                if (diffHr < 24)
                    return `Updated ${diffHr} ${diffHr === 1 ? "hour" : "hours"} ago`;
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
            }
            else if (activeOverridesCount > 0) {
                aiSummaryLine = "A prolonged human override has been detected. Monitored systems remain within expected conditions.";
            }
            else if (enterpriseLeadsCount > 0) {
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
                plan: (0, pricing_config_1.getPricingPlanLabel)(planKey),
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
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "PROJECTION_MS",
                value: durationMs,
                businessId,
                route: "dashboard_stats",
            });
            if (durationMs >= 700) {
                (0, performanceMetrics_1.emitPerformanceMetric)({
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
    static async getLeadsList(businessId, page, limit, stage, search, req) {
        if (req && (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
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
            const where = { businessId };
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
                prisma_1.default.lead.findMany({
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
                prisma_1.default.lead.count({ where }),
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
        }
        catch (error) {
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
    static async getLeadDetail(businessId, leadId, req) {
        if (req && (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
            return null;
        }
        try {
            return await prisma_1.default.lead.findFirst({
                where: { id: leadId, businessId },
                include: {
                    messages: {
                        orderBy: { createdAt: "asc" },
                    },
                },
            });
        }
        catch (error) {
            console.error("Dashboard getLeadDetail error", error);
            return null;
        }
    }
    static async updateLeadStage(businessId, leadId, stage, req) {
        if (req && (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
            return null;
        }
        try {
            const lead = await prisma_1.default.lead.findFirst({
                where: { id: leadId, businessId },
                select: { id: true },
            });
            if (!lead) {
                return null;
            }
            return await prisma_1.default.lead.update({
                where: { id: leadId },
                data: { stage },
            });
        }
        catch (error) {
            console.error("Dashboard updateLeadStage error", error);
            return null;
        }
    }
    static async getLeadsGrowth(businessId, req) {
        if (req && (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
            return [];
        }
        const today = (0, date_fns_1.startOfDay)(new Date());
        try {
            const days = Array.from({ length: 7 }, (_, index) => {
                const dayStart = (0, date_fns_1.startOfDay)((0, date_fns_1.subDays)(today, 6 - index));
                const dayEnd = (0, date_fns_1.addDays)(dayStart, 1);
                return {
                    label: (0, date_fns_1.format)(dayStart, "EEE"),
                    dayStart,
                    dayEnd,
                };
            });
            const oldestDayStart = days[0]?.dayStart || today;
            const newestDayEnd = days[days.length - 1]?.dayEnd || (0, date_fns_1.addDays)(today, 1);
            const rows = await prisma_1.default.lead.findMany({
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
            const dailyCounts = rows.reduce((acc, row) => {
                const key = (0, date_fns_1.startOfDay)(row.createdAt).toISOString();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            return days.map((day) => ({
                date: day.label,
                leads: dailyCounts[day.dayStart.toISOString()] || 0,
            }));
        }
        catch (error) {
            console.error("Dashboard getLeadsGrowth error", error);
            return [];
        }
    }
    static async getMessagesGrowth(businessId, req) {
        if (req && (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
            return [];
        }
        const today = (0, date_fns_1.startOfDay)(new Date());
        try {
            const days = Array.from({ length: 7 }, (_, index) => {
                const dayStart = (0, date_fns_1.startOfDay)((0, date_fns_1.subDays)(today, 6 - index));
                const dayEnd = (0, date_fns_1.addDays)(dayStart, 1);
                return {
                    label: (0, date_fns_1.format)(dayStart, "EEE"),
                    dayStart,
                    dayEnd,
                };
            });
            const oldestDayStart = days[0]?.dayStart || today;
            const newestDayEnd = days[days.length - 1]?.dayEnd || (0, date_fns_1.addDays)(today, 1);
            const rows = await prisma_1.default.message.findMany({
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
            const dailyCounts = rows.reduce((acc, row) => {
                const key = (0, date_fns_1.startOfDay)(row.createdAt).toISOString();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            return days.map((day) => ({
                date: day.label,
                messages: dailyCounts[day.dayStart.toISOString()] || 0,
            }));
        }
        catch (error) {
            console.error("Dashboard getMessagesGrowth error", error);
            return [];
        }
    }
    static async getRecentActivity(businessId, req) {
        if (req && (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
            return [];
        }
        try {
            const leads = await prisma_1.default.lead.findMany({
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
        }
        catch (error) {
            console.error("Dashboard getRecentActivity error", error);
            return [];
        }
    }
    static async getActiveConversations(businessId, req) {
        if (req && (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
            return {
                active: 0,
                waitingReplies: 0,
                resolved: 0,
            };
        }
        try {
            const [active, waitingReplies] = await Promise.all([
                prisma_1.default.lead.count({
                    where: {
                        businessId,
                        deletedAt: null,
                        lastMessageAt: { not: null },
                    },
                }),
                prisma_1.default.lead.count({
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
        }
        catch (error) {
            console.error("Dashboard getActiveConversations error", error);
            return {
                active: 0,
                waitingReplies: 0,
                resolved: 0,
            };
        }
    }
}
exports.DashboardService = DashboardService;
