import { recordObservabilityEvent } from "../services/reliability/reliabilityOS.service";

export type PerformanceMetricName =
  | "APP_BOOT_MS"
  | "AUTH_MS"
  | "API_MS"
  | "CACHE_HIT"
  | "CACHE_MISS"
  | "DB_SLOW"
  | "PROJECTION_MS"
  | "TIMEOUT_PREVENTED";

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

