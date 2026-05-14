import { emitPerformanceMetric } from "../observability/performanceMetrics";

type CachedProjectionEntry<T> = {
  value: T;
  updatedAt: number;
  expiresAt: number;
  staleUntil: number;
};

type ProjectionOutcome<T> =
  | {
      status: "ok";
      value: T;
      computeMs: number;
    }
  | {
      status: "budget_exceeded";
      computeMs: number;
      reason: string;
      error?: Error;
    }
  | {
      status: "failed";
      computeMs: number;
      error: Error;
    };

type InflightProjectionEntry<T> = {
  key: string;
  label: string;
  businessId: string | null;
  startedAt: number;
  waiters: number;
  promise: Promise<ProjectionOutcome<T>>;
};

type QueueJob<T> = {
  label: string;
  key: string;
  businessId: string | null;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

type ProjectionWaitOutcome<T> =
  | {
      type: "ready";
      outcome: ProjectionOutcome<T>;
    }
  | {
      type: "timed_out";
    }
  | {
      type: "cancelled";
    };

export type ProjectionSnapshotReadResult<T> = {
  value: T;
  meta: {
    source: "fresh_cache" | "stale_cache" | "fresh_compute" | "fallback";
    cacheHit: boolean;
    stale: boolean;
    deduped: boolean;
    cancelled: boolean;
    budgetExceeded: boolean;
    snapshotAgeMs: number | null;
    waitMs: number;
  };
};

const parsePositiveInt = (raw: string | undefined, fallbackValue: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.max(1, Math.floor(parsed));
};

const PROJECTION_MAX_CONCURRENT_COMPUTE = parsePositiveInt(
  process.env.PROJECTION_MAX_CONCURRENT_COMPUTE,
  2
);
const PROJECTION_MAX_QUEUED_COMPUTE = parsePositiveInt(
  process.env.PROJECTION_MAX_QUEUED_COMPUTE,
  24
);
const PROJECTION_CACHE_MAX_ENTRIES = parsePositiveInt(
  process.env.PROJECTION_CACHE_MAX_ENTRIES,
  500
);

const projectionCache = new Map<string, CachedProjectionEntry<unknown>>();
const projectionInflight = new Map<string, InflightProjectionEntry<unknown>>();
const projectionQueue: Array<QueueJob<unknown>> = [];
let activeProjectionCompute = 0;
let drainScheduled = false;

const setProjectionCacheEntry = <T>(key: string, value: CachedProjectionEntry<T>) => {
  projectionCache.set(key, value as CachedProjectionEntry<unknown>);
  if (projectionCache.size <= PROJECTION_CACHE_MAX_ENTRIES) {
    return;
  }

  const oldestKey = projectionCache.keys().next().value;
  if (oldestKey) {
    projectionCache.delete(oldestKey);
  }
};

const toNullableBusinessId = (value: string | null | undefined) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const emitProjectionMetric = (input: {
  name:
    | "projection_compute_ms"
    | "projection_cache_hit"
    | "projection_deduped"
    | "projection_cancelled"
    | "projection_budget_exceeded";
  value?: number;
  businessId?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  emitPerformanceMetric({
    name: input.name,
    value: input.value,
    businessId: input.businessId || null,
    route: input.route || null,
    metadata: input.metadata || null,
  });
};

const scheduleDrain = () => {
  if (drainScheduled) {
    return;
  }
  drainScheduled = true;
  setImmediate(() => {
    drainScheduled = false;
    drainProjectionQueue();
  });
};

const runJob = <T>(job: QueueJob<T>) => {
  activeProjectionCompute += 1;
  Promise.resolve()
    .then(job.run)
    .then(job.resolve)
    .catch((error) => {
      const typedError =
        error instanceof Error ? error : new Error(String(error || "projection_compute_failed"));
      job.reject(typedError);
    })
    .finally(() => {
      activeProjectionCompute = Math.max(0, activeProjectionCompute - 1);
      scheduleDrain();
    });
};

const drainProjectionQueue = () => {
  while (
    activeProjectionCompute < PROJECTION_MAX_CONCURRENT_COMPUTE &&
    projectionQueue.length > 0
  ) {
    const next = projectionQueue.shift();
    if (!next) {
      break;
    }
    runJob(next);
  }
};

const queueProjectionCompute = <T>(input: {
  label: string;
  key: string;
  businessId?: string | null;
  task: () => Promise<T>;
}) =>
  new Promise<T>((resolve, reject) => {
    const job: QueueJob<T> = {
      label: input.label,
      key: input.key,
      businessId: toNullableBusinessId(input.businessId),
      run: input.task,
      resolve,
      reject,
    };

    if (activeProjectionCompute < PROJECTION_MAX_CONCURRENT_COMPUTE) {
      runJob(job);
      return;
    }

    if (projectionQueue.length >= PROJECTION_MAX_QUEUED_COMPUTE) {
      reject(new Error("projection_budget_exceeded:queue_saturated"));
      return;
    }

    projectionQueue.push(job as QueueJob<unknown>);
  });

const runWithComputeBudget = async <T>(input: {
  label: string;
  key: string;
  businessId?: string | null;
  computeBudgetMs: number;
  task: () => Promise<T>;
}): Promise<ProjectionOutcome<T>> => {
  const startedAt = Date.now();
  const computeBudgetMs = Math.max(1, Math.floor(input.computeBudgetMs));

  try {
    const value = await queueProjectionCompute({
      label: input.label,
      key: input.key,
      businessId: input.businessId,
      task: async () => {
        const taskPromise = Promise.resolve().then(input.task);
        let timeoutHandle: NodeJS.Timeout | null = null;

        try {
          return await Promise.race([
            taskPromise,
            new Promise<T>((_, reject) => {
              timeoutHandle = setTimeout(() => {
                reject(
                  new Error(
                    `projection_budget_exceeded:compute_timeout:${input.label}:${computeBudgetMs}`
                  )
                );
              }, computeBudgetMs);
            }),
          ]);
        } finally {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        }
      },
    });

    const computeMs = Date.now() - startedAt;
    emitProjectionMetric({
      name: "projection_compute_ms",
      value: computeMs,
      businessId: input.businessId,
      route: input.label,
      metadata: {
        key: input.key,
        status: "ok",
      },
    });
    return {
      status: "ok",
      value,
      computeMs,
    };
  } catch (error) {
    const computeMs = Date.now() - startedAt;
    const typedError =
      error instanceof Error ? error : new Error(String(error || "projection_compute_failed"));
    const budgetExceeded = typedError.message.includes("projection_budget_exceeded");

    if (budgetExceeded) {
      emitProjectionMetric({
        name: "projection_budget_exceeded",
        value: 1,
        businessId: input.businessId,
        route: input.label,
        metadata: {
          key: input.key,
          reason: typedError.message,
          computeMs,
        },
      });
      return {
        status: "budget_exceeded",
        computeMs,
        reason: typedError.message,
        error: typedError,
      };
    }

    return {
      status: "failed",
      computeMs,
      error: typedError,
    };
  }
};

const primeProjection = <T>(input: {
  cacheKey: string;
  label: string;
  businessId?: string | null;
  cacheTtlMs: number;
  staleTtlMs: number;
  computeBudgetMs: number;
  compute: () => Promise<T>;
}) => {
  const inflight = projectionInflight.get(input.cacheKey) as
    | InflightProjectionEntry<T>
    | undefined;

  if (inflight?.promise) {
    inflight.waiters += 1;
    emitProjectionMetric({
      name: "projection_deduped",
      value: 1,
      businessId: input.businessId,
      route: input.label,
      metadata: {
        key: input.cacheKey,
        waiters: inflight.waiters,
      },
    });
    return {
      promise: inflight.promise,
      deduped: true,
    } as const;
  }

  const projectionPromise = runWithComputeBudget({
    label: input.label,
    key: input.cacheKey,
    businessId: input.businessId,
    computeBudgetMs: input.computeBudgetMs,
    task: input.compute,
  })
    .then((outcome) => {
      if (outcome.status === "ok") {
        const nowMs = Date.now();
        setProjectionCacheEntry(input.cacheKey, {
          value: outcome.value,
          updatedAt: nowMs,
          expiresAt: nowMs + Math.max(1, Math.floor(input.cacheTtlMs)),
          staleUntil: nowMs + Math.max(1, Math.floor(input.staleTtlMs)),
        });
      }
      return outcome;
    })
    .finally(() => {
      const current = projectionInflight.get(input.cacheKey);
      if (current?.promise === projectionPromise) {
        projectionInflight.delete(input.cacheKey);
      }
    });

  projectionInflight.set(input.cacheKey, {
    key: input.cacheKey,
    label: input.label,
    businessId: toNullableBusinessId(input.businessId),
    startedAt: Date.now(),
    waiters: 1,
    promise: projectionPromise as Promise<ProjectionOutcome<unknown>>,
  });

  return {
    promise: projectionPromise,
    deduped: false,
  } as const;
};

const waitForProjection = async <T>(input: {
  promise: Promise<ProjectionOutcome<T>>;
  waitMs: number;
  requestSignal?: AbortSignal | null;
}): Promise<ProjectionWaitOutcome<T>> =>
  new Promise((resolve) => {
    let settled = false;
    const boundedWaitMs = Math.max(1, Math.floor(input.waitMs));
    let timeoutHandle: NodeJS.Timeout | null = null;
    const signal = input.requestSignal || null;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    };

    const settle = (outcome: ProjectionWaitOutcome<T>) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(outcome);
    };

    const onAbort = () => {
      settle({
        type: "cancelled",
      });
    };

    if (signal?.aborted) {
      settle({
        type: "cancelled",
      });
      return;
    }

    timeoutHandle = setTimeout(() => {
      settle({
        type: "timed_out",
      });
    }, boundedWaitMs);

    if (signal) {
      signal.addEventListener("abort", onAbort, {
        once: true,
      });
    }

    input.promise
      .then((outcome) => {
        settle({
          type: "ready",
          outcome,
        });
      })
      .catch(() => {
        settle({
          type: "timed_out",
        });
      });
  });

const resolveFallbackValue = <T>(fallback: T | (() => T | Promise<T>)) =>
  typeof fallback === "function"
    ? Promise.resolve().then(() => (fallback as () => T | Promise<T>)())
    : Promise.resolve(fallback);

export const getProjectionSnapshot = async <T>(input: {
  cacheKey: string;
  label: string;
  businessId?: string | null;
  cacheTtlMs: number;
  staleTtlMs: number;
  computeBudgetMs: number;
  initialWaitMs: number;
  minRefreshIntervalMs?: number;
  requestSignal?: AbortSignal | null;
  fallback: T | (() => T | Promise<T>);
  compute: () => Promise<T>;
}): Promise<ProjectionSnapshotReadResult<T>> => {
  const nowMs = Date.now();
  const cached = projectionCache.get(input.cacheKey) as
    | CachedProjectionEntry<T>
    | undefined;
  const snapshotAgeMs =
    cached?.updatedAt && Number.isFinite(cached.updatedAt)
      ? Math.max(0, nowMs - cached.updatedAt)
      : null;
  const minimumRefreshAgeMs = Math.max(0, Math.floor(input.minRefreshIntervalMs || 0));
  const shouldRefresh =
    !cached ||
    !snapshotAgeMs ||
    snapshotAgeMs >= minimumRefreshAgeMs ||
    cached.expiresAt <= nowMs;

  if (cached?.value !== undefined && cached.expiresAt > nowMs) {
    emitProjectionMetric({
      name: "projection_cache_hit",
      value: 1,
      businessId: input.businessId,
      route: input.label,
      metadata: {
        key: input.cacheKey,
        stale: false,
      },
    });

    if (shouldRefresh && cached.expiresAt <= nowMs + 500) {
      primeProjection({
        cacheKey: input.cacheKey,
        label: input.label,
        businessId: input.businessId,
        cacheTtlMs: input.cacheTtlMs,
        staleTtlMs: input.staleTtlMs,
        computeBudgetMs: input.computeBudgetMs,
        compute: input.compute,
      });
    }

    return {
      value: cached.value,
      meta: {
        source: "fresh_cache",
        cacheHit: true,
        stale: false,
        deduped: false,
        cancelled: false,
        budgetExceeded: false,
        snapshotAgeMs,
        waitMs: 0,
      },
    };
  }

  const refresh = shouldRefresh
    ? primeProjection({
        cacheKey: input.cacheKey,
        label: input.label,
        businessId: input.businessId,
        cacheTtlMs: input.cacheTtlMs,
        staleTtlMs: input.staleTtlMs,
        computeBudgetMs: input.computeBudgetMs,
        compute: input.compute,
      })
    : {
        promise: Promise.resolve({
          status: "failed",
          computeMs: 0,
          error: new Error("projection_refresh_skipped"),
        } as ProjectionOutcome<T>),
        deduped: false,
      };

  if (cached?.value !== undefined && cached.staleUntil > nowMs) {
    emitProjectionMetric({
      name: "projection_cache_hit",
      value: 1,
      businessId: input.businessId,
      route: input.label,
      metadata: {
        key: input.cacheKey,
        stale: true,
      },
    });

    return {
      value: cached.value,
      meta: {
        source: "stale_cache",
        cacheHit: true,
        stale: true,
        deduped: refresh.deduped,
        cancelled: false,
        budgetExceeded: false,
        snapshotAgeMs,
        waitMs: 0,
      },
    };
  }

  const waitMs = Math.max(1, Math.floor(input.initialWaitMs));
  const waitOutcome = await waitForProjection({
    promise: refresh.promise,
    waitMs,
    requestSignal: input.requestSignal,
  });

  if (waitOutcome.type === "ready" && waitOutcome.outcome.status === "ok") {
    return {
      value: waitOutcome.outcome.value,
      meta: {
        source: "fresh_compute",
        cacheHit: false,
        stale: false,
        deduped: refresh.deduped,
        cancelled: false,
        budgetExceeded: false,
        snapshotAgeMs: null,
        waitMs,
      },
    };
  }

  const fallback = await resolveFallbackValue(input.fallback);

  if (waitOutcome.type === "cancelled") {
    emitProjectionMetric({
      name: "projection_cancelled",
      value: 1,
      businessId: input.businessId,
      route: input.label,
      metadata: {
        key: input.cacheKey,
      },
    });
    return {
      value: fallback,
      meta: {
        source: "fallback",
        cacheHit: false,
        stale: false,
        deduped: refresh.deduped,
        cancelled: true,
        budgetExceeded: false,
        snapshotAgeMs: null,
        waitMs,
      },
    };
  }

  const budgetReason =
    waitOutcome.type === "timed_out"
      ? "wait_budget_exceeded"
      : waitOutcome.outcome.status === "budget_exceeded"
      ? waitOutcome.outcome.reason
      : "projection_failed";
  const budgetExceeded =
    waitOutcome.type === "timed_out" ||
    (waitOutcome.type === "ready" && waitOutcome.outcome.status === "budget_exceeded");

  if (budgetExceeded) {
    emitProjectionMetric({
      name: "projection_budget_exceeded",
      value: 1,
      businessId: input.businessId,
      route: input.label,
      metadata: {
        key: input.cacheKey,
        reason: budgetReason,
        waitMs,
      },
    });
  }

  return {
    value: fallback,
    meta: {
      source: "fallback",
      cacheHit: false,
      stale: false,
      deduped: refresh.deduped,
      cancelled: false,
      budgetExceeded,
      snapshotAgeMs: null,
      waitMs,
    },
  };
};

export const runProjectionComputeTask = async <T>(input: {
  cacheKey: string;
  label: string;
  businessId?: string | null;
  computeBudgetMs: number;
  task: () => Promise<T>;
}) => {
  const outcome = await runWithComputeBudget({
    key: input.cacheKey,
    label: input.label,
    businessId: input.businessId,
    computeBudgetMs: input.computeBudgetMs,
    task: input.task,
  });

  if (outcome.status === "ok") {
    return outcome.value;
  }

  if (outcome.status === "budget_exceeded") {
    throw outcome.error || new Error(outcome.reason);
  }

  throw outcome.error;
};

export const invalidateProjectionSnapshots = (input: {
  key?: string | null;
  prefix?: string | null;
}) => {
  const key = String(input.key || "").trim();
  const prefix = String(input.prefix || "").trim();

  if (key) {
    projectionCache.delete(key);
    return;
  }

  if (prefix) {
    for (const cacheKey of projectionCache.keys()) {
      if (cacheKey.startsWith(prefix)) {
        projectionCache.delete(cacheKey);
      }
    }
    return;
  }
};
