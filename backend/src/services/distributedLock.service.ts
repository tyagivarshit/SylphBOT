import crypto from "crypto";
import { getSharedRedisConnection } from "../config/redis";
import {
  recordMetricSnapshot,
  recordObservabilityEvent,
} from "./reliability/reliabilityOS.service";

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const EXTEND_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[2]))
end
return 0
`;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const runWithTimeout = async <T>({
  promise,
  timeoutMs,
  timeoutMessage,
}: {
  promise: Promise<T>;
  timeoutMs: number;
  timeoutMessage: string;
}) => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export type DistributedLockHandle = {
  key: string;
  token: string;
  ttlMs: number;
  extend: (ttlOverrideMs?: number) => Promise<boolean>;
  release: () => Promise<void>;
};

export const acquireDistributedLock = async ({
  key,
  ttlMs,
  waitMs = 0,
  pollMs = 50,
  token,
  refreshIntervalMs = 0,
}: {
  key: string;
  ttlMs: number;
  waitMs?: number;
  pollMs?: number;
  token?: string;
  refreshIntervalMs?: number;
}): Promise<DistributedLockHandle | null> => {
  const redis = getSharedRedisConnection();
  const lockToken = token || crypto.randomUUID();
  const deadline = Date.now() + Math.max(0, waitMs);
  const effectivePollMs = Math.max(10, pollMs);

  do {
    const remainingWaitMs = Math.max(0, deadline - Date.now());
    const commandTimeoutMs = Math.max(
      50,
      Math.min(
        ttlMs,
        waitMs > 0 ? Math.max(remainingWaitMs, effectivePollMs) : effectivePollMs,
        1000
      )
    );

    let result: string | null = null;

    try {
      result = await runWithTimeout({
        promise: redis.set(key, lockToken, "PX", ttlMs, "NX"),
        timeoutMs: commandTimeoutMs,
        timeoutMessage: `distributed_lock_acquire_timeout:${key}`,
      });
    } catch {
      result = null;
    }

    if (result === "OK") {
      let released = false;
      let refreshTimer: ReturnType<typeof setInterval> | null = null;

      const stopRefreshTimer = () => {
        if (!refreshTimer) {
          return;
        }

        clearInterval(refreshTimer);
        refreshTimer = null;
      };

      const extend = async (ttlOverrideMs = ttlMs) => {
        if (released) {
          return false;
        }

        const extended = await extendDistributedLock({
          key,
          token: lockToken,
          ttlMs: ttlOverrideMs,
        });

        if (!extended) {
          stopRefreshTimer();
        }

        return extended;
      };

      if (refreshIntervalMs > 0) {
        refreshTimer = setInterval(() => {
          void extend(ttlMs).catch(() => {
            stopRefreshTimer();
          });
        }, Math.max(50, refreshIntervalMs));
      }

      return {
        key,
        token: lockToken,
        ttlMs,
        extend,
        release: async () => {
          if (released) {
            return;
          }

          released = true;
          stopRefreshTimer();

          await releaseDistributedLock({
            key,
            token: lockToken,
          });
        },
      };
    }

    if (Date.now() >= deadline) {
      break;
    }

    await sleep(effectivePollMs);
  } while (Date.now() <= deadline);

  await recordMetricSnapshot({
    subsystem: "LOCKS",
    queueLag: 0,
    workerUtilization: 0,
    dlqRate: 0,
    retryRate: 0,
    lockContention: 1,
    providerErrorRate: 0,
    metadata: {
      lockKey: key,
      ttlMs,
      waitMs,
      pollMs,
      event: "lock_unavailable",
    },
  }).catch(() => undefined);

  await recordObservabilityEvent({
    eventType: "lock.acquire.unavailable",
    message: `Unable to acquire distributed lock for ${key}`,
    severity: "warn",
    context: {
      component: "locks",
      phase: "acquire",
    },
    metadata: {
      lockKey: key,
      ttlMs,
      waitMs,
      pollMs,
    },
  }).catch(() => undefined);

  return null;
};

export const releaseDistributedLock = async ({
  key,
  token,
}: {
  key: string;
  token: string;
}) => {
  const redis = getSharedRedisConnection();

  await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
};

export const extendDistributedLock = async ({
  key,
  token,
  ttlMs,
}: {
  key: string;
  token: string;
  ttlMs: number;
}) => {
  const redis = getSharedRedisConnection();
  const result = await redis.eval(EXTEND_LOCK_SCRIPT, 1, key, token, String(ttlMs));
  return Number(result) === 1;
};

export const withDistributedLock = async <T>({
  key,
  ttlMs,
  waitMs = 0,
  pollMs = 50,
  token,
  refreshIntervalMs = 0,
  onUnavailable,
  run,
}: {
  key: string;
  ttlMs: number;
  waitMs?: number;
  pollMs?: number;
  token?: string;
  refreshIntervalMs?: number;
  onUnavailable?: () => T | Promise<T>;
  run: (lock: DistributedLockHandle) => Promise<T>;
}) => {
  const lock = await acquireDistributedLock({
    key,
    ttlMs,
    waitMs,
    pollMs,
    token,
    refreshIntervalMs,
  });

  if (!lock) {
    if (onUnavailable) {
      return await onUnavailable();
    }

    throw new Error(`Unable to acquire lock: ${key}`);
  }

  try {
    return await run(lock);
  } finally {
    await lock.release().catch(() => undefined);
  }
};
