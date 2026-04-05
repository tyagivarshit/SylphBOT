"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const dashboard_service_1 = require("../services/dashboard.service");
/* ======================================
UTILS
====================================== */
function isValidString(val) {
    return typeof val === "string" && val.trim().length > 0;
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
    console.error("❌ DASHBOARD ERROR", {
        userId: req.user?.id,
        businessId: req.user?.businessId,
        path: req.originalUrl,
        error: error?.message,
    });
}
/* ======================================
BASE HANDLER (SaaS UPGRADED)
====================================== */
async function baseHandler(req, res, handler) {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return sendError(res, 403, "No business found. Please complete onboarding.");
        }
        /* ======================================
        🔥 SOFT LIMIT MODE (IMPORTANT FIX)
        ====================================== */
        if (req.featureDenied || req.isLimited) {
            return sendSuccess(res, null, {
                limited: true,
                upgradeRequired: true,
            });
        }
        const data = await handler(businessId);
        /* ======================================
        ✅ NORMAL FLOW
        ====================================== */
        return sendSuccess(res, data);
    }
    catch (error) {
        logError(req, error);
        return sendError(res, 500, error?.message || "Dashboard error");
    }
}
/* ======================================
CONTROLLER
====================================== */
class DashboardController {
    /* ================================
       📊 STATS
    ================================ */
    static async getStats(req, res) {
        return baseHandler(req, res, async (businessId) => {
            return dashboard_service_1.DashboardService.getStats(businessId);
        });
    }
    /* ================================
       👥 LEADS LIST
    ================================ */
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
        });
    }
    /* ================================
       🔍 LEAD DETAIL
    ================================ */
    static async getLeadDetail(req, res) {
        return baseHandler(req, res, async (businessId) => {
            const id = req.params.id;
            if (!isValidString(id)) {
                throw new Error("Valid Lead ID is required");
            }
            return dashboard_service_1.DashboardService.getLeadDetail(businessId, id);
        });
    }
    /* ================================
       ✏️ UPDATE LEAD STAGE
    ================================ */
    static async updateLeadStage(req, res) {
        return baseHandler(req, res, async (businessId) => {
            const id = req.params.id;
            const { stage } = req.body;
            if (!isValidString(id) || !isValidString(stage)) {
                throw new Error("Valid Lead ID and stage are required");
            }
            return dashboard_service_1.DashboardService.updateLeadStage(businessId, id, stage);
        });
    }
    /* ================================
       💬 ACTIVE CONVERSATIONS
    ================================ */
    static async getActiveConversations(req, res) {
        return baseHandler(req, res, async (businessId) => {
            return dashboard_service_1.DashboardService.getActiveConversations(businessId);
        });
    }
}
exports.DashboardController = DashboardController;
