"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingController = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const stripe_service_1 = require("../services/stripe.service");
const env_1 = require("../config/env");
const geoip_lite_1 = __importDefault(require("geoip-lite"));
const invoice_service_1 = require("../services/invoice.service");
/* ====================================== */
/* USER CONTEXT */
/* ====================================== */
async function getUserContext(req) {
    const userId = req.user?.id;
    const businessId = req.user?.businessId;
    if (!userId || !businessId) {
        throw new Error("Unauthorized");
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        throw new Error("Unauthorized");
    }
    return {
        businessId,
        email: user.email,
    };
}
/* ====================================== */
/* GEO */
/* ====================================== */
function getCurrency(req) {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress ||
        "";
    const geo = geoip_lite_1.default.lookup(ip);
    const country = geo?.country || "IN";
    return country === "IN" ? "INR" : "USD";
}
/* ====================================== */
/* CONTROLLER */
/* ====================================== */
class BillingController {
    static async getPlans(req, res) {
        try {
            const plans = await prisma_1.default.plan.findMany({
                where: {
                    type: {
                        in: ["BASIC", "PRO", "ELITE"],
                    },
                },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    priceIdINR: true,
                    priceIdUSD: true,
                },
            });
            return res.json({
                success: true,
                plans,
            });
        }
        catch (error) {
            console.error("Get plans error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch plans",
            });
        }
    }
    static async getBilling(req, res) {
        try {
            const { businessId } = await getUserContext(req);
            const subscription = await prisma_1.default.subscription.findUnique({
                where: { businessId },
                include: { plan: true },
            });
            const currency = getCurrency(req);
            let invoices = [];
            if (subscription?.stripeCustomerId) {
                invoices = await (0, invoice_service_1.getInvoices)(subscription.stripeCustomerId);
            }
            return res.json({
                success: true,
                subscription,
                currency,
                invoices,
            });
        }
        catch (error) {
            console.error("Billing fetch error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch billing",
            });
        }
    }
    static async checkout(req, res) {
        try {
            const { plan, billing, coupon } = req.body;
            if (!plan || !billing) {
                return res.status(400).json({
                    success: false,
                    message: "Plan & billing required",
                });
            }
            const { businessId, email } = await getUserContext(req);
            const currency = getCurrency(req);
            const session = await (0, stripe_service_1.createCheckoutSession)(email, businessId, plan, billing, req, currency, coupon);
            return res.json({
                success: true,
                url: session.url,
            });
        }
        catch (error) {
            if (error.message === "Unauthorized") {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }
            if (error.message?.includes("Currency cannot be changed")) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }
            console.error("Checkout error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Checkout failed",
            });
        }
    }
    static async createPortal(req, res) {
        try {
            const { businessId } = await getUserContext(req);
            const subscription = await prisma_1.default.subscription.findUnique({
                where: { businessId },
            });
            if (!subscription?.stripeCustomerId) {
                return res.status(400).json({
                    success: false,
                    message: "No customer found",
                });
            }
            const session = await stripe_service_1.stripe.billingPortal.sessions.create({
                customer: subscription.stripeCustomerId,
                return_url: `${env_1.env.FRONTEND_URL}/billing`,
            });
            return res.json({
                success: true,
                url: session.url,
            });
        }
        catch (error) {
            console.error("Portal error:", error);
            return res.status(500).json({
                success: false,
                message: "Portal failed",
            });
        }
    }
    static async cancelSubscription(req, res) {
        try {
            const { businessId } = await getUserContext(req);
            const subscription = await prisma_1.default.subscription.findUnique({
                where: { businessId },
            });
            if (!subscription?.stripeSubscriptionId) {
                return res.status(400).json({
                    success: false,
                    message: "No active paid subscription found",
                });
            }
            await stripe_service_1.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                cancel_at_period_end: true,
            });
            /* ❌ DB update removed (webhook करेगा) */
            return res.json({
                success: true,
                message: "Subscription will cancel at period end",
            });
        }
        catch (error) {
            console.error("Cancel error:", error);
            return res.status(500).json({
                success: false,
                message: "Cancel failed",
            });
        }
    }
    static async upgradePlan(req, res) {
        try {
            const { plan, billing, coupon } = req.body;
            if (!plan || !billing) {
                return res.status(400).json({
                    success: false,
                    message: "Plan & billing required",
                });
            }
            const { businessId, email } = await getUserContext(req);
            const currency = getCurrency(req);
            const session = await (0, stripe_service_1.createCheckoutSession)(email, businessId, plan, billing, req, currency, coupon);
            return res.json({
                success: true,
                url: session.url,
            });
        }
        catch (error) {
            if (error.message === "Unauthorized") {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }
            if (error.message?.includes("Currency cannot be changed")) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }
            console.error("Upgrade error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Upgrade failed",
            });
        }
    }
}
exports.BillingController = BillingController;
