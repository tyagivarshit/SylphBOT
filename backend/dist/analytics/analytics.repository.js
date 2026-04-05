"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTopSources = exports.getFunnelStats = exports.getLeadsGroupedByDate = exports.countBookings = exports.countAIReplies = exports.countMessages = exports.countLeads = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const countLeads = (businessId, start, end) => {
    return prisma_1.default.lead.count({
        where: {
            businessId,
            createdAt: { gte: start, lte: end }
        }
    });
};
exports.countLeads = countLeads;
// 🔥 messages → via lead relation
const countMessages = async (businessId, start, end) => {
    return prisma_1.default.message.count({
        where: {
            lead: {
                businessId
            },
            createdAt: { gte: start, lte: end }
        }
    });
};
exports.countMessages = countMessages;
const countAIReplies = async (businessId, start, end) => {
    return prisma_1.default.message.count({
        where: {
            sender: "AI",
            lead: {
                businessId
            },
            createdAt: { gte: start, lte: end }
        }
    });
};
exports.countAIReplies = countAIReplies;
const countBookings = (businessId, start, end) => {
    return prisma_1.default.appointment.count({
        where: {
            businessId,
            createdAt: { gte: start, lte: end }
        }
    });
};
exports.countBookings = countBookings;
// 🔥 MongoDB aggregation (NO SQL RAW)
const getLeadsGroupedByDate = async (businessId, start, end) => {
    const data = await prisma_1.default.lead.findMany({
        where: {
            businessId,
            createdAt: { gte: start, lte: end }
        },
        select: {
            createdAt: true
        }
    });
    const grouped = {};
    data.forEach((item) => {
        const date = item.createdAt.toISOString().split("T")[0];
        grouped[date] = (grouped[date] || 0) + 1;
    });
    return Object.entries(grouped).map(([date, count]) => ({
        date,
        count
    }));
};
exports.getLeadsGroupedByDate = getLeadsGroupedByDate;
const getFunnelStats = async (businessId) => {
    const [leads, interested, qualified, booked] = await Promise.all([
        prisma_1.default.lead.count({ where: { businessId } }),
        prisma_1.default.lead.count({ where: { businessId, stage: "INTERESTED" } }),
        prisma_1.default.lead.count({ where: { businessId, stage: "QUALIFIED" } }),
        prisma_1.default.appointment.count({ where: { businessId } })
    ]);
    return { leads, interested, qualified, booked };
};
exports.getFunnelStats = getFunnelStats;
const getTopSources = async (businessId) => {
    const leads = await prisma_1.default.lead.findMany({
        where: { businessId },
        select: { platform: true }
    });
    const map = {};
    leads.forEach((l) => {
        map[l.platform] = (map[l.platform] || 0) + 1;
    });
    return Object.entries(map).map(([key, value]) => ({
        _id: key,
        count: value
    }));
};
exports.getTopSources = getTopSources;
