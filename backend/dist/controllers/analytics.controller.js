"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordConversionOutcome = exports.getRevenueAnalytics = exports.getDeepAnalyticsDashboard = exports.getTopSources = exports.getConversionFunnel = exports.getAnalyticsCharts = exports.getAnalyticsOverview = void 0;
const service = __importStar(require("../services/analytics.service"));
const analyticsDashboard_service_1 = require("../services/analyticsDashboard.service");
const prisma_1 = __importDefault(require("../config/prisma"));
const conversionTracker_service_1 = require("../services/salesAgent/conversionTracker.service");
const followup_queue_1 = require("../queues/followup.queue");
const tenant_service_1 = require("../services/tenant.service");
const getBusinessId = async (userId, requestBusinessId) => {
    if (requestBusinessId) {
        return requestBusinessId;
    }
    const business = await prisma_1.default.business.findFirst({
        where: { ownerId: userId }
    });
    if (!business)
        throw new Error("Business not found");
    return business.id;
};
const getAnalyticsOverview = async (req, res) => {
    try {
        const userId = req.user.id;
        const range = req.query.range || "7d";
        const businessId = await getBusinessId(userId, (0, tenant_service_1.getRequestBusinessId)(req));
        const data = await service.getOverview(businessId, range);
        res.json({ success: true, data });
    }
    catch (error) {
        console.error("Overview Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.getAnalyticsOverview = getAnalyticsOverview;
const getAnalyticsCharts = async (req, res) => {
    try {
        const userId = req.user.id;
        const range = req.query.range || "7d";
        const businessId = await getBusinessId(userId, (0, tenant_service_1.getRequestBusinessId)(req));
        const data = await service.getCharts(businessId, range);
        res.json({ success: true, data });
    }
    catch (error) {
        console.error("Charts Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.getAnalyticsCharts = getAnalyticsCharts;
const getConversionFunnel = async (req, res) => {
    try {
        const userId = req.user.id;
        const businessId = await getBusinessId(userId, (0, tenant_service_1.getRequestBusinessId)(req));
        const data = await service.getFunnel(businessId);
        res.json({ success: true, data });
    }
    catch (error) {
        console.error("Funnel Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.getConversionFunnel = getConversionFunnel;
const getTopSources = async (req, res) => {
    try {
        const userId = req.user.id;
        const businessId = await getBusinessId(userId, (0, tenant_service_1.getRequestBusinessId)(req));
        const data = await service.getSources(businessId);
        res.json({ success: true, data });
    }
    catch (error) {
        console.error("Sources Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.getTopSources = getTopSources;
const getDeepAnalyticsDashboard = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        const range = req.query.range || "30d";
        const planKey = req.billing?.planKey || "FREE_LOCKED";
        if (!businessId) {
            return res.status(403).json({
                success: false,
                message: "Business not found",
            });
        }
        const data = await (0, analyticsDashboard_service_1.getAnalyticsDashboard)(businessId, range, planKey);
        res.json({
            success: true,
            data,
            limited: data.meta.upgradeRequired,
            upgradeRequired: data.meta.upgradeRequired,
        });
    }
    catch (error) {
        console.error("Deep Analytics Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.getDeepAnalyticsDashboard = getDeepAnalyticsDashboard;
const getRevenueAnalytics = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        const range = req.query.range || "30d";
        const planKey = req.billing?.planKey || "FREE_LOCKED";
        if (!businessId) {
            return res.status(403).json({
                success: false,
                message: "Business not found",
            });
        }
        const dashboard = await (0, analyticsDashboard_service_1.getAnalyticsDashboard)(businessId, range, planKey);
        res.json({
            success: true,
            data: dashboard.revenueEngine,
            meta: dashboard.meta,
        });
    }
    catch (error) {
        console.error("Revenue Analytics Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.getRevenueAnalytics = getRevenueAnalytics;
const recordConversionOutcome = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        const { leadId, messageId, trackingId, variantId, outcome, value, idempotencyKey, metadata, } = req.body || {};
        if (!businessId || !leadId || !outcome) {
            return res.status(400).json({
                success: false,
                message: "businessId, leadId and outcome are required",
            });
        }
        const event = await (0, conversionTracker_service_1.recordConversionEvent)({
            businessId,
            leadId: String(leadId),
            messageId: messageId ? String(messageId) : null,
            trackingId: trackingId ? String(trackingId) : null,
            variantId: variantId ? String(variantId) : null,
            outcome: String(outcome),
            value: typeof value === "number" ? value : null,
            source: "ANALYTICS_API",
            idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
            metadata: metadata && typeof metadata === "object"
                ? metadata
                : {},
        });
        if (outcome === "link_clicked") {
            void (0, followup_queue_1.scheduleFollowups)(String(leadId), {
                trigger: "clicked_not_booked",
            }).catch(() => { });
        }
        if (outcome === "opened") {
            void (0, followup_queue_1.scheduleFollowups)(String(leadId), {
                trigger: "opened_not_responded",
            }).catch(() => { });
        }
        res.json({
            success: true,
            event,
        });
    }
    catch (error) {
        console.error("Conversion Outcome Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.recordConversionOutcome = recordConversionOutcome;
