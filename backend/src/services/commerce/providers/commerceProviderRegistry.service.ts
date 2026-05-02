import { CommerceProvider } from "@prisma/client";
import { normalizeProvider } from "../shared";
import { internalCommerceProvider } from "./internalCommerce.provider";
import { paypalCommerceProvider } from "./paypalCommerce.provider";
import { razorpayCommerceProvider } from "./razorpayCommerce.provider";
import { stripeCommerceProvider } from "./stripeCommerce.provider";
import type {
  CommerceProviderAdapter,
  ProviderWebhookEvent,
} from "./commerceProvider.types";

const providerMap: Record<CommerceProvider, CommerceProviderAdapter> = {
  STRIPE: stripeCommerceProvider,
  RAZORPAY: razorpayCommerceProvider,
  PAYPAL: paypalCommerceProvider,
  INTERNAL: internalCommerceProvider,
};

export const resolveCommerceProviderAdapter = (
  provider?: string | null
): CommerceProviderAdapter => {
  const normalized = normalizeProvider(provider);
  return providerMap[normalized] || providerMap.INTERNAL;
};

const inferProviderFromHeaders = (
  headers?: Record<string, unknown> | null
): CommerceProvider => {
  const normalizedHeaders = headers || {};
  const keys = Object.keys(normalizedHeaders).reduce<Record<string, unknown>>(
    (acc, key) => {
      acc[key.toLowerCase()] = normalizedHeaders[key];
      return acc;
    },
    {}
  );

  if (typeof keys["stripe-signature"] === "string") {
    return "STRIPE";
  }

  if (typeof keys["x-razorpay-signature"] === "string") {
    return "RAZORPAY";
  }

  if (typeof keys["paypal-transmission-id"] === "string") {
    return "PAYPAL";
  }

  const forced = String(keys["x-commerce-provider"] || "").trim();
  return normalizeProvider(forced);
};

const parseMaybeJsonBody = (body: unknown) => {
  if (!Buffer.isBuffer(body)) {
    return body;
  }

  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return body;
  }
};

export const parseCommerceProviderWebhook = async ({
  provider,
  headers,
  body,
}: {
  provider?: string | null;
  headers?: Record<string, unknown> | null;
  body: unknown;
}): Promise<ProviderWebhookEvent> => {
  const resolvedProvider = provider
    ? normalizeProvider(provider)
    : inferProviderFromHeaders(headers);
  const adapter = resolveCommerceProviderAdapter(resolvedProvider);
  return adapter.parseWebhook({
    headers,
    body:
      resolvedProvider === "STRIPE"
        ? body
        : parseMaybeJsonBody(body),
  });
};

export const commerceProviderRegistry = {
  resolve: resolveCommerceProviderAdapter,
  parseWebhook: parseCommerceProviderWebhook,
};
