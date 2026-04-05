"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeadBehavior = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/* =====================================================
🔥 MAIN ENGINE
===================================================== */
const getLeadBehavior = async ({ leadId, }) => {
    try {
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                aiStage: true,
                leadScore: true,
                stage: true,
            },
        });
        if (!lead) {
            return {
                tone: "soft",
                goal: "educate",
                pushBooking: false,
                urgency: false,
            };
        }
        const { aiStage, leadScore } = lead;
        /* =====================================================
        🔥 HOT LEADS (CLOSE FAST)
        ===================================================== */
        if (aiStage === "HOT" || (leadScore ?? 0) >= 8) {
            return {
                tone: "aggressive",
                goal: "close",
                pushBooking: true,
                urgency: true,
            };
        }
        /* =====================================================
        🌤️ WARM LEADS (CONVERT)
        ===================================================== */
        if (aiStage === "WARM" || (leadScore ?? 0) >= 4) {
            return {
                tone: "persuasive",
                goal: "nurture",
                pushBooking: true,
                urgency: false,
            };
        }
        /* =====================================================
        ❄️ COLD LEADS (EDUCATE)
        ===================================================== */
        return {
            tone: "soft",
            goal: "educate",
            pushBooking: false,
            urgency: false,
        };
    }
    catch (error) {
        console.error("BEHAVIOR ENGINE ERROR:", error);
        return {
            tone: "soft",
            goal: "educate",
            pushBooking: false,
            urgency: false,
        };
    }
};
exports.getLeadBehavior = getLeadBehavior;
