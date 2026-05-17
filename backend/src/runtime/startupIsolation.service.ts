import os from "os";
import { monitorEventLoopDelay } from "perf_hooks";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { getRequestPriorityRuntimeSnapshot } from "../middleware/requestPriority.middleware";

type StartupBackgroundTaskStatus =
  | "scheduled"
  | "deferred"
  | "started"
  | "completed"
  | "failed";

type StartupBackgroundTaskState = {
  name: string;
  status: StartupBackgroundTaskStatus;
  attempts: number;
  scheduledAtIso: string | null;
  startedAtIso: string | null;
  completedAtIso: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  metadata: Record<string, unknown> | null;
};

const parsePositiveInt = (raw: string | undefined, fallbackValue: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.max(1, Math.floor(parsed));
};

const parsePositiveNumber = (raw: string | undefined, fallbackValue: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.max(0, parsed);
};

const STARTUP_WINDOW_MS = parsePositiveInt(
  process.env.STARTUP_WINDOW_MS,
  3 * 60 * 1000
);
const STARTUP_PRESSURE_SAMPLE_INTERVAL_MS = parsePositiveInt(
  process.env.STARTUP_PRESSURE_SAMPLE_INTERVAL_MS,
  2_000
);
const STARTUP_WARMUP_MAX_EVENT_LOOP_LAG_MS = parsePositiveNumber(
  process.env.STARTUP_WARMUP_MAX_EVENT_LOOP_LAG_MS,
  80
);
const STARTUP_WARMUP_MAX_CPU_PRESSURE_PERCENT = parsePositiveNumber(
  process.env.STARTUP_WARMUP_MAX_CPU_PRESSURE_PERCENT,
  80
);

const startupStartedAt = Date.now();
let appBootReadyAt: number | null = null;
let aiRuntimeReadyAt: number | null = null;

const startupEventLoopLagMonitor = monitorEventLoopDelay({
  resolution: 20,
});
startupEventLoopLagMonitor.enable();

let previousCpuUsage = process.cpuUsage();
let previousCpuSampleAt = Date.now();
let startupPressureProbe: NodeJS.Timeout | null = null;

const startupBackgroundTasks = new Map<string, StartupBackgroundTaskState>();

let lastPressureSample = {
  sampledAtIso: new Date().toISOString(),
  eventLoopLagMs: 0,
  cpuPressurePercent: 0,
};

const toIso = (timestamp: number | null) =>
  timestamp ? new Date(timestamp).toISOString() : null;

const normalizeErrorMessage = (error: unknown) =>
  String((error as { message?: unknown })?.message || error || "unknown_error");

const readEventLoopLagMs = () => {
  const meanNanoseconds = Number(startupEventLoopLagMonitor.mean || 0);
  if (!Number.isFinite(meanNanoseconds) || meanNanoseconds <= 0) {
    return 0;
  }
  return Number((meanNanoseconds / 1_000_000).toFixed(2));
};

const readCpuPressurePercent = () => {
  const now = Date.now();
  const elapsedMs = Math.max(1, now - previousCpuSampleAt);
  const deltaCpu = process.cpuUsage(previousCpuUsage);
  previousCpuUsage = process.cpuUsage();
  previousCpuSampleAt = now;
  const cores = Math.max(1, os.cpus().length);
  const microsUsed = Math.max(0, Number(deltaCpu.user || 0) + Number(deltaCpu.system || 0));
  const percent = (microsUsed / 1000 / (elapsedMs * cores)) * 100;

  return Number(Math.max(0, percent).toFixed(2));
};

const sampleStartupPressure = (source: string) => {
  const eventLoopLagMs = readEventLoopLagMs();
  const cpuPressurePercent = readCpuPressurePercent();
  lastPressureSample = {
    sampledAtIso: new Date().toISOString(),
    eventLoopLagMs,
    cpuPressurePercent,
  };

  emitPerformanceMetric({
    name: "startup_event_loop_lag",
    value: eventLoopLagMs,
    route: "startup_isolation",
    metadata: {
      source,
    },
  });
  emitPerformanceMetric({
    name: "startup_cpu_pressure",
    value: cpuPressurePercent,
    route: "startup_isolation",
    metadata: {
      source,
      cpuCores: os.cpus().length,
    },
  });

  return lastPressureSample;
};

const isStartupWindowExpired = () => Date.now() - startupStartedAt > STARTUP_WINDOW_MS;

const ensureStartupPressureProbe = () => {
  if (startupPressureProbe) {
    return;
  }

  startupPressureProbe = setInterval(() => {
    if (isStartupWindowExpired()) {
      if (startupPressureProbe) {
        clearInterval(startupPressureProbe);
        startupPressureProbe = null;
      }
      return;
    }

    sampleStartupPressure("interval");
  }, STARTUP_PRESSURE_SAMPLE_INTERVAL_MS);
  startupPressureProbe.unref();
};

ensureStartupPressureProbe();

const getOrCreateBackgroundTaskState = (name: string) => {
  const existing = startupBackgroundTasks.get(name);
  if (existing) {
    return existing;
  }

  const created: StartupBackgroundTaskState = {
    name,
    status: "scheduled",
    attempts: 0,
    scheduledAtIso: null,
    startedAtIso: null,
    completedAtIso: null,
    lastDurationMs: null,
    lastError: null,
    metadata: null,
  };
  startupBackgroundTasks.set(name, created);
  return created;
};

export const markAppBootReady = () => {
  if (appBootReadyAt) {
    return appBootReadyAt;
  }

  appBootReadyAt = Date.now();
  emitPerformanceMetric({
    name: "app_boot_ready_ms",
    value: appBootReadyAt - startupStartedAt,
    route: "startup_isolation",
    metadata: {
      startupWindowMs: STARTUP_WINDOW_MS,
    },
  });

  return appBootReadyAt;
};

export const markAiRuntimeReady = (metadata?: Record<string, unknown>) => {
  if (aiRuntimeReadyAt) {
    return aiRuntimeReadyAt;
  }

  aiRuntimeReadyAt = Date.now();
  emitPerformanceMetric({
    name: "ai_runtime_ready_ms",
    value: aiRuntimeReadyAt - startupStartedAt,
    route: "startup_isolation",
    metadata: metadata || null,
  });

  return aiRuntimeReadyAt;
};

export const markEmbeddingWarmupReady = (input: {
  warmupMs: number;
  metadata?: Record<string, unknown>;
}) => {
  emitPerformanceMetric({
    name: "embedding_warmup_ms",
    value: input.warmupMs,
    route: "startup_isolation",
    metadata: input.metadata || null,
  });
  markAiRuntimeReady({
    source: "embedding_runtime",
    ...(input.metadata || {}),
  });
};

export const recordStartupBackgroundTask = (input: {
  name: string;
  status: StartupBackgroundTaskStatus;
  attempts?: number;
  durationMs?: number;
  error?: unknown;
  metadata?: Record<string, unknown>;
}) => {
  const state = getOrCreateBackgroundTaskState(input.name);
  const nowIso = new Date().toISOString();

  state.status = input.status;
  state.attempts = Math.max(
    state.attempts,
    Number.isFinite(Number(input.attempts)) ? Number(input.attempts) : state.attempts
  );
  if (input.status === "scheduled") {
    state.scheduledAtIso = nowIso;
  }
  if (input.status === "started") {
    state.startedAtIso = nowIso;
  }
  if (input.status === "completed") {
    state.completedAtIso = nowIso;
  }
  if (Number.isFinite(Number(input.durationMs))) {
    state.lastDurationMs = Number(input.durationMs);
  }
  if (input.error !== undefined) {
    state.lastError = normalizeErrorMessage(input.error);
  }
  if (input.metadata) {
    state.metadata = {
      ...(state.metadata || {}),
      ...input.metadata,
    };
  }

  const statusWeight: Record<StartupBackgroundTaskStatus, number> = {
    scheduled: 0.2,
    deferred: 0.4,
    started: 0.6,
    completed: 1,
    failed: 0,
  };

  emitPerformanceMetric({
    name: "startup_background_warmup",
    value: statusWeight[input.status],
    route: "startup_isolation",
    metadata: {
      task: input.name,
      status: input.status,
      attempts: state.attempts,
      durationMs: state.lastDurationMs,
      error: state.lastError,
      ...(input.metadata || {}),
    },
  });
};

export const shouldTrackStartupAuthLatency = (path: string) => {
  if (isStartupWindowExpired()) {
    return false;
  }

  const normalized = String(path || "").trim();
  const isApiRoute = normalized.startsWith("/api");
  const isWebhookRoute = normalized.startsWith("/webhook/");

  if (!isApiRoute && !isWebhookRoute) {
    return false;
  }

  return (
    normalized.startsWith("/api/auth") ||
    normalized.startsWith("/api/user/me") ||
    normalized.startsWith("/api/user/workspace") ||
    normalized.startsWith("/api/billing") ||
    normalized.startsWith("/api/integrations/onboarding") ||
    normalized.startsWith("/api/webhooks/commerce") ||
    normalized.startsWith("/api/webhook/") ||
    normalized.startsWith("/webhook/")
  );
};

export const recordStartupAuthLatency = (input: {
  route: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  priorityClass?: string | null;
}) => {
  if (!shouldTrackStartupAuthLatency(input.route)) {
    return;
  }

  emitPerformanceMetric({
    name: "startup_auth_latency",
    value: input.latencyMs,
    route: input.route,
    metadata: {
      method: input.method,
      statusCode: input.statusCode,
      priorityClass: input.priorityClass || null,
      startupAgeMs: Date.now() - startupStartedAt,
      appBootReadyMs: appBootReadyAt ? appBootReadyAt - startupStartedAt : null,
    },
  });
};

export const shouldDeferLowPriorityWarmup = () => {
  const pressure = sampleStartupPressure("warmup_gate");
  const prioritySnapshot = getRequestPriorityRuntimeSnapshot();
  const reasons: string[] = [];

  if (
    pressure.eventLoopLagMs > STARTUP_WARMUP_MAX_EVENT_LOOP_LAG_MS &&
    STARTUP_WARMUP_MAX_EVENT_LOOP_LAG_MS > 0
  ) {
    reasons.push("startup_event_loop_lag_high");
  }

  if (
    pressure.cpuPressurePercent > STARTUP_WARMUP_MAX_CPU_PRESSURE_PERCENT &&
    STARTUP_WARMUP_MAX_CPU_PRESSURE_PERCENT > 0
  ) {
    reasons.push("startup_cpu_pressure_high");
  }

  if ((prioritySnapshot.active.critical || 0) > 0) {
    reasons.push("critical_requests_inflight");
  }

  if ((prioritySnapshot.queue.critical || 0) > 0) {
    reasons.push("critical_requests_queued");
  }

  return {
    defer: reasons.length > 0,
    reasons,
    pressure,
    prioritySnapshot,
  };
};

export const getStartupIsolationSnapshot = () => {
  const tasks = Array.from(startupBackgroundTasks.values()).map((task) => ({
    ...task,
  }));

  return {
    startedAt: new Date(startupStartedAt).toISOString(),
    startupAgeMs: Date.now() - startupStartedAt,
    startupWindowMs: STARTUP_WINDOW_MS,
    startupWindowActive: !isStartupWindowExpired(),
    appBootReadyAt: toIso(appBootReadyAt),
    appBootReadyMs: appBootReadyAt ? appBootReadyAt - startupStartedAt : null,
    aiRuntimeReadyAt: toIso(aiRuntimeReadyAt),
    aiRuntimeReadyMs: aiRuntimeReadyAt ? aiRuntimeReadyAt - startupStartedAt : null,
    pressure: {
      ...lastPressureSample,
      maxEventLoopLagMs: STARTUP_WARMUP_MAX_EVENT_LOOP_LAG_MS,
      maxCpuPressurePercent: STARTUP_WARMUP_MAX_CPU_PRESSURE_PERCENT,
    },
    backgroundTasks: tasks,
    requestPriority: getRequestPriorityRuntimeSnapshot(),
  };
};
