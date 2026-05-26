import { getRequestPriorityRuntimeSnapshot } from "../middleware/requestPriority.middleware";

export const markAppBootReady = (...args: any[]) => Date.now();
export const markAiRuntimeReady = (...args: any[]) => Date.now();
export const markEmbeddingWarmupReady = (...args: any[]) => {};
export const recordStartupBackgroundTask = (...args: any[]) => {};
export const shouldTrackStartupAuthLatency = (...args: any[]) => false;
export const recordStartupAuthLatency = (...args: any[]) => {};
export const shouldDeferLowPriorityWarmup = (...args: any[]) => ({
  defer: false,
  reasons: [],
  pressure: {
    sampledAtIso: new Date().toISOString(),
    eventLoopLagMs: 0,
    cpuPressurePercent: 0,
  },
  prioritySnapshot: getRequestPriorityRuntimeSnapshot(),
});

export const getStartupIsolationSnapshot = () => ({
  startedAt: new Date().toISOString(),
  startupAgeMs: 0,
  startupWindowMs: 0,
  startupWindowActive: false,
  appBootReadyAt: new Date().toISOString(),
  appBootReadyMs: 0,
  aiRuntimeReadyAt: new Date().toISOString(),
  aiRuntimeReadyMs: 0,
  pressure: {
    sampledAtIso: new Date().toISOString(),
    eventLoopLagMs: 0,
    cpuPressurePercent: 0,
    maxEventLoopLagMs: 0,
    maxCpuPressurePercent: 0,
  },
  backgroundTasks: [],
  requestPriority: getRequestPriorityRuntimeSnapshot(),
});
