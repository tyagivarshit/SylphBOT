import os from "os";
import type { PlanType } from "../config/plan.config";

export const getWorkerCount = () => {

  const cpu = os.cpus().length;

  if (cpu <= 2) return 1;

  if (cpu <= 4) return 2;

  return cpu - 1;

};

export const resolveWorkerConcurrency = (
  envKey: string,
  fallback: number,
  options?: {
    min?: number;
    max?: number;
  }
) => {
  const min = Math.max(1, options?.min ?? 1);
  const max = Math.max(min, options?.max ?? 64);
  const raw = process.env[envKey];
  const parsed = Number(raw);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;

  return Math.min(Math.max(Math.floor(value), min), max);
};

type ThroughputLimits = {
  messagesPerMinute: number;
  aiPerHour: number;
};

const DEFAULT_THROUGHPUT_LIMITS: Record<PlanType, ThroughputLimits> = {
  LOCKED: {
    messagesPerMinute: 0,
    aiPerHour: 0,
  },
  FREE_LOCKED: {
    messagesPerMinute: 0,
    aiPerHour: 0,
  },
  BASIC: {
    messagesPerMinute: 20,
    aiPerHour: 50,
  },
  PRO: {
    messagesPerMinute: 50,
    aiPerHour: 120,
  },
  ELITE: {
    messagesPerMinute: 100,
    aiPerHour: 300,
  },
};

export const getThroughputLimits = (
  planKey?: PlanType | null
): ThroughputLimits =>
  DEFAULT_THROUGHPUT_LIMITS[planKey || "LOCKED"] ||
  DEFAULT_THROUGHPUT_LIMITS.LOCKED;
