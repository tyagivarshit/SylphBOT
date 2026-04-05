"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyConversionBooster = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/* =====================================================
🔥 TRIGGER CHECK
===================================================== */
const shouldApplyBooster = (message) => {
    const msg = message.toLowerCase();
    const triggers = [
        "price",
        "cost",
        "interested",
        "details",
        "tell me",
        "how",
        "info",
    ];
    return triggers.some((t) => msg.includes(t));
};
/* =====================================================
🔥 URGENCY
===================================================== */
const generateUrgencyLine = () => {
    const lines = [
        "⚡ Just a heads up — slots are filling fast today.",
        "⏳ Only a few spots left for today.",
        "🔥 This is getting booked quickly right now.",
    ];
    return lines[Math.floor(Math.random() * lines.length)];
};
/* =====================================================
🔥 FOMO
===================================================== */
const generateFomoLine = () => {
    const lines = [
        "Most people prefer to jump on a quick call to understand better.",
        "People usually take action at this stage to avoid missing out.",
        "This is where most customers move forward quickly.",
    ];
    return lines[Math.floor(Math.random() * lines.length)];
};
/* =====================================================
🔥 CTA (BEHAVIOR BASED)
===================================================== */
const generateCTA = (stage, aiStage, behavior) => {
    if (behavior?.pushBooking) {
        if (stage === "READY_TO_BUY" || aiStage === "HOT") {
            return "Want me to lock a slot for you right now?";
        }
        return "Want me to quickly book a call for you?";
    }
    return "Would you like more details?";
};
/*
=========================================================
MAIN FUNCTION
=========================================================
*/
const applyConversionBooster = async ({ leadId, message, behavior, }) => {
    try {
        if (!message || message.length < 10) {
            return { boostedMessage: message, applied: false };
        }
        /* 🔥 TRIGGER CHECK */
        if (!shouldApplyBooster(message)) {
            return { boostedMessage: message, applied: false };
        }
        /* 🔥 GET LEAD */
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                stage: true,
                aiStage: true,
                leadScore: true,
            },
        });
        if (!lead) {
            return { boostedMessage: message, applied: false };
        }
        /* 🔥 AVOID LOW INTENT */
        if ((lead.leadScore ?? 0) < 2) {
            return { boostedMessage: message, applied: false };
        }
        /* =====================================================
        🔥 BUILD RESPONSE
        ===================================================== */
        let extra = "";
        /* 🔥 URGENCY ONLY IF ALLOWED */
        if (behavior?.urgency) {
            extra += `\n\n${generateUrgencyLine()}`;
        }
        /* 🔥 FOMO ONLY FOR MID/HIGH INTENT */
        if ((lead.leadScore ?? 0) >= 4) {
            extra += `\n\n${generateFomoLine()}`;
        }
        /* 🔥 CTA */
        const cta = generateCTA(lead.stage || "NEW", lead.aiStage || "COLD", behavior);
        extra += `\n\n👉 ${cta}`;
        const boosted = `${message}${extra}`;
        return {
            boostedMessage: boosted.trim(),
            applied: true,
        };
    }
    catch (error) {
        console.error("CONVERSION BOOSTER ERROR:", error);
        return {
            boostedMessage: message,
            applied: false,
        };
    }
};
exports.applyConversionBooster = applyConversionBooster;
