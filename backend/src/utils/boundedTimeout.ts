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
  try {
    return {
      value: await withTimeout({
        label: input.label,
        timeoutMs: input.timeoutMs,
        task: input.task,
      }),
      timedOut: false,
      failed: false,
    };
  } catch (error) {
    const timedOut = error instanceof TimeoutExceededError;
    return {
      value: await resolveFallback(input.fallback),
      timedOut,
      failed: !timedOut,
    };
  }
};
