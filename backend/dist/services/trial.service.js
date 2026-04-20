"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireTrials = exports.ensureTrialPlanExists = exports.startTrial = exports.getTrialStatus = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const pricing_config_1 = require("../config/pricing.config");
const normalizeBusinessId = (businessId) => String(businessId || "").trim();
const getTrialPlan = async () => prisma_1.default.plan.findFirst({
    where: {
        OR: [{ name: pricing_config_1.TRIAL_PLAN_KEY }, { type: pricing_config_1.TRIAL_PLAN_KEY }],
    },
});
const getTrialStatus = async (businessId) => {
    const normalizedBusinessId = normalizeBusinessId(businessId);
    if (!normalizedBusinessId) {
        throw new Error("Invalid business id");
    }
    const subscription = await prisma_1.default.subscription.findUnique({
        where: { businessId: normalizedBusinessId },
        select: {
            isTrial: true,
            currentPeriodEnd: true,
        },
    });
    if (!subscription?.isTrial || !subscription.currentPeriodEnd) {
        return {
            trialActive: false,
            daysLeft: 0,
            currentPeriodEnd: null,
        };
    }
    const now = Date.now();
    const expiresAt = subscription.currentPeriodEnd.getTime();
    const active = expiresAt >= now;
    return {
        trialActive: active,
        daysLeft: active
            ? Math.max(Math.ceil((expiresAt - now) / 86400000), 0)
            : 0,
        currentPeriodEnd: subscription.currentPeriodEnd,
    };
};
exports.getTrialStatus = getTrialStatus;
const startTrial = async (businessId) => {
    const normalizedBusinessId = normalizeBusinessId(businessId);
    if (!normalizedBusinessId) {
        throw new Error("Invalid business id");
    }
    return prisma_1.default.$transaction(async (tx) => {
        const existing = await tx.subscription.findUnique({
            where: { businessId: normalizedBusinessId },
        });
        if (existing?.trialUsed) {
            throw new Error("Trial already used");
        }
        const selectedPlan = await tx.plan.findFirst({
            where: {
                OR: [{ name: pricing_config_1.TRIAL_PLAN_KEY }, { type: pricing_config_1.TRIAL_PLAN_KEY }],
            },
        });
        if (!selectedPlan) {
            throw new Error("Default trial plan not found");
        }
        const currentPeriodEnd = new Date();
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + pricing_config_1.TRIAL_DAYS);
        await tx.subscription.upsert({
            where: { businessId: normalizedBusinessId },
            update: {
                planId: selectedPlan.id,
                status: "ACTIVE",
                isTrial: true,
                trialUsed: true,
                currentPeriodEnd,
                graceUntil: null,
            },
            create: {
                businessId: normalizedBusinessId,
                planId: selectedPlan.id,
                status: "ACTIVE",
                isTrial: true,
                trialUsed: true,
                currentPeriodEnd,
            },
        });
    });
};
exports.startTrial = startTrial;
const ensureTrialPlanExists = async () => {
    const plan = await getTrialPlan();
    if (!plan) {
        throw new Error("Default trial plan not found");
    }
    return plan;
};
exports.ensureTrialPlanExists = ensureTrialPlanExists;
const expireTrials = async () => {
    const now = new Date();
    await prisma_1.default.subscription.updateMany({
        where: {
            isTrial: true,
            currentPeriodEnd: { lt: now },
        },
        data: {
            status: "INACTIVE",
            isTrial: false,
            graceUntil: null,
        },
    });
};
exports.expireTrials = expireTrials;
