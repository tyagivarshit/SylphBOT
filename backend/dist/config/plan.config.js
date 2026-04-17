"use strict";
/* ======================================
TYPES
====================================== */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUpgradePlan = exports.isNearLimit = exports.canSendFollowup = exports.canCreateTrigger = exports.hasFeature = exports.getPlanFeatures = exports.getPlanLimits = exports.getPlanKey = void 0;
/* ======================================
PLAN CONFIG
====================================== */
const PLAN_CONFIG = {
    FREE_LOCKED: {
        limits: {
            aiCallsLimit: 0,
            messagesLimit: 0,
            followupsLimit: 0,
            maxTriggers: 0,
        },
        features: {
            whatsappEnabled: false,
            automationEnabled: false,
            bookingEnabled: false,
            crmEnabled: false,
            followupsEnabled: false,
            prioritySupport: false,
        },
    },
    BASIC: {
        limits: {
            aiCallsLimit: 500,
            messagesLimit: 2000,
            followupsLimit: 0,
            maxTriggers: 5,
        },
        features: {
            whatsappEnabled: false,
            automationEnabled: true,
            bookingEnabled: false,
            crmEnabled: false,
            followupsEnabled: false,
            prioritySupport: false,
        },
    },
    PRO: {
        limits: {
            aiCallsLimit: 5000,
            messagesLimit: 15000,
            followupsLimit: 2000,
            maxTriggers: -1,
        },
        features: {
            whatsappEnabled: true,
            automationEnabled: true,
            bookingEnabled: false,
            crmEnabled: true,
            followupsEnabled: true,
            prioritySupport: true,
        },
    },
    ELITE: {
        limits: {
            aiCallsLimit: -1,
            messagesLimit: -1,
            followupsLimit: -1,
            maxTriggers: -1,
        },
        features: {
            whatsappEnabled: true,
            automationEnabled: true,
            bookingEnabled: true,
            crmEnabled: true,
            followupsEnabled: true,
            prioritySupport: true,
        },
    },
};
const normalizePlanValue = (value) => {
    if (!value)
        return null;
    const normalized = value
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
    if (normalized === "FREE" ||
        normalized === "FREE_LOCKED" ||
        normalized === "FREE_TRIAL" ||
        normalized === "STARTER") {
        return "FREE_LOCKED";
    }
    if (normalized.includes("ELITE"))
        return "ELITE";
    if (normalized.includes("PRO"))
        return "PRO";
    if (normalized.includes("BASIC"))
        return "BASIC";
    return null;
};
/* ======================================
GET PLAN KEY
====================================== */
const getPlanKey = (plan) => {
    return (normalizePlanValue(plan?.type) ||
        normalizePlanValue(plan?.name) ||
        "FREE_LOCKED");
};
exports.getPlanKey = getPlanKey;
/* ======================================
GET LIMITS
====================================== */
const getPlanLimits = (plan) => {
    return PLAN_CONFIG[(0, exports.getPlanKey)(plan)].limits;
};
exports.getPlanLimits = getPlanLimits;
/* ======================================
GET FEATURES
====================================== */
const getPlanFeatures = (plan) => {
    return PLAN_CONFIG[(0, exports.getPlanKey)(plan)].features;
};
exports.getPlanFeatures = getPlanFeatures;
/* ======================================
FEATURE CHECK
====================================== */
const hasFeature = (plan, feature) => {
    return (0, exports.getPlanFeatures)(plan)[feature] === true;
};
exports.hasFeature = hasFeature;
/* ======================================
LIMIT HELPERS
====================================== */
const canCreateTrigger = (plan, currentCount) => {
    const { maxTriggers } = (0, exports.getPlanLimits)(plan);
    if (maxTriggers === -1)
        return true;
    return currentCount < maxTriggers;
};
exports.canCreateTrigger = canCreateTrigger;
const canSendFollowup = (plan, used) => {
    const { followupsLimit } = (0, exports.getPlanLimits)(plan);
    if (followupsLimit === -1)
        return true;
    return used < followupsLimit;
};
exports.canSendFollowup = canSendFollowup;
/* ======================================
UPSELL ENGINE
====================================== */
const isNearLimit = (current, max) => {
    if (max === -1)
        return false;
    return current / max >= 0.8;
};
exports.isNearLimit = isNearLimit;
const getUpgradePlan = (current) => {
    const order = ["FREE_LOCKED", "BASIC", "PRO", "ELITE"];
    const index = order.indexOf(current);
    return order[index + 1] || current;
};
exports.getUpgradePlan = getUpgradePlan;
