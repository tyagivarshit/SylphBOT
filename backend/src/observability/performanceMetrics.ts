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
  | "retrieval_ms"
  | "embedding_ms"
  | "candidate_count"
  | "scoring_count"
  | "retrieval_cache_hit"
  | "retrieval_budget_exceeded"
  | "retrieval_degraded"
  | "embedding_compute_ms"
  | "embedding_queue_wait_ms"
  | "embedding_cache_hit"
  | "embedding_inflight_deduped"
  | "embedding_budget_exceeded"
  | "embedding_concurrency"
  | "embedding_cold_start_ms"
  | "embedding_degraded"
  | "queue_wait_ms"
  | "queue_backlog_by_partition"
  | "partition_concurrency"
  | "lightweight_vs_heavy_latency"
  | "retry_amplification"
  | "partition_saturation"
  | "worker_utilization"
  | "queue_degraded"
  | "auth_ms"
  | "auth_bootstrap_ms"
  | "auth_stabilization_ms"
  | "auth_inflight_reused"
  | "auth_duplicate_login_blocked"
  | "auth_processing_state"
  | "auth_timeout_recovered"
  | "auth_session_ready"
  | "auth_parallel_me_collapsed"
  | "auth_terminal_failure"
  | "billing_context_ms"
  | "pricing_ms"
  | "proposal_ms"
  | "payment_intent_ms"
  | "credential_resolve_ms"
  | "stripe_checkout_ms"
  | "webhook_ms"
  | "webhook_ingest_ms"
  | "enqueue_ms"
  | "webhook_post_response_work"
  | "webhook_runtime_budget_exceeded"
  | "webhook_queue_wait_ms"
  | "webhook_burst_saturation"
  | "webhook_deduped"
  | "webhook_degraded"
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
