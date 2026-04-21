import { PassThrough } from "stream";
import logger from "../utils/logger";

export type RedisCircuitState = {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
};

type RedisSafetyState = RedisCircuitState & {
  halfOpenInFlight: boolean;
  fallbackModeEnabled: boolean;
  circuitEpoch: number;
  skipLogEpochs: Record<string, number>;
};

type FallbackValue<T> = T | (() => T);

const REDIS_FAILURE_THRESHOLD = 5;
const REDIS_COOLDOWN_MS = 30_000;

const globalForRedisSafety = globalThis as typeof globalThis & {
  __sylphRedisSafetyState?: RedisSafetyState;
};

const redisSafetyState =
  globalForRedisSafety.__sylphRedisSafetyState ||
  ({
    failures: 0,
    lastFailureTime: 0,
    isOpen: false,
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

const enableFallbackMode = () => {
  if (redisSafetyState.fallbackModeEnabled) {
    return;
  }

  redisSafetyState.fallbackModeEnabled = true;
  logger.warn("Redis fallback mode enabled");
};

const openRedisCircuit = () => {
  if (redisSafetyState.isOpen) {
    return;
  }

  redisSafetyState.isOpen = true;
  redisSafetyState.circuitEpoch += 1;
  logger.warn("Redis circuit OPEN");
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
  redisSafetyState.halfOpenInFlight = false;
  redisSafetyState.fallbackModeEnabled = false;

  if (wasOpen) {
    logger.info("Redis circuit CLOSED");
  }
};

const recordRedisFailure = (error: unknown, operation?: string) => {
  enableFallbackMode();

  redisSafetyState.failures += 1;
  redisSafetyState.lastFailureTime = Date.now();
  redisSafetyState.halfOpenInFlight = false;

  logger.debug(
    {
      operation: operation || "redis",
      failures: redisSafetyState.failures,
      error,
    },
    "Redis operation failed"
  );

  if (redisSafetyState.failures > REDIS_FAILURE_THRESHOLD) {
    openRedisCircuit();
  }
};

const recordRedisSuccess = () => {
  closeRedisCircuit();
};

const getRedisCircuitDecision = () => {
  if (!redisSafetyState.isOpen) {
    return {
      allow: true,
      halfOpen: false,
    };
  }

  const elapsed = Date.now() - redisSafetyState.lastFailureTime;

  if (elapsed < REDIS_COOLDOWN_MS) {
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
