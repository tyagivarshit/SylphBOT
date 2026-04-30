import { Currency } from "@prisma/client";
import { buildDeterministicDigest } from "../shared";
import type {
  CommerceProviderAdapter,
  ProviderCheckoutRequest,
  ProviderWebhookEvent,
} from "./commerceProvider.types";

const normalizeCurrency = (value?: string | null): Currency =>
  String(value || "USD").trim().toUpperCase() === "INR" ? "INR" : "USD";

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mapType = (value: string): ProviderWebhookEvent["type"] => {
  const normalized = value.trim().toUpperCase();

  if (normalized === "PAYMENT.CAPTURE.COMPLETED") return "payment_intent.succeeded";
  if (normalized === "PAYMENT.CAPTURE.DENIED") return "payment_intent.failed";
  if (normalized === "BILLING.SUBSCRIPTION.RENEWED") return "subscription.renewed";
  if (normalized === "BILLING.SUBSCRIPTION.CANCELLED") return "subscription.cancelled";
  if (normalized === "PAYMENT.SALE.REFUNDED") return "refund.succeeded";
  if (normalized === "CUSTOMER.DISPUTE.CREATED") return "chargeback.created";
  if (normalized === "CUSTOMER.DISPUTE.RESOLVED") return "chargeback.updated";

  return "unknown";
};

export const paypalCommerceProvider: CommerceProviderAdapter = {
  provider: "PAYPAL",

  createCheckout: async (input: ProviderCheckoutRequest) => {
    const digest = buildDeterministicDigest({
      paymentIntentKey: input.paymentIntentKey,
      amountMinor: input.amountMinor,
      currency: input.currency,
      provider: "PAYPAL",
    }).slice(0, 20);

    return {
      provider: "PAYPAL",
      providerPaymentIntentId: `pp_order_${digest}`,
      checkoutUrl:
        input.successUrl ||
        `https://www.paypal.com/checkoutnow?token=${input.paymentIntentKey}`,
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
      provider: "PAYPAL",
      providerRefundId: `pp_refund_${digest}`,
      status: "PROCESSING",
      metadata: {
        mode: "adapter_boundary_stub",
      },
    };
  },

  parseWebhook: async ({ body }) => {
    const payload = toRecord(body);
    const resource = toRecord(payload.resource);
    const amount = toRecord(resource.amount);
    const supplementaryData = toRecord(resource.supplementary_data);
    const relatedIds = toRecord(supplementaryData.related_ids);
    const eventType = String(payload.event_type || payload.type || "unknown");

    return {
      provider: "PAYPAL",
      providerEventId:
        String(payload.id || resource.id || buildDeterministicDigest(payload).slice(0, 14)).trim() ||
        "pp_unknown_event",
      type: mapType(eventType),
      occurredAt: payload.create_time ? new Date(String(payload.create_time)) : new Date(),
      providerPaymentIntentId:
        String(resource.id || relatedIds.order_id || "").trim() || null,
      providerRefundId: String(resource.sale_id || resource.id || "").trim() || null,
      providerSubscriptionId: String(resource.id || resource.billing_agreement_id || "").trim() || null,
      providerInvoiceId: String(resource.invoice_id || "").trim() || null,
      amountMinor:
        Number.isFinite(Number(amount.value))
          ? Math.round(Number(amount.value) * 100)
          : null,
      currency: normalizeCurrency(String(amount.currency_code || "USD")),
      metadata: {
        eventType,
      },
      rawPayload: payload,
    };
  },
};
