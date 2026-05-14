import { recordObservabilityEvent } from "../services/reliability/reliabilityOS.service";

export type PerformanceMetricName =
  | "APP_BOOT_MS"
  | "AUTH_MS"
  | "API_MS"
  | "CACHE_HIT"
  | "CACHE_MISS"
  | "DB_SLOW"
  | "PROJECTION_MS"
  | "TIMEOUT_PREVENTED"
  | "projection_compute_ms"
  | "projection_cache_hit"
  | "projection_deduped"
  | "projection_cancelled"
  | "projection_budget_exceeded"
  | "auth_ms"
  | "billing_context_ms"
  | "pricing_ms"
  | "proposal_ms"
  | "payment_intent_ms"
  | "credential_resolve_ms"
  | "stripe_checkout_ms"
  | "webhook_ms"
  | "reconcile_ms"
  | "subscription_activation_ms"
  | "total_checkout_ms";

type EmitPerformanceMetricInput = {
  name: PerformanceMetricName;
  value?: number;
  businessId?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const emitPerformanceMetric = (input: EmitPerformanceMetricInput) => {
  const payload = {
    metric: input.name,
    value: Number.isFinite(Number(input.value)) ? Number(input.value) : null,
    businessId: input.businessId || null,
    route: input.route || null,
    metadata: input.metadata || null,
    recordedAt: new Date().toISOString(),
  };

  if (input.value !== undefined) {
    console.info(input.name, payload);
  } else {
    console.info(input.name, {
      ...payload,
      value: null,
    });
  }

  void recordObservabilityEvent({
    businessId: input.businessId || null,
    tenantId: input.businessId || null,
    eventType: input.name,
    message:
      input.value !== undefined
        ? `${input.name}:${Math.round(Number(input.value))}`
        : input.name,
    severity: "info",
    context: {
      component: "performance",
      phase: "runtime",
      tenantId: input.businessId || null,
    },
    metadata: payload,
  }).catch(() => undefined);
};
