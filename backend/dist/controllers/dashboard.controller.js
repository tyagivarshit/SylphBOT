"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const dashboard_service_1 = require("../services/dashboard.service");
const boundedTimeout_1 = require("../utils/boundedTimeout");
function isValidString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function sendSuccess(res, data, extra = {}) {
    return res.status(200).json({
        success: true,
        data,
        limited: extra.limited ?? false,
        upgradeRequired: extra.upgradeRequired ?? false,
    });
}
function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        message,
    });
}
function logError(req, error) {
    const message = error instanceof Error ? error.message : "unknown_dashboard_error";
    console.error("DASHBOARD_ERROR", {
        userId: req.user?.id,
        businessId: req.user?.businessId,
        path: req.originalUrl,
        error: message,
    });
}
async function baseHandler(req, res, handler, options) {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return sendError(res, 403, "No business found. Please complete onboarding.");
        }
        if (req.featureDenied || req.isLimited) {
            return sendSuccess(res, null, {
                limited: true,
                upgradeRequired: true,
            });
        }
        const projection = await (0, boundedTimeout_1.withTimeoutFallback)({
            label: options.timeoutLabel,
            timeoutMs: options.timeoutMs || 4000,
            task: handler(businessId),
            fallback: options.fallback,
        });
        if (options.projectionLog) {
            console.info(options.projectionLog, {
                businessId,
                timedOut: projection.timedOut,
                fallback: projection.timedOut || projection.failed,
            });
        }
        return sendSuccess(res, projection.value);
    }
    catch (error) {
        logError(req, error);
        return sendError(res, 500, error instanceof Error ? error.message : "Dashboard error");
    }
}
class DashboardController {
    static async getStats(req, res) {
        return baseHandler(req, res, async (businessId) => dashboard_service_1.DashboardService.getStats(businessId), {
            timeoutLabel: "dashboard_stats_projection",
            timeoutMs: 4500,
            fallback: {
                totalLeads: 0,
                leadsToday: 0,
                leadsThisMonth: 0,
                messagesToday: 0,
                qualifiedLeads: 0,
                aiCallsUsed: 0,
                aiCallsLimit: 0,
                aiCallsRemaining: 0,
                usagePercent: 0,
                nearLimit: false,
                warning: false,
                warningMessage: null,
                isUnlimited: false,
                plan: "LOCKED",
                planKey: "LOCKED",
                premiumLocked: true,
                chartData: [],
                messagesChart: [],
                recentActivity: [],
            },
            projectionLog: "DASHBOARD_PROJECTION_READY",
        });
    }
    static async getLeadsList(req, res) {
        return baseHandler(req, res, async (businessId) => {
            const page = Math.max(Number(req.query.page) || 1, 1);
            const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
            const stage = isValidString(req.query.stage)
                ? String(req.query.stage)
                : undefined;
            const search = isValidString(req.query.search)
                ? String(req.query.search)
                : undefined;
            const result = await dashboard_service_1.DashboardService.getLeadsList(businessId, page, limit, stage, search);
            return {
                leads: result.leads,
                pagination: result.pagination,
            };
        }, {
            timeoutLabel: "dashboard_leads_projection",
            timeoutMs: 3500,
            fallback: {
                leads: [],
                pagination: {
                    total: 0,
                    page: 1,
                    limit: 10,
                    totalPages: 0,
                },
            },
        });
    }
    static async getLeadDetail(req, res) {
        return baseHandler(req, res, async (businessId) => {
            const id = req.params.id;
            if (!isValidString(id)) {
                throw new Error("Valid Lead ID is required");
            }
            return dashboard_service_1.DashboardService.getLeadDetail(businessId, id);
        }, {
            timeoutLabel: "dashboard_lead_detail_projection",
            timeoutMs: 3500,
            fallback: null,
        });
    }
    static async updateLeadStage(req, res) {
        return baseHandler(req, res, async (businessId) => {
            const id = req.params.id;
            const { stage } = req.body;
            if (!isValidString(id) || !isValidString(stage)) {
                throw new Error("Valid Lead ID and stage are required");
            }
            return dashboard_service_1.DashboardService.updateLeadStage(businessId, id, stage);
        }, {
            timeoutLabel: "dashboard_lead_stage_projection",
            timeoutMs: 3500,
            fallback: null,
        });
    }
    static async getActiveConversations(req, res) {
        return baseHandler(req, res, async (businessId) => dashboard_service_1.DashboardService.getActiveConversations(businessId), {
            timeoutLabel: "dashboard_conversation_projection",
            timeoutMs: 3500,
            fallback: {
                active: 0,
                waitingReplies: 0,
                resolved: 0,
            },
        });
    }
}
exports.DashboardController = DashboardController;
