"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingController = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const env_1 = require("../config/env");
const billingGeo_service_1 = require("../services/billingGeo.service");
const subscription_middleware_1 = require("../middleware/subscription.middleware");
const commerceProjection_service_1 = require("../services/commerceProjection.service");
const paymentIntent_service_1 = require("../services/paymentIntent.service");
const proposalEngine_service_1 = require("../services/proposalEngine.service");
const subscriptionEngine_service_1 = require("../services/subscriptionEngine.service");
const pricing_config_1 = require("../config/pricing.config");
const usage_service_1 = require("../services/usage.service");
const tenant_service_1 = require("../services/tenant.service");
const boundedTimeout_1 = require("../utils/boundedTimeout");
const stripe_service_1 = require("../services/stripe.service");
const EMPTY_USAGE_SUMMARY = {
    aiCallsUsed: 0,
    messagesUsed: 0,
    followupsUsed: 0,
    summary: {
        plan: "LOCKED",
        planLabel: "Locked",
        trialActive: false,
        daysLeft: 0,
        warning: false,
        warningMessage: null,
        addonCredits: 0,
        ai: {
            usedToday: 0,
            limit: 0,
            remaining: 0,
        },
        usage: {
            ai: {
                used: 0,
                dailyLimit: 0,
                monthlyUsed: 0,
                monthlyLimit: 0,
                dailyRemaining: 0,
                monthlyRemaining: 0,
                warning: false,
            },
            contacts: {
                used: 0,
                limit: 0,
                remaining: 0,
            },
            messages: {
                used: 0,
                limit: 0,
                remaining: 0,
            },
            automation: {
                used: 0,
                limit: 0,
                remaining: 0,
            },
        },
        addons: {
            aiCredits: 0,
            contacts: 0,
        },
    },
};
const EMPTY_BILLING_CONTEXT = {
    subscription: null,
    plan: null,
    planKey: "FREE_LOCKED",
    status: "INACTIVE",
    isLimited: true,
    upgradeRequired: true,
    allowEarly: false,
    remainingEarly: 0,
};
const mapInvoiceForClient = (invoice) => ({
    id: invoice.invoiceKey,
    invoiceKey: invoice.invoiceKey,
    status: String(invoice.status || "").toLowerCase(),
    currency: invoice.currency,
    amount: invoice.totalMinor,
    subtotal: invoice.subtotalMinor,
    taxAmount: invoice.taxMinor,
    paidAmount: invoice.paidMinor,
    created: Math.floor(invoice.createdAt.getTime() / 1000),
    createdAt: invoice.createdAt,
    dueAt: invoice.dueAt,
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
    externalInvoiceId: invoice.externalInvoiceId,
    hosted_invoice_url: null,
    invoice_pdf: null,
});
async function getUserContext(req) {
    const userId = req.user?.id;
    if (!userId) {
        throw new Error("Unauthorized");
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            businessId: true,
        },
    });
    if (!user) {
        throw new Error("Unauthorized");
    }
    const identity = await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
        userId,
        preferredBusinessId: req.user?.businessId || user.businessId || null,
    });
    return {
        userId,
        businessId: identity.businessId,
        email: user.email,
    };
}
class BillingController {
    static async buildBillingResponse(businessId, req) {
        if (!businessId) {
            return {
                success: true,
                subscription: null,
                billing: EMPTY_BILLING_CONTEXT,
                usage: EMPTY_USAGE_SUMMARY,
                currency: (0, billingGeo_service_1.resolveBillingCurrency)(req),
                invoices: [],
            };
        }
        const [billingContextResult, usageResult, invoicesResult] = await Promise.all([
            (0, boundedTimeout_1.withTimeoutFallback)({
                label: "billing_context_projection",
                timeoutMs: 3500,
                task: (0, subscription_middleware_1.loadBillingContext)(businessId),
                fallback: {
                    subscription: null,
                    context: EMPTY_BILLING_CONTEXT,
                },
            }),
            (0, boundedTimeout_1.withTimeoutFallback)({
                label: "billing_usage_projection",
                timeoutMs: 3500,
                task: (0, usage_service_1.getUsageOverview)(businessId),
                fallback: null,
            }),
            (0, boundedTimeout_1.withTimeoutFallback)({
                label: "billing_invoice_projection",
                timeoutMs: 2500,
                task: prisma_1.default.invoiceLedger.findMany({
                    where: {
                        businessId,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 20,
                    select: {
                        invoiceKey: true,
                        status: true,
                        currency: true,
                        subtotalMinor: true,
                        taxMinor: true,
                        totalMinor: true,
                        paidMinor: true,
                        dueAt: true,
                        issuedAt: true,
                        paidAt: true,
                        externalInvoiceId: true,
                        createdAt: true,
                    },
                }),
                fallback: [],
            }),
        ]);
        const billingContext = billingContextResult.value;
        const usage = usageResult.value;
        const invoices = invoicesResult.value.map(mapInvoiceForClient);
        console.info("BILLING_PROJECTION_READY", {
            businessId,
            contextTimedOut: billingContextResult.timedOut,
            usageTimedOut: usageResult.timedOut,
            invoicesTimedOut: invoicesResult.timedOut,
            usedFallback: billingContextResult.timedOut ||
                billingContextResult.failed ||
                usageResult.timedOut ||
                usageResult.failed ||
                invoicesResult.timedOut ||
                invoicesResult.failed,
        });
        return {
            success: true,
            subscription: billingContext.subscription,
            billing: billingContext.context,
            usage: usage
                ? {
                    aiCallsUsed: usage.usage.ai.monthlyUsed,
                    messagesUsed: usage.usage.messages.used,
                    followupsUsed: usage.usage.automation.used,
                    summary: usage,
                }
                : EMPTY_USAGE_SUMMARY,
            currency: billingContext.subscription?.currency || (0, billingGeo_service_1.resolveBillingCurrency)(req),
            invoices,
        };
    }
    static async handleCheckout(req, res) {
        try {
            const { plan, coupon, quantity } = req.body;
            const billing = String(req.body?.billing || "monthly");
            const normalizedPlan = String(plan || "").trim().toUpperCase();
            const normalizedBilling = billing === "yearly"
                ? "yearly"
                : billing === "monthly"
                    ? "monthly"
                    : null;
            const allowedPlans = new Set(["BASIC", "PRO", "ELITE"]);
            if (!normalizedPlan) {
                return res.status(400).json({
                    success: false,
                    message: "Plan is required",
                });
            }
            if (!allowedPlans.has(normalizedPlan)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid plan selected",
                });
            }
            if (!normalizedBilling) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid billing cycle",
                });
            }
            const { businessId } = await getUserContext(req);
            if (!businessId) {
                return res.status(403).json({
                    success: false,
                    message: "Business context is required",
                });
            }
            const currency = (0, billingGeo_service_1.resolveBillingCurrency)(req);
            const pricingPlan = (0, pricing_config_1.getPricingPlanConfig)(normalizedPlan);
            const unitPrice = normalizedBilling === "yearly"
                ? pricingPlan.yearlyPrice[currency]
                : pricingPlan.monthlyPrice[currency];
            const proposal = await proposalEngine_service_1.proposalEngineService.createProposal({
                businessId,
                planCode: normalizedPlan,
                billingCycle: normalizedBilling,
                currency,
                quantity: Math.max(1, Number(quantity || 1)),
                customUnitPriceMinor: Math.round(Number(unitPrice || 0) * 100),
                source: "SELF",
                requestedBy: "SELF",
                metadata: {
                    checkoutSource: "billing_controller",
                    coupon: coupon || null,
                },
                idempotencyKey: `checkout:proposal:${businessId}:${normalizedPlan}:${normalizedBilling}:${currency}`,
            });
            const readyProposal = proposal.status === "APPROVED" || proposal.status === "SENT"
                ? proposal
                : await proposalEngine_service_1.proposalEngineService.sendProposal({
                    businessId,
                    proposalKey: proposal.proposalKey,
                });
            const paymentIntent = await paymentIntent_service_1.paymentIntentService.createCheckout({
                businessId,
                proposalKey: readyProposal.proposalKey,
                provider: "STRIPE",
                source: "SELF",
                description: `${normalizedPlan} ${normalizedBilling} plan checkout`,
                successUrl: `${env_1.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${normalizedPlan}&billing=${normalizedBilling}&proposal=${readyProposal.proposalKey}`,
                cancelUrl: `${env_1.env.FRONTEND_URL}/billing/cancel?plan=${normalizedPlan}&billing=${normalizedBilling}&proposal=${readyProposal.proposalKey}`,
                metadata: {
                    coupon: coupon || null,
                    origin: "billing_controller",
                    planCode: normalizedPlan,
                    billingCycle: normalizedBilling,
                },
                idempotencyKey: `checkout:payment_intent:${businessId}:${readyProposal.proposalKey}:${req.requestId || Date.now()}`,
            });
            return res.json({
                success: true,
                url: paymentIntent.checkoutUrl,
                proposalKey: readyProposal.proposalKey,
                paymentIntentKey: paymentIntent.paymentIntentKey,
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
                error.message?.includes("Invalid billing") ||
                error.message?.includes("proposal_not_checkout_ready")) {
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
            const planMap = new Map(plans.map((plan) => [String(plan.type || plan.name).toUpperCase(), plan]));
            return res.json({
                success: true,
                trialDays: pricing_config_1.TRIAL_DAYS,
                addons: (0, pricing_config_1.getAddonCatalog)(),
                plans: (0, pricing_config_1.getPublicPricingPlans)().map((plan) => {
                    const existing = planMap.get(plan.key) || planMap.get(plan.label.toUpperCase());
                    return {
                        id: existing?.id || plan.key,
                        name: plan.label,
                        type: existing?.type || plan.key,
                        priceIdINR: existing?.priceIdINR || null,
                        priceIdUSD: existing?.priceIdUSD || null,
                        description: plan.description,
                        popular: Boolean(plan.popular),
                        monthlyPrice: plan.monthlyPrice,
                        yearlyPrice: plan.yearlyPrice,
                        limits: plan.limits,
                        features: plan.features,
                    };
                }),
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
            if (error?.message === "Unauthorized") {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }
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
    static async createCheckoutSession(req, res) {
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
            if (!businessId) {
                return res.status(403).json({
                    success: false,
                    message: "Business context is required",
                });
            }
            const paymentIntent = await prisma_1.default.paymentIntentLedger.findFirst({
                where: {
                    businessId,
                    provider: "STRIPE",
                    providerPaymentIntentId: sessionId,
                },
                select: {
                    id: true,
                    paymentIntentKey: true,
                    providerPaymentIntentId: true,
                    proposal: {
                        select: {
                            proposalKey: true,
                        },
                    },
                },
            });
            if (!paymentIntent?.providerPaymentIntentId) {
                return res.status(403).json({
                    success: false,
                    message: "Checkout session does not belong to this user",
                });
            }
            const session = await stripe_service_1.stripe.checkout.sessions
                .retrieve(sessionId)
                .catch(() => null);
            const paymentStatus = String(session?.payment_status || "").trim().toLowerCase();
            if (session && paymentStatus !== "paid") {
                return res.status(409).json({
                    success: false,
                    message: "Payment is still pending confirmation",
                });
            }
            await commerceProjection_service_1.commerceProjectionService.reconcileProviderWebhook({
                provider: "STRIPE",
                strictBusinessId: businessId,
                body: {
                    id: `manual_confirm_${paymentIntent.providerPaymentIntentId}`,
                    type: session ? "checkout.session.completed" : "payment_intent.succeeded",
                    created: Math.floor(Date.now() / 1000),
                    data: {
                        object: {
                            id: paymentIntent.providerPaymentIntentId,
                            payment_status: session?.payment_status || "paid",
                            amount_total: session?.amount_total || null,
                            currency: session?.currency || null,
                            subscription: typeof session?.subscription === "string"
                                ? session.subscription
                                : session?.subscription?.id || null,
                            metadata: {
                                businessId,
                                paymentIntentKey: paymentIntent.paymentIntentKey,
                                proposalKey: paymentIntent.proposal?.proposalKey || null,
                            },
                        },
                    },
                },
            });
            res.setHeader("Cache-Control", "no-store");
            return res.json(await BillingController.buildBillingResponse(businessId, req));
        }
        catch (error) {
            console.error("Confirm checkout error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Checkout confirmation failed",
            });
        }
    }
    static async createPortal(req, res) {
        return res.status(410).json({
            success: false,
            message: "billing_portal_deprecated_use_canonical_commerce",
        });
    }
    static async cancelSubscription(req, res) {
        try {
            const { businessId } = await getUserContext(req);
            if (!businessId) {
                return res.status(403).json({
                    success: false,
                    message: "Business context is required",
                });
            }
            const subscription = await prisma_1.default.subscriptionLedger.findFirst({
                where: {
                    businessId,
                },
                orderBy: {
                    updatedAt: "desc",
                },
            });
            if (!subscription) {
                return res.status(400).json({
                    success: false,
                    message: "No active subscription found",
                });
            }
            await subscriptionEngine_service_1.subscriptionEngineService.applyLifecycleAction({
                businessId,
                subscriptionKey: subscription.subscriptionKey,
                action: "cancel",
                metadata: {
                    source: "billing_controller",
                    requestedBy: "SELF",
                },
            });
            await (0, subscription_middleware_1.invalidateBillingContextCache)(businessId);
            return res.json({
                success: true,
                message: "Subscription cancellation submitted",
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
