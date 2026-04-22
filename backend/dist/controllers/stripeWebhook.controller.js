"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = __importDefault(require("../config/redis"));
const env_1 = require("../config/env");
const stripe_service_1 = require("../services/stripe.service");
const email_service_1 = require("../services/email.service");
const invoice_service_1 = require("../services/invoice.service");
const tax_service_1 = require("../services/tax.service");
const billingSync_service_1 = require("../services/billingSync.service");
const conversionTracker_service_1 = require("../services/salesAgent/conversionTracker.service");
function getSubscriptionId(subscription) {
    if (!subscription)
        return null;
    if (typeof subscription === "string")
        return subscription;
    return subscription.id;
}
function getCustomerId(customer) {
    if (!customer)
        return null;
    if (typeof customer === "string")
        return customer;
    return customer.id;
}
const safeRedisDel = async (key) => {
    try {
        await redis_1.default.del(key);
    }
    catch {
        console.warn("Redis cache delete failed", { key });
    }
};
const isUniqueConstraintError = (error) => error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";
const logBilling = (level, message, payload) => {
    const logger = level === "info"
        ? console.info
        : level === "warn"
            ? console.warn
            : console.error;
    logger(message, payload);
};
const runBillingSideEffect = async (label, payload, task) => {
    try {
        await task;
    }
    catch (error) {
        logBilling("warn", label, {
            ...payload,
            error: error instanceof Error ? error.message : "Unknown side-effect error",
        });
    }
};
const reserveBillingEvent = async (event) => {
    const existing = await prisma_1.default.billingEvent.findUnique({
        where: { stripeEventId: event.id },
    });
    if (existing) {
        console.log("Duplicate webhook ignored", {
            eventId: event.id,
            eventType: event.type,
        });
        return false;
    }
    try {
        await prisma_1.default.billingEvent.create({
            data: { stripeEventId: event.id },
        });
        return true;
    }
    catch (error) {
        if (isUniqueConstraintError(error)) {
            console.log("Duplicate webhook ignored", {
                eventId: event.id,
                eventType: event.type,
            });
            return false;
        }
        throw error;
    }
};
const releaseBillingEvent = async (eventId) => {
    try {
        await prisma_1.default.billingEvent.deleteMany({
            where: {
                stripeEventId: eventId,
            },
        });
    }
    catch (error) {
        logBilling("error", "Billing webhook dedupe rollback failed", {
            eventId,
            error: error instanceof Error ? error.message : "Unknown rollback error",
        });
    }
};
const findSubscriptionRecord = async ({ businessId, stripeSubscriptionId, customerId, }) => {
    if (businessId) {
        const byBusiness = await prisma_1.default.subscription.findUnique({
            where: { businessId },
            include: { plan: true },
        });
        if (byBusiness) {
            return byBusiness;
        }
    }
    if (stripeSubscriptionId) {
        const byStripeSubscription = await prisma_1.default.subscription.findFirst({
            where: { stripeSubscriptionId },
            include: { plan: true },
        });
        if (byStripeSubscription) {
            return byStripeSubscription;
        }
    }
    if (customerId) {
        return prisma_1.default.subscription.findFirst({
            where: { stripeCustomerId: customerId },
            include: { plan: true },
        });
    }
    return null;
};
const getPlanName = (subscription) => subscription?.plan?.type || subscription?.plan?.name || null;
const syncInvoiceSubscription = async (invoice) => {
    const stripeSubscriptionId = getSubscriptionId(invoice.subscription);
    if (!stripeSubscriptionId) {
        return null;
    }
    const stripeSubscription = await stripe_service_1.stripe.subscriptions.retrieve(stripeSubscriptionId);
    return (0, billingSync_service_1.syncStripeSubscriptionState)(stripeSubscription, {
        currencyHint: invoice.currency?.toUpperCase() || null,
    });
};
const handleCheckoutSessionCompleted = async (event) => {
    const session = event.data.object;
    const businessId = session.metadata?.businessId || session.client_reference_id || null;
    const userId = session.metadata?.userId || null;
    const leadId = session.metadata?.leadId;
    const customerId = getCustomerId(session.customer);
    if (!businessId) {
        logBilling("warn", "Stripe checkout.session.completed missing business", {
            eventId: event.id,
            eventType: event.type,
            sessionId: session.id,
            customerId,
        });
        return;
    }
    const previous = await findSubscriptionRecord({
        businessId,
        stripeSubscriptionId: getSubscriptionId(session.subscription),
        customerId,
    });
    const syncedSubscription = await (0, billingSync_service_1.syncCheckoutSession)(session);
    const plan = getPlanName(syncedSubscription) || session.metadata?.plan || null;
    logBilling("info", "Stripe checkout completed", {
        eventId: event.id,
        eventType: event.type,
        sessionId: session.id,
        businessId,
        userId,
        customerId: syncedSubscription?.stripeCustomerId || customerId,
        stripeSubscriptionId: syncedSubscription?.stripeSubscriptionId ||
            getSubscriptionId(session.subscription),
        plan,
        previousStatus: previous?.status || null,
        nextStatus: syncedSubscription?.status || null,
    });
    if (leadId && plan) {
        await (0, conversionTracker_service_1.recordConversionEvent)({
            businessId,
            leadId,
            outcome: "payment_completed",
            source: "STRIPE_CHECKOUT",
            idempotencyKey: `stripe:${event.id}`,
            metadata: {
                checkoutSessionId: session.id,
                planType: plan,
            },
        }).catch(() => { });
    }
    const user = await prisma_1.default.user.findFirst({
        where: { businessId },
        select: { email: true },
    });
    if (user?.email) {
        await runBillingSideEffect("Stripe subscription email skipped", {
            eventId: event.id,
            eventType: event.type,
            businessId,
            customerId,
            plan,
        }, (0, email_service_1.sendSubscriptionEmail)(user.email, plan || "SUBSCRIPTION"));
    }
};
const handleInvoicePaymentSucceeded = async (event) => {
    const invoice = event.data.object;
    const customerId = getCustomerId(invoice.customer);
    const stripeSubscriptionId = getSubscriptionId(invoice.subscription);
    const previous = await findSubscriptionRecord({
        stripeSubscriptionId,
        customerId,
    });
    await syncInvoiceSubscription(invoice);
    const current = await findSubscriptionRecord({
        stripeSubscriptionId,
        customerId,
    });
    if (!current) {
        logBilling("warn", "Stripe payment succeeded without subscription match", {
            eventId: event.id,
            eventType: event.type,
            invoiceId: invoice.id,
            customerId,
            stripeSubscriptionId,
        });
        return;
    }
    const updated = await prisma_1.default.subscription.update({
        where: { businessId: current.businessId },
        data: {
            status: "ACTIVE",
            graceUntil: null,
        },
        include: {
            plan: true,
        },
    });
    const taxData = (0, tax_service_1.getStripeTaxDetails)(invoice);
    const existingInvoice = await prisma_1.default.invoice.findFirst({
        where: { stripeInvoiceId: invoice.id },
        select: { id: true },
    });
    let invoiceCreated = false;
    if (!existingInvoice) {
        await prisma_1.default.invoice.create({
            data: {
                businessId: updated.businessId,
                amount: taxData.total,
                currency: taxData.currency,
                status: "PAID",
                stripeInvoiceId: invoice.id,
                invoiceNumber: (0, invoice_service_1.generateInvoiceNumber)(),
                subtotal: taxData.subtotal,
                taxAmount: taxData.taxAmount,
                taxType: taxData.taxType,
            },
        });
        invoiceCreated = true;
    }
    await safeRedisDel(`sub:${updated.businessId}`);
    logBilling("info", "Stripe invoice payment succeeded", {
        eventId: event.id,
        eventType: event.type,
        invoiceId: invoice.id,
        businessId: updated.businessId,
        customerId,
        stripeSubscriptionId,
        plan: getPlanName(updated),
        previousStatus: previous?.status || null,
        nextStatus: updated.status,
        invoiceCreated,
    });
    if (!invoiceCreated) {
        return;
    }
    const user = await prisma_1.default.user.findFirst({
        where: { businessId: updated.businessId },
        select: { email: true },
    });
    if (user?.email) {
        await runBillingSideEffect("Stripe invoice email skipped", {
            eventId: event.id,
            eventType: event.type,
            businessId: updated.businessId,
            customerId,
            plan: getPlanName(updated),
        }, (0, email_service_1.sendInvoiceEmail)(user.email, taxData.total, taxData.currency, invoice.hosted_invoice_url || undefined, invoice.invoice_pdf || undefined, taxData.subtotal, taxData.taxAmount, taxData.taxType));
    }
};
const handleCustomerSubscriptionUpdated = async (event) => {
    const subscription = event.data.object;
    const customerId = getCustomerId(subscription.customer);
    const previous = await findSubscriptionRecord({
        stripeSubscriptionId: subscription.id,
        customerId,
    });
    const synced = await (0, billingSync_service_1.syncStripeSubscriptionState)(subscription);
    if (!synced) {
        logBilling("warn", "Stripe subscription update missing business link", {
            eventId: event.id,
            eventType: event.type,
            customerId,
            stripeSubscriptionId: subscription.id,
        });
        return;
    }
    logBilling("info", "Stripe subscription updated", {
        eventId: event.id,
        eventType: event.type,
        businessId: synced.businessId,
        customerId: synced.stripeCustomerId || customerId,
        stripeSubscriptionId: synced.stripeSubscriptionId,
        plan: synced.planType,
        previousStatus: previous?.status || null,
        nextStatus: synced.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
};
const handleCustomerSubscriptionDeleted = async (event) => {
    const subscription = event.data.object;
    const customerId = getCustomerId(subscription.customer);
    const previous = await findSubscriptionRecord({
        stripeSubscriptionId: subscription.id,
        customerId,
    });
    const synced = await (0, billingSync_service_1.syncStripeSubscriptionState)(subscription);
    if (!synced) {
        logBilling("warn", "Stripe subscription deletion missing business link", {
            eventId: event.id,
            eventType: event.type,
            customerId,
            stripeSubscriptionId: subscription.id,
        });
        return;
    }
    logBilling("info", "Subscription cancelled", {
        eventId: event.id,
        eventType: event.type,
        businessId: synced.businessId,
        customerId: synced.stripeCustomerId || customerId,
        stripeSubscriptionId: synced.stripeSubscriptionId,
        plan: synced.planType,
        effectivePlan: "FREE_LOCKED",
        previousStatus: previous?.status || null,
        nextStatus: synced.status,
    });
};
const handleInvoicePaymentFailed = async (event) => {
    const invoice = event.data.object;
    const customerId = getCustomerId(invoice.customer);
    const stripeSubscriptionId = getSubscriptionId(invoice.subscription);
    const previous = await findSubscriptionRecord({
        stripeSubscriptionId,
        customerId,
    });
    await syncInvoiceSubscription(invoice);
    const current = await findSubscriptionRecord({
        stripeSubscriptionId,
        customerId,
    });
    if (!current) {
        logBilling("warn", "Stripe payment failure missing subscription match", {
            eventId: event.id,
            eventType: event.type,
            invoiceId: invoice.id,
            customerId,
            stripeSubscriptionId,
        });
        return;
    }
    const gracePeriodEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const updated = await prisma_1.default.subscription.update({
        where: { businessId: current.businessId },
        data: {
            status: "PAST_DUE",
            graceUntil: gracePeriodEndsAt,
        },
        include: {
            plan: true,
        },
    });
    await safeRedisDel(`sub:${updated.businessId}`);
    logBilling("warn", "Payment failed - grace period started", {
        eventId: event.id,
        eventType: event.type,
        invoiceId: invoice.id,
        businessId: updated.businessId,
        customerId,
        stripeSubscriptionId,
        plan: getPlanName(updated),
        previousStatus: previous?.status || null,
        nextStatus: updated.status,
        gracePeriodEndsAt,
    });
};
const handleStripeEvent = async (event) => {
    switch (event.type) {
        case "checkout.session.completed":
            await handleCheckoutSessionCompleted(event);
            break;
        case "invoice.payment_succeeded":
            await handleInvoicePaymentSucceeded(event);
            break;
        case "customer.subscription.updated":
            await handleCustomerSubscriptionUpdated(event);
            break;
        case "customer.subscription.deleted":
            await handleCustomerSubscriptionDeleted(event);
            break;
        case "invoice.payment_failed":
            await handleInvoicePaymentFailed(event);
            break;
        default:
            logBilling("info", "Unhandled Stripe billing event", {
                eventId: event.id,
                eventType: event.type,
            });
    }
};
const stripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe_service_1.stripe.webhooks.constructEvent(req.body, sig, env_1.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (error) {
        logBilling("error", "Stripe signature failed", {
            error: error?.message || "Unknown signature error",
        });
        return res.status(400).send("Webhook Error");
    }
    try {
        logBilling("info", "Stripe webhook received", {
            eventId: event.id,
            eventType: event.type,
        });
        const shouldProcess = await reserveBillingEvent(event);
        if (!shouldProcess) {
            return res.json({ received: true });
        }
        await handleStripeEvent(event);
        return res.json({ received: true });
    }
    catch (err) {
        await releaseBillingEvent(event.id);
        logBilling("error", "WEBHOOK ERROR", {
            eventId: event.id,
            eventType: event.type,
            error: err instanceof Error ? err.message : "Unknown webhook error",
        });
        return res.status(500).json({ error: "Webhook failed" });
    }
};
exports.stripeWebhook = stripeWebhook;
