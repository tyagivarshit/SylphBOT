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
const stripe_price_map_1 = require("../config/stripe.price.map");
const usage_service_1 = require("../services/usage.service");
const tenant_service_1 = require("../services/tenant.service");
const boundedTimeout_1 = require("../utils/boundedTimeout");
const stripe_service_1 = require("../services/stripe.service");
const stripeConfig_service_1 = require("../services/commerce/providers/stripeConfig.service");
const performanceMetrics_1 = require("../observability/performanceMetrics");
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
const BILLING_CONFIRM_REQUEST_TIMEOUT_MS = 1800;
const BILLING_CONFIRM_LOOKUP_TIMEOUT_MS = 700;
const BILLING_CONFIRM_DUPLICATE_WINDOW_MS = 60000;
const BILLING_CONFIRM_STRIPE_TIMEOUT_MS = 1100;
const BILLING_CONFIRM_RECONCILE_TIMEOUT_MS = 1300;
const BILLING_USER_CONTEXT_LOOKUP_TIMEOUT_MS = 650;
const BILLING_CHECKOUT_PROPOSAL_TIMEOUT_MS = 2200;
const BILLING_CHECKOUT_PAYMENT_INTENT_TIMEOUT_MS = 5500;
const BILLING_PROJECTION_CACHE_TTL_MS = 4000;
const RESPONSE_FINAL_WRITE_LOCAL_KEY = "__runtimeFinalWriteInvoked";
const billingProjectionCache = new Map();
const getBillingProjectionCacheKey = (businessId, currencyHint) => `${businessId}:${currencyHint}`;
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
const ACTIVE_STRIPE_SUBSCRIPTION_STATUSES = new Set([
    "active",
    "past_due",
    "unpaid",
    "incomplete",
]);
const toIsoOrNull = (value) => Number.isFinite(Number(value)) && Number(value) > 0
    ? new Date(Number(value) * 1000).toISOString()
    : null;
const toDateOrNull = (value) => Number.isFinite(Number(value)) && Number(value) > 0
    ? new Date(Number(value) * 1000)
    : null;
const normalizeStripeCurrency = (value) => {
    const normalized = String(value || "").trim().toUpperCase();
    return normalized === "USD" ? "USD" : normalized === "INR" ? "INR" : null;
};
const normalizeStripeBillingCycle = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "year" ? "yearly" : normalized === "month" ? "monthly" : null;
};
const resolveStripeBillingStatus = (status) => {
    if (status === "trialing") {
        return "TRIAL";
    }
    if (ACTIVE_STRIPE_SUBSCRIPTION_STATUSES.has(status)) {
        return "ACTIVE";
    }
    return "INACTIVE";
};
const mapInvoiceForClient = (invoice) => ({
    ...(toRecord(invoice.metadata).providerInvoiceId
        ? {
            providerInvoiceId: String(toRecord(invoice.metadata).providerInvoiceId || "")
                .trim()
                .toLowerCase(),
        }
        : {}),
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
    hosted_invoice_url: String(toRecord(invoice.metadata).hostedInvoiceUrl ||
        toRecord(invoice.metadata).hosted_invoice_url ||
        "").trim() || null,
    invoice_pdf: String(toRecord(invoice.metadata).invoicePdf ||
        toRecord(invoice.metadata).invoice_pdf ||
        "").trim() || null,
});
const TERMINAL_PAYMENT_INTENT_STATUSES = new Set([
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
]);
const getCheckoutConfirmMetadata = (value) => toRecord(toRecord(value).checkoutConfirm);
const getCheckoutConfirmState = (value) => String(getCheckoutConfirmMetadata(value).state || "")
    .trim()
    .toUpperCase();
const isCheckoutConfirmStillProcessing = (value) => {
    const checkoutConfirm = getCheckoutConfirmMetadata(value);
    const state = String(checkoutConfirm.state || "")
        .trim()
        .toUpperCase();
    const startedAt = new Date(String(checkoutConfirm.startedAt || ""));
    const startedAtMs = startedAt.getTime();
    if (state !== "PROCESSING" || Number.isNaN(startedAtMs)) {
        return false;
    }
    return Date.now() - startedAtMs <= BILLING_CONFIRM_DUPLICATE_WINDOW_MS;
};
async function getUserContext(req) {
    const userId = req.user?.id;
    if (!userId) {
        throw new Error("Unauthorized");
    }
    const businessIdFromRequest = String(req?.tenant?.businessId || req.user?.businessId || "").trim() ||
        null;
    const emailFromRequest = String(req.user?.email || "").trim().toLowerCase() || null;
    if (businessIdFromRequest && emailFromRequest) {
        return {
            userId,
            businessId: businessIdFromRequest,
            email: emailFromRequest,
        };
    }
    const userLookup = await (0, boundedTimeout_1.withTimeoutFallback)({
        label: "billing_user_context_lookup",
        timeoutMs: BILLING_USER_CONTEXT_LOOKUP_TIMEOUT_MS,
        task: prisma_1.default.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                businessId: true,
            },
        }),
        fallback: null,
    });
    const user = userLookup.value;
    if (!user) {
        if (emailFromRequest) {
            return {
                userId,
                businessId: businessIdFromRequest,
                email: emailFromRequest,
            };
        }
        throw new Error("Unauthorized");
    }
    const businessIdHint = String(businessIdFromRequest || user.businessId || "").trim() || null;
    const identityResult = businessIdHint
        ? {
            businessId: businessIdHint,
            workspace: null,
            source: "request_fallback",
        }
        : await (0, boundedTimeout_1.withTimeoutFallback)({
            label: "billing_workspace_identity_lookup",
            timeoutMs: BILLING_USER_CONTEXT_LOOKUP_TIMEOUT_MS,
            task: (0, tenant_service_1.resolveUserWorkspaceIdentity)({
                userId,
                preferredBusinessId: req.user?.businessId || user.businessId || businessIdFromRequest || null,
            }),
            fallback: {
                businessId: user.businessId || null,
                workspace: null,
                source: "none",
            },
        });
    const identity = "value" in identityResult ? identityResult.value : identityResult;
    const resolvedEmail = emailFromRequest || String(user.email || "").trim().toLowerCase();
    return {
        userId,
        businessId: identity.businessId,
        email: resolvedEmail,
    };
}
class BillingController {
    static getBusinessIdFromRequest(req) {
        const tenantBusinessId = String(req?.tenant?.businessId || "").trim();
        const userBusinessId = String(req.user?.businessId || "").trim();
        return tenantBusinessId || userBusinessId || null;
    }
    static async findCheckoutIntentForSession(input) {
        const directMatch = await prisma_1.default.paymentIntentLedger.findFirst({
            where: {
                businessId: input.businessId,
                provider: "STRIPE",
                providerPaymentIntentId: input.sessionId,
            },
            select: {
                id: true,
                businessId: true,
                paymentIntentKey: true,
                providerPaymentIntentId: true,
                status: true,
                metadata: true,
                proposal: {
                    select: {
                        proposalKey: true,
                    },
                },
            },
        });
        if (directMatch) {
            return directMatch;
        }
        const recentRows = await prisma_1.default.paymentIntentLedger.findMany({
            where: {
                businessId: input.businessId,
                provider: "STRIPE",
            },
            orderBy: {
                updatedAt: "desc",
            },
            take: 40,
            select: {
                id: true,
                businessId: true,
                paymentIntentKey: true,
                providerPaymentIntentId: true,
                status: true,
                metadata: true,
                proposal: {
                    select: {
                        proposalKey: true,
                    },
                },
            },
        });
        const resolved = recentRows.find((row) => {
            const metadata = toRecord(row.metadata);
            const providerMetadata = toRecord(metadata.providerMetadata);
            return (String(metadata.stripeSessionId || "").trim() === input.sessionId ||
                String(providerMetadata.stripeSessionId || "").trim() === input.sessionId);
        });
        return resolved ? resolved : null;
    }
    static async updateCheckoutConfirmMetadata(input) {
        const metadata = toRecord(input.paymentIntent.metadata);
        const previous = getCheckoutConfirmMetadata(metadata);
        const nowIso = new Date().toISOString();
        const nextCheckoutConfirm = {
            ...previous,
            state: input.state,
            sessionId: input.sessionId,
            reason: String(input.reason || "").trim() || null,
            updatedAt: nowIso,
            ...(input.state === "PROCESSING"
                ? {
                    startedAt: nowIso,
                }
                : {}),
            ...(input.state === "SUCCESS" || input.state === "FAILED"
                ? {
                    completedAt: nowIso,
                }
                : {}),
        };
        await prisma_1.default.paymentIntentLedger
            .update({
            where: {
                id: input.paymentIntent.id,
            },
            data: {
                metadata: {
                    ...metadata,
                    checkoutConfirm: nextCheckoutConfirm,
                },
            },
        })
            .catch(() => undefined);
    }
    static async finalizeCheckoutConfirmationAsync(input) {
        const paidLikeStatuses = new Set(["paid", "no_payment_required"]);
        try {
            (0, stripeConfig_service_1.assertStripeConfigReady)();
        }
        catch (error) {
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent: input.paymentIntent,
                sessionId: input.sessionId,
                state: "FAILED",
                reason: "stripe_config_invalid",
            });
            console.error("BILLING_CONFIRM_FAILED", {
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                reason: String(error?.message || "stripe_config_invalid"),
            });
            return;
        }
        const stripeSessionResult = await (0, boundedTimeout_1.withTimeoutFallback)({
            label: "billing_confirm_stripe_session",
            timeoutMs: BILLING_CONFIRM_STRIPE_TIMEOUT_MS,
            task: stripe_service_1.stripe.checkout.sessions.retrieve(input.sessionId),
            fallback: null,
        });
        const session = stripeSessionResult.value;
        const paymentStatus = String(session?.payment_status || "")
            .trim()
            .toLowerCase();
        if (stripeSessionResult.timedOut || !session) {
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent: input.paymentIntent,
                sessionId: input.sessionId,
                state: "PENDING",
                reason: "stripe_session_pending",
            });
            console.info("BILLING_CONFIRM_PENDING", {
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                timedOut: stripeSessionResult.timedOut,
                reason: "stripe_session_pending",
            });
            return;
        }
        if (!paidLikeStatuses.has(paymentStatus)) {
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent: input.paymentIntent,
                sessionId: input.sessionId,
                state: "PENDING",
                reason: `payment_status_${paymentStatus || "unknown"}`,
            });
            console.info("BILLING_CONFIRM_PENDING", {
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                reason: `payment_status_${paymentStatus || "unknown"}`,
            });
            return;
        }
        const reconcileResult = await (0, boundedTimeout_1.withTimeoutFallback)({
            label: "billing_confirm_reconcile",
            timeoutMs: BILLING_CONFIRM_RECONCILE_TIMEOUT_MS,
            task: commerceProjection_service_1.commerceProjectionService.reconcileProviderWebhook({
                provider: "STRIPE",
                headers: {
                    "x-commerce-manual-reconcile": "true",
                },
                strictBusinessId: input.businessId,
                body: {
                    id: `manual_confirm_${input.paymentIntent.providerPaymentIntentId || input.sessionId}`,
                    type: "checkout.session.completed",
                    created: Math.floor(Date.now() / 1000),
                    data: {
                        object: {
                            id: input.paymentIntent.providerPaymentIntentId || input.sessionId,
                            payment_status: session.payment_status || "paid",
                            amount_total: session.amount_total || null,
                            currency: session.currency || null,
                            subscription: typeof session.subscription === "string"
                                ? session.subscription
                                : session.subscription?.id || null,
                            metadata: {
                                businessId: input.businessId,
                                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                                proposalKey: input.paymentIntent.proposal?.proposalKey || null,
                            },
                        },
                    },
                },
            }),
            fallback: null,
        });
        if (reconcileResult.timedOut || reconcileResult.failed) {
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent: input.paymentIntent,
                sessionId: input.sessionId,
                state: "PENDING",
                reason: reconcileResult.timedOut
                    ? "reconcile_timeout"
                    : "reconcile_retry_required",
            });
            console.info("BILLING_CONFIRM_PENDING", {
                businessId: input.businessId,
                sessionId: input.sessionId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                timedOut: reconcileResult.timedOut,
                failed: reconcileResult.failed,
                reason: reconcileResult.timedOut
                    ? "reconcile_timeout"
                    : "reconcile_retry_required",
            });
            return;
        }
        await BillingController.updateCheckoutConfirmMetadata({
            paymentIntent: input.paymentIntent,
            sessionId: input.sessionId,
            state: "SUCCESS",
            reason: "projection_reconciled",
        });
        console.info("BILLING_CONFIRM_SUCCESS", {
            businessId: input.businessId,
            sessionId: input.sessionId,
            paymentIntentKey: input.paymentIntent.paymentIntentKey,
        });
    }
    static buildConfirmPayload(input) {
        return {
            state: input.state,
            sessionId: input.sessionId,
            message: input.message,
            shouldPoll: input.shouldPoll,
            retryAfterMs: input.shouldPoll && Number.isFinite(Number(input.retryAfterMs))
                ? Math.max(500, Math.floor(Number(input.retryAfterMs)))
                : null,
            reason: String(input.reason || "").trim() || null,
            code: String(input.code || "").trim() || null,
        };
    }
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
    static async buildStripeLiveSnapshot(input) {
        const fallbackSubscription = input.fallbackSubscription || null;
        const knownStripeSubscriptionId = String(fallbackSubscription?.stripeSubscriptionId || "").trim() || null;
        const latestStripeSubscription = knownStripeSubscriptionId
            ? null
            : await prisma_1.default.subscriptionLedger.findFirst({
                where: {
                    businessId: input.businessId,
                    provider: "STRIPE",
                    providerSubscriptionId: {
                        not: null,
                    },
                },
                orderBy: {
                    updatedAt: "desc",
                },
                select: {
                    providerSubscriptionId: true,
                },
            });
        const stripeSubscriptionId = knownStripeSubscriptionId ||
            String(latestStripeSubscription?.providerSubscriptionId || "").trim() ||
            null;
        if (!stripeSubscriptionId) {
            return null;
        }
        (0, stripeConfig_service_1.assertStripeConfigReady)();
        const stripeSubscription = await stripe_service_1.stripe.subscriptions
            .retrieve(stripeSubscriptionId)
            .catch(() => null);
        if (!stripeSubscription) {
            return null;
        }
        const subscriptionRaw = toRecord(stripeSubscription);
        const metadata = toRecord(subscriptionRaw.metadata);
        const items = Array.isArray(toRecord(subscriptionRaw.items).data)
            ? toRecord(subscriptionRaw.items).data
            : [];
        const firstItem = toRecord(items[0]);
        const firstPrice = toRecord(firstItem.price);
        const firstRecurring = toRecord(firstPrice.recurring);
        const priceId = String(firstPrice.id || "").trim() || null;
        const planFromPrice = (0, stripe_price_map_1.getPlanFromPrice)(priceId);
        const planCode = String(metadata.planCode || fallbackSubscription?.plan?.type || planFromPrice || "")
            .trim()
            .toUpperCase() || null;
        const billingCycle = normalizeStripeBillingCycle(firstRecurring.interval) ||
            String(fallbackSubscription?.billingCycle || "").trim().toLowerCase() ||
            null;
        const currency = normalizeStripeCurrency(subscriptionRaw.currency) ||
            normalizeStripeCurrency(fallbackSubscription?.currency) ||
            null;
        const stripeStatus = String(subscriptionRaw.status || "").trim().toLowerCase();
        const billingStatus = resolveStripeBillingStatus(stripeStatus);
        const customerId = typeof stripeSubscription.customer === "string"
            ? stripeSubscription.customer
            : null;
        const stripeInvoices = await stripe_service_1.stripe.invoices
            .list({
            customer: customerId || undefined,
            subscription: stripeSubscriptionId,
            limit: 20,
        })
            .catch(() => ({ data: [] }));
        const invoices = (Array.isArray(stripeInvoices.data) ? stripeInvoices.data : []).map((invoice) => {
            const invoiceRaw = toRecord(invoice);
            const totalDetails = toRecord(invoiceRaw.total_details);
            const statusTransitions = toRecord(invoiceRaw.status_transitions);
            const taxAmount = Math.max(0, Math.floor(Number(totalDetails.amount_tax || 0)));
            const subtotal = Math.max(0, Math.floor(Number(invoiceRaw.subtotal || 0)));
            const amountPaid = Math.max(0, Math.floor(Number(invoiceRaw.amount_paid || invoiceRaw.amount_due || 0)));
            const amountTotal = Math.max(amountPaid, Math.floor(Number(invoiceRaw.total || amountPaid || 0)));
            const created = Math.max(0, Math.floor(Number(invoiceRaw.created || Date.now() / 1000)));
            return {
                id: String(invoiceRaw.id || "").trim() || `stripe_invoice_${created}`,
                invoiceKey: String(invoiceRaw.id || "").trim() || `stripe_invoice_${created}`,
                status: String(invoiceRaw.status || "").trim().toLowerCase() || "open",
                currency: normalizeStripeCurrency(invoiceRaw.currency) ||
                    currency ||
                    "INR",
                amount: amountTotal,
                subtotal,
                taxAmount,
                paidAmount: amountPaid,
                created,
                createdAt: new Date(created * 1000),
                dueAt: toDateOrNull(Number(invoiceRaw.due_date || 0)),
                issuedAt: toDateOrNull(Number(statusTransitions.finalized_at || invoiceRaw.created || 0)),
                paidAt: toDateOrNull(Number(statusTransitions.paid_at || 0)),
                externalInvoiceId: String(invoiceRaw.number || invoiceRaw.id || "").trim() || null,
                hosted_invoice_url: String(invoiceRaw.hosted_invoice_url || "").trim() || null,
                invoice_pdf: String(invoiceRaw.invoice_pdf || "").trim() || null,
            };
        });
        return {
            subscription: {
                ...fallbackSubscription,
                stripeSubscriptionId,
                currency: currency || fallbackSubscription?.currency || null,
                billingCycle: billingCycle === "yearly" || billingCycle === "monthly"
                    ? billingCycle
                    : fallbackSubscription?.billingCycle || null,
                currentPeriodEnd: toIsoOrNull(Number(subscriptionRaw.current_period_end || 0)) ||
                    fallbackSubscription?.currentPeriodEnd ||
                    null,
                trialUsed: billingStatus === "TRIAL"
                    ? false
                    : Boolean(fallbackSubscription?.trialUsed ?? true),
                status: stripeStatus || fallbackSubscription?.status || "inactive",
                plan: {
                    name: planCode || fallbackSubscription?.plan?.name || null,
                    type: planCode || fallbackSubscription?.plan?.type || null,
                },
            },
            billingStatus,
            planKey: planCode,
            invoices,
        };
    }
    static async buildBillingResponse(businessId, req) {
        const startedAt = Date.now();
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
                timeoutMs: 1350,
                task: (0, subscription_middleware_1.loadBillingContext)(businessId),
                fallback: {
                    subscription: null,
                    context: EMPTY_BILLING_CONTEXT,
                },
            }),
            (0, boundedTimeout_1.withTimeoutFallback)({
                label: "billing_usage_projection",
                timeoutMs: 1350,
                task: (0, usage_service_1.getUsageOverview)(businessId),
                fallback: null,
            }),
            (0, boundedTimeout_1.withTimeoutFallback)({
                label: "billing_invoice_projection",
                timeoutMs: 1350,
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
                        metadata: true,
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
        const shouldAttemptStripeLive = Boolean(String(billingContext.subscription?.stripeSubscriptionId || "").trim());
        const stripeLiveResult = shouldAttemptStripeLive
            ? await (0, boundedTimeout_1.withTimeoutFallback)({
                label: "billing_stripe_live_projection",
                timeoutMs: 450,
                task: BillingController.buildStripeLiveSnapshot({
                    businessId,
                    fallbackSubscription: billingContext.subscription,
                }),
                fallback: null,
            })
            : {
                value: null,
                timedOut: false,
                failed: false,
            };
        const stripeLive = stripeLiveResult.value;
        const hasStripeLiveInvoices = Boolean(stripeLive?.invoices?.length);
        const effectiveSubscription = stripeLive?.subscription || billingContext.subscription;
        const effectiveBillingContext = {
            ...billingContext.context,
            ...(stripeLive?.planKey
                ? {
                    planKey: stripeLive.planKey,
                    status: stripeLive.billingStatus,
                    isLimited: stripeLive.billingStatus === "INACTIVE",
                    upgradeRequired: stripeLive.billingStatus === "INACTIVE",
                }
                : {}),
        };
        const effectiveInvoices = hasStripeLiveInvoices ? stripeLive.invoices : invoices;
        const effectiveCurrency = stripeLive?.subscription?.currency ||
            billingContext.subscription?.currency ||
            (0, billingGeo_service_1.resolveBillingCurrency)(req);
        const degraded = billingContextResult.timedOut ||
            billingContextResult.failed ||
            usageResult.timedOut ||
            usageResult.failed ||
            invoicesResult.timedOut ||
            invoicesResult.failed ||
            stripeLiveResult.timedOut ||
            stripeLiveResult.failed;
        const reasons = [
            billingContextResult.timedOut ? "context_timeout" : null,
            billingContextResult.failed ? "context_failed" : null,
            usageResult.timedOut ? "usage_timeout" : null,
            usageResult.failed ? "usage_failed" : null,
            invoicesResult.timedOut ? "invoices_timeout" : null,
            invoicesResult.failed ? "invoices_failed" : null,
            stripeLiveResult.timedOut ? "stripe_live_timeout" : null,
            stripeLiveResult.failed ? "stripe_live_failed" : null,
        ].filter(Boolean);
        console.info("BILLING_PROJECTION_READY", {
            businessId,
            contextTimedOut: billingContextResult.timedOut,
            usageTimedOut: usageResult.timedOut,
            invoicesTimedOut: invoicesResult.timedOut,
            stripeLiveTimedOut: stripeLiveResult.timedOut,
            stripeLiveApplied: Boolean(stripeLive?.subscription || hasStripeLiveInvoices),
            usedFallback: degraded,
        });
        const durationMs = Date.now() - startedAt;
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "PROJECTION_MS",
            value: durationMs,
            businessId,
            route: "billing_projection",
            metadata: {
                degraded,
            },
        });
        if (durationMs >= 900) {
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "DB_SLOW",
                value: durationMs,
                businessId,
                route: "billing_projection",
            });
        }
        return {
            success: true,
            subscription: effectiveSubscription,
            billing: effectiveBillingContext,
            usage: usage
                ? {
                    aiCallsUsed: usage.usage.ai.monthlyUsed,
                    messagesUsed: usage.usage.messages.used,
                    followupsUsed: usage.usage.automation.used,
                    summary: usage,
                }
                : EMPTY_USAGE_SUMMARY,
            currency: effectiveCurrency,
            invoices: effectiveInvoices,
            meta: {
                degraded,
                reason: reasons.length ? reasons.join(",") : null,
            },
        };
    }
    static buildCheckoutFailureRedirect(reason) {
        const normalizedReason = String(reason || "").trim() || "checkout_failed";
        const appBaseUrl = String(env_1.env.FRONTEND_URL || "").replace(/\/$/, "");
        const query = new URLSearchParams({
            checkout: "failed",
            reason: normalizedReason,
        });
        return `${appBaseUrl}/billing?${query.toString()}`;
    }
    static async handleCheckout(req, res, options) {
        const redirectOnSuccess = Boolean(options?.redirectOnSuccess);
        const checkoutStartedAt = Date.now();
        const checkoutRequestId = String(req?.requestId || "").trim() || null;
        const hasExplicitFinalResponseWrite = () => Boolean(res.locals?.[RESPONSE_FINAL_WRITE_LOCAL_KEY]);
        const isResponseCommitted = () => res.headersSent || res.writableEnded || hasExplicitFinalResponseWrite();
        const logCheckoutStart = (label, details) => {
            console.info(label, {
                requestId: checkoutRequestId,
                route: req.originalUrl,
                method: req.method,
                elapsedMs: Date.now() - checkoutStartedAt,
                ...(details || {}),
            });
        };
        logCheckoutStart("[START 1] checkout request received", {
            redirectOnSuccess,
        });
        if (redirectOnSuccess) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
        }
        const requestBody = req.body && typeof req.body === "object" && !Array.isArray(req.body)
            ? req.body
            : {};
        const requestQuery = req.query && typeof req.query === "object" && !Array.isArray(req.query)
            ? req.query
            : {};
        const readInput = (key) => {
            const bodyValue = requestBody[key];
            if (bodyValue !== undefined && bodyValue !== null && bodyValue !== "") {
                return bodyValue;
            }
            const queryValue = requestQuery[key];
            if (Array.isArray(queryValue)) {
                return queryValue[0];
            }
            return queryValue;
        };
        const sendCheckoutError = (input) => {
            logCheckoutStart("[START 8] response return", {
                success: false,
                status: input.status,
                reason: input.reason,
                code: input.code || null,
                redirectOnSuccess,
            });
            if (isResponseCommitted()) {
                logCheckoutStart("[START 8] response skipped", {
                    success: false,
                    status: input.status,
                    reason: input.reason,
                    code: input.code || null,
                    skipped: "response_already_committed",
                    redirectOnSuccess,
                });
                return res;
            }
            if (redirectOnSuccess) {
                return res.redirect(303, BillingController.buildCheckoutFailureRedirect(input.reason));
            }
            return res.status(input.status).json({
                success: false,
                ...(input.code ? { code: input.code } : {}),
                message: input.message,
            });
        };
        try {
            const plan = readInput("plan");
            const coupon = readInput("coupon");
            const requestedQuantity = Number(readInput("seats") || readInput("quantity") || 1);
            const quantity = Math.max(1, Math.floor(Number.isFinite(requestedQuantity) ? requestedQuantity : 1));
            const billing = String(readInput("billing") || "monthly");
            const checkoutTypeInput = String(readInput("checkoutType") || readInput("action") || (coupon ? "coupon" : "subscription"))
                .trim()
                .toLowerCase();
            const checkoutAttemptRaw = String(readInput("attempt") || readInput("checkoutAttempt") || "").trim();
            const checkoutAttempt = checkoutAttemptRaw
                .replace(/[^a-zA-Z0-9._-]/g, "")
                .slice(0, 80) || crypto_1.default.randomUUID().replace(/-/g, "");
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
                ? Math.max(1, Math.min(30, Math.floor(Number(readInput("trialDays") || pricing_config_1.TRIAL_DAYS))))
                : 0;
            const addonLineItems = Array.isArray(requestBody.lineItems)
                ? requestBody.lineItems
                : Array.isArray(requestBody.addons)
                    ? requestBody.addons.map((item, index) => ({
                        type: String(item?.type || item?.addonType || "").trim().toLowerCase(),
                        credits: Math.max(0, Math.floor(Number(item?.credits || item?.quantity || 0))),
                        label: String(item?.label || `addon_${index + 1}`).trim(),
                    }))
                    : [];
            const couponCode = String(coupon || readInput("couponId") || "").trim() || null;
            const normalizedPlan = String(plan || "").trim().toUpperCase();
            const normalizedBilling = billing === "yearly"
                ? "yearly"
                : billing === "monthly"
                    ? "monthly"
                    : null;
            const allowedPlans = new Set(["BASIC", "PRO", "ELITE"]);
            if (!normalizedPlan) {
                return sendCheckoutError({
                    status: 400,
                    message: "Plan is required",
                    reason: "plan_required",
                });
            }
            if (!allowedPlans.has(normalizedPlan)) {
                return sendCheckoutError({
                    status: 400,
                    message: "Invalid plan selected",
                    reason: "invalid_plan",
                });
            }
            if (!normalizedBilling) {
                return sendCheckoutError({
                    status: 400,
                    message: "Invalid billing cycle",
                    reason: "invalid_billing",
                });
            }
            const { businessId, email } = await getUserContext(req);
            logCheckoutStart("[START 2] auth resolved", {
                userId: String(req.user?.id || "").trim() || null,
                businessId: businessId || null,
            });
            if (!businessId) {
                return sendCheckoutError({
                    status: 403,
                    message: "Business context is required",
                    reason: "business_context_required",
                });
            }
            logCheckoutStart("[START 3] checkout context validated", {
                businessId,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                checkoutType,
                quantity,
            });
            (0, stripeConfig_service_1.assertStripeConfigReady)();
            const currency = (0, billingGeo_service_1.resolveBillingCurrency)(req);
            const pricingPlan = (0, pricing_config_1.getPricingPlanConfig)(normalizedPlan);
            const unitPrice = normalizedBilling === "yearly"
                ? pricingPlan.yearlyPrice[currency]
                : pricingPlan.monthlyPrice[currency];
            if (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) <= 0) {
                return sendCheckoutError({
                    status: 400,
                    message: `Pricing is not configured for ${normalizedPlan} (${currency}, ${normalizedBilling})`,
                    reason: "pricing_unavailable",
                });
            }
            const explicitUnitAmountMinor = Number(readInput("unitAmountMinor") || readInput("amountMinor") || 0);
            const customUnitPriceMinor = Number.isFinite(explicitUnitAmountMinor) && explicitUnitAmountMinor > 0
                ? Math.floor(explicitUnitAmountMinor)
                : Math.round(Number(unitPrice || 0) * 100);
            logCheckoutStart("[START 4] pricing resolved", {
                businessId,
                plan: normalizedPlan,
                billingCycle: normalizedBilling,
                currency,
                quantity,
                unitPrice,
                customUnitPriceMinor,
            });
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
            const checkoutProposalFingerprint = crypto_1.default
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
                prorationBehavior: readInput("prorationBehavior") || null,
            }))
                .digest("hex")
                .slice(0, 24);
            let proposal;
            try {
                proposal = await (0, boundedTimeout_1.withTimeout)({
                    label: "billing_checkout_proposal",
                    timeoutMs: BILLING_CHECKOUT_PROPOSAL_TIMEOUT_MS,
                    task: proposalEngine_service_1.proposalEngineService.createProposal({
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
                            prorationBehavior: String(readInput("prorationBehavior") || "").trim().toLowerCase() || null,
                            providerSubscriptionId: String(readInput("providerSubscriptionId") || activeSubscription?.providerSubscriptionId || "").trim() ||
                                null,
                            stripeCustomerId: String(readInput("stripeCustomerId") || subscriptionMeta.stripeCustomerId || "").trim() ||
                                null,
                            seatBased: quantity > 1,
                        },
                        idempotencyKey: `checkout:proposal:${businessId}:${checkoutProposalFingerprint}`,
                    }),
                });
            }
            catch (error) {
                if (error instanceof boundedTimeout_1.TimeoutExceededError) {
                    return sendCheckoutError({
                        status: 504,
                        code: "BILLING_PROPOSAL_TIMEOUT",
                        message: "Checkout is taking longer than expected. Please retry.",
                        reason: "proposal_timeout",
                    });
                }
                throw error;
            }
            const readyProposal = proposal.status === "APPROVED" || proposal.status === "SENT"
                ? proposal
                : await proposalEngine_service_1.proposalEngineService.sendProposal({
                    businessId,
                    proposalKey: proposal.proposalKey,
                });
            logCheckoutStart("[START 5] proposal created", {
                businessId,
                proposalKey: readyProposal.proposalKey,
                proposalStatus: readyProposal.status,
            });
            let paymentIntent;
            try {
                paymentIntent = await (0, boundedTimeout_1.withTimeout)({
                    label: "billing_checkout_payment_intent",
                    timeoutMs: BILLING_CHECKOUT_PAYMENT_INTENT_TIMEOUT_MS,
                    task: paymentIntent_service_1.paymentIntentService.createCheckout({
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
                            providerSubscriptionId: String(readInput("providerSubscriptionId") || activeSubscription?.providerSubscriptionId || "").trim() ||
                                null,
                            stripeCustomerId: String(readInput("stripeCustomerId") || subscriptionMeta.stripeCustomerId || "").trim() ||
                                null,
                            customerEmail: email,
                            checkoutAttempt,
                            checkoutStartRequestId: checkoutRequestId,
                            checkoutStartPath: req.originalUrl,
                            prorationBehavior: String(readInput("prorationBehavior") || "").trim().toLowerCase() || null,
                            seatBased: quantity > 1,
                        },
                        idempotencyKey: `checkout:payment_intent:${businessId}:${readyProposal.proposalKey}:${checkoutAttempt}`,
                    }),
                });
            }
            catch (error) {
                if (error instanceof boundedTimeout_1.TimeoutExceededError) {
                    return sendCheckoutError({
                        status: 504,
                        code: "BILLING_PROVIDER_TIMEOUT",
                        message: "Stripe took too long to respond. Please retry in a few seconds.",
                        reason: "provider_timeout",
                    });
                }
                throw error;
            }
            logCheckoutStart("[START 6] payment intent created", {
                businessId,
                proposalKey: readyProposal.proposalKey,
                paymentIntentKey: paymentIntent.paymentIntentKey,
                provider: paymentIntent.provider,
                paymentIntentStatus: paymentIntent.status,
            });
            const checkoutUrl = String(paymentIntent.checkoutUrl || "").trim();
            logCheckoutStart("[START 7] checkout url evaluated", {
                businessId,
                proposalKey: readyProposal.proposalKey,
                paymentIntentKey: paymentIntent.paymentIntentKey,
                hasCheckoutUrl: Boolean(checkoutUrl),
            });
            if (!checkoutUrl) {
                return sendCheckoutError({
                    status: 503,
                    message: "Stripe checkout link is temporarily unavailable. Please retry shortly.",
                    reason: "checkout_url_missing",
                });
            }
            if (isResponseCommitted()) {
                logCheckoutStart("[START 8] response skipped", {
                    success: true,
                    businessId,
                    proposalKey: readyProposal.proposalKey,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    skipped: "response_already_committed",
                    redirectOnSuccess,
                });
                return;
            }
            if (redirectOnSuccess) {
                logCheckoutStart("[START 8] response return", {
                    success: true,
                    status: 303,
                    businessId,
                    proposalKey: readyProposal.proposalKey,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    redirectOnSuccess,
                });
                return res.redirect(303, checkoutUrl);
            }
            logCheckoutStart("[START 8] response return", {
                success: true,
                status: 200,
                businessId,
                proposalKey: readyProposal.proposalKey,
                paymentIntentKey: paymentIntent.paymentIntentKey,
                redirectOnSuccess,
            });
            return res.json({
                success: true,
                url: checkoutUrl,
                proposalKey: readyProposal.proposalKey,
                paymentIntentKey: paymentIntent.paymentIntentKey,
            });
        }
        catch (error) {
            const stripeCode = String(error?.code || "").trim().toLowerCase();
            const stripeType = String(error?.type || "").trim().toLowerCase();
            if (error.message === "Unauthorized") {
                return sendCheckoutError({
                    status: 401,
                    message: "Unauthorized",
                    reason: "unauthorized",
                });
            }
            if (error.message?.includes("Currency cannot be changed") ||
                error.message?.includes("Invalid plan") ||
                error.message?.includes("Invalid billing") ||
                error.message?.includes("proposal_not_checkout_ready") ||
                error.message?.includes("stripe_subscription_amount_invalid") ||
                error.message?.includes("stripe_price_mapping_missing") ||
                error.message?.includes("unknown parameter") ||
                error.message?.includes("parameter_unknown") ||
                error.message?.includes("invalid_request_error") ||
                stripeCode === "parameter_unknown" ||
                stripeType === "invalid_request_error") {
                return sendCheckoutError({
                    status: 400,
                    message: "Checkout configuration is invalid. Please contact support if this persists.",
                    reason: "checkout_invalid",
                });
            }
            if (error.message?.includes("checkout_manual_review_required")) {
                return sendCheckoutError({
                    status: 409,
                    code: "CHECKOUT_MANUAL_REVIEW_REQUIRED",
                    message: "Checkout is temporarily paused for risk review. Please contact support.",
                    reason: "manual_review_required",
                });
            }
            if (error.message?.includes("provider_timeout")) {
                return sendCheckoutError({
                    status: 504,
                    code: "BILLING_PROVIDER_TIMEOUT",
                    message: "Stripe took too long to respond. Please retry in a few seconds.",
                    reason: "provider_timeout",
                });
            }
            if (error.message?.includes("provider_credential_unavailable")) {
                return sendCheckoutError({
                    status: 503,
                    code: "BILLING_PROVIDER_UNAVAILABLE",
                    message: "Billing provider is temporarily unavailable. Please retry shortly.",
                    reason: "provider_unavailable",
                });
            }
            if (error.message?.includes("stripe_config_invalid")) {
                return sendCheckoutError({
                    status: 503,
                    code: "BILLING_PROVIDER_UNAVAILABLE",
                    message: "Billing provider is temporarily unavailable. Please retry shortly.",
                    reason: "provider_unavailable",
                });
            }
            console.error("Billing checkout error:", error);
            return sendCheckoutError({
                status: 500,
                message: error.message || "Checkout failed",
                reason: "checkout_failed",
            });
        }
    }
    static async getPlans(req, res) {
        try {
            const projection = await (0, boundedTimeout_1.withTimeoutFallback)({
                label: "billing_plans_projection",
                timeoutMs: 1800,
                task: prisma_1.default.plan.findMany({
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
                }),
                fallback: [],
            });
            const plans = Array.isArray(projection.value) ? projection.value : [];
            const degraded = projection.timedOut || projection.failed;
            return res.json(buildPlansPayload({
                plans: plans.map((plan) => ({
                    id: plan.id,
                    name: plan.name,
                    type: String(plan.type || "").trim(),
                    priceIdINR: plan.priceIdINR,
                    priceIdUSD: plan.priceIdUSD,
                })),
                degraded,
                reason: degraded ? "plans_projection_degraded" : null,
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
                void (0, boundedTimeout_1.withTimeoutFallback)({
                    label: "billing_portal_reconcile",
                    timeoutMs: 900,
                    task: BillingController.reconcileRecentPortalState(businessId),
                    fallback: {
                        attempted: false,
                        reason: "reconcile_skipped",
                    },
                }).catch(() => undefined);
            }
            res.setHeader("Cache-Control", "no-store");
            const currencyHint = (0, billingGeo_service_1.resolveBillingCurrency)(req);
            const cacheKey = businessId
                ? getBillingProjectionCacheKey(businessId, currencyHint)
                : null;
            if (cacheKey) {
                const cached = billingProjectionCache.get(cacheKey);
                if (cached?.value && cached.expiresAt > Date.now()) {
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "CACHE_HIT",
                        businessId,
                        route: "billing_projection",
                        metadata: {
                            cache: "memory_billing_projection",
                        },
                    });
                    return res.json(cached.value);
                }
                if (cached?.promise) {
                    return res.json(await cached.promise);
                }
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "CACHE_MISS",
                    businessId,
                    route: "billing_projection",
                    metadata: {
                        cache: "memory_billing_projection",
                    },
                });
            }
            const computeProjection = (async () => {
                const projection = await (0, boundedTimeout_1.withTimeoutFallback)({
                    label: "billing_projection_api_guard",
                    timeoutMs: BILLING_CONFIRM_REQUEST_TIMEOUT_MS,
                    task: BillingController.buildBillingResponse(businessId, req),
                    fallback: {
                        success: true,
                        subscription: null,
                        billing: EMPTY_BILLING_CONTEXT,
                        usage: EMPTY_USAGE_SUMMARY,
                        currency: currencyHint,
                        invoices: [],
                        meta: {
                            degraded: true,
                            reason: "billing_projection_timeout_guard",
                        },
                    },
                });
                return projection.value;
            })();
            if (cacheKey) {
                billingProjectionCache.set(cacheKey, {
                    expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                    promise: computeProjection,
                });
            }
            const value = await computeProjection.catch((error) => {
                if (cacheKey) {
                    billingProjectionCache.delete(cacheKey);
                }
                throw error;
            });
            if (cacheKey) {
                billingProjectionCache.set(cacheKey, {
                    value,
                    expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                });
            }
            return res.json(value);
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
    static async startCheckoutRedirect(req, res) {
        return BillingController.handleCheckout(req, res, {
            redirectOnSuccess: true,
        });
    }
    static async confirmCheckout(req, res) {
        const sessionId = String(req.query.session_id || req.body?.session_id || "").trim();
        const businessId = BillingController.getBusinessIdFromRequest(req);
        const respond = (payload) => {
            res.setHeader("Cache-Control", "no-store");
            return res.status(200).json({
                success: true,
                data: payload,
            });
        };
        console.info("BILLING_CONFIRM_START", {
            businessId,
            sessionId: sessionId || null,
        });
        if (!sessionId) {
            console.error("BILLING_CONFIRM_FAILED", {
                businessId,
                sessionId: null,
                reason: "session_id_missing",
            });
            return respond(BillingController.buildConfirmPayload({
                state: "FAILED",
                sessionId: "",
                message: "session_id is required",
                shouldPoll: false,
                reason: "session_id_missing",
                code: "SESSION_ID_MISSING",
            }));
        }
        if (!businessId) {
            console.error("BILLING_CONFIRM_FAILED", {
                businessId: null,
                sessionId,
                reason: "business_context_missing",
            });
            return respond(BillingController.buildConfirmPayload({
                state: "FAILED",
                sessionId,
                message: "Business context is required",
                shouldPoll: false,
                reason: "business_context_missing",
                code: "BUSINESS_CONTEXT_MISSING",
            }));
        }
        try {
            const lookup = await (0, boundedTimeout_1.withTimeoutFallback)({
                label: "billing_confirm_intent_lookup",
                timeoutMs: BILLING_CONFIRM_LOOKUP_TIMEOUT_MS,
                task: BillingController.findCheckoutIntentForSession({
                    businessId,
                    sessionId,
                }),
                fallback: null,
            });
            const paymentIntent = lookup.value;
            if (!paymentIntent) {
                if (lookup.timedOut) {
                    console.info("BILLING_CONFIRM_PENDING", {
                        businessId,
                        sessionId,
                        reason: "intent_lookup_timeout",
                    });
                    return respond(BillingController.buildConfirmPayload({
                        state: "PENDING",
                        sessionId,
                        message: "Payment is being verified. Please wait a moment.",
                        shouldPoll: true,
                        retryAfterMs: 1000,
                        reason: "intent_lookup_timeout",
                        code: "INTENT_LOOKUP_TIMEOUT",
                    }));
                }
                console.error("BILLING_CONFIRM_FAILED", {
                    businessId,
                    sessionId,
                    reason: "checkout_session_not_found",
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "FAILED",
                    sessionId,
                    message: "Checkout session could not be matched with your workspace.",
                    shouldPoll: false,
                    reason: "checkout_session_not_found",
                    code: "CHECKOUT_SESSION_NOT_FOUND",
                }));
            }
            const status = String(paymentIntent.status || "")
                .trim()
                .toUpperCase();
            const confirmState = getCheckoutConfirmState(paymentIntent.metadata);
            const alreadyProcessed = status === "SUCCEEDED" ||
                confirmState === "SUCCESS" ||
                confirmState === "ALREADY_PROCESSED";
            if (alreadyProcessed) {
                console.info("BILLING_CONFIRM_ALREADY_PROCESSED", {
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    status,
                    confirmState,
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "ALREADY_PROCESSED",
                    sessionId,
                    message: "Payment confirmation is already complete.",
                    shouldPoll: true,
                    retryAfterMs: 900,
                    reason: "already_processed",
                    code: "ALREADY_PROCESSED",
                }));
            }
            if (TERMINAL_PAYMENT_INTENT_STATUSES.has(status)) {
                console.error("BILLING_CONFIRM_FAILED", {
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    status,
                    reason: "payment_intent_terminal_non_success",
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "FAILED",
                    sessionId,
                    message: "Checkout confirmation cannot continue for this session.",
                    shouldPoll: false,
                    reason: "payment_intent_terminal_non_success",
                    code: "PAYMENT_INTENT_TERMINAL",
                }));
            }
            if (isCheckoutConfirmStillProcessing(paymentIntent.metadata)) {
                console.info("BILLING_CONFIRM_PENDING", {
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    reason: "duplicate_confirm",
                });
                return respond(BillingController.buildConfirmPayload({
                    state: "PENDING",
                    sessionId,
                    message: "Payment is already being verified.",
                    shouldPoll: true,
                    retryAfterMs: 1000,
                    reason: "duplicate_confirm",
                    code: "DUPLICATE_CONFIRM",
                }));
            }
            await BillingController.updateCheckoutConfirmMetadata({
                paymentIntent,
                sessionId,
                state: "PROCESSING",
                reason: "queued_for_async_confirmation",
            });
            if (status === "CREATED" || status === "REQUIRES_ACTION") {
                await paymentIntent_service_1.paymentIntentService
                    .transitionPaymentIntentStatus({
                    paymentIntentId: paymentIntent.id,
                    nextStatus: "PROCESSING",
                    metadata: {
                        manualConfirmSessionId: sessionId,
                        manualConfirmQueuedAt: new Date().toISOString(),
                    },
                })
                    .catch(() => undefined);
            }
            void BillingController.finalizeCheckoutConfirmationAsync({
                businessId,
                sessionId,
                paymentIntent,
            }).catch((error) => {
                console.error("BILLING_CONFIRM_FAILED", {
                    businessId,
                    sessionId,
                    paymentIntentKey: paymentIntent.paymentIntentKey,
                    reason: String(error?.message || "confirm_async_failed"),
                });
            });
            console.info("BILLING_CONFIRM_PENDING", {
                businessId,
                sessionId,
                paymentIntentKey: paymentIntent.paymentIntentKey,
                reason: "queued_for_async_confirmation",
            });
            return respond(BillingController.buildConfirmPayload({
                state: "PENDING",
                sessionId,
                message: "Payment is being verified. We will activate your plan shortly.",
                shouldPoll: true,
                retryAfterMs: 1200,
                reason: "queued_for_async_confirmation",
                code: "CONFIRM_QUEUED",
            }));
        }
        catch (error) {
            console.error("BILLING_CONFIRM_FAILED", {
                businessId,
                sessionId,
                reason: String(error?.message || "confirm_failed"),
            });
            return respond(BillingController.buildConfirmPayload({
                state: "FAILED",
                sessionId,
                message: "Checkout confirmation is temporarily unavailable. Please retry.",
                shouldPoll: true,
                retryAfterMs: 1200,
                reason: String(error?.message || "confirm_failed"),
                code: "CONFIRM_FAILED",
            }));
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
