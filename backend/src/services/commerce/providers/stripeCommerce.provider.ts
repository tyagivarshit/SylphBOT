import { Currency, RefundStatus } from "@prisma/client";
import Stripe from "stripe";
import { env } from "../../../config/env";
import { stripe } from "../../stripe.service";
import type {
  CommerceProviderAdapter,
  ProviderCheckoutRequest,
  ProviderWebhookEvent,
} from "./commerceProvider.types";

const normalizeCurrency = (value?: string | null): Currency =>
  String(value || "INR").trim().toUpperCase() === "USD" ? "USD" : "INR";

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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

const mapStripeWebhookType = (type: string): ProviderWebhookEvent["type"] => {
  switch (type) {
    case "payment_intent.succeeded":
      return "payment_intent.succeeded";
    case "payment_intent.processing":
      return "payment_intent.processing";
    case "payment_intent.payment_failed":
      return "payment_intent.failed";
    case "charge.captured":
      return "payment_intent.partially_captured";
    case "invoice.payment_succeeded":
      return "invoice.paid";
    case "invoice.payment_failed":
      return "invoice.payment_failed";
    case "customer.subscription.updated":
      return "subscription.updated";
    case "customer.subscription.deleted":
      return "subscription.cancelled";
    case "customer.subscription.created":
    case "invoice.paid":
      return "subscription.renewed";
    case "charge.refunded":
      return "refund.succeeded";
    case "refund.failed":
      return "refund.failed";
    case "charge.dispute.created":
      return "chargeback.created";
    case "charge.dispute.closed":
      return "chargeback.updated";
    case "checkout.session.completed":
      return "checkout.completed";
    default:
      return "unknown";
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

export const stripeCommerceProvider: CommerceProviderAdapter = {
  provider: "STRIPE",

  createCheckout: async (input: ProviderCheckoutRequest) => {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: Math.max(0, Math.floor(input.amountMinor)),
            product_data: {
              name: input.description,
            },
          },
        },
      ],
      metadata: {
        businessId: input.businessId,
        paymentIntentKey: input.paymentIntentKey,
      },
      success_url:
        input.successUrl || `${env.FRONTEND_URL}/billing/success?payment_intent_key=${input.paymentIntentKey}`,
      cancel_url:
        input.cancelUrl || `${env.FRONTEND_URL}/billing/cancel?payment_intent_key=${input.paymentIntentKey}`,
    });

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
      },
    };
  },

  createRefund: async ({
    paymentIntentId,
    amountMinor,
    reason,
  }) => {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: Math.max(0, Math.floor(amountMinor)),
      reason:
        reason === "duplicate"
          ? "duplicate"
          : reason === "fraudulent"
          ? "fraudulent"
          : reason === "requested_by_customer"
          ? "requested_by_customer"
          : undefined,
    });

    return {
      provider: "STRIPE",
      providerRefundId: refund.id,
      status: normalizeStripeRefundStatus(refund.status),
      metadata: {
        rawStatus: refund.status,
      },
    };
  },

  parseWebhook: async ({ headers, body }) => {
    const signature = getHeaderValue(headers, "stripe-signature");
    const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || "").trim();

    let event: Stripe.Event;

    if (Buffer.isBuffer(body)) {
      if (!webhookSecret) {
        throw new Error("stripe_webhook_secret_missing");
      }

      if (!signature) {
        throw new Error("stripe_webhook_signature_missing");
      }

      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      event = parseRawStripeEventBody(body);
    }

    const raw = toRecord(event?.data?.object || body);
    const stripeType = String(event?.type || "unknown");
    let type = mapStripeWebhookType(stripeType);

    if (stripeType === "checkout.session.completed") {
      const paymentStatus = String(raw.payment_status || "").trim().toLowerCase();
      if (paymentStatus === "paid") {
        type = "payment_intent.succeeded";
      }
    }

    const isCheckoutSession = stripeType.startsWith("checkout.session.");

    const providerPaymentIntentId =
      String(
        (isCheckoutSession ? raw.id : raw.payment_intent) ||
          raw.payment_intent ||
          raw.id ||
          raw.session_id ||
          raw.checkout_session_id ||
          ""
      ).trim() || null;

    const providerSubscriptionId =
      String(raw.subscription || raw.id || "").trim() || null;
    const providerInvoiceId = String(raw.invoice || raw.id || "").trim() || null;
    const providerRefundId = String(raw.refund || raw.id || "").trim() || null;

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
      currency: normalizeCurrency(String(raw.currency || "INR")),
      metadata: {
        stripeType: event?.type || null,
      },
      rawPayload: raw,
    };
  },
};
