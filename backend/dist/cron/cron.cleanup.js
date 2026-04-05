"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCleanup = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/* ======================================
CONFIG
====================================== */
const DAYS_TO_KEEP = 30;
/* ======================================
DATE HELPER
====================================== */
const getExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - DAYS_TO_KEEP);
    return date;
};
/* ======================================
STRIPE EVENT CLEANUP
====================================== */
const cleanStripeEvents = async () => {
    const expiry = getExpiryDate();
    const result = await prisma_1.default.stripeEvent.deleteMany({
        where: {
            createdAt: {
                lt: expiry,
            },
        },
    });
    console.log(`🧹 Stripe events cleaned: ${result.count}`);
};
/* ======================================
WEBHOOK EVENT CLEANUP
====================================== */
const cleanWebhookEvents = async () => {
    const expiry = getExpiryDate();
    const result = await prisma_1.default.webhookEvent.deleteMany({
        where: {
            createdAt: {
                lt: expiry,
            },
        },
    });
    console.log(`🧹 Webhook events cleaned: ${result.count}`);
};
/* ======================================
REFRESH TOKEN CLEANUP
====================================== */
const cleanExpiredTokens = async () => {
    const now = new Date();
    const result = await prisma_1.default.refreshToken.deleteMany({
        where: {
            expiresAt: {
                lt: now,
            },
        },
    });
    console.log(`🧹 Expired tokens removed: ${result.count}`);
};
/* ======================================
MAIN CLEANUP RUNNER
====================================== */
const runCleanup = async () => {
    try {
        console.log("🧹 Running cleanup job...");
        await Promise.all([
            cleanStripeEvents(),
            cleanWebhookEvents(),
            cleanExpiredTokens(),
        ]);
        console.log("✅ Cleanup completed");
    }
    catch (error) {
        console.error("❌ Cleanup failed:", error);
    }
};
exports.runCleanup = runCleanup;
