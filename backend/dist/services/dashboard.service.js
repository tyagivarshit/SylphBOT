"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const date_fns_1 = require("date-fns");
const plan_config_1 = require("../config/plan.config");
class DashboardService {
    /* ======================================
       📊 DASHBOARD STATS (SaaS PRO)
    ====================================== */
    static async getStats(businessId) {
        try {
            const now = new Date();
            const todayStart = (0, date_fns_1.startOfDay)(now);
            const monthStart = (0, date_fns_1.startOfMonth)(now);
            const baseFilter = { businessId };
            /* 🔥 SUBSCRIPTION (SAFE FALLBACK) */
            const subscription = await prisma_1.default.subscription.findUnique({
                where: { businessId },
                include: { plan: true },
            });
            const planKey = (0, plan_config_1.getPlanKey)(subscription?.plan || null);
            const limits = (0, plan_config_1.getPlanLimits)(subscription?.plan || null);
            /* ======================================
            PARALLEL QUERIES (FAST)
            ====================================== */
            const [totalLeads, leadsToday, leadsThisMonth, messagesToday, aiCallsUsed, qualifiedLeads,] = await Promise.all([
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
                /* 🔥 AI usage (temporary metric) */
                prisma_1.default.message.count({
                    where: {
                        lead: { businessId },
                        sender: "AI",
                    },
                }),
                prisma_1.default.lead.count({
                    where: {
                        ...baseFilter,
                        stage: "QUALIFIED",
                    },
                }),
            ]);
            const [chartData, messagesChart, activity] = await Promise.all([
                this.getLeadsGrowth(businessId),
                this.getMessagesGrowth(businessId),
                this.getRecentActivity(businessId),
            ]);
            /* ======================================
            🔥 USAGE ENGINE
            ====================================== */
            const aiLimit = limits.aiCallsUsed;
            const isUnlimited = aiLimit === -1;
            const usagePercent = isUnlimited || aiLimit === 0
                ? 0
                : aiCallsUsed / aiLimit;
            const nearLimit = (0, plan_config_1.isNearLimit)(aiCallsUsed, aiLimit);
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
                plan: planKey,
                /* 📊 */
                qualifiedLeads: qualifiedLeads || 0,
                chartData: chartData || [],
                messagesChart: messagesChart || [],
                recentActivity: activity || [],
            };
        }
        catch (error) {
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
                plan: "FREE",
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
    static async getLeadsList(businessId, page, limit, stage, search) {
        try {
            const skip = (page - 1) * limit;
            const where = { businessId };
            if (stage)
                where.stage = stage;
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
                leads: leads || [],
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            };
        }
        catch (error) {
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
    static async getLeadDetail(businessId, leadId) {
        try {
            const lead = await prisma_1.default.lead.findFirst({
                where: { id: leadId, businessId },
                include: {
                    messages: {
                        orderBy: { createdAt: "asc" },
                    },
                },
            });
            return lead || null;
        }
        catch (error) {
            console.error("❌ SERVICE ERROR (getLeadDetail):", error);
            return null;
        }
    }
    /* ======================================
       ✏️ UPDATE LEAD STAGE
    ====================================== */
    static async updateLeadStage(businessId, leadId, stage) {
        try {
            const lead = await prisma_1.default.lead.findFirst({
                where: { id: leadId, businessId },
            });
            if (!lead)
                return null;
            return prisma_1.default.lead.update({
                where: { id: leadId },
                data: { stage },
            });
        }
        catch (error) {
            console.error("❌ SERVICE ERROR (updateLeadStage):", error);
            return null;
        }
    }
    /* ======================================
       📈 LEADS GROWTH
    ====================================== */
    static async getLeadsGrowth(businessId) {
        try {
            const today = new Date();
            const startDate = (0, date_fns_1.subDays)(today, 6);
            const leads = await prisma_1.default.lead.findMany({
                where: {
                    businessId,
                    createdAt: { gte: startDate },
                },
                select: { createdAt: true },
            });
            const map = {};
            for (let i = 0; i < 7; i++) {
                const day = (0, date_fns_1.format)((0, date_fns_1.subDays)(today, i), "EEE");
                map[day] = 0;
            }
            leads.forEach((lead) => {
                const day = (0, date_fns_1.format)(lead.createdAt, "EEE");
                if (map[day] !== undefined)
                    map[day]++;
            });
            return Object.keys(map)
                .reverse()
                .map((day) => ({
                date: day,
                leads: map[day],
            }));
        }
        catch {
            return [];
        }
    }
    /* ======================================
       💬 MESSAGES GROWTH
    ====================================== */
    static async getMessagesGrowth(businessId) {
        try {
            const today = new Date();
            const startDate = (0, date_fns_1.subDays)(today, 6);
            const messages = await prisma_1.default.message.findMany({
                where: {
                    lead: { businessId },
                    createdAt: { gte: startDate },
                },
                select: { createdAt: true },
            });
            const map = {};
            for (let i = 0; i < 7; i++) {
                const day = (0, date_fns_1.format)((0, date_fns_1.subDays)(today, i), "EEE");
                map[day] = 0;
            }
            messages.forEach((msg) => {
                const day = (0, date_fns_1.format)(msg.createdAt, "EEE");
                if (map[day] !== undefined)
                    map[day]++;
            });
            return Object.keys(map)
                .reverse()
                .map((day) => ({
                date: day,
                messages: map[day],
            }));
        }
        catch {
            return [];
        }
    }
    /* ======================================
       🕒 RECENT ACTIVITY
    ====================================== */
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
            return leads.map((lead) => ({
                id: lead.id,
                text: `New lead from ${lead.platform} (${lead.name || "Unknown"})`,
                time: lead.createdAt,
            }));
        }
        catch {
            return [];
        }
    }
    /* ======================================
       📊 ACTIVE CONVERSATIONS
    ====================================== */
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
                waitingReplies: leads.filter((l) => l.unreadCount > 0).length,
                resolved: leads.filter((l) => l.unreadCount === 0).length,
            };
        }
        catch {
            return {
                active: 0,
                waitingReplies: 0,
                resolved: 0,
            };
        }
    }
}
exports.DashboardService = DashboardService;
