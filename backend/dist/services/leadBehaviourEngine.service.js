"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeadBehavior = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const leadIntelligence_service_1 = require("./crm/leadIntelligence.service");
const fallbackBehavior = {
    tone: "soft",
    goal: "educate",
    pushBooking: false,
    urgency: false,
};
const getLeadBehavior = async ({ leadId, }) => {
    try {
        const lead = await prisma_1.default.lead.findUnique({
            where: {
                id: leadId,
            },
            select: {
                businessId: true,
            },
        });
        if (!lead?.businessId) {
            return fallbackBehavior;
        }
        const profile = await (0, leadIntelligence_service_1.buildLeadIntelligenceProfile)({
            businessId: lead.businessId,
            leadId,
            source: "LEGACY_BEHAVIOR_ENGINE",
        });
        if (profile.behavior.predictedBehavior === "BOOKING_READY" ||
            profile.behavior.predictedBehavior === "CLOSE_READY") {
            return {
                tone: "aggressive",
                goal: "close",
                pushBooking: true,
                urgency: profile.behavior.urgency === "HIGH",
            };
        }
        if (profile.behavior.predictedBehavior === "PRICE_EVALUATION" ||
            profile.behavior.predictedBehavior === "NEEDS_NURTURE") {
            return {
                tone: "persuasive",
                goal: "nurture",
                pushBooking: true,
                urgency: false,
            };
        }
        return {
            tone: "soft",
            goal: "educate",
            pushBooking: profile.behavior.nextBestAction === "SHORT_PROOF_FOLLOWUP",
            urgency: false,
        };
    }
    catch (error) {
        console.error("BEHAVIOR ENGINE ERROR:", error);
        return fallbackBehavior;
    }
};
exports.getLeadBehavior = getLeadBehavior;
