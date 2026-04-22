"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCleanup = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const billingSync_service_1 = require("../services/billingSync.service");
const DAYS_TO_KEEP = 30;
const getExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - DAYS_TO_KEEP);
    return date;
};
const cleanStripeEvents = async () => {
    const expiry = getExpiryDate();
    const result = await prisma_1.default.stripeEvent.deleteMany({
        where: {
            createdAt: {
                lt: expiry,
            },
        },
    });
    console.log(`Stripe events cleaned: ${result.count}`);
};
const cleanBillingEvents = async () => {
    const expiry = getExpiryDate();
    const result = await prisma_1.default.billingEvent.deleteMany({
        where: {
            createdAt: {
                lt: expiry,
            },
        },
    });
    console.log(`Billing events cleaned: ${result.count}`);
};
const cleanWebhookEvents = async () => {
    const expiry = getExpiryDate();
    const result = await prisma_1.default.webhookEvent.deleteMany({
        where: {
            createdAt: {
                lt: expiry,
            },
        },
    });
    console.log(`Webhook events cleaned: ${result.count}`);
};
const cleanExpiredTokens = async () => {
    const now = new Date();
    const result = await prisma_1.default.refreshToken.deleteMany({
        where: {
            expiresAt: {
                lt: now,
            },
        },
    });
    console.log(`Expired tokens removed: ${result.count}`);
};
const runCleanup = async () => {
    try {
        console.log("Running cleanup job...");
        const expiredCount = await (0, billingSync_service_1.expirePastDueSubscriptions)();
        await Promise.all([
            cleanBillingEvents(),
            cleanStripeEvents(),
            cleanWebhookEvents(),
            cleanExpiredTokens(),
        ]);
        console.log(`Grace period expiries processed: ${expiredCount}`);
        console.log("Cleanup completed");
    }
    catch (error) {
        console.error("Cleanup failed:", error);
    }
};
exports.runCleanup = runCleanup;
