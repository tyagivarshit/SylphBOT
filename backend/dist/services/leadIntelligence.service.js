"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeadIntelligenceProfile = exports.processLeadIntelligence = exports.getBehaviorConfig = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const leadIntelligence_service_1 = require("./crm/leadIntelligence.service");
const getBehaviorConfig = (temperature) => {
    if (temperature === "HOT") {
        return {
            tone: "aggressive",
            goal: "close",
            pushBooking: true,
        };
    }
    if (temperature === "WARM") {
        return {
            tone: "persuasive",
            goal: "nurture",
            pushBooking: true,
        };
    }
    return {
        tone: "soft",
        goal: "educate",
        pushBooking: false,
    };
};
exports.getBehaviorConfig = getBehaviorConfig;
const processLeadIntelligence = async ({ leadId, message, }) => {
    try {
        if (!leadId || !message) {
            return null;
        }
        const lead = await prisma_1.default.lead.findUnique({
            where: {
                id: leadId,
            },
            select: {
                businessId: true,
            },
        });
        if (!lead?.businessId) {
            return null;
        }
        const profile = await (0, leadIntelligence_service_1.refreshLeadIntelligenceProfile)({
            businessId: lead.businessId,
            leadId,
            inputMessage: message,
            source: "LEGACY_LEAD_INTELLIGENCE",
        });
        return {
            score: profile.scorecard.compositeScore,
            temperature: profile.lifecycle.nextAIStage === "HOT"
                ? "HOT"
                : profile.lifecycle.nextAIStage === "WARM"
                    ? "WARM"
                    : "COLD",
            stage: profile.lifecycle.nextLeadStage,
        };
    }
    catch (error) {
        console.error("LEAD INTELLIGENCE ERROR:", error);
        return null;
    }
};
exports.processLeadIntelligence = processLeadIntelligence;
const getLeadIntelligenceProfile = async (leadId) => {
    const lead = await prisma_1.default.lead.findUnique({
        where: {
            id: leadId,
        },
        select: {
            businessId: true,
        },
    });
    if (!lead?.businessId) {
        return null;
    }
    return (0, leadIntelligence_service_1.buildLeadIntelligenceProfile)({
        businessId: lead.businessId,
        leadId,
        source: "LEGACY_LEAD_INTELLIGENCE_READ",
    });
};
exports.getLeadIntelligenceProfile = getLeadIntelligenceProfile;
