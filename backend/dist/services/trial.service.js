"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireTrials = exports.startTrial = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/* ======================================
START TRIAL (SAFE)
====================================== */
const startTrial = async (businessId) => {
    return prisma_1.default.$transaction(async (tx) => {
        const existing = await tx.subscription.findUnique({
            where: { businessId },
        });
        /* 🔥 PREVENT TRIAL ABUSE */
        if (existing?.trialUsed) {
            throw new Error("Trial already used");
        }
        /* ======================================
        ✅ FIX: USE BASIC PLAN (NO FREE PLAN)
        ====================================== */
        const selectedPlan = await tx.plan.findFirst({
            where: {
                OR: [{ name: "BASIC" }, { type: "BASIC" }],
            },
        });
        if (!selectedPlan) {
            throw new Error("Default trial plan not found");
        }
        const trialDays = 7;
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + trialDays);
        await tx.subscription.upsert({
            where: { businessId },
            update: {
                status: "ACTIVE",
                isTrial: true,
                trialUsed: true,
                currentPeriodEnd: endDate,
                planId: selectedPlan.id, // ✅ FIX
            },
            create: {
                businessId,
                planId: selectedPlan.id, // ✅ FIX
                status: "ACTIVE",
                isTrial: true,
                trialUsed: true,
                currentPeriodEnd: endDate,
            },
        });
    });
};
exports.startTrial = startTrial;
/* ======================================
EXPIRE TRIAL (BULK + FAST)
====================================== */
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
        },
    });
};
exports.expireTrials = expireTrials;
