"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = void 0;
const stripe_service_1 = require("../services/stripe.service");
const prisma_1 = __importDefault(require("../config/prisma"));
const env_1 = require("../config/env");
const email_service_1 = require("../services/email.service");
const tax_service_1 = require("../services/tax.service");
const invoice_service_1 = require("../services/invoice.service");
const redis_1 = __importDefault(require("../config/redis"));
const billingSync_service_1 = require("../services/billingSync.service");
function getSubscriptionId(subscription) {
    if (!subscription)
        return null;
    if (typeof subscription === "string")
        return subscription;
    return subscription.id;
}
const safeRedisDel = async (key) => {
    try {
        await redis_1.default.del(key);
    }
    catch {
        console.warn("Redis cache delete failed:", key);
    }
};
const stripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe_service_1.stripe.webhooks.constructEvent(req.body, sig, env_1.env.STRIPE_WEBHOOK_SECRET);
    }
    catch {
        console.error("Stripe signature failed");
        return res.status(400).send("Webhook Error");
    }
    try {
        const exists = await prisma_1.default.stripeEvent.findUnique({
            where: { eventId: event.id },
        });
        if (exists) {
            return res.json({ received: true });
        }
        await prisma_1.default.stripeEvent.create({
            data: { eventId: event.id, type: event.type },
        });
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const businessId = session.metadata?.businessId;
                const planType = session.metadata?.plan;
                if (!businessId || !planType)
                    break;
                await (0, billingSync_service_1.syncCheckoutSession)(session);
                const user = await prisma_1.default.user.findFirst({
                    where: { businessId },
                });
                if (user?.email) {
                    await (0, email_service_1.sendSubscriptionEmail)(user.email, planType);
                }
                break;
            }
            case "invoice.payment_succeeded": {
                const invoice = event.data.object;
                const subscriptionId = getSubscriptionId(invoice.subscription);
                if (!subscriptionId)
                    break;
                const existing = await prisma_1.default.subscription.findFirst({
                    where: { stripeSubscriptionId: subscriptionId },
                });
                if (!existing)
                    break;
                await prisma_1.default.subscription.update({
                    where: { stripeSubscriptionId: subscriptionId },
                    data: {
                        status: "ACTIVE",
                        graceUntil: null,
                    },
                });
                const taxData = (0, tax_service_1.getStripeTaxDetails)(invoice);
                const invoiceNumber = await (0, invoice_service_1.generateInvoiceNumber)();
                await prisma_1.default.invoice.create({
                    data: {
                        businessId: existing.businessId,
                        amount: taxData.total,
                        currency: taxData.currency,
                        status: "PAID",
                        stripeInvoiceId: invoice.id,
                        invoiceNumber,
                        subtotal: taxData.subtotal,
                        taxAmount: taxData.taxAmount,
                        taxType: taxData.taxType,
                    },
                });
                const user = await prisma_1.default.user.findFirst({
                    where: { businessId: existing.businessId },
                });
                if (user?.email) {
                    await (0, email_service_1.sendInvoiceEmail)(user.email, taxData.total, taxData.currency, invoice.hosted_invoice_url || undefined, invoice.invoice_pdf || undefined, taxData.subtotal, taxData.taxAmount, taxData.taxType);
                }
                await safeRedisDel(`sub:${existing.businessId}`);
                break;
            }
            case "customer.subscription.updated": {
                const subscription = event.data.object;
                await (0, billingSync_service_1.syncStripeSubscriptionState)(subscription);
                break;
            }
            case "customer.subscription.deleted": {
                const subscription = event.data.object;
                const existing = await prisma_1.default.subscription.findFirst({
                    where: { stripeSubscriptionId: subscription.id },
                });
                if (!existing)
                    break;
                await prisma_1.default.subscription.update({
                    where: { stripeSubscriptionId: subscription.id },
                    data: {
                        status: "CANCELLED",
                        graceUntil: null,
                        isTrial: false,
                    },
                });
                await safeRedisDel(`sub:${existing.businessId}`);
                break;
            }
            case "invoice.payment_failed": {
                const invoice = event.data.object;
                const subscriptionId = getSubscriptionId(invoice.subscription);
                if (!subscriptionId)
                    break;
                const existing = await prisma_1.default.subscription.findFirst({
                    where: { stripeSubscriptionId: subscriptionId },
                });
                if (!existing)
                    break;
                await prisma_1.default.subscription.update({
                    where: { stripeSubscriptionId: subscriptionId },
                    data: {
                        status: "PAST_DUE",
                        graceUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                    },
                });
                await safeRedisDel(`sub:${existing.businessId}`);
                break;
            }
            default:
                console.log("Unhandled event:", event.type);
        }
        return res.json({ received: true });
    }
    catch (error) {
        console.error("Stripe webhook error:", error);
        return res.json({ received: true });
    }
};
exports.stripeWebhook = stripeWebhook;
