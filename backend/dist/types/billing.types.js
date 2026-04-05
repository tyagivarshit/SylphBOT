"use strict";
/* ======================================
PLAN LIST
====================================== */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_CONFIG = exports.PLANS = void 0;
exports.PLANS = ["BASIC", "PRO", "ELITE"];
/* ======================================
PLAN CONFIG MAP
====================================== */
exports.PLAN_CONFIG = {
    BASIC: {
        name: "BASIC",
        features: [
            "INSTAGRAM_DM",
            "INSTAGRAM_COMMENT_AUTOMATION",
            "COMMENT_TO_DM",
            "REEL_AUTOMATION_CONTROL"
        ],
        maxMessages: 200,
        maxFollowups: 50,
        aiUnlimited: true
    },
    PRO: {
        name: "PRO",
        features: [
            "INSTAGRAM_DM",
            "INSTAGRAM_COMMENT_AUTOMATION",
            "COMMENT_TO_DM",
            "REEL_AUTOMATION_CONTROL",
            "WHATSAPP_AUTOMATION",
            "CRM",
            "FOLLOWUPS",
            "CUSTOM_FOLLOWUPS"
        ],
        maxMessages: 2000,
        maxFollowups: 500,
        aiUnlimited: true
    },
    ELITE: {
        name: "ELITE",
        features: [
            "INSTAGRAM_DM",
            "INSTAGRAM_COMMENT_AUTOMATION",
            "COMMENT_TO_DM",
            "REEL_AUTOMATION_CONTROL",
            "WHATSAPP_AUTOMATION",
            "CRM",
            "FOLLOWUPS",
            "CUSTOM_FOLLOWUPS",
            "AI_BOOKING_SCHEDULING"
        ],
        maxMessages: null,
        maxFollowups: null,
        aiUnlimited: true
    }
};
