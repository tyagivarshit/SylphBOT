import { Currency } from "@prisma/client";
import { buildDeterministicDigest } from "../shared";
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

const mapType = (value: string): ProviderWebhookEvent["type"] => {
  const normalized = value.trim().toLowerCase();

  if (normalized === "payment.captured") return "payment_intent.succeeded";
  if (normalized === "payment.failed") return "payment_intent.failed";
  if (normalized === "payment.authorized") return "payment_intent.processing";
  if (normalized === "subscription.charged") return "subscription.renewed";
  if (normalized === "subscription.cancelled") return "subscription.cancelled";
  if (normalized === "refund.processed") return "refund.succeeded";
  if (normalized === "refund.failed") return "refund.failed";
  if (normalized === "dispute.created") return "chargeback.created";
  if (normalized === "dispute.closed") return "chargeback.updated";

  return "unknown";
};

export const razorpayCommerceProvider: CommerceProviderAdapter = {
  provider: "RAZORPAY",

  createCheckout: async (input: ProviderCheckoutRequest) => {
    const digest = buildDeterministicDigest({
      paymentIntentKey: input.paymentIntentKey,
      amountMinor: input.amountMinor,
      currency: input.currency,
      provider: "RAZORPAY",
    }).slice(0, 20);

    return {
      provider: "RAZORPAY",
      providerPaymentIntentId: `rzp_order_${digest}`,
      checkoutUrl:
        input.successUrl ||
        `https://checkout.razorpay.com/v1/checkout?reference=${input.paymentIntentKey}`,
      status: "REQUIRES_ACTION",
      expiresAt: new Date(Date.now() + 20 * 60_000),
      metadata: {
        mode: "adapter_boundary_stub",
      },
    };
  },

  createRefund: async ({ paymentIntentId }) => {
    const digest = buildDeterministicDigest(paymentIntentId).slice(0, 16);

    return {
      provider: "RAZORPAY",
      providerRefundId: `rzp_refund_${digest}`,
      status: "PROCESSING",
      metadata: {
        mode: "adapter_boundary_stub",
      },
    };
  },

  parseWebhook: async ({ body }) => {
    const payload = toRecord(body);
    const event = toRecord(payload.event ? payload : payload.payload);
    const eventType = String(payload.event || payload.type || "unknown");

    return {
      provider: "RAZORPAY",
      providerEventId:
        String(payload.id || event.id || buildDeterministicDigest(payload).slice(0, 14)).trim() ||
        "rzp_unknown_event",
      type: mapType(eventType),
      occurredAt: new Date(),
      providerPaymentIntentId:
        String(event.payment_id || event.order_id || payload.payment_id || "").trim() || null,
      providerRefundId: String(event.refund_id || "").trim() || null,
      providerSubscriptionId:
        String(event.subscription_id || payload.subscription_id || "").trim() || null,
      providerInvoiceId: String(event.invoice_id || "").trim() || null,
      amountMinor: Number.isFinite(Number(event.amount)) ? Number(event.amount) : null,
      currency: normalizeCurrency(String(event.currency || payload.currency || "INR")),
      metadata: {
        eventType,
      },
      rawPayload: payload,
    };
  },
};
