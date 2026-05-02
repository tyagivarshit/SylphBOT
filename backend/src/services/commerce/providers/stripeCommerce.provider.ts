import { Currency, RefundStatus } from "@prisma/client";
import Stripe from "stripe";
import { env } from "../../../config/env";
import {
  BillingInterval,
  PlanType,
  PricingCurrency,
  getStripePriceId,
} from "../../../config/stripe.price.map";
import { stripe } from "../../stripe.service";
import { assertStripeConfigReady } from "./stripeConfig.service";
import type {
  CommerceProviderAdapter,
  ProviderCheckoutRequest,
  ProviderWebhookEvent,
} from "./commerceProvider.types";

const SUPPORTED_CURRENCIES: PricingCurrency[] = ["INR", "USD"];
const CHECKOUT_SUBSCRIPTION_TYPES = new Set([
  "subscription",
  "trial",
  "coupon",
  "upgrade",
  "downgrade",
]);

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const clampQuantity = (value: unknown) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
};

const normalizeCheckoutCurrency = (value?: string | null): Currency => {
  const normalized = String(value || "INR").trim().toUpperCase();

  if (!SUPPORTED_CURRENCIES.includes(normalized as PricingCurrency)) {
    throw new Error(`stripe_currency_unsupported:${normalized || "unknown"}`);
  }

  return normalized as Currency;
};

const normalizeStripeRefundStatus = (status?: string | null): RefundStatus => {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "succeeded") return "SUCCEEDED";
  if (normalized === "pending" || normalized === "requires_action") return "PROCESSING";
  if (normalized === "failed" || normalized === "canceled") return "FAILED";

  return "PROCESSING";
};

const extractAmountMinor = (payload: Record<string, unknown>) => {
  const candidates = [
    payload.amount_received,
    payload.amount_total,
    payload.amount,
    payload.amount_due,
    payload.amount_paid,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);

    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return null;
};

const extractInvoiceTaxMinor = (payload: Record<string, unknown>) => {
  const totalDetails = toRecord(payload.total_details);
  const tax = Number(totalDetails.amount_tax);

  if (Number.isFinite(tax)) {
    return Math.max(0, Math.floor(tax));
  }

  return 0;
};

const extractSubscriptionQuantity = (payload: Record<string, unknown>) => {
  const directQuantity = Number(payload.quantity);

  if (Number.isFinite(directQuantity) && directQuantity > 0) {
    return Math.max(1, Math.floor(directQuantity));
  }

  const items = Array.isArray(toRecord(payload.items).data)
    ? (toRecord(payload.items).data as Array<Record<string, unknown>>)
    : [];
  const firstItem = items[0] ? toRecord(items[0]) : {};
  const itemQuantity = Number(firstItem.quantity);

  if (Number.isFinite(itemQuantity) && itemQuantity > 0) {
    return Math.max(1, Math.floor(itemQuantity));
  }

  return null;
};

const normalizeWebhookCurrency = (value?: string | null): Currency | null => {
  const normalized = String(value || "").trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  if (SUPPORTED_CURRENCIES.includes(normalized as PricingCurrency)) {
    return normalized as Currency;
  }

  throw new Error(`stripe_currency_unsupported:${normalized}`);
};

const mapStripeWebhookType = ({
  type,
  payload,
}: {
  type: string;
  payload: Record<string, unknown>;
}): ProviderWebhookEvent["type"] => {
  switch (type) {
    case "payment_intent.succeeded":
      return "payment_intent.succeeded";
    case "payment_intent.processing":
      return "payment_intent.processing";
    case "payment_intent.payment_failed":
      return "payment_intent.failed";
    case "charge.captured": {
      const capturedMinor = Number(payload.amount_captured);
      const authorizedMinor = Number(payload.amount);

      if (
        Number.isFinite(capturedMinor) &&
        Number.isFinite(authorizedMinor) &&
        capturedMinor >= authorizedMinor
      ) {
        return "payment_intent.succeeded";
      }

      return "payment_intent.partially_captured";
    }
    case "invoice.payment_succeeded":
    case "invoice.paid":
      return "invoice.paid";
    case "invoice.payment_failed":
      return "invoice.payment_failed";
    case "customer.subscription.updated":
      return "subscription.updated";
    case "customer.subscription.deleted":
      return "subscription.cancelled";
    case "customer.subscription.created":
    case "subscription_schedule.created":
    case "subscription_schedule.updated":
    case "subscription_schedule.released":
    case "subscription_schedule.canceled":
      return "subscription.updated";
    case "charge.refunded":
    case "refund.updated":
    case "refund.created":
      return "refund.succeeded";
    case "refund.failed":
    case "charge.refund.updated":
      return "refund.failed";
    case "refund.canceled":
      return "refund.failed";
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
      return "chargeback.created";
    case "charge.dispute.funds_reinstated":
    case "charge.dispute.closed":
    case "charge.dispute.updated":
      return "chargeback.updated";
    case "checkout.session.completed":
      return "checkout.completed";
    default:
      return "unknown";
  }
};

const isStripeTimeoutError = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message || error || "")
    .trim()
    .toLowerCase();
  const code = String((error as { code?: unknown })?.code || "")
    .trim()
    .toLowerCase();
  const type = String((error as { type?: unknown })?.type || "")
    .trim()
    .toLowerCase();

  return (
    code.includes("etimedout") ||
    code.includes("timeout") ||
    type.includes("stripeconnectionerror") ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
};

const withStripeTimeoutRetry = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    if (!isStripeTimeoutError(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    try {
      return await operation();
    } catch (retryError) {
      if (isStripeTimeoutError(retryError)) {
        throw new Error("provider_timeout");
      }

      throw retryError;
    }
  }
};

const getHeaderValue = (
  headers: Record<string, unknown> | null | undefined,
  key: string
) => {
  if (!headers) {
    return null;
  }

  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() !== key.toLowerCase()) {
      continue;
    }

    if (Array.isArray(value)) {
      return String(value[0] || "").trim() || null;
    }

    return String(value || "").trim() || null;
  }

  return null;
};

const parseRawStripeEventBody = (body: unknown) => {
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8")) as Stripe.Event;
    } catch {
      throw new Error("stripe_webhook_payload_invalid_json");
    }
  }

  if (body && typeof body === "object") {
    return body as Stripe.Event;
  }

  throw new Error("stripe_webhook_payload_invalid");
};

const getFirstRefundId = (raw: Record<string, unknown>) => {
  const refunds = toRecord(raw.refunds);
  const data = Array.isArray(refunds.data) ? refunds.data : [];
  const first = data[0];

  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return null;
  }

  return String((first as Record<string, unknown>).id || "").trim() || null;
};

const getKnownPlanCode = (value: unknown): PlanType | null => {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "BASIC" || normalized === "PRO" || normalized === "ELITE") {
    return normalized;
  }

  return null;
};

const getBillingInterval = (value: unknown): BillingInterval =>
  String(value || "").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";

const getDiscountsFromMetadata = (
  metadata: Record<string, unknown>
): Stripe.Checkout.SessionCreateParams.Discount[] | undefined => {
  const promotionCode = String(metadata.promotionCodeId || metadata.promotionCode || "").trim();
  const coupon = String(metadata.couponId || metadata.coupon || "").trim();

  if (promotionCode && promotionCode.startsWith("promo_")) {
    return [{ promotion_code: promotionCode }];
  }

  if (coupon && coupon.startsWith("coupon_")) {
    return [{ coupon }];
  }

  return undefined;
};

const resolveRefundPaymentIntentId = async (paymentIntentId: string) => {
  const normalized = String(paymentIntentId || "").trim();

  if (!normalized) {
    throw new Error("stripe_refund_payment_intent_missing");
  }

  if (!normalized.startsWith("cs_")) {
    return normalized;
  }

  const session = await stripe.checkout.sessions.retrieve(normalized);
  const resolved = String(session.payment_intent || "").trim();

  if (!resolved) {
    throw new Error("stripe_refund_payment_intent_unresolved");
  }

  return resolved;
};

export const stripeCommerceProvider: CommerceProviderAdapter = {
  provider: "STRIPE",

  createCheckout: async (input: ProviderCheckoutRequest) => {
    assertStripeConfigReady({
      requireWebhookSecret: true,
    });

    const metadata = toRecord(input.metadata);
    const checkoutType = String(metadata.checkoutType || "subscription")
      .trim()
      .toLowerCase();
    const subscriptionMode = CHECKOUT_SUBSCRIPTION_TYPES.has(checkoutType);
    const quantity = clampQuantity(metadata.quantity);
    const currency = normalizeCheckoutCurrency(input.currency);
    const planCode = getKnownPlanCode(metadata.planCode);
    const billingCycle = getBillingInterval(metadata.billingCycle);
    const early = Boolean(metadata.earlyAccess || metadata.early);
    const trialDays = Math.max(0, Math.floor(Number(metadata.trialDays || 0)));
    const customerId = String(
      metadata.customerId || metadata.stripeCustomerId || ""
    ).trim();
    const discounts = getDiscountsFromMetadata(metadata);

    let paymentQuantity = quantity;
    let paymentUnitAmount = Math.max(
      0,
      Math.floor(Number(metadata.unitPriceMinor || input.amountMinor || 0))
    );

    if (paymentUnitAmount * paymentQuantity !== input.amountMinor) {
      paymentQuantity = 1;
      paymentUnitAmount = Math.max(0, Math.floor(input.amountMinor));
    }

    const sessionMetadata: Record<string, string> = {
      businessId: String(input.businessId || "").trim(),
      paymentIntentKey: String(input.paymentIntentKey || "").trim(),
      checkoutType,
      planCode: planCode || "",
      billingCycle,
      quantity: String(quantity),
      proposalKey: String(metadata.proposalKey || ""),
      providerSubscriptionId: String(metadata.providerSubscriptionId || ""),
    };

    const sessionPayload: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ["card"],
      metadata: sessionMetadata,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      success_url:
        input.successUrl ||
        `${env.FRONTEND_URL}/billing/success?payment_intent_key=${input.paymentIntentKey}`,
      cancel_url:
        input.cancelUrl ||
        `${env.FRONTEND_URL}/billing/cancel?payment_intent_key=${input.paymentIntentKey}`,
    };

    if (discounts?.length) {
      sessionPayload.discounts = discounts;
    }

    if (subscriptionMode) {
      const mappedPriceId =
        planCode &&
        getStripePriceId({
          plan: planCode,
          currency: currency as PricingCurrency,
          billing: billingCycle,
          early,
        });

      if (!mappedPriceId) {
        throw new Error(
          `stripe_price_mapping_missing:${planCode || "UNKNOWN"}:${currency}:${billingCycle}:${early ? "early" : "standard"}`
        );
      }

      sessionPayload.mode = "subscription";
      sessionPayload.line_items = [
        {
          price: mappedPriceId,
          quantity,
        },
      ];
      sessionPayload.subscription_data = {
        metadata: sessionMetadata,
        trial_period_days: trialDays > 0 ? trialDays : undefined,
      };
      if (customerId) {
        sessionPayload.customer = customerId;
      }
    } else {
      sessionPayload.mode = "payment";
      sessionPayload.customer_creation = "always";
      sessionPayload.line_items = [
        {
          quantity: paymentQuantity,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: paymentUnitAmount,
            product_data: {
              name: input.description,
            },
          },
        },
      ];
      if (customerId) {
        sessionPayload.customer = customerId;
      }
    }

    const checkoutIdempotencyKey = `checkout:${input.paymentIntentKey}`;
    const session = await withStripeTimeoutRetry(() =>
      stripe.checkout.sessions.create(sessionPayload, {
        idempotencyKey: checkoutIdempotencyKey,
      })
    );

    return {
      provider: "STRIPE",
      providerPaymentIntentId: session.id,
      checkoutUrl: session.url,
      status: "REQUIRES_ACTION",
      expiresAt:
        typeof session.expires_at === "number"
          ? new Date(session.expires_at * 1000)
          : null,
      metadata: {
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
        stripeSubscriptionId:
          typeof session.subscription === "string" ? session.subscription : null,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : customerId || null,
        checkoutType,
        mode: session.mode || null,
      },
    };
  },

  createRefund: async ({
    paymentIntentId,
    amountMinor,
    reason,
  }) => {
    assertStripeConfigReady();

    const resolvedPaymentIntentId = await resolveRefundPaymentIntentId(paymentIntentId);
    const refundIdempotencyKey = `refund:${resolvedPaymentIntentId}:${Math.max(
      0,
      Math.floor(amountMinor)
    )}:${String(reason || "").trim().toLowerCase() || "generic"}`;
    const refund = await withStripeTimeoutRetry(() =>
      stripe.refunds.create(
        {
          payment_intent: resolvedPaymentIntentId,
          amount: Math.max(0, Math.floor(amountMinor)),
          reason:
            reason === "duplicate"
              ? "duplicate"
              : reason === "fraudulent"
              ? "fraudulent"
              : reason === "requested_by_customer"
              ? "requested_by_customer"
              : undefined,
        },
        {
          idempotencyKey: refundIdempotencyKey,
        }
      )
    );

    return {
      provider: "STRIPE",
      providerRefundId: refund.id,
      status: normalizeStripeRefundStatus(refund.status),
      metadata: {
        rawStatus: refund.status,
        resolvedPaymentIntentId,
      },
    };
  },

  parseWebhook: async ({ headers, body }) => {
    const signature = getHeaderValue(headers, "stripe-signature");
    const manualReconcileHeader = String(
      getHeaderValue(headers, "x-commerce-manual-reconcile") || ""
    )
      .trim()
      .toLowerCase();
    const allowManualUnsigned =
      manualReconcileHeader === "1" || manualReconcileHeader === "true";
    const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || "").trim();

    let event: Stripe.Event;

    if (Buffer.isBuffer(body)) {
      assertStripeConfigReady({
        requireWebhookSecret: true,
      });

      if (!signature) {
        throw new Error("stripe_webhook_signature_missing");
      }

      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      assertStripeConfigReady();

      if (!allowManualUnsigned) {
        throw new Error("stripe_webhook_payload_raw_required_for_signature");
      }

      event = parseRawStripeEventBody(body);
    }

    const raw = toRecord(event?.data?.object || body);
    const rawMetadata = toRecord(raw.metadata);
    const stripeType = String(event?.type || "unknown");
    const type = mapStripeWebhookType({
      type: stripeType,
      payload: raw,
    });
    const isCheckoutSession = stripeType.startsWith("checkout.session.");
    const isSubscriptionEvent = stripeType.startsWith("customer.subscription.");
    const isInvoiceEvent = stripeType.startsWith("invoice.");
    const isRefundEvent = stripeType.startsWith("refund.") || stripeType === "charge.refunded";
    const isDisputeEvent = stripeType.startsWith("charge.dispute.");
    const isPaymentIntentEvent = stripeType.startsWith("payment_intent.");
    const isChargeEvent = stripeType.startsWith("charge.");
    const invoiceLines = Array.isArray(toRecord(raw.lines).data)
      ? (toRecord(raw.lines).data as Array<Record<string, unknown>>)
      : [];
    const subscriptionItems = Array.isArray(toRecord(raw.items).data)
      ? (toRecord(raw.items).data as Array<Record<string, unknown>>)
      : [];
    const firstPriceId =
      String(toRecord(toRecord(subscriptionItems[0]).price).id || "").trim() || null;
    const prorationMinor = invoiceLines.reduce((sum, line) => {
      if (!Boolean(line.proration)) {
        return sum;
      }
      const amount = Number(line.amount);
      if (!Number.isFinite(amount)) {
        return sum;
      }
      return sum + Math.max(0, Math.floor(amount));
    }, 0);
    const invoiceTotalMinor =
      Number.isFinite(Number(raw.total))
        ? Math.max(0, Math.floor(Number(raw.total)))
        : extractAmountMinor(raw);
    const invoiceTaxMinor = extractInvoiceTaxMinor(raw);
    const invoiceSubtotalMinor =
      invoiceTotalMinor === null ? null : Math.max(0, invoiceTotalMinor - invoiceTaxMinor);
    const providerCaseId = isDisputeEvent
      ? String(raw.id || "").trim() || null
      : null;
    const providerChargeId = isDisputeEvent
      ? String(raw.charge || "").trim() || null
      : isChargeEvent
      ? String(raw.id || "").trim() || null
      : null;

    const providerPaymentIntentId =
      String(
        (isPaymentIntentEvent
          ? raw.id
          : isCheckoutSession
          ? raw.payment_intent || raw.id
          : isInvoiceEvent
          ? raw.payment_intent
          : isRefundEvent
          ? raw.payment_intent
          : isDisputeEvent
          ? raw.payment_intent
          : isChargeEvent
          ? raw.payment_intent
          : raw.payment_intent) ||
          raw.payment_intent_id ||
          raw.checkout_session_id ||
          raw.session_id ||
          ""
      ).trim() || null;

    const providerSubscriptionId =
      String(
        (isSubscriptionEvent ? raw.id : raw.subscription || toRecord(raw.subscription).id) || ""
      ).trim() || null;
    const providerInvoiceId =
      String((isInvoiceEvent ? raw.id : raw.invoice || toRecord(raw.invoice).id) || "").trim() ||
      null;
    const providerRefundId =
      String(
        (stripeType.startsWith("refund.") ? raw.id : raw.refund || toRecord(raw.refund).id) || ""
      ).trim() ||
      getFirstRefundId(raw) ||
      null;

    const providerVersion = `${String(event?.created || Math.floor(Date.now() / 1000)).trim()}:${String(
      event?.id || raw.id || "unknown_event"
    ).trim()}`;
    const currency = normalizeWebhookCurrency(String(raw.currency || ""));
    const subscriptionQuantity = extractSubscriptionQuantity(raw);

    return {
      provider: "STRIPE",
      providerEventId:
        String(event?.id || raw.eventId || raw.id || "").trim() || "stripe_unknown_event",
      type,
      occurredAt:
        typeof event?.created === "number"
          ? new Date(event.created * 1000)
          : new Date(),
      providerPaymentIntentId,
      providerRefundId,
      providerSubscriptionId,
      providerInvoiceId,
      amountMinor: extractAmountMinor(raw),
      currency,
      metadata: {
        stripeType: event?.type || null,
        stripeSessionId: isCheckoutSession ? String(raw.id || "").trim() || null : null,
        stripeCustomerId: String(raw.customer || "").trim() || null,
        providerVersion,
        providerCaseId,
        providerChargeId,
        billingReason: String(raw.billing_reason || "").trim() || null,
        subscriptionStatus: String(raw.status || "").trim() || null,
        subscriptionQuantity,
        subscriptionPlanCode:
          String(rawMetadata.planCode || "").trim().toUpperCase() || null,
        subscriptionPriceId: firstPriceId,
        subscriptionCurrentPeriodStart:
          Number.isFinite(Number(raw.current_period_start)) &&
          Number(raw.current_period_start) > 0
            ? new Date(Number(raw.current_period_start) * 1000).toISOString()
            : null,
        subscriptionCurrentPeriodEnd:
          Number.isFinite(Number(raw.current_period_end)) &&
          Number(raw.current_period_end) > 0
            ? new Date(Number(raw.current_period_end) * 1000).toISOString()
            : null,
        subscriptionCancelAt:
          Number.isFinite(Number(raw.cancel_at)) && Number(raw.cancel_at) > 0
            ? new Date(Number(raw.cancel_at) * 1000).toISOString()
            : null,
        subscriptionCancelAtPeriodEnd: Boolean(raw.cancel_at_period_end),
        subscriptionTrialEndsAt:
          Number.isFinite(Number(raw.trial_end)) && Number(raw.trial_end) > 0
            ? new Date(Number(raw.trial_end) * 1000).toISOString()
            : null,
        invoiceSubtotalMinor,
        invoiceTaxMinor,
        invoiceTotalMinor,
        invoiceProrationMinor: prorationMinor > 0 ? prorationMinor : 0,
        invoiceProrationDetected: prorationMinor > 0,
        paymentIntentKey: String(rawMetadata.paymentIntentKey || "").trim() || null,
      },
      rawPayload: raw,
    };
  },
};
