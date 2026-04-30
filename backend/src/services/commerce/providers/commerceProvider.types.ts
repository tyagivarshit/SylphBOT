import { CommerceProvider, Currency, PaymentIntentStatus, RefundStatus } from "@prisma/client";

export type ProviderCheckoutRequest = {
  businessId: string;
  paymentIntentKey: string;
  amountMinor: number;
  currency: Currency;
  description: string;
  successUrl?: string | null;
  cancelUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderCheckoutResponse = {
  provider: CommerceProvider;
  providerPaymentIntentId: string;
  checkoutUrl: string | null;
  status: PaymentIntentStatus;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
};

export type ProviderRefundRequest = {
  paymentIntentId: string;
  amountMinor: number;
  currency: Currency;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderRefundResponse = {
  provider: CommerceProvider;
  providerRefundId: string;
  status: RefundStatus;
  metadata?: Record<string, unknown>;
};

export type ProviderWebhookEvent = {
  provider: CommerceProvider;
  providerEventId: string;
  type:
    | "payment_intent.succeeded"
    | "payment_intent.processing"
    | "payment_intent.failed"
    | "payment_intent.partially_captured"
    | "invoice.paid"
    | "invoice.payment_failed"
    | "subscription.renewed"
    | "subscription.updated"
    | "subscription.cancelled"
    | "refund.succeeded"
    | "refund.failed"
    | "chargeback.created"
    | "chargeback.updated"
    | "checkout.completed"
    | "unknown";
  occurredAt: Date;
  providerPaymentIntentId?: string | null;
  providerRefundId?: string | null;
  providerSubscriptionId?: string | null;
  providerInvoiceId?: string | null;
  amountMinor?: number | null;
  currency?: Currency | null;
  metadata?: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
};

export type CommerceProviderAdapter = {
  provider: CommerceProvider;
  createCheckout: (
    input: ProviderCheckoutRequest
  ) => Promise<ProviderCheckoutResponse>;
  createRefund: (
    input: ProviderRefundRequest
  ) => Promise<ProviderRefundResponse>;
  parseWebhook: (input: {
    headers?: Record<string, unknown> | null;
    body: unknown;
  }) => Promise<ProviderWebhookEvent>;
};
