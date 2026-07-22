import Redis, { type ChainableCommander, type RedisOptions } from "ioredis";
import { env } from "./env";
import {
  createEmptyRedisStream,
  isRedisTransientError,
  isRedisHealthy,
  isRedisCircuitOpen,
  markRedisFailure,
  markRedisHealthy,
  safeRedisCall,
  shouldLogRedisSkip,
} from "../redis/redisSafety";
import logger from "../utils/logger";
import { requestStorage, getRequestRemainingMs } from "../utils/requestLifecycle";

const MANUAL_CLOSE_SYMBOL = Symbol.for("sylph.redis.manualClose");
const MAX_RECONNECT_ATTEMPTS = Math.max(
  3,
  Number(process.env.REDIS_MAX_RECONNECT_ATTEMPTS || 8)
);
const REDIS_READY_POLL_MS = 50;
const REDIS_RECONNECT_JITTER_MS = Math.max(
  10,
  Number(process.env.REDIS_RECONNECT_JITTER_MS || 180)
);

type ManagedRedisClient = Redis & {
  [MANUAL_CLOSE_SYMBOL]?: boolean;
};

type RedisReconnectStats = {
  attempts: number;
  lastAttemptAtMs: number;
  lastDelayMs: number;
  byConnection: Record<
    string,
    {
      attempts: number;
      lastAttemptAtMs: number;
      lastDelayMs: number;
    }
  >;
};

const globalForRedis = globalThis as typeof globalThis & {
  __sylphRedis?: ManagedRedisClient;
  __sylphQueueRedis?: ManagedRedisClient;
  __sylphRedisProxy?: ManagedRedisClient;
  __sylphRedisProxyClient?: ManagedRedisClient;
  __sylphBullConnections?: Set<ManagedRedisClient>;
  __sylphRedisReconnectStats?: RedisReconnectStats;
};

const isRetryableRedisError = (error: unknown) => isRedisTransientError(error);

const getRedisReconnectStats = () => {
  if (!globalForRedis.__sylphRedisReconnectStats) {
    globalForRedis.__sylphRedisReconnectStats = {
      attempts: 0,
      lastAttemptAtMs: 0,
      lastDelayMs: 0,
      byConnection: {},
    };
  }
  return globalForRedis.__sylphRedisReconnectStats;
};

const noteRedisReconnectAttempt = (
  connectionName: string,
  attempt: number,
  delayMs: number
) => {
  const stats = getRedisReconnectStats();
  const now = Date.now();
  const key = String(connectionName || "unknown");
  const previous = stats.byConnection[key];
  stats.attempts += 1;
  stats.lastAttemptAtMs = now;
  stats.lastDelayMs = Math.max(0, Math.floor(delayMs));
  stats.byConnection[key] = {
    attempts: Math.max(previous?.attempts || 0, Math.max(0, Math.floor(attempt))),
    lastAttemptAtMs: now,
    lastDelayMs: stats.lastDelayMs,
  };
};

const noteRedisConnectionReady = (connectionName: string) => {
  const stats = getRedisReconnectStats();
  const key = String(connectionName || "unknown");
  const previous = stats.byConnection[key];
  if (!previous) {
    return;
  }

  stats.byConnection[key] = {
    attempts: 0,
    lastAttemptAtMs: previous.lastAttemptAtMs,
    lastDelayMs: previous.lastDelayMs,
  };
};

const buildRedisOptions = (connectionName: string): RedisOptions => {
  const isTlsRedisUrl = env.REDIS_URL.startsWith("rediss://");
  const isPlainRedisUrl = env.REDIS_URL.startsWith("redis://");
  const allowPlainRedis =
    process.env.NODE_ENV === "integration" || process.env.NODE_ENV === "test";

  if (!isTlsRedisUrl && !(allowPlainRedis && isPlainRedisUrl)) {
    throw new Error(
      "REDIS_URL must use rediss:// (or redis:// in integration/test mode)"
    );
  }

  const isWorker = connectionName.startsWith("worker");

  return {
    connectionName,
    enableReadyCheck: false,
    enableAutoPipelining: true,
    enableOfflineQueue: false,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: false,
    lazyConnect: true,
    keepAlive: 30000,
    noDelay: true,
    maxRetriesPerRequest: isWorker ? null : 3,
    connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy(attempts) {
      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        return null;
      }

      // If the Redis circuit is open or Redis is not healthy, back off aggressively
      // to prevent DNS reconnect storms and threadpool starvation.
      if (isRedisCircuitOpen() || !isRedisHealthy()) {
        const backoffDelay = 15_000 + Math.floor(Math.random() * 5000); // 15-20 seconds jittered
        noteRedisReconnectAttempt(connectionName, attempts, backoffDelay);
        return backoffDelay;
      }

      const exponentialDelay = Math.min(
        env.REDIS_RETRY_DELAY_MS * 2 ** Math.max(attempts - 1, 0),
        env.REDIS_MAX_RETRY_DELAY_MS
      );
      const jitterMs = Math.floor(Math.random() * REDIS_RECONNECT_JITTER_MS);
      const delayMs = Math.min(
        env.REDIS_MAX_RETRY_DELAY_MS,
        exponentialDelay + jitterMs
      );
      noteRedisReconnectAttempt(connectionName, attempts, delayMs);
      return delayMs;
    },
    reconnectOnError(error) {
      return isRetryableRedisError(error) ? 1 : false;
    },
    tls: isTlsRedisUrl ? {} : undefined,
  };
};

const attachRedisListeners = (client: ManagedRedisClient, label: string) => {
  client.on("connect", () => {
    logger.info({ label }, "Redis client connected");
  });

  client.on("ready", () => {
    noteRedisConnectionReady(label);
    markRedisHealthy();
  });

  client.on("reconnecting", (delay: number) => {
    noteRedisReconnectAttempt(label, 0, Number(delay) || 0);
  });

  client.on("error", (error) => {
    logger.error({ err: error, label }, "Redis client error");
    markRedisFailure(error, `redis:${label}:error`);
  });

  client.on("close", () => {
    if (client[MANUAL_CLOSE_SYMBOL]) {
      return;
    }

    markRedisFailure(new Error("Redis connection closed"), `redis:${label}:close`);
  });

  client.on("end", () => {
    if (client[MANUAL_CLOSE_SYMBOL]) {
      return;
    }

    markRedisFailure(new Error("Redis connection ended"), `redis:${label}:end`);
  });
};

const createRedisClient = (label: string) => {
  const client = new Redis(env.REDIS_URL, buildRedisOptions(label)) as ManagedRedisClient;
  attachRedisListeners(client, label);
  return client;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isAlreadyConnectedError = (error: unknown) =>
  /already connecting|already connected/i.test(
    String((error as { message?: unknown })?.message || error || "")
  );

const isRedisClientWritable = (client?: ManagedRedisClient | null) =>
  Boolean(client && client.status === "ready");

const REDIS_CONTROL_METHODS = new Set([
  "connect",
  "disconnect",
  "quit",
  "duplicate",
  "on",
  "once",
  "off",
  "emit",
  "addlistener",
  "removelistener",
  "removealllisteners",
  "listeners",
  "listenercount",
]);

const shouldBypassRedisCommandDuringReconnect = (methodName: string) =>
  methodName.length > 0 && !REDIS_CONTROL_METHODS.has(methodName.toLowerCase());

const getMethodFallback = (methodName: string) => {
  switch (methodName) {
    case "get":
    case "hget":
    case "set":
    case "setex":
    case "setnx":
    case "ping":
    case "call":
    case "eval":
      return null;
    case "hgetall":
      return {};
    case "hmget":
    case "hkeys":
      return [];
    case "pttl":
    case "ttl":
      return -1;
    case "hset":
    case "hdel":
    case "hincrby":
    case "incrby":
    case "decrby":
    case "pexpire":
    case "expireat":
    case "pexpireat":
    case "persist":
    case "publish":
    case "sadd":
    case "srem":
    case "lpush":
    case "rpush":
    case "ltrim":
    case "zincrby":
    case "zrem":
    case "zadd":
      return 0;
    case "hexists":
    case "sismember":
      return 0;
    case "del":
    case "expire":
    case "incr":
    case "zremrangebyscore":
    case "zcard":
    case "zcount":
    case "exists":
      return 0;
    case "mset":
      return "OK";
    case "mget":
    case "smembers":
    case "lrange":
    case "zrange":
    case "zrangebyscore":
    case "keys":
    case "scan":
      return [];
    case "zscore":
      return null;
    default:
      return null;
  }
};

const buildChainFallback = (commands: Array<{ name: string }>) =>
  commands.map((command) => [null, getMethodFallback(command.name)]);

const createSafeCommandChainProxy = <T extends ChainableCommander>(
  chain: T,
  label: string
): T => {
  const commands: Array<{ name: string }> = [];
  let proxy: T;

  proxy = new Proxy(chain, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") {
        return value;
      }

      if (property === "exec" || property === "execBuffer") {
        return (...args: unknown[]) =>
          safeRedisCall(
            () => (value as (...methodArgs: unknown[]) => unknown).apply(target, args),
            () => buildChainFallback(commands),
            {
              operation: `${label}.${String(property)}`,
            }
          );
      }

      return (...args: unknown[]) => {
        const result = (value as (...methodArgs: unknown[]) => unknown).apply(
          target,
          args
        );

        commands.push({
          name: String(property),
        });

        return result === target ? proxy : result;
      };
    },
  }) as T;

  return proxy;
};

const createSafeRedisProxy = (client: ManagedRedisClient, label: string) =>
  new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") {
        return value;
      }

      const methodName = String(property);

      if (REDIS_CONTROL_METHODS.has(methodName.toLowerCase())) {
        return (...args: unknown[]) =>
          (value as (...methodArgs: unknown[]) => unknown).apply(target, args);
      }

      if (property === "multi" || property === "pipeline") {
        return (...args: unknown[]) =>
          createSafeCommandChainProxy(
            (value as (...methodArgs: unknown[]) => ChainableCommander).apply(
              target,
              args
            ),
            `${label}.${String(property)}`
          );
      }

      if (property === "scanStream") {
        return (...args: unknown[]) => {
          if (!isRedisHealthy()) {
            return createEmptyRedisStream();
          }

          try {
            return (value as (...methodArgs: unknown[]) => unknown).apply(
              target,
              args
            );
          } catch (error) {
            markRedisFailure(error, `${label}.scanStream`);
            return createEmptyRedisStream();
          }
        };
      }

      return (...args: unknown[]) =>
        {
          const operation = `${label}.${methodName}`;

          if (
            !isRedisClientWritable(target) &&
            shouldBypassRedisCommandDuringReconnect(methodName)
          ) {
            if (shouldLogRedisSkip(`${operation}:redis_not_ready`)) {
              logger.warn(
                {
                  operation,
                  status: target.status,
                },
                "Redis command bypassed while connection is not writable"
              );
            }

            return Promise.resolve(getMethodFallback(methodName));
          }

          return safeRedisCall(
            () => (value as (...methodArgs: unknown[]) => unknown).apply(target, args),
            getMethodFallback(methodName),
            {
              operation,
            }
          );
        };
    },
  }) as ManagedRedisClient;

const getBullConnections = () => {
  if (!globalForRedis.__sylphBullConnections) {
    globalForRedis.__sylphBullConnections = new Set<ManagedRedisClient>();
  }

  return globalForRedis.__sylphBullConnections;
};

const trackBullConnection = (client: ManagedRedisClient) => {
  getBullConnections().add(client);
  return client;
};

const untrackBullConnection = (client?: ManagedRedisClient) => {
  if (!client) {
    return;
  }

  getBullConnections().delete(client);
};

const ensureSharedRedisClient = () => {
  if (!globalForRedis.__sylphRedis) {
    globalForRedis.__sylphRedis = createRedisClient("shared");
  }

  return globalForRedis.__sylphRedis;
};

const ensureQueueRedisClient = () => {
  if (!globalForRedis.__sylphQueueRedis) {
    globalForRedis.__sylphQueueRedis = trackBullConnection(createRedisClient("queue"));
  }

  return globalForRedis.__sylphQueueRedis;
};

const ensureSharedRedisProxy = () => {
  const client = ensureSharedRedisClient();

  if (
    !globalForRedis.__sylphRedisProxy ||
    globalForRedis.__sylphRedisProxyClient !== client
  ) {
    globalForRedis.__sylphRedisProxy = createSafeRedisProxy(client, "redis");
    globalForRedis.__sylphRedisProxyClient = client;
  }

  return globalForRedis.__sylphRedisProxy;
};

let workerConnectionCounter = 0;

const maybeConnectClient = async (client: ManagedRedisClient) => {
  if (client.status !== "wait" && client.status !== "end") {
    return;
  }

  try {
    await client.connect();
  } catch (error) {
    if (!isAlreadyConnectedError(error)) {
      throw error;
    }
  }
};

const waitForClientReady = async (
  client: ManagedRedisClient,
  label: string,
  timeoutMs: number
) => {
  if (isRedisClientWritable(client)) {
    return;
  }

  // Fail fast immediately if the circuit breaker is open or Redis is down
  if (isRedisCircuitOpen() || !isRedisHealthy()) {
    throw new Error(`redis_not_ready:${label} (circuit open)`);
  }

  let lastError: unknown = null;
  const onError = (error: unknown) => {
    lastError = error;
  };

  client.on("error", onError);
  const deadline = Date.now() + timeoutMs;

  try {
    // Initiate connect once; do not loop client.connect() to prevent DNS spam
    try {
      await maybeConnectClient(client);
    } catch (error) {
      lastError = error;
    }

    while (Date.now() <= deadline) {
      if (isRedisClientWritable(client)) {
        return;
      }

      // Check if circuit breaker opened during wait
      if (isRedisCircuitOpen() || !isRedisHealthy()) {
        throw new Error(`redis_not_ready:${label} (circuit opened during wait)`);
      }

      await sleep(REDIS_READY_POLL_MS);
    }
  } finally {
    client.off("error", onError);
  }

  const suffix = lastError
    ? `: ${String((lastError as { message?: unknown })?.message || lastError)}`
    : "";
  throw new Error(`redis_not_ready:${label}${suffix}`);
};

export const initRedis = () => ({
  shared: ensureSharedRedisClient(),
  queue: ensureQueueRedisClient(),
});

export const isSharedRedisWritable = () =>
  isRedisClientWritable(globalForRedis.__sylphRedis);

export const isQueueRedisWritable = () =>
  isRedisClientWritable(globalForRedis.__sylphQueueRedis);

export const isRedisWritable = () => isSharedRedisWritable();

let lastQueueRecoveryAttemptAt = 0;
const QUEUE_RECOVERY_COOLDOWN_MS = 30_000; // 30 seconds cooldown

export const ensureBackgroundQueueRecovery = () => {
  const queueClient = globalForRedis.__sylphQueueRedis;
  if (!queueClient) {
    return;
  }

  // Stop recovery attempts if circuit is open/unhealthy
  if (isRedisCircuitOpen() || !isRedisHealthy()) {
    return;
  }

  const now = Date.now();
  if (now - lastQueueRecoveryAttemptAt < QUEUE_RECOVERY_COOLDOWN_MS) {
    return;
  }

  if (queueClient.status === "end" || queueClient.status === "wait") {
    lastQueueRecoveryAttemptAt = now;
    logger.info({ status: queueClient.status }, "Background Queue Recovery: queue Redis in wait/end state, initiating reconnect...");
    queueClient.connect().catch((err) => {
      if (!isAlreadyConnectedError(err)) {
        logger.warn({ err }, "Background Queue Recovery reconnect attempt failed");
      }
    });
  }
};

export const waitForRedisReady = async (input?: {
  requireQueue?: boolean;
  timeoutMs?: number;
}) => {
  const store = requestStorage.getStore();
  const isRequestPath = Boolean(store);
  
  let timeoutMs = input?.timeoutMs;
  if (timeoutMs === undefined || timeoutMs === null) {
    if (isRequestPath) {
      const remainingMs = getRequestRemainingMs(null, 2000);
      timeoutMs = Math.min(2000, remainingMs);
    } else {
      timeoutMs = Math.max(env.REDIS_CONNECT_TIMEOUT_MS * 3, 15_000);
    }
  } else {
    if (isRequestPath) {
      const remainingMs = getRequestRemainingMs(null, timeoutMs);
      timeoutMs = Math.min(timeoutMs, remainingMs);
    }
  }

  timeoutMs = Math.max(1_000, Math.floor(Number(timeoutMs)));
  
  const shared = ensureSharedRedisClient();
  try {
    await waitForClientReady(shared, "shared", timeoutMs);
  } catch (error) {
    if (isRequestPath) {
      logger.warn({ error, timeoutMs }, "Redis shared client not ready on request path, failing open/stale and continuing async recovery");
    } else {
      throw error;
    }
  }

  if (input?.requireQueue === false || isRequestPath) {
    if (isRequestPath) {
      const queueClient = ensureQueueRedisClient();
      if (queueClient.status !== "ready") {
        logger.info({ status: queueClient.status }, "Queue Redis not ready on request path, triggering background recovery");
        ensureBackgroundQueueRecovery();
      }
    }
    return {
      shared,
      queue: input?.requireQueue === false ? null : ensureQueueRedisClient(),
    };
  }

  const queue = ensureQueueRedisClient();
  await waitForClientReady(queue, "queue", timeoutMs);

  return {
    shared,
    queue,
  };
};

export const getSharedRedisConnection = () => ensureSharedRedisClient();

export const getResilientSharedRedisConnection = () => ensureSharedRedisProxy();

export const getQueueRedisConnection = () => ensureQueueRedisClient();

export const getWorkerRedisConnection = () =>
  trackBullConnection(createRedisClient(`worker:${++workerConnectionCounter}`));

const closeClient = async (client?: ManagedRedisClient) => {
  if (!client) {
    return;
  }

  client[MANUAL_CLOSE_SYMBOL] = true;

  try {
    if (client.status === "end") {
      return;
    }

    if (client.status === "wait") {
      client.disconnect(false);
      return;
    }

    await client.quit();
  } catch {
    client.disconnect(false);
  }
};

export const closeRedisConnection = async () => {
  const clients = Array.from(
    new Set(
      [
        globalForRedis.__sylphRedis,
        globalForRedis.__sylphQueueRedis,
        ...Array.from(getBullConnections().values()),
      ].filter(Boolean)
    )
  );

  for (const client of clients) {
    await closeClient(client);
    untrackBullConnection(client);
  }

  globalForRedis.__sylphRedis = undefined;
  globalForRedis.__sylphQueueRedis = undefined;
  globalForRedis.__sylphRedisProxy = undefined;
  globalForRedis.__sylphRedisProxyClient = undefined;
  globalForRedis.__sylphBullConnections = undefined;
  globalForRedis.__sylphRedisReconnectStats = undefined;
};

const redis = new Proxy({} as ManagedRedisClient, {
  get(_target, property) {
    return Reflect.get(ensureSharedRedisProxy(), property);
  },
}) as ManagedRedisClient;

export { isRedisHealthy } from "../redis/redisSafety";

export const __redisRuntimeTestInternals = {
  isAlreadyConnectedError,
  isRedisClientWritable,
  waitForClientReady,
};

export const getRedisReconnectSnapshot = () => {
  const stats = getRedisReconnectStats();
  return {
    attempts: stats.attempts,
    lastAttemptAtMs: stats.lastAttemptAtMs,
    lastDelayMs: stats.lastDelayMs,
    byConnection: { ...stats.byConnection },
  };
};

export default redis;

import { RedisConnection } from "bullmq";

// Safely suppress unhandled RedisConnection error events during shutdown/initializing race conditions to prevent crashes.
const originalEmit = RedisConnection.prototype.emit;
RedisConnection.prototype.emit = function (event: string | symbol, ...args: any[]) {
  if (event === "error") {
    if (this.listenerCount("error") === 0) {
      logger.warn(
        { err: args[0] },
        "Suppressing unhandled RedisConnection error event to prevent crash"
      );
      return false;
    }
  }
  return originalEmit.apply(this, [event, ...args]);
};
