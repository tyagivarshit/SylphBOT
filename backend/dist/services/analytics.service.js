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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSources = exports.getFunnel = exports.getCharts = exports.getOverview = void 0;
const repo = __importStar(require("../analytics/analytics.repository"));
const analytics_utils_1 = require("../utils/analytics.utils");
const getOverview = async (businessId, range) => {
    const { start, end } = (0, analytics_utils_1.getDateRange)(range);
    const [totalLeads, messages, aiReplies, bookings] = await Promise.all([
        repo.countLeads(businessId, start, end),
        repo.countMessages(businessId, start, end),
        repo.countAIReplies(businessId, start, end),
        repo.countBookings(businessId, start, end)
    ]);
    return {
        totalLeads,
        messages,
        aiReplies,
        bookings
    };
};
exports.getOverview = getOverview;
const getCharts = async (businessId, range) => {
    const { start, end } = (0, analytics_utils_1.getDateRange)(range);
    const data = await repo.getLeadsGroupedByDate(businessId, start, end);
    return data.map((item) => ({
        date: item.date,
        leads: item.count
    }));
};
exports.getCharts = getCharts;
const getFunnel = async (businessId) => {
    return repo.getFunnelStats(businessId);
};
exports.getFunnel = getFunnel;
const getSources = async (businessId) => {
    const data = await repo.getTopSources(businessId);
    return data.map((item) => ({
        name: item._id,
        value: item.count
    }));
};
exports.getSources = getSources;
