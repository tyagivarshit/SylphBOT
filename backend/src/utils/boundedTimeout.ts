import { emitPerformanceMetric } from "../observability/performanceMetrics";

export class TimeoutExceededError extends Error {
  readonly code: string;
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`timeout_exceeded:${label}:${timeoutMs}`);
    this.name = "TimeoutExceededError";
    this.code = "TIMEOUT_EXCEEDED";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

type TimeoutFallback<T> = T | (() => T | Promise<T>);

const resolveFallback = async <T>(fallback: TimeoutFallback<T>) =>
  typeof fallback === "function" ? await (fallback as () => T | Promise<T>)() : fallback;

export const withTimeout = async <T>(input: {
  label: string;
  timeoutMs: number;
  task: Promise<T>;
}): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      input.task,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new TimeoutExceededError(input.label, input.timeoutMs));
        }, input.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export const withTimeoutFallback = async <T>(input: {
  label: string;
  timeoutMs: number;
  task: Promise<T>;
  fallback: TimeoutFallback<T>;
}) => {
  const startedAt = Date.now();

  try {
    const value = await withTimeout({
      label: input.label,
      timeoutMs: input.timeoutMs,
      task: input.task,
    });

    emitPerformanceMetric({
      name: "PROJECTION_MS",
      value: Date.now() - startedAt,
      route: input.label,
      metadata: {
        timeoutMs: input.timeoutMs,
        status: "ok",
      },
    });

    return {
      value,
      timedOut: false,
      failed: false,
    };
  } catch (error) {
    const timedOut = error instanceof TimeoutExceededError;

    if (timedOut) {
      emitPerformanceMetric({
        name: "TIMEOUT_PREVENTED",
        value: Date.now() - startedAt,
        route: input.label,
        metadata: {
          timeoutMs: input.timeoutMs,
        },
      });
    }

    emitPerformanceMetric({
      name: "PROJECTION_MS",
      value: Date.now() - startedAt,
      route: input.label,
      metadata: {
        timeoutMs: input.timeoutMs,
        status: timedOut ? "timed_out" : "failed",
      },
    });

    return {
      value: await resolveFallback(input.fallback),
      timedOut,
      failed: !timedOut,
    };
  }
};
