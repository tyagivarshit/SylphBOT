import { getRequestPriorityRuntimeSnapshot } from "../middleware/requestPriority.middleware";
import { emitPerformanceMetric } from "../observability/performanceMetrics";

let _redisReady = false;
let _dbReady = false;
let _httpReady = false;
let _runtimeMinimalReady = false;
let _aiRuntimeReady = false;

const _startedAt = new Date();
let _redisConnectedAt: string | null = null;
let _dbConnectedAt: string | null = null;
let _httpStartedAt: string | null = null;
let _minimalReadyAt: string | null = null;
let _aiReadyAt: string | null = null;
let _embeddingWarmupReadyAt: string | null = null;

const backgroundTasks: any[] = [];
const authLatencies: any[] = [];

// Event Loop Lag Tracking
let lastTick = Date.now();
let maxLag = 0;
let currentLag = 0;
let tickCount = 0;
const lagInterval = setInterval(() => {
  const now = Date.now();
  currentLag = Math.max(0, now - lastTick - 100); // 100ms interval
  if (currentLag > maxLag) {
    maxLag = currentLag;
  }
  lastTick = now;

  tickCount++;
  if (tickCount % 10 === 0) {
    const ageMs = Date.now() - _startedAt.getTime();
    if (ageMs < 60000) {
      emitPerformanceMetric({
        name: "startup_event_loop_lag",
        value: currentLag,
        route: "startup_isolation",
      });
    }
  }
}, 100);

if (lagInterval.unref) {
  lagInterval.unref();
}

const evaluateMinimalReady = () => {
  // Minimal ready = DB reachable and HTTP responsive
  if (_dbReady && _httpReady) {
    _runtimeMinimalReady = true;
    if (!_minimalReadyAt) {
      _minimalReadyAt = new Date().toISOString();
    }
  }
};

export const markRedisReady = (ready = true) => {
  _redisReady = ready;
  if (ready && !_redisConnectedAt) {
    _redisConnectedAt = new Date().toISOString();
  }
  evaluateMinimalReady();
};

export const markDbReady = (ready = true) => {
  _dbReady = ready;
  if (ready && !_dbConnectedAt) {
    _dbConnectedAt = new Date().toISOString();
  }
  evaluateMinimalReady();
};

export const markAppBootReady = (...args: any[]) => {
  const now = new Date();
  _httpReady = true;
  _httpStartedAt = now.toISOString();
  evaluateMinimalReady();
  return now.getTime();
};

export const markAiRuntimeReady = (metadata?: any) => {
  _aiRuntimeReady = true;
  _aiReadyAt = new Date().toISOString();
  return Date.now();
};

export const markEmbeddingWarmupReady = (metadata?: any) => {
  _embeddingWarmupReadyAt = new Date().toISOString();
};

export const recordStartupBackgroundTask = (task: any) => {
  if (!task || !task.name) return;
  const existingIndex = backgroundTasks.findIndex(t => t.name === task.name);
  if (existingIndex > -1) {
    backgroundTasks[existingIndex] = {
      ...backgroundTasks[existingIndex],
      ...task,
      metadata: {
        ...(backgroundTasks[existingIndex].metadata || {}),
        ...(task.metadata || {})
      },
      updatedAt: new Date().toISOString()
    };
  } else {
    backgroundTasks.push({
      ...task,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
};

export const shouldTrackStartupAuthLatency = (...args: any[]) => {
  const ageMs = Date.now() - _startedAt.getTime();
  return ageMs < 300_000;
};

export const recordStartupAuthLatency = (latency: any) => {
  if (shouldTrackStartupAuthLatency()) {
    authLatencies.push({
      ...latency,
      timestamp: new Date().toISOString()
    });
    emitPerformanceMetric({
      name: "startup_auth_latency",
      value: latency.latencyMs,
      route: latency.route || "auth.bootstrap",
      metadata: {
        method: latency.method,
        statusCode: latency.statusCode,
        priorityClass: latency.priorityClass,
      },
    });
  }
};

export const shouldDeferLowPriorityWarmup = (...args: any[]) => {
  if (process.env.STARTUP_ISOLATION_ENABLED === "false") {
    return {
      defer: false,
      reasons: [],
      pressure: {
        sampledAtIso: new Date().toISOString(),
        eventLoopLagMs: 0,
        cpuPressurePercent: 0,
      },
      prioritySnapshot: getRequestPriorityRuntimeSnapshot(),
    };
  }

  const ageMs = Date.now() - _startedAt.getTime();
  // Defer if lag is high (> 150ms) or within 10 seconds of boot (startup grace period)
  const defer = currentLag > 150 || ageMs < 10_000;
  
  const reasons: string[] = [];
  if (currentLag > 150) reasons.push(`event_loop_lag:${currentLag}ms`);
  if (ageMs < 10_000) reasons.push(`startup_grace_period:${ageMs}ms`);

  return {
    defer,
    reasons,
    pressure: {
      sampledAtIso: new Date().toISOString(),
      eventLoopLagMs: currentLag,
      cpuPressurePercent: 0,
    },
    prioritySnapshot: getRequestPriorityRuntimeSnapshot(),
  };
};

export const getStartupIsolationSnapshot = () => {
  const now = Date.now();
  const startupAgeMs = now - _startedAt.getTime();
  const startupWindowMs = 60_000;
  const startupWindowActive = startupAgeMs < startupWindowMs;

  return {
    startedAt: _startedAt.toISOString(),
    startupAgeMs,
    startupWindowMs,
    startupWindowActive,
    
    // Readiness states
    redisReady: _redisReady,
    dbReady: _dbReady,
    httpReady: _httpReady,
    runtimeMinimalReady: _runtimeMinimalReady,
    aiRuntimeReady: _aiRuntimeReady,

    // Timestamps
    redisConnectedAt: _redisConnectedAt,
    dbConnectedAt: _dbConnectedAt,
    httpStartedAt: _httpStartedAt,
    minimalReadyAt: _minimalReadyAt,
    aiReadyAt: _aiReadyAt,
    embeddingWarmupReadyAt: _embeddingWarmupReadyAt,

    appBootReadyAt: _httpStartedAt,
    appBootReadyMs: _httpStartedAt ? new Date(_httpStartedAt).getTime() - _startedAt.getTime() : 0,
    aiRuntimeReadyAt: _aiReadyAt,
    aiRuntimeReadyMs: _aiReadyAt ? new Date(_aiReadyAt).getTime() - _startedAt.getTime() : 0,
    
    pressure: {
      sampledAtIso: new Date().toISOString(),
      eventLoopLagMs: currentLag,
      cpuPressurePercent: 0,
      maxEventLoopLagMs: maxLag,
      maxCpuPressurePercent: 0,
    },
    backgroundTasks,
    authLatencies: authLatencies.slice(-20),
    requestPriority: getRequestPriorityRuntimeSnapshot(),
  };
};
