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

  const resolveFallbackValue = async (): Promise<T> => {
    if (typeof input.fallback === "function") {
      return (input.fallback as () => T | Promise<T>)();
    }
    return input.fallback;
  };

  // 1. Pre-flight check: Client abort
  if (input.requestSignal?.aborted) {
    const fallbackVal = await resolveFallbackValue();
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
      return existing.promise;
    }

    const promise = (async () => {
      if (input.requestSignal?.aborted) {
        throw new Error("aborted");
      }
      return input.compute();
    })().then((result) => {
      cache.set(input.cacheKey, {
        value: result,
        updatedAt: Date.now(),
        expiresAt: Date.now() + input.cacheTtlMs,
        staleUntil: Date.now() + input.staleTtlMs,
      });
      inflight.delete(input.cacheKey);
      return result;
    }).catch((err) => {
      inflight.delete(input.cacheKey);
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

  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Timeout"));
    }, input.computeBudgetMs);
  });

  try {
    const value = await Promise.race([computePromise, timeoutPromise]);
    clearTimeout(timeoutId!);

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
    if (timeoutId!) {
      clearTimeout(timeoutId);
    }
    const isCancelled = !!input.requestSignal?.aborted || error?.message === "aborted";
    const isTimeout = error instanceof Error && error.message === "Timeout";

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
