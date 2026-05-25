import { PassThrough } from "stream";
import logger from "../utils/logger";

export type RedisCircuitState = {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
  openSinceTime: number;
  openDurationMs: number;
  halfOpenSuccesses: number;
  cooldownRemainingMs: number;
  minOpenRemainingMs: number;
};

type RedisSafetyState = RedisCircuitState & {
  halfOpenInFlight: boolean;
  fallbackModeEnabled: boolean;
  circuitEpoch: number;
  skipLogEpochs: Record<string, number>;
};

type FallbackValue<T> = T | (() => T);

const REDIS_TRANSIENT_ERROR_PATTERN =
  /ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|READONLY|Connection is closed|Connection is in closed state|Connection is not ready|Socket closed unexpectedly|Stream isn't writeable and enableOfflineQueue options is false|Command queue state error|Reached the max retries per request limit/i;

const toPositiveInt = (value: unknown, fallback: number, min = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
};

const REDIS_FAILURE_THRESHOLD = toPositiveInt(
  process.env.REDIS_CIRCUIT_FAILURE_THRESHOLD,
  5
);
const REDIS_COOLDOWN_MS = toPositiveInt(process.env.REDIS_COOLDOWN_MS, 30_000, 250);
const REDIS_MIN_OPEN_MS = toPositiveInt(process.env.REDIS_MIN_OPEN_MS, 12_000, 250);
const REDIS_HALF_OPEN_SUCCESS_THRESHOLD = toPositiveInt(
  process.env.REDIS_HALF_OPEN_SUCCESS_THRESHOLD,
  2
);
const REDIS_FAILURE_DECAY_MS = toPositiveInt(
  process.env.REDIS_FAILURE_DECAY_MS,
  60_000,
  1_000
);

const globalForRedisSafety = globalThis as typeof globalThis & {
  __sylphRedisSafetyState?: RedisSafetyState;
};

const redisSafetyState =
  globalForRedisSafety.__sylphRedisSafetyState ||
  ({
    failures: 0,
    lastFailureTime: 0,
    isOpen: false,
    openSinceTime: 0,
    openDurationMs: 0,
    halfOpenSuccesses: 0,
    cooldownRemainingMs: 0,
    minOpenRemainingMs: 0,
    halfOpenInFlight: false,
    fallbackModeEnabled: false,
    circuitEpoch: 0,
    skipLogEpochs: {},
  } satisfies RedisSafetyState);

if (!globalForRedisSafety.__sylphRedisSafetyState) {
  globalForRedisSafety.__sylphRedisSafetyState = redisSafetyState;
}

const resolveFallback = <T>(fallback: FallbackValue<T>) =>
  typeof fallback === "function"
    ? (fallback as () => T)()
    : fallback;

export const isRedisTransientError = (error: unknown) =>
  REDIS_TRANSIENT_ERROR_PATTERN.test(
    String((error as { message?: unknown })?.message || error || "")
  );

const enableFallbackMode = () => {
  if (redisSafetyState.fallbackModeEnabled) {
    return;
  }

  redisSafetyState.fallbackModeEnabled = true;
  logger.warn(
    {
      failures: redisSafetyState.failures,
    },
    "Redis fallback mode enabled"
  );
};

const openRedisCircuit = () => {
  if (redisSafetyState.isOpen) {
    return;
  }

  redisSafetyState.isOpen = true;
  redisSafetyState.openSinceTime = Date.now();
  redisSafetyState.halfOpenSuccesses = 0;
  redisSafetyState.circuitEpoch += 1;
  logger.warn(
    {
      failures: redisSafetyState.failures,
      cooldownMs: REDIS_COOLDOWN_MS,
      minOpenMs: REDIS_MIN_OPEN_MS,
    },
    "Redis circuit OPEN"
  );
};

const closeRedisCircuit = () => {
  const wasOpen = redisSafetyState.isOpen;
  const shouldReset =
    wasOpen ||
    redisSafetyState.failures > 0 ||
    redisSafetyState.fallbackModeEnabled ||
    redisSafetyState.halfOpenInFlight;

  if (!shouldReset) {
    return;
  }

  redisSafetyState.failures = 0;
  redisSafetyState.lastFailureTime = 0;
  redisSafetyState.isOpen = false;
  redisSafetyState.openSinceTime = 0;
  redisSafetyState.halfOpenSuccesses = 0;
  redisSafetyState.halfOpenInFlight = false;
  redisSafetyState.fallbackModeEnabled = false;

  if (wasOpen) {
    logger.info("Redis circuit CLOSED");
  }
};

const recordRedisFailure = (error: unknown, operation?: string) => {
  if (
    redisSafetyState.lastFailureTime > 0 &&
    Date.now() - redisSafetyState.lastFailureTime > REDIS_FAILURE_DECAY_MS
  ) {
    redisSafetyState.failures = 0;
  }

  enableFallbackMode();

  redisSafetyState.failures += 1;
  redisSafetyState.lastFailureTime = Date.now();
  redisSafetyState.halfOpenInFlight = false;
  redisSafetyState.halfOpenSuccesses = 0;

  logger.debug(
    {
      operation: operation || "redis",
      failures: redisSafetyState.failures,
      transient: isRedisTransientError(error),
      error,
    },
    "Redis operation failed"
  );

  if (redisSafetyState.failures >= REDIS_FAILURE_THRESHOLD) {
    openRedisCircuit();
  }
};

const recordRedisSuccess = () => {
  if (redisSafetyState.isOpen) {
    const openDurationMs = Date.now() - redisSafetyState.openSinceTime;

    if (openDurationMs < REDIS_MIN_OPEN_MS) {
      return;
    }

    redisSafetyState.halfOpenSuccesses += 1;
    if (redisSafetyState.halfOpenSuccesses < REDIS_HALF_OPEN_SUCCESS_THRESHOLD) {
      return;
    }
  }

  closeRedisCircuit();
};

const getRedisCircuitDecision = () => {
  if (!redisSafetyState.isOpen) {
    return {
      allow: true,
      halfOpen: false,
    };
  }

  const now = Date.now();
  const elapsed = now - redisSafetyState.lastFailureTime;
  const openDurationMs = now - redisSafetyState.openSinceTime;

  if (elapsed < REDIS_COOLDOWN_MS || openDurationMs < REDIS_MIN_OPEN_MS) {
    return {
      allow: false,
      halfOpen: false,
    };
  }

  if (redisSafetyState.halfOpenInFlight) {
    return {
      allow: false,
      halfOpen: false,
    };
  }

  redisSafetyState.halfOpenInFlight = true;

  return {
    allow: true,
    halfOpen: true,
  };
};

export const safeRedisCall = async <T>(
  fn: () => Promise<T> | T,
  fallback: FallbackValue<T>,
  options?: {
    operation?: string;
  }
): Promise<T> => {
  const decision = getRedisCircuitDecision();

  if (!decision.allow) {
    const operation = options?.operation || "redis";

    if (shouldLogRedisSkip(operation)) {
      logger.warn(
        {
          operation,
        },
        "Redis operation skipped while circuit is open"
      );
    }

    return resolveFallback(fallback);
  }

  try {
    const result = await fn();
    recordRedisSuccess();
    return result;
  } catch (error) {
    recordRedisFailure(error, options?.operation);
    return resolveFallback(fallback);
  } finally {
    if (decision.halfOpen) {
      redisSafetyState.halfOpenInFlight = false;
    }
  }
};

export const markRedisFailure = (error: unknown, operation?: string) => {
  recordRedisFailure(error, operation);
};

export const markRedisHealthy = () => {
  recordRedisSuccess();
};

export const isRedisHealthy = () =>
  !redisSafetyState.isOpen &&
  !redisSafetyState.fallbackModeEnabled &&
  !redisSafetyState.halfOpenInFlight;

export const isRedisCircuitOpen = () => redisSafetyState.isOpen;

export const getRedisCircuitState = (): RedisCircuitState => ({
  failures: redisSafetyState.failures,
  lastFailureTime: redisSafetyState.lastFailureTime,
  isOpen: redisSafetyState.isOpen,
  openSinceTime: redisSafetyState.openSinceTime,
  openDurationMs: redisSafetyState.isOpen
    ? Math.max(0, Date.now() - redisSafetyState.openSinceTime)
    : 0,
  halfOpenSuccesses: redisSafetyState.halfOpenSuccesses,
  cooldownRemainingMs: redisSafetyState.isOpen
    ? Math.max(
        0,
        REDIS_COOLDOWN_MS - (Date.now() - redisSafetyState.lastFailureTime)
      )
    : 0,
  minOpenRemainingMs: redisSafetyState.isOpen
    ? Math.max(0, REDIS_MIN_OPEN_MS - (Date.now() - redisSafetyState.openSinceTime))
    : 0,
});

export const shouldLogRedisSkip = (scope: string) => {
  const key = String(scope || "redis");
  const currentEpoch = redisSafetyState.circuitEpoch;

  if (redisSafetyState.skipLogEpochs[key] === currentEpoch) {
    return false;
  }

  redisSafetyState.skipLogEpochs[key] = currentEpoch;
  return true;
};

export const createEmptyRedisStream = () => {
  const stream = new PassThrough({
    objectMode: true,
  });

  setImmediate(() => {
    stream.end();
  });

  return stream;
};

export const getRedisCooldownMs = () => REDIS_COOLDOWN_MS;
export const getRedisMinOpenMs = () => REDIS_MIN_OPEN_MS;
