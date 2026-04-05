"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementFollowupUsage = exports.incrementMessageUsage = exports.incrementAiUsage = exports.trackUsage = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const monthlyUsage_helper_1 = require("../utils/monthlyUsage.helper");
const plan_config_1 = require("../config/plan.config");
/* ======================================
KEY
====================================== */
const getKey = (businessId) => {
    const { month, year } = (0, monthlyUsage_helper_1.getCurrentMonthYear)();
    return { businessId, month, year };
};
/* ======================================
CUSTOM ERROR
====================================== */
class UsageError extends Error {
    constructor(code, message, meta) {
        super(message);
        this.code = code;
        this.meta = meta;
        this.upgradeRequired = true;
    }
}
/* ======================================
🔥 ATOMIC CHECK + INCREMENT
====================================== */
const trackUsage = async (businessId, field) => {
    return prisma_1.default.$transaction(async (tx) => {
        const subscription = await tx.subscription.findUnique({
            where: { businessId },
            include: { plan: true },
        });
        /* ======================================
        VALID STATUS (FIXED)
        ====================================== */
        const validStatuses = ["ACTIVE"]; // ✅ FIXED
        if (!subscription ||
            !validStatuses.includes(subscription.status)) {
            throw new UsageError("NO_ACTIVE_SUBSCRIPTION", "No active subscription");
        }
        const limits = (0, plan_config_1.getPlanLimits)(subscription.plan);
        const key = getKey(businessId);
        const usage = await tx.usage.upsert({
            where: {
                businessId_month_year: key,
            },
            update: {},
            create: {
                ...key,
                aiCallsUsed: 0,
                messagesUsed: 0,
                followupsUsed: 0,
            },
        });
        const current = usage[field];
        const max = limits[field];
        /* ======================================
        HARD LIMIT
        ====================================== */
        if (max !== -1 && current >= max) {
            throw new UsageError("LIMIT_REACHED", "Usage limit reached", { field, current, max });
        }
        /* ======================================
        🔥 SAFE INCREMENT
        ====================================== */
        const updated = await tx.usage.update({
            where: { id: usage.id },
            data: {
                [field]: {
                    increment: 1,
                },
            },
        });
        /* ======================================
        SOFT LIMIT (UPSELL ENGINE)
        ====================================== */
        const nearLimit = max !== -1 && (0, plan_config_1.isNearLimit)(updated[field], max);
        return {
            success: true,
            current: updated[field],
            max,
            nearLimit,
        };
    });
};
exports.trackUsage = trackUsage;
/* ======================================
HELPERS
====================================== */
const incrementAiUsage = async (businessId) => {
    return (0, exports.trackUsage)(businessId, "aiCallsUsed");
};
exports.incrementAiUsage = incrementAiUsage;
const incrementMessageUsage = async (businessId) => {
    return (0, exports.trackUsage)(businessId, "messagesUsed");
};
exports.incrementMessageUsage = incrementMessageUsage;
const incrementFollowupUsage = async (businessId) => {
    return (0, exports.trackUsage)(businessId, "followupsUsed");
};
exports.incrementFollowupUsage = incrementFollowupUsage;
