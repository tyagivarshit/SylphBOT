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

const createCheckout = async (
  input: ProviderCheckoutRequest
) => {
  const digest = buildDeterministicDigest({
    businessId: input.businessId,
    paymentIntentKey: input.paymentIntentKey,
    amountMinor: input.amountMinor,
    currency: input.currency,
  }).slice(0, 20);

  return {
    provider: "INTERNAL" as const,
    providerPaymentIntentId: `internal_pi_${digest}`,
    checkoutUrl:
      input.successUrl ||
      `https://checkout.automexia.internal/${input.paymentIntentKey}`,
    status: "REQUIRES_ACTION" as const,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    metadata: {
      digest,
      mode: "internal_deterministic",
    },
  };
};

const createRefund = async ({ paymentIntentId }: { paymentIntentId: string }) => {
  const digest = buildDeterministicDigest(paymentIntentId).slice(0, 18);

  return {
    provider: "INTERNAL" as const,
    providerRefundId: `internal_rf_${digest}`,
    status: "SUCCEEDED" as const,
    metadata: {
      settledBy: "internal_mock",
    },
  };
};

const parseWebhook = async ({
  body,
}: {
  headers?: Record<string, unknown> | null;
  body: unknown;
}): Promise<ProviderWebhookEvent> => {
  const payload = toRecord(body);
  const type = String(payload.type || "unknown").trim();

  return {
    provider: "INTERNAL",
    providerEventId: String(payload.eventId || payload.id || buildDeterministicDigest(payload).slice(0, 16)),
    type: (type as ProviderWebhookEvent["type"]) || "unknown",
    occurredAt: payload.occurredAt ? new Date(String(payload.occurredAt)) : new Date(),
    providerPaymentIntentId:
      String(payload.providerPaymentIntentId || payload.paymentIntentId || "").trim() || null,
    providerRefundId:
      String(payload.providerRefundId || payload.refundId || "").trim() || null,
    providerSubscriptionId:
      String(payload.providerSubscriptionId || payload.subscriptionId || "").trim() || null,
    providerInvoiceId:
      String(payload.providerInvoiceId || payload.invoiceId || "").trim() || null,
    amountMinor:
      Number.isFinite(Number(payload.amountMinor)) ? Number(payload.amountMinor) : null,
    currency: normalizeCurrency(String(payload.currency || "INR")),
    metadata: {
      ...payload,
      parsedBy: "internal",
    },
    rawPayload: payload,
  };
};

export const internalCommerceProvider: CommerceProviderAdapter = {
  provider: "INTERNAL",
  createCheckout,
  createRefund,
  parseWebhook,
};
