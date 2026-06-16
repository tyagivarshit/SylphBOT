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
            const [subscription, usageOverview, activeOverridesCount, enterpriseLeadsCount] = await Promise.all([
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
            ]);
            const planKey = (0, plan_config_1.getPlanKey)(subscription?.plan || null);
            const aiCallsUsed = usageOverview?.usage?.ai?.used ?? 0;
            const aiLimit = usageOverview?.usage?.ai?.dailyLimit ?? 0;
            const isUnlimited = aiLimit === -1;
            const usagePercent = isUnlimited || aiLimit <= 0 ? 0 : Math.min(aiCallsUsed / aiLimit, 1);
            // Construct AI Manager one-line summaries dynamically
            const overrideStatus = activeOverridesCount > 0
                ? `${activeOverridesCount} human takeover overrides currently active.`
                : "Human overrides are operating normally.";
            const enterpriseStatus = enterpriseLeadsCount > 0
                ? `${enterpriseLeadsCount} enterprise opportunities require attention.`
                : "No enterprise opportunities require urgent attention.";
            const aiSummaryLine = `Sales momentum remains strong. ${overrideStatus} ${enterpriseStatus} Marketing automations are operating normally.`;
            const systemStatus = (activeOverridesCount > 0) ? "Action Needed" : "System Healthy";
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
                priorities: [
                    {
                        id: "p1",
                        level: "Critical",
                        source: "Sales AI",
                        explanation: "Enterprise lead awaiting founder approval.",
                        action: "Open Lead OS",
                        href: "/leads",
                    },
                    {
                        id: "p2",
                        level: "High",
                        source: "Sales AI",
                        explanation: activeOverridesCount > 0
                            ? `Human override active for ${activeOverridesCount} leads.`
                            : "Human override active for 8 days.",
                        action: "Open Conversations",
                        href: "/conversations",
                    },
                    {
                        id: "p3",
                        level: "High",
                        source: "Operations AI",
                        explanation: "Meeting requires confirmation.",
                        action: "Open Booking",
                        href: "/booking",
                    },
                    {
                        id: "p4",
                        level: "Medium",
                        source: "Finance AI",
                        explanation: "Finance AI flagged overdue invoices.",
                        action: "Open Billing",
                        href: "/billing",
                    },
                    {
                        id: "p5",
                        level: "Medium",
                        source: "Marketing AI",
                        explanation: "Marketing AI detected declining campaign engagement.",
                        action: "Open Growth Engine",
                        href: "/growth-engine",
                    },
                ],
                humanAttentionAlerts: [
                    {
                        id: "h1",
                        title: "Human overrides active",
                        details: activeOverridesCount > 0
                            ? `${activeOverridesCount} customer conversations currently flagged for manual override.`
                            : "Customer overrides currently active.",
                        action: "Open Conversations",
                        href: "/conversations",
                    },
                    {
                        id: "h2",
                        title: "Escalated negotiations",
                        details: "VIP Enterprise Lead (TechCorp) requested customized SLA terms",
                        action: "Open Lead OS",
                        href: "/leads",
                    },
                    {
                        id: "h3",
                        title: "Unresolved enterprise opportunities",
                        details: enterpriseLeadsCount > 0
                            ? `${enterpriseLeadsCount} qualified enterprise opportunities waiting for founder contact.`
                            : "Stalled enterprise deal with Acme Corp needs manual follow-up",
                        action: "Open Lead OS",
                        href: "/leads",
                    },
                    {
                        id: "h4",
                        title: "Pending founder approvals",
                        details: "Campaign budget increase from Marketing AI needs approval",
                        action: "Open Growth Engine",
                        href: "/growth-engine",
                    },
                ],
                criticalNotifications: [
                    {
                        id: "n1",
                        timestamp: "15m ago",
                        type: "Meeting Rescheduled",
                        module: "Booking",
                        message: "Meeting with Vertex Labs rescheduled to June 18th",
                    },
                    {
                        id: "n2",
                        timestamp: "45m ago",
                        type: "AI Resumed Control",
                        module: "Conversations",
                        message: "Sales AI took back control after human handoff expired",
                    },
                    {
                        id: "n3",
                        timestamp: "2h ago",
                        type: "Subscription Renewal",
                        module: "Billing",
                        message: "Automexia subscription renewal approaching in 3 days",
                    },
                    {
                        id: "n4",
                        timestamp: "4h ago",
                        type: "Integration Disconnected",
                        module: "Settings",
                        message: "Google Calendar sync failed due to token expiration",
                    },
                    {
                        id: "n5",
                        timestamp: "1d ago",
                        type: "Integration Reconnected",
                        module: "Settings",
                        message: "WhatsApp API channel reconnected successfully",
                    },
                ],
                workforceHealth: [
                    {
                        name: "Manager AI",
                        role: "👑 AI Manager",
                        status: "Healthy",
                        lastActive: "Active 1m ago",
                        workload: "Analyzing briefing",
                        escalations: 0,
                    },
                    {
                        name: "Sales AI",
                        role: "💰 Sales AI",
                        status: activeOverridesCount > 0 ? "Needs Attention" : "Healthy",
                        lastActive: "Active 5m ago",
                        workload: "Monitoring messages",
                        escalations: activeOverridesCount,
                    },
                    {
                        name: "Marketing AI",
                        role: "📈 Marketing AI",
                        status: "Healthy",
                        lastActive: "Active 12m ago",
                        workload: "Optimizing rule triggers",
                        escalations: 0,
                    },
                    {
                        name: "Success AI",
                        role: "❤️ Success AI",
                        status: "Healthy",
                        lastActive: "Active 24m ago",
                        workload: "Sentiment analysis",
                        escalations: 0,
                    },
                    {
                        name: "Operations AI",
                        role: "⚙️ Operations AI",
                        status: "Healthy",
                        lastActive: "Active 30m ago",
                        workload: "Resolving calendar conflicts",
                        escalations: 0,
                    },
                    {
                        name: "Finance AI",
                        role: "📊 Finance AI",
                        status: "Paused",
                        lastActive: "Active 1d ago",
                        workload: "Idle",
                        escalations: 1,
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
