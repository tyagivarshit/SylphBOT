"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFeature = void 0;
const plan_config_1 = require("../config/plan.config");
const prisma_1 = __importDefault(require("../config/prisma"));
const HARD_BLOCK_FEATURES = [
    "WHATSAPP_AUTOMATION",
    "FOLLOWUPS",
    "CUSTOM_FOLLOWUPS",
    "AI_BOOKING_SCHEDULING",
];
const requireFeature = (feature) => async (req, res, next) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({
                code: "UNAUTHORIZED",
                message: "Unauthorized",
            });
        }
        const billing = req.billing;
        const plan = billing?.plan || null;
        const planKey = billing?.planKey || "FREE_LOCKED";
        const featureKey = mapFeature(feature);
        const allowed = planKey === "FREE_LOCKED"
            ? false
            : (0, plan_config_1.hasFeature)(plan, featureKey);
        req.feature = {
            allowed,
            feature,
            plan: planKey,
        };
        /* 🔴 HARD BLOCK */
        if (!allowed && HARD_BLOCK_FEATURES.includes(feature)) {
            return res.status(403).json({
                code: "FEATURE_NOT_ALLOWED",
                feature,
                plan: planKey,
                upgradeRequired: true,
            });
        }
        /* 🔥 BASIC LIMIT */
        if (planKey === "BASIC" && feature === "INSTAGRAM_DM") {
            const flowCount = await prisma_1.default.automationFlow.count({
                where: { businessId },
            });
            if (flowCount >= 5) {
                return res.status(403).json({
                    code: "LIMIT_REACHED",
                    message: "Automation limit reached (5 max in BASIC)",
                    upgradeRequired: true,
                });
            }
        }
        next();
    }
    catch (error) {
        console.error("❌ Feature Middleware Error:", error);
        return res.status(500).json({
            message: "Server error",
        });
    }
};
exports.requireFeature = requireFeature;
const mapFeature = (feature) => {
    const mapping = {
        INSTAGRAM_DM: "automationEnabled",
        INSTAGRAM_COMMENT_AUTOMATION: "automationEnabled",
        COMMENT_TO_DM: "automationEnabled",
        REEL_AUTOMATION_CONTROL: "automationEnabled",
        WHATSAPP_AUTOMATION: "whatsappEnabled",
        CRM: "crmEnabled",
        FOLLOWUPS: "followupsEnabled",
        CUSTOM_FOLLOWUPS: "followupsEnabled",
        AI_BOOKING_SCHEDULING: "bookingEnabled",
    };
    return mapping[feature];
};
