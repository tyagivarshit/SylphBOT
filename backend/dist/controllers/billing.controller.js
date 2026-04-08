"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingController = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const stripe_service_1 = require("../services/stripe.service");
const checkout_service_1 = require("../services/checkout.service");
const env_1 = require("../config/env");
const invoice_service_1 = require("../services/invoice.service");
const billingGeo_service_1 = require("../services/billingGeo.service");
const subscription_middleware_1 = require("../middleware/subscription.middleware");
const billingSync_service_1 = require("../services/billingSync.service");
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
/* CONTROLLER */
/* ====================================== */
class BillingController {
    static async buildBillingResponse(businessId, req) {
        const { subscription, context } = await (0, subscription_middleware_1.loadBillingContext)(businessId);
        let invoices = [];
        if (subscription?.stripeCustomerId) {
            invoices = await (0, invoice_service_1.getInvoices)(subscription.stripeCustomerId);
        }
        return {
            success: true,
            subscription,
            billing: context,
            currency: subscription?.currency || (0, billingGeo_service_1.resolveBillingCurrency)(req),
            invoices,
        };
    }
    static async handleCheckout(req, res) {
        try {
            const { plan, billing, coupon } = req.body;
            if (!plan || !billing) {
                return res.status(400).json({
                    success: false,
                    message: "Plan & billing required",
                });
            }
            const { businessId, email } = await getUserContext(req);
            const session = await (0, checkout_service_1.createCheckoutSession)(email, businessId, plan, billing, req, (0, billingGeo_service_1.resolveBillingCurrency)(req), coupon);
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
            if (error.message?.includes("Currency cannot be changed") ||
                error.message?.includes("Invalid plan") ||
                error.message?.includes("Invalid billing")) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }
            console.error("Billing checkout error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Checkout failed",
            });
        }
    }
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
            res.setHeader("Cache-Control", "no-store");
            return res.json(await BillingController.buildBillingResponse(businessId, req));
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
        return BillingController.handleCheckout(req, res);
    }
    static async confirmCheckout(req, res) {
        try {
            const sessionId = String(req.query.session_id || req.body?.session_id || "");
            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    message: "session_id is required",
                });
            }
            const { businessId } = await getUserContext(req);
            await (0, billingSync_service_1.confirmCheckoutSession)(sessionId, businessId);
            res.setHeader("Cache-Control", "no-store");
            return res.json(await BillingController.buildBillingResponse(businessId, req));
        }
        catch (error) {
            if (error.message?.includes("does not belong") ||
                error.message?.includes("missing billing metadata")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            console.error("Confirm checkout error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Checkout confirmation failed",
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
        return BillingController.handleCheckout(req, res);
    }
}
exports.BillingController = BillingController;
