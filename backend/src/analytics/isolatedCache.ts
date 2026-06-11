import { runOutsideRequestContext } from "../observability/requestContext";
import { requestStorage } from "../utils/requestLifecycle";

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

type CachedEntry<T> = {
  value: T;
  updatedAt: number;
  expiresAt: number;
  staleUntil: number;
};

type InflightEntry<T> = {
  promise: Promise<T>;
  startedAt: number;
};

const cache = new Map<string, CachedEntry<unknown>>();
const inflight = new Map<string, InflightEntry<unknown>>();

const runOutsideHttpRequest = <T>(task: () => T): T =>
  requestStorage.exit(() => runOutsideRequestContext(task));

const unrefTimer = (timer: NodeJS.Timeout) => {
  timer.unref?.();
  return timer;
};

const logProjectionTiming = (
  label: string,
  event: string,
  fields: Record<string, unknown>
) => {
  console.info(`[ISOLATED_CACHE_TIMING] ${label}`, {
    event,
    ...fields,
  });
};

export const getIsolatedProjectionSnapshot = async <T>(input: {
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
  const now = Date.now();
  const timingBase = {
    cacheKey: input.cacheKey,
    businessId: input.businessId || null,
  };
  logProjectionTiming(input.label, "start", timingBase);

  const resolveFallbackValue = async (): Promise<T> => {
    if (typeof input.fallback === "function") {
      const fallbackStart = Date.now();
      logProjectionTiming(input.label, "await_fallback_start", timingBase);
      const fallbackValue = await (input.fallback as () => T | Promise<T>)();
      logProjectionTiming(input.label, "await_fallback_end", {
        ...timingBase,
        durationMs: Date.now() - fallbackStart,
      });
      return fallbackValue;
    }
    return input.fallback;
  };

  // 1. Pre-flight check: Client abort
  if (input.requestSignal?.aborted) {
    const fallbackVal = await resolveFallbackValue();
    logProjectionTiming(input.label, "client_aborted_before_compute", timingBase);
    return {
      value: fallbackVal,
      meta: {
        source: "fallback",
        cacheHit: false,
        stale: false,
        deduped: false,
        cancelled: true,
        budgetExceeded: false,
        snapshotAgeMs: null,
        waitMs: 0,
      },
    };
  }

  const cached = cache.get(input.cacheKey) as CachedEntry<T> | undefined;
  const age = cached ? now - cached.updatedAt : null;
  const isFresh = cached && cached.expiresAt > now;
  const isStaleButUsable = cached && cached.staleUntil > now;

  // 2. Cache Hit (Fresh)
  if (isFresh) {
    logProjectionTiming(input.label, "fresh_cache_return", {
      ...timingBase,
      snapshotAgeMs: age,
    });
    return {
      value: cached.value,
      meta: {
        source: "fresh_cache",
        cacheHit: true,
        stale: false,
        deduped: false,
        cancelled: false,
        budgetExceeded: false,
        snapshotAgeMs: age,
        waitMs: 0,
      },
    };
  }

  // 3. Trigger Compute (with Promise deduplication)
  const triggerCompute = (): Promise<T> => {
    const existing = inflight.get(input.cacheKey) as InflightEntry<T> | undefined;
    if (existing) {
      const inflightAgeMs = Date.now() - existing.startedAt;
      logProjectionTiming(input.label, "dedupe_existing_inflight", {
        ...timingBase,
        inflightAgeMs,
      });

      if (inflightAgeMs > input.computeBudgetMs) {
        logProjectionTiming(input.label, "stale_inflight_lock_released", {
          ...timingBase,
          inflightAgeMs,
          computeBudgetMs: input.computeBudgetMs,
        });
        inflight.delete(input.cacheKey);
      } else {
        return existing.promise;
      }
    }

    const computeStartedAt = Date.now();
    logProjectionTiming(input.label, "compute_start", timingBase);
    const promise = runOutsideHttpRequest(() =>
      (async () => {
        if (input.requestSignal?.aborted) {
          throw new Error("aborted");
        }
        return input.compute();
      })()
    ).then((result) => {
      const finishedAt = Date.now();
      cache.set(input.cacheKey, {
        value: result,
        updatedAt: finishedAt,
        expiresAt: finishedAt + input.cacheTtlMs,
        staleUntil: finishedAt + input.staleTtlMs,
      });
      inflight.delete(input.cacheKey);
      logProjectionTiming(input.label, "compute_success_lock_released", {
        ...timingBase,
        durationMs: finishedAt - computeStartedAt,
      });
      return result;
    }).catch((err) => {
      inflight.delete(input.cacheKey);
      logProjectionTiming(input.label, "compute_error_lock_released", {
        ...timingBase,
        durationMs: Date.now() - computeStartedAt,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    });

    inflight.set(input.cacheKey, {
      promise,
      startedAt: Date.now(),
    });

    return promise;
  };

  // 4. Stale-While-Revalidate: Return stale immediately and trigger background compute
  if (isStaleButUsable) {
    logProjectionTiming(input.label, "stale_cache_return_and_revalidate", {
      ...timingBase,
      snapshotAgeMs: age,
    });
    triggerCompute().catch((err) => {
      console.error(`[ISOLATED_CACHE_BACKGROUND_ERROR] ${input.label}:`, err);
    });

    return {
      value: cached.value,
      meta: {
        source: "stale_cache",
        cacheHit: true,
        stale: true,
        deduped: false,
        cancelled: false,
        budgetExceeded: false,
        snapshotAgeMs: age,
        waitMs: 0,
      },
    };
  }

  // 5. Cache Miss or Expired Cache: Race the compute promise against budget
  const isDeduped = inflight.has(input.cacheKey);
  const computePromise = triggerCompute();

  let initialWaitTimeoutId: NodeJS.Timeout;
  let computeBudgetTimeoutId: NodeJS.Timeout;
  const initialWaitPromise = new Promise<never>((_, reject) => {
    initialWaitTimeoutId = unrefTimer(
      setTimeout(() => {
        reject(new Error("InitialWaitTimeout"));
      }, input.initialWaitMs)
    );
  });
  const computeBudgetPromise = new Promise<never>((_, reject) => {
    computeBudgetTimeoutId = unrefTimer(
      setTimeout(() => {
        reject(new Error("ComputeBudgetTimeout"));
      }, input.computeBudgetMs)
    );
  });
  computeBudgetPromise.catch(() => {
    const current = inflight.get(input.cacheKey);
    if (current?.promise === computePromise) {
      inflight.delete(input.cacheKey);
      logProjectionTiming(input.label, "compute_budget_lock_released", {
        ...timingBase,
        waitMs: Date.now() - now,
        computeBudgetMs: input.computeBudgetMs,
      });
    }
  });

  try {
    logProjectionTiming(input.label, "await_compute_race_start", {
      ...timingBase,
      initialWaitMs: input.initialWaitMs,
      computeBudgetMs: input.computeBudgetMs,
      deduped: isDeduped,
    });
    const value = await Promise.race([computePromise, initialWaitPromise]);
    clearTimeout(initialWaitTimeoutId!);
    clearTimeout(computeBudgetTimeoutId!);
    logProjectionTiming(input.label, "await_compute_race_end", {
      ...timingBase,
      waitMs: Date.now() - now,
    });

    return {
      value,
      meta: {
        source: "fresh_compute",
        cacheHit: false,
        stale: false,
        deduped: isDeduped,
        cancelled: false,
        budgetExceeded: false,
        snapshotAgeMs: 0,
        waitMs: Date.now() - now,
      },
    };
  } catch (error: any) {
    if (initialWaitTimeoutId!) {
      clearTimeout(initialWaitTimeoutId);
    }
    const keepBackgroundCompute =
      error instanceof Error && error.message === "InitialWaitTimeout";
    if (!keepBackgroundCompute && computeBudgetTimeoutId!) {
      clearTimeout(computeBudgetTimeoutId);
    }
    const isCancelled = !!input.requestSignal?.aborted || error?.message === "aborted";
    const isTimeout =
      error instanceof Error &&
      (error.message === "InitialWaitTimeout" ||
        error.message === "ComputeBudgetTimeout");

    logProjectionTiming(input.label, "await_compute_race_fallback", {
      ...timingBase,
      waitMs: Date.now() - now,
      error: error instanceof Error ? error.message : String(error),
      keepBackgroundCompute,
    });

    const fallbackVal = await resolveFallbackValue();

    return {
      value: cached?.value ?? fallbackVal,
      meta: {
        source: "fallback",
        cacheHit: cached !== undefined,
        stale: cached !== undefined,
        deduped: isDeduped,
        cancelled: isCancelled,
        budgetExceeded: isTimeout,
        snapshotAgeMs: age,
        waitMs: Date.now() - now,
      },
    };
  }
};
