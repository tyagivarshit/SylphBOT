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
exports.getTopSources = exports.getConversionFunnel = exports.getAnalyticsCharts = exports.getAnalyticsOverview = void 0;
const service = __importStar(require("../services/analytics.service"));
const prisma_1 = __importDefault(require("../config/prisma"));
const getBusinessId = async (userId) => {
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
        const businessId = await getBusinessId(userId);
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
        const businessId = await getBusinessId(userId);
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
        const businessId = await getBusinessId(userId);
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
        const businessId = await getBusinessId(userId);
        const data = await service.getSources(businessId);
        res.json({ success: true, data });
    }
    catch (error) {
        console.error("Sources Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.getTopSources = getTopSources;
