"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingController = void 0;
const crypto_1 = __importDefault(require("crypto"));
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
const stripeConfig_service_1 = require("../services/commerce/providers/stripeConfig.service");
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
const mapPublicPlans = (plans = []) => {
    const planMap = new Map(plans.map((plan) => [String(plan.type || plan.name).toUpperCase(), plan]));
    return (0, pricing_config_1.getPublicPricingPlans)().map((plan) => {
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
    });
};
const buildPlansPayload = (input) => ({
    success: true,
    trialDays: pricing_config_1.TRIAL_DAYS,
    addons: (0, pricing_config_1.getAddonCatalog)(),
    plans: mapPublicPlans(input?.plans || []),
    meta: {
        degraded: Boolean(input?.degraded),
        reason: String(input?.reason || "").trim() || null,
    },
});
const toRecord = (value) => value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
    static async reconcileRecentPortalState(businessId) {
        const latestSubscription = await prisma_1.default.subscriptionLedger.findFirst({
            where: {
                businessId,
                provider: "STRIPE",
                providerSubscriptionId: {
                    not: null,
                },
            },
            orderBy: {
                updatedAt: "desc",
            },
            select: {
                id: true,
                providerSubscriptionId: true,
                metadata: true,
            },
        });
        if (!latestSubscription?.providerSubscriptionId) {
            return {
                attempted: false,
                reason: "subscription_missing",
            };
        }
        const metadata = toRecord(latestSubscription.metadata);
        const portalLastOpenedAt = new Date(String(metadata.portalLastOpenedAt || ""));
        const hasRecentPortalActivity = !Number.isNaN(portalLastOpenedAt.getTime()) &&
            Date.now() - portalLastOpenedAt.getTime() <= 2 * 60 * 60 * 1000;
        if (!hasRecentPortalActivity) {
            return {
                attempted: false,
                reason: "portal_inactive",
            };
        }
        (0, stripeConfig_service_1.assertStripeConfigReady)();
        const stripeSubscription = await stripe_service_1.stripe.subscriptions
            .retrieve(latestSubscription.providerSubscriptionId)
            .catch(() => null);
        if (!stripeSubscription) {
            return {
                attempted: true,
                reconciled: false,
                reason: "provider_subscription_unavailable",
            };
        }
        const firstItem = Array.isArray(stripeSubscription.items?.data)
            ? stripeSubscription.items.data[0]
            : null;
        const replayToken = crypto_1.default
            .createHash("sha256")
            .update(JSON.stringify({
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            quantity: firstItem?.quantity || 1,
            current_period_start: stripeSubscription.current_period_start || null,
            current_period_end: stripeSubscription.current_period_end || null,
            cancel_at: stripeSubscription.cancel_at || null,
            cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
            trial_end: stripeSubscription.trial_end || null,
        }))
            .digest("hex")
            .slice(0, 16);
        const created = Math.floor(Date.now() / 1000);
        await commerceProjection_service_1.commerceProjectionService.reconcileProviderWebhook({
            provider: "STRIPE",
            strictBusinessId: businessId,
            body: {
                id: `manual_portal_sync_${stripeSubscription.id}_${replayToken}`,
                type: "customer.subscription.updated",
                created,
                data: {
                    object: {
                        id: stripeSubscription.id,
                        status: stripeSubscription.status,
                        currency: stripeSubscription.currency,
                        metadata: stripeSubscription.metadata || {},
                        quantity: firstItem?.quantity || 1,
                        current_period_start: stripeSubscription.current_period_start || null,
                        current_period_end: stripeSubscription.current_period_end || null,
                        cancel_at: stripeSubscription.cancel_at || null,
                        cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
                        trial_end: stripeSubscription.trial_end || null,
                        items: {
                            data: firstItem
                                ? [
                                    {
                                        id: firstItem.id,
                                        quantity: firstItem.quantity,
                                        price: {
                                            id: typeof firstItem.price === "string"
                                                ? firstItem.price
                                                : firstItem.price?.id || null,
                                        },
                                    },
                                ]
                                : [],
                        },
                    },
                },
            },
        });
        return {
            attempted: true,
            reconciled: true,
            subscriptionId: stripeSubscription.id,
        };
    }
    static async resolveStripeCustomerIdForPortal(input) {
        const normalizedBusinessId = String(input.businessId || "").trim();
        const normalizedEmail = String(input.email || "").trim().toLowerCase();
        if (!normalizedBusinessId || !normalizedEmail) {
            return null;
        }
        const customers = await stripe_service_1.stripe.customers
            .list({
            email: normalizedEmail,
            limit: 10,
        })
            .then((response) => (Array.isArray(response.data) ? response.data : []))
            .catch(() => []);
        if (!customers.length) {
            return null;
        }
        const customerWithBusinessId = customers.find((customer) => {
            const metadata = toRecord(customer.metadata);
            const customerBusinessId = String(metadata.businessId || "").trim();
            return customerBusinessId && customerBusinessId === normalizedBusinessId;
        }) || null;
        if (customerWithBusinessId?.id) {
            return customerWithBusinessId.id;
        }
        const customerWithSubscription = input.subscriptionProviderId &&
            (await Promise.all(customers.map(async (customer) => {
                if (!customer.id || !input.subscriptionProviderId) {
                    return false;
                }
                const subscriptions = await stripe_service_1.stripe.subscriptions
                    .list({
                    customer: customer.id,
                    status: "all",
                    limit: 10,
                })
                    .catch(() => ({ data: [] }));
                return subscriptions.data.some((subscription) => String(subscription.id || "").trim() === input.subscriptionProviderId);
            })).then((matches) => {
                const index = matches.findIndex(Boolean);
                return index >= 0 ? customers[index] : null;
            }));
        if (customerWithSubscription?.id) {
            return customerWithSubscription.id;
        }
        return customers[0]?.id || null;
    }
    static async buildBillingResponse(businessId, req) {
        if (!businessId) {
            return {
                success: true,
                subscription: null,
                billing: EMPTY_BILLING_CONTEXT,
                usage: EMPTY_USAGE_SUMMARY,
                currency: (0, billingGeo_service_1.resolveBillingCurrency)(req),
                invoices: [],
                meta: {
                    degraded: false,
                    reason: null,
                },
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
        const invoicesRaw = Array.isArray(invoicesResult.value)
            ? invoicesResult.value
            : [];
        const invoices = invoicesRaw.map(mapInvoiceForClient);
        const degraded = billingContextResult.timedOut ||
            billingContextResult.failed ||
            usageResult.timedOut ||
            usageResult.failed ||
            invoicesResult.timedOut ||
            invoicesResult.failed;
        const reasons = [
            billingContextResult.timedOut ? "context_timeout" : null,
            billingContextResult.failed ? "context_failed" : null,
            usageResult.timedOut ? "usage_timeout" : null,
            usageResult.failed ? "usage_failed" : null,
            invoicesResult.timedOut ? "invoices_timeout" : null,
            invoicesResult.failed ? "invoices_failed" : null,
        ].filter(Boolean);
        console.info("BILLING_PROJECTION_READY", {
            businessId,
            contextTimedOut: billingContextResult.timedOut,
            usageTimedOut: usageResult.timedOut,
            invoicesTimedOut: invoicesResult.timedOut,
            usedFallback: degraded,
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
            meta: {
                degraded,
                reason: reasons.length ? reasons.join(",") : null,
            },
        };
    }
    static async handleCheckout(req, res) {
        try {
            const { plan, coupon } = req.body;
            const requestedQuantity = Number(req.body?.seats || req.body?.quantity || 1);
            const quantity = Math.max(1, Math.floor(Number.isFinite(requestedQuantity) ? requestedQuantity : 1));
            const billing = String(req.body?.billing || "monthly");
            const checkoutTypeInput = String(req.body?.checkoutType || req.body?.action || (coupon ? "coupon" : "subscription"))
                .trim()
                .toLowerCase();
            const checkoutType = new Set([
                "subscription",
                "one_time",
                "trial",
                "coupon",
                "upgrade",
                "downgrade",
                "addon",
            ]).has(checkoutTypeInput)
                ? checkoutTypeInput
                : "subscription";
            const trialDays = checkoutType === "trial"
                ? Math.max(1, Math.min(30, Math.floor(Number(req.body?.trialDays || pricing_config_1.TRIAL_DAYS))))
                : 0;
            const addonLineItems = Array.isArray(req.body?.lineItems)
                ? req.body.lineItems
                : Array.isArray(req.body?.addons)
                    ? req.body.addons.map((item, index) => ({
                        type: String(item?.type || item?.addonType || "").trim().toLowerCase(),
                        credits: Math.max(0, Math.floor(Number(item?.credits || item?.quantity || 0))),
                        label: String(item?.label || `addon_${index + 1}`).trim(),
                    }))
                    : [];
            const couponCode = String(coupon || req.body?.couponId || "").trim() || null;
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
            (0, stripeConfig_service_1.assertStripeConfigReady)();
            const currency = (0, billingGeo_service_1.resolveBillingCurrency)(req);
            const pricingPlan = (0, pricing_config_1.getPricingPlanConfig)(normalizedPlan);
            const unitPrice = normalizedBilling === "yearly"
                ? pricingPlan.yearlyPrice[currency]
                : pricingPlan.monthlyPrice[currency];
            if (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Pricing is not configured for ${normalizedPlan} (${currency}, ${normalizedBilling})`,
                });
            }
            const explicitUnitAmountMinor = Number(req.body?.unitAmountMinor || req.body?.amountMinor || 0);
            const customUnitPriceMinor = Number.isFinite(explicitUnitAmountMinor) && explicitUnitAmountMinor > 0
                ? Math.floor(explicitUnitAmountMinor)
                : Math.round(Number(unitPrice || 0) * 100);
            const activeSubscription = await prisma_1.default.subscriptionLedger.findFirst({
                where: {
                    businessId,
                    status: {
                        in: ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"],
                    },
                },
                orderBy: {
                    updatedAt: "desc",
                },
            });
            const subscriptionMeta = (activeSubscription?.metadata || {});
            const checkoutFingerprint = crypto_1.default
                .createHash("sha256")
                .update(JSON.stringify({
                businessId,
                normalizedPlan,
                normalizedBilling,
                currency,
                quantity,
                checkoutType,
                trialDays,
                couponCode,
                addonLineItems,
                activeSubscriptionKey: activeSubscription?.subscriptionKey || null,
                prorationBehavior: req.body?.prorationBehavior || null,
            }))
                .digest("hex")
                .slice(0, 24);
            const proposal = await proposalEngine_service_1.proposalEngineService.createProposal({
                businessId,
                planCode: normalizedPlan,
                billingCycle: normalizedBilling,
                currency,
                quantity,
                customUnitPriceMinor,
                lineItems: addonLineItems,
                source: "SELF",
                requestedBy: "SELF",
                metadata: {
                    checkoutSource: "billing_controller",
                    checkoutType,
                    trialDays,
                    coupon: couponCode,
                    prorationBehavior: String(req.body?.prorationBehavior || "").trim().toLowerCase() || null,
                    providerSubscriptionId: String(req.body?.providerSubscriptionId || activeSubscription?.providerSubscriptionId || "").trim() ||
                        null,
                    stripeCustomerId: String(req.body?.stripeCustomerId || subscriptionMeta.stripeCustomerId || "").trim() ||
                        null,
                    seatBased: quantity > 1,
                },
                idempotencyKey: `checkout:proposal:${businessId}:${checkoutFingerprint}`,
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
                    coupon: couponCode,
                    origin: "billing_controller",
                    planCode: normalizedPlan,
                    billingCycle: normalizedBilling,
                    quantity,
                    checkoutType,
                    trialDays,
                    providerSubscriptionId: String(req.body?.providerSubscriptionId || activeSubscription?.providerSubscriptionId || "").trim() ||
                        null,
                    stripeCustomerId: String(req.body?.stripeCustomerId || subscriptionMeta.stripeCustomerId || "").trim() ||
                        null,
                    prorationBehavior: String(req.body?.prorationBehavior || "").trim().toLowerCase() || null,
                    seatBased: quantity > 1,
                },
                idempotencyKey: `checkout:payment_intent:${businessId}:${readyProposal.proposalKey}:${checkoutFingerprint}`,
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
            if (error.message?.includes("stripe_config_invalid")) {
                return res.status(503).json({
                    success: false,
                    code: "BILLING_PROVIDER_UNAVAILABLE",
                    message: "Billing provider is temporarily unavailable. Please retry shortly.",
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
            return res.json(buildPlansPayload({
                plans: plans.map((plan) => ({
                    id: plan.id,
                    name: plan.name,
                    type: String(plan.type || "").trim(),
                    priceIdINR: plan.priceIdINR,
                    priceIdUSD: plan.priceIdUSD,
                })),
            }));
        }
        catch (error) {
            console.error("Get plans error:", error);
            return res.json(buildPlansPayload({
                degraded: true,
                reason: "plans_fallback",
            }));
        }
    }
    static async getBilling(req, res) {
        try {
            const { businessId } = await getUserContext(req);
            if (businessId) {
                await BillingController.reconcileRecentPortalState(businessId).catch(() => undefined);
            }
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
            res.setHeader("Cache-Control", "no-store");
            return res.json({
                success: true,
                subscription: null,
                billing: EMPTY_BILLING_CONTEXT,
                usage: EMPTY_USAGE_SUMMARY,
                currency: (0, billingGeo_service_1.resolveBillingCurrency)(req),
                invoices: [],
                meta: {
                    degraded: true,
                    reason: "billing_projection_failed",
                },
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
            const directMatch = await prisma_1.default.paymentIntentLedger.findFirst({
                where: {
                    businessId,
                    provider: "STRIPE",
                    providerPaymentIntentId: sessionId,
                },
                select: {
                    id: true,
                    paymentIntentKey: true,
                    providerPaymentIntentId: true,
                    metadata: true,
                    proposal: {
                        select: {
                            proposalKey: true,
                        },
                    },
                },
            });
            const paymentIntent = directMatch ||
                (await prisma_1.default.paymentIntentLedger
                    .findMany({
                    where: {
                        businessId,
                        provider: "STRIPE",
                    },
                    orderBy: {
                        updatedAt: "desc",
                    },
                    take: 50,
                    select: {
                        id: true,
                        paymentIntentKey: true,
                        providerPaymentIntentId: true,
                        metadata: true,
                        proposal: {
                            select: {
                                proposalKey: true,
                            },
                        },
                    },
                })
                    .then((rows) => rows.find((row) => {
                    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                        ? row.metadata
                        : {};
                    const providerMetadata = metadata.providerMetadata &&
                        typeof metadata.providerMetadata === "object" &&
                        !Array.isArray(metadata.providerMetadata)
                        ? metadata.providerMetadata
                        : {};
                    return (String(metadata.stripeSessionId || "").trim() === sessionId ||
                        String(providerMetadata.stripeSessionId || "").trim() === sessionId);
                })));
            if (!paymentIntent?.providerPaymentIntentId) {
                return res.status(403).json({
                    success: false,
                    message: "Checkout session does not belong to this user",
                });
            }
            (0, stripeConfig_service_1.assertStripeConfigReady)();
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
            if (error?.message?.includes("stripe_config_invalid")) {
                return res.status(503).json({
                    success: false,
                    code: "BILLING_PROVIDER_UNAVAILABLE",
                    message: "Billing confirmation is temporarily unavailable. Please retry shortly.",
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Checkout confirmation failed",
            });
        }
    }
    static async createPortal(req, res) {
        try {
            const { businessId, email } = await getUserContext(req);
            if (!businessId) {
                return res.status(403).json({
                    success: false,
                    message: "Business context is required",
                });
            }
            const subscription = await prisma_1.default.subscriptionLedger.findFirst({
                where: {
                    businessId,
                    provider: "STRIPE",
                    status: {
                        in: ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"],
                    },
                },
                orderBy: {
                    updatedAt: "desc",
                },
            });
            if (!subscription) {
                return res.status(400).json({
                    success: false,
                    message: "No Stripe subscription found",
                });
            }
            (0, stripeConfig_service_1.assertStripeConfigReady)();
            const subscriptionMetadata = subscription.metadata &&
                typeof subscription.metadata === "object" &&
                !Array.isArray(subscription.metadata)
                ? subscription.metadata
                : {};
            let stripeCustomerId = String(req.body?.customerId || subscriptionMetadata.stripeCustomerId || "").trim() ||
                null;
            if (!stripeCustomerId) {
                const recentPaymentIntent = await prisma_1.default.paymentIntentLedger.findFirst({
                    where: {
                        businessId,
                        provider: "STRIPE",
                        status: "SUCCEEDED",
                    },
                    orderBy: {
                        updatedAt: "desc",
                    },
                    select: {
                        metadata: true,
                    },
                });
                const metadata = recentPaymentIntent?.metadata &&
                    typeof recentPaymentIntent.metadata === "object" &&
                    !Array.isArray(recentPaymentIntent.metadata)
                    ? recentPaymentIntent.metadata
                    : {};
                const providerMetadata = metadata.providerMetadata &&
                    typeof metadata.providerMetadata === "object" &&
                    !Array.isArray(metadata.providerMetadata)
                    ? metadata.providerMetadata
                    : {};
                stripeCustomerId =
                    String(metadata.stripeCustomerId ||
                        providerMetadata.stripeCustomerId ||
                        "").trim() || null;
            }
            if (!stripeCustomerId && subscription.providerSubscriptionId) {
                const stripeSubscription = await stripe_service_1.stripe.subscriptions
                    .retrieve(subscription.providerSubscriptionId)
                    .catch(() => null);
                stripeCustomerId =
                    typeof stripeSubscription?.customer === "string"
                        ? stripeSubscription.customer
                        : null;
            }
            if (!stripeCustomerId) {
                stripeCustomerId = await BillingController.resolveStripeCustomerIdForPortal({
                    businessId,
                    email,
                    subscriptionProviderId: subscription.providerSubscriptionId,
                });
            }
            if (!stripeCustomerId) {
                return res.status(409).json({
                    success: false,
                    message: "stripe_customer_missing_for_portal",
                });
            }
            await prisma_1.default.subscriptionLedger
                .update({
                where: {
                    id: subscription.id,
                },
                data: {
                    metadata: {
                        ...subscriptionMetadata,
                        stripeCustomerId,
                        portalLastOpenedAt: new Date().toISOString(),
                    },
                },
            })
                .catch(() => undefined);
            const returnUrl = String(req.body?.returnUrl || "").trim() ||
                env_1.env.STRIPE_BILLING_PORTAL_RETURN_URL ||
                `${env_1.env.FRONTEND_URL}/billing`;
            const session = await stripe_service_1.stripe.billingPortal.sessions.create({
                customer: stripeCustomerId,
                return_url: returnUrl,
            }, {
                idempotencyKey: `portal:${businessId}:${stripeCustomerId}`,
            });
            return res.json({
                success: true,
                url: session.url,
            });
        }
        catch (error) {
            console.error("Create billing portal error:", error);
            if (error?.message?.includes("stripe_config_invalid")) {
                return res.status(503).json({
                    success: false,
                    code: "BILLING_PROVIDER_UNAVAILABLE",
                    message: "Billing portal is temporarily unavailable. Please retry shortly.",
                });
            }
            return res.status(500).json({
                success: false,
                message: error?.message || "billing_portal_failed",
            });
        }
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
