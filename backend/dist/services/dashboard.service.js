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
const getSettledValue = (result, fallback) => result.status === "fulfilled" ? result.value : fallback;
class DashboardService {
    static async getStats(businessId) {
        const now = new Date();
        const todayStart = (0, date_fns_1.startOfDay)(now);
        const monthStart = (0, date_fns_1.startOfMonth)(now);
        const baseFilter = { businessId };
        const [subscription, coreMetrics, usageOverview, timeline] = await Promise.all([
            (0, subscriptionAuthority_service_1.getCanonicalSubscriptionSnapshot)(businessId).catch(() => null),
            Promise.allSettled([
                prisma_1.default.lead.count({ where: baseFilter }),
                prisma_1.default.lead.count({
                    where: {
                        ...baseFilter,
                        createdAt: { gte: todayStart },
                    },
                }),
                prisma_1.default.lead.count({
                    where: {
                        ...baseFilter,
                        createdAt: { gte: monthStart },
                    },
                }),
                prisma_1.default.message.count({
                    where: {
                        lead: { businessId },
                        createdAt: { gte: todayStart },
                    },
                }),
                prisma_1.default.lead.count({
                    where: {
                        ...baseFilter,
                        stage: "QUALIFIED",
                    },
                }),
            ]),
            (0, usage_service_1.getUsageOverview)(businessId).catch(() => EMPTY_USAGE),
            Promise.allSettled([
                this.getLeadsGrowth(businessId),
                this.getMessagesGrowth(businessId),
                this.getRecentActivity(businessId),
            ]),
        ]);
        const planKey = (0, plan_config_1.getPlanKey)(subscription?.plan || null);
        const aiCallsUsed = usageOverview?.usage?.ai?.used ?? 0;
        const aiLimit = usageOverview?.usage?.ai?.dailyLimit ?? 0;
        const isUnlimited = aiLimit === -1;
        const usagePercent = isUnlimited || aiLimit <= 0 ? 0 : Math.min(aiCallsUsed / aiLimit, 1);
        return {
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
            plan: (0, pricing_config_1.getPricingPlanLabel)(planKey),
            planKey,
            premiumLocked: planKey === "LOCKED" || planKey === "FREE_LOCKED",
            chartData: getSettledValue(timeline[0], []),
            messagesChart: getSettledValue(timeline[1], []),
            recentActivity: getSettledValue(timeline[2], []),
        };
    }
    static async getLeadsList(businessId, page, limit, stage, search) {
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
    static async getLeadDetail(businessId, leadId) {
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
    static async updateLeadStage(businessId, leadId, stage) {
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
    static async getLeadsGrowth(businessId) {
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
            const counts = await Promise.all(days.map((day) => prisma_1.default.lead.count({
                where: {
                    businessId,
                    createdAt: {
                        gte: day.dayStart,
                        lt: day.dayEnd,
                    },
                },
            })));
            return days.map((day, index) => ({
                date: day.label,
                leads: counts[index] || 0,
            }));
        }
        catch (error) {
            console.error("Dashboard getLeadsGrowth error", error);
            return [];
        }
    }
    static async getMessagesGrowth(businessId) {
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
            const counts = await Promise.all(days.map((day) => prisma_1.default.message.count({
                where: {
                    lead: { businessId },
                    createdAt: {
                        gte: day.dayStart,
                        lt: day.dayEnd,
                    },
                },
            })));
            return days.map((day, index) => ({
                date: day.label,
                messages: counts[index] || 0,
            }));
        }
        catch (error) {
            console.error("Dashboard getMessagesGrowth error", error);
            return [];
        }
    }
    static async getRecentActivity(businessId) {
        try {
            const leads = await prisma_1.default.lead.findMany({
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
    static async getActiveConversations(businessId) {
        try {
            const leads = await prisma_1.default.lead.findMany({
                where: {
                    businessId,
                    lastMessageAt: { not: null },
                },
                select: { unreadCount: true },
            });
            return {
                active: leads.length,
                waitingReplies: leads.filter((lead) => lead.unreadCount > 0).length,
                resolved: leads.filter((lead) => lead.unreadCount === 0).length,
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
