"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLeadIntelligence = exports.getBehaviorConfig = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/* =====================================================
🔥 SCORING RULES (ADVANCED)
===================================================== */
const calculateScore = (message) => {
    const msg = message.toLowerCase();
    let score = 0;
    /* 🔥 HIGH INTENT */
    if (/buy|purchase|start|book now/.test(msg))
        score += 10;
    /* 💰 MONEY SIGNAL */
    if (/price|cost|pricing|fees/.test(msg))
        score += 4;
    /* 📞 CALL INTENT */
    if (/call|demo|meeting/.test(msg))
        score += 6;
    /* 🤔 INTEREST */
    if (/interested|tell me|details|info/.test(msg))
        score += 3;
    /* ❌ NEGATIVE */
    if (/not interested|later|busy/.test(msg))
        score -= 3;
    return score;
};
/* =====================================================
🔥 TEMPERATURE DETECTION
===================================================== */
const getTemperature = (score) => {
    if (score >= 8)
        return "HOT";
    if (score >= 4)
        return "WARM";
    return "COLD";
};
/* =====================================================
🔥 STAGE MAPPING
===================================================== */
const getStage = (temperature) => {
    if (temperature === "HOT")
        return "READY_TO_BUY";
    if (temperature === "WARM")
        return "INTERESTED";
    return "NEW";
};
/* =====================================================
🔥 BEHAVIOR LOGIC (IMPORTANT)
===================================================== */
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
/*
=========================================================
MAIN FUNCTION
=========================================================
*/
const processLeadIntelligence = async ({ leadId, message, }) => {
    try {
        if (!leadId || !message)
            return null;
        /* 🔥 SCORE */
        const score = calculateScore(message);
        /* 🔥 TEMPERATURE */
        const temperature = getTemperature(score);
        /* 🔥 STAGE */
        const stage = getStage(temperature);
        /* 🔥 UPDATE DB */
        await prisma_1.default.lead.update({
            where: { id: leadId },
            data: {
                leadScore: { increment: score },
                aiStage: temperature,
                stage,
            },
        });
        console.log("🧠 Lead Intelligence:", {
            score,
            temperature,
            stage,
        });
        return {
            score,
            temperature,
            stage,
        };
    }
    catch (error) {
        console.error("LEAD INTELLIGENCE ERROR:", error);
        return null;
    }
};
exports.processLeadIntelligence = processLeadIntelligence;
