"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireTrials = exports.ensureTrialPlanExists = exports.startTrial = exports.getTrialStatus = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const pricing_config_1 = require("../config/pricing.config");
const shared_1 = require("./commerce/shared");
const normalizeBusinessId = (businessId) => String(businessId || "").trim();
const toRecord = (value) => value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
const hasTrialBeenUsed = (metadata) => Boolean(toRecord(metadata).trialUsed) || Boolean(toRecord(metadata).trialUsedAt);
const getTrialStatus = async (businessId) => {
    const normalizedBusinessId = normalizeBusinessId(businessId);
    if (!normalizedBusinessId) {
        throw new Error("Invalid business id");
    }
    const subscription = await prisma_1.default.subscriptionLedger.findFirst({
        where: {
            businessId: normalizedBusinessId,
        },
        orderBy: {
            updatedAt: "desc",
        },
        select: {
            status: true,
            trialEndsAt: true,
        },
    });
    if (!subscription ||
        subscription.status !== "TRIALING" ||
        !subscription.trialEndsAt) {
        return {
            trialActive: false,
            daysLeft: 0,
            currentPeriodEnd: null,
        };
    }
    const now = Date.now();
    const expiresAt = subscription.trialEndsAt.getTime();
    const active = expiresAt >= now;
    return {
        trialActive: active,
        daysLeft: active ? Math.max(Math.ceil((expiresAt - now) / 86400000), 0) : 0,
        currentPeriodEnd: subscription.trialEndsAt,
    };
};
exports.getTrialStatus = getTrialStatus;
const startTrial = async (businessId) => {
    const normalizedBusinessId = normalizeBusinessId(businessId);
    if (!normalizedBusinessId) {
        throw new Error("Invalid business id");
    }
    return prisma_1.default.$transaction(async (tx) => {
        const existing = await tx.subscriptionLedger.findFirst({
            where: {
                businessId: normalizedBusinessId,
            },
            orderBy: {
                updatedAt: "desc",
            },
        });
        if (existing && hasTrialBeenUsed(existing.metadata)) {
            throw new Error("Trial already used");
        }
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + pricing_config_1.TRIAL_DAYS * 24 * 60 * 60 * 1000);
        if (existing) {
            return tx.subscriptionLedger.update({
                where: {
                    id: existing.id,
                },
                data: {
                    status: "TRIALING",
                    planCode: pricing_config_1.TRIAL_PLAN_KEY,
                    trialEndsAt,
                    currentPeriodStart: now,
                    currentPeriodEnd: trialEndsAt,
                    renewAt: trialEndsAt,
                    metadata: (0, shared_1.mergeMetadata)(existing.metadata, {
                        trialUsed: true,
                        trialUsedAt: now.toISOString(),
                        trialSource: "trial_service",
                    }),
                    version: {
                        increment: 1,
                    },
                },
            });
        }
        return tx.subscriptionLedger.create({
            data: {
                businessId: normalizedBusinessId,
                subscriptionKey: (0, shared_1.buildLedgerKey)("subscription"),
                status: "TRIALING",
                provider: "INTERNAL",
                planCode: pricing_config_1.TRIAL_PLAN_KEY,
                billingCycle: "monthly",
                currency: "INR",
                quantity: 1,
                unitPriceMinor: 0,
                amountMinor: 0,
                trialEndsAt,
                currentPeriodStart: now,
                currentPeriodEnd: trialEndsAt,
                renewAt: trialEndsAt,
                metadata: {
                    trialUsed: true,
                    trialUsedAt: now.toISOString(),
                    trialSource: "trial_service",
                },
                idempotencyKey: `trial_start:${normalizedBusinessId}`,
            },
        });
    });
};
exports.startTrial = startTrial;
const ensureTrialPlanExists = async () => {
    return {
        key: pricing_config_1.TRIAL_PLAN_KEY,
    };
};
exports.ensureTrialPlanExists = ensureTrialPlanExists;
const expireTrials = async () => {
    const now = new Date();
    await prisma_1.default.subscriptionLedger.updateMany({
        where: {
            status: "TRIALING",
            trialEndsAt: {
                lt: now,
            },
        },
        data: {
            status: "EXPIRED",
            renewAt: null,
            trialEndsAt: now,
        },
    });
};
exports.expireTrials = expireTrials;
