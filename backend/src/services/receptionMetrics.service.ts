type CounterName =
  | "inbound_received_total"
  | "normalized_total"
  | "classified_total"
  | "routed_total"
  | "revenue_routed_total"
  | "support_routed_total"
  | "spam_detected_total"
  | "sla_warning_total"
  | "sla_breach_total"
  | "resolved_total"
  | "reopened_total";

type DurationName = "avg_first_response_time" | "avg_resolution_time";

type ReceptionMetricsState = {
  counters: Record<CounterName, number>;
  queueDepthByType: Record<string, number>;
  durations: Record<DurationName, { totalMs: number; count: number }>;
};

const buildEmptyState = (): ReceptionMetricsState => ({
  counters: {
    inbound_received_total: 0,
    normalized_total: 0,
    classified_total: 0,
    routed_total: 0,
    revenue_routed_total: 0,
    support_routed_total: 0,
    spam_detected_total: 0,
    sla_warning_total: 0,
    sla_breach_total: 0,
    resolved_total: 0,
    reopened_total: 0,
  },
  queueDepthByType: {},
  durations: {
    avg_first_response_time: {
      totalMs: 0,
      count: 0,
    },
    avg_resolution_time: {
      totalMs: 0,
      count: 0,
    },
  },
});

const globalForReceptionMetrics = globalThis as typeof globalThis & {
  __sylphReceptionMetrics?: ReceptionMetricsState;
};

const getMetricsState = () => {
  if (!globalForReceptionMetrics.__sylphReceptionMetrics) {
    globalForReceptionMetrics.__sylphReceptionMetrics = buildEmptyState();
  }

  return globalForReceptionMetrics.__sylphReceptionMetrics;
};

export const incrementReceptionMetric = (
  name: CounterName,
  amount = 1
) => {
  const state = getMetricsState();
  state.counters[name] += Math.max(0, amount);
  return state.counters[name];
};

export const observeReceptionDuration = (
  name: DurationName,
  durationMs: number
) => {
  const state = getMetricsState();
  const bucket = state.durations[name];

  bucket.totalMs += Math.max(0, durationMs);
  bucket.count += 1;

  return bucket;
};

export const setReceptionQueueDepth = (queueType: string, depth: number) => {
  const state = getMetricsState();
  const normalizedQueueType = String(queueType || "UNKNOWN").trim() || "UNKNOWN";
  state.queueDepthByType[normalizedQueueType] = Math.max(0, Math.floor(depth));
  return state.queueDepthByType[normalizedQueueType];
};

export const getReceptionMetricsSnapshot = () => {
  const state = getMetricsState();

  return {
    ...state.counters,
    queue_depth_by_type: {
      ...state.queueDepthByType,
    },
    avg_first_response_time:
      state.durations.avg_first_response_time.count > 0
        ? state.durations.avg_first_response_time.totalMs /
          state.durations.avg_first_response_time.count
        : 0,
    avg_resolution_time:
      state.durations.avg_resolution_time.count > 0
        ? state.durations.avg_resolution_time.totalMs /
          state.durations.avg_resolution_time.count
        : 0,
  };
};

export const resetReceptionMetrics = () => {
  globalForReceptionMetrics.__sylphReceptionMetrics = buildEmptyState();
};
