"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = void 0;
const stripe_service_1 = require("../services/stripe.service");
const prisma_1 = __importDefault(require("../config/prisma"));
const env_1 = require("../config/env");
const ioredis_1 = __importDefault(require("ioredis"));
/* 🔥 EMAIL */
const email_service_1 = require("../services/email.service");
/* 🔥 TAX */
const tax_service_1 = require("../services/tax.service");
/* 🔥 INVOICE NUMBER */
const invoice_service_1 = require("../services/invoice.service");
const redis = new ioredis_1.default(process.env.REDIS_URL);
/* ====================================== */
/* UTILS */
/* ====================================== */
function getSubscriptionId(subscription) {
    if (!subscription)
        return null;
    if (typeof subscription === "string")
        return subscription;
    return subscription.id;
}
const getPeriodEnd = (sub) => {
    const raw = sub.current_period_end;
    return raw ? new Date(raw * 1000) : null;
};
const safeRedisDel = async (key) => {
    try {
        await redis.del(key);
    }
    catch {
        console.warn("⚠️ Redis failed:", key);
    }
};
const mapCurrency = (currency) => {
    if (!currency)
        return "INR";
    const upper = currency.toUpperCase();
    return upper === "USD" ? "USD" : "INR";
};
/* ====================================== */
/* WEBHOOK */
/* ====================================== */
const stripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe_service_1.stripe.webhooks.constructEvent(req.body, sig, env_1.env.STRIPE_WEBHOOK_SECRET);
    }
    catch {
        console.error("❌ Stripe signature failed");
        return res.status(400).send("Webhook Error");
    }
    try {
        /* 🔥 DUPLICATE PROTECTION */
        const exists = await prisma_1.default.stripeEvent.findUnique({
            where: { eventId: event.id },
        });
        if (exists)
            return res.json({ received: true });
        await prisma_1.default.stripeEvent.create({
            data: { eventId: event.id, type: event.type },
        });
        switch (event.type) {
            /* ====================================== */
            /* CHECKOUT COMPLETE */
            /* ====================================== */
            case "checkout.session.completed": {
                const session = event.data.object;
                const businessId = session.metadata?.businessId;
                const planType = session.metadata?.plan;
                const rawCurrency = session.metadata?.currency ||
                    session.currency ||
                    "INR";
                const currency = mapCurrency(rawCurrency);
                const subscriptionId = getSubscriptionId(session.subscription);
                if (!businessId || !subscriptionId || !planType)
                    break;
                const existing = await prisma_1.default.subscription.findUnique({
                    where: { businessId },
                });
                const plan = await prisma_1.default.plan.findFirst({
                    where: {
                        OR: [{ name: planType }, { type: planType }],
                    },
                });
                if (!plan)
                    break;
                /* ============================= */
                /* 🔥 EARLY COUNT UPDATE */
                /* ============================= */
                const usedEarly = session.metadata?.usedEarly === "true";
                if (usedEarly) {
                    await prisma_1.default.plan.updateMany({
                        where: {
                            OR: [{ name: planType }, { type: planType }],
                        },
                        data: {
                            earlyUsed: { increment: 1 },
                        },
                    });
                }
                const stripeSub = await stripe_service_1.stripe.subscriptions.retrieve(subscriptionId);
                const periodEnd = getPeriodEnd(stripeSub);
                await prisma_1.default.subscription.upsert({
                    where: { businessId },
                    update: {
                        stripeSubscriptionId: stripeSub.id,
                        stripeCustomerId: typeof stripeSub.customer === "string"
                            ? stripeSub.customer
                            : stripeSub.customer?.id ?? null,
                        planId: plan.id,
                        currency,
                        status: stripeSub.status === "trialing" ||
                            stripeSub.status === "active"
                            ? "ACTIVE"
                            : "INACTIVE",
                        currentPeriodEnd: periodEnd,
                        isTrial: stripeSub.status === "trialing",
                        /* 🔥 TRIAL PROTECTION */
                        trialUsed: existing?.trialUsed === true
                            ? true
                            : stripeSub.status === "trialing",
                    },
                    create: {
                        businessId,
                        stripeSubscriptionId: stripeSub.id,
                        stripeCustomerId: typeof stripeSub.customer === "string"
                            ? stripeSub.customer
                            : stripeSub.customer?.id ?? null,
                        planId: plan.id,
                        currency,
                        status: stripeSub.status === "trialing" ||
                            stripeSub.status === "active"
                            ? "ACTIVE"
                            : "INACTIVE",
                        currentPeriodEnd: periodEnd,
                        isTrial: stripeSub.status === "trialing",
                        trialUsed: stripeSub.status === "trialing",
                    },
                });
                const user = await prisma_1.default.user.findFirst({
                    where: { businessId },
                });
                if (user?.email) {
                    await (0, email_service_1.sendSubscriptionEmail)(user.email, planType);
                }
                await safeRedisDel(`sub:${businessId}`);
                break;
            }
            /* ====================================== */
            /* PAYMENT SUCCESS */
            /* ====================================== */
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
            /* ====================================== */
            /* SUB UPDATED */
            /* ====================================== */
            case "customer.subscription.updated": {
                const sub = event.data.object;
                const existing = await prisma_1.default.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id },
                });
                if (!existing)
                    break;
                const periodEnd = getPeriodEnd(sub);
                await prisma_1.default.subscription.update({
                    where: { stripeSubscriptionId: sub.id },
                    data: {
                        status: sub.status === "active" ||
                            sub.status === "trialing"
                            ? "ACTIVE"
                            : "INACTIVE",
                        currentPeriodEnd: periodEnd,
                        isTrial: sub.status === "trialing",
                    },
                });
                await safeRedisDel(`sub:${existing.businessId}`);
                break;
            }
            /* ====================================== */
            /* CANCELLED */
            /* ====================================== */
            case "customer.subscription.deleted": {
                const sub = event.data.object;
                const existing = await prisma_1.default.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id },
                });
                if (!existing)
                    break;
                await prisma_1.default.subscription.update({
                    where: { stripeSubscriptionId: sub.id },
                    data: { status: "CANCELLED" },
                });
                await safeRedisDel(`sub:${existing.businessId}`);
                break;
            }
            /* ====================================== */
            /* PAYMENT FAILED (GRACE PERIOD) */
            /* ====================================== */
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
        console.error("❌ Stripe webhook error:", error);
        return res.json({ received: true });
    }
};
exports.stripeWebhook = stripeWebhook;
