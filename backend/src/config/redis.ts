import Redis, { type ChainableCommander, type RedisOptions } from "ioredis";
import { env } from "./env";
import {
  createEmptyRedisStream,
  isRedisHealthy,
  markRedisFailure,
  markRedisHealthy,
  safeRedisCall,
} from "../redis/redisSafety";
import logger from "../utils/logger";

const MANUAL_CLOSE_SYMBOL = Symbol.for("sylph.redis.manualClose");
const MAX_RECONNECT_ATTEMPTS = 5;

type ManagedRedisClient = Redis & {
  [MANUAL_CLOSE_SYMBOL]?: boolean;
};

const globalForRedis = globalThis as typeof globalThis & {
  __sylphRedis?: ManagedRedisClient;
  __sylphQueueRedis?: ManagedRedisClient;
  __sylphRedisProxy?: ManagedRedisClient;
  __sylphRedisProxyClient?: ManagedRedisClient;
  __sylphBullConnections?: Set<ManagedRedisClient>;
};

const isRetryableRedisError = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message || error || "");

  return /ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|READONLY|Connection is closed|Socket closed unexpectedly|Connection is in closed state/i.test(
    message
  );
};

const buildRedisOptions = (connectionName: string): RedisOptions => {
  if (!env.REDIS_URL.startsWith("rediss://")) {
    throw new Error("REDIS_URL must use rediss:// for Upstash TLS connections");
  }

  const isWorker = connectionName.startsWith("worker");

  return {
    connectionName,
    enableReadyCheck: false,
    enableAutoPipelining: true,
    enableOfflineQueue: true,
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

      return Math.min(
        env.REDIS_RETRY_DELAY_MS * 2 ** Math.max(attempts - 1, 0),
        env.REDIS_MAX_RETRY_DELAY_MS
      );
    },
    reconnectOnError(error) {
      return isRetryableRedisError(error) ? 1 : false;
    },
    tls: {},
  };
};

const attachRedisListeners = (client: ManagedRedisClient, label: string) => {
  client.on("connect", () => {
    markRedisHealthy();
    logger.info({ label }, "Redis client connected");
  });

  client.on("ready", () => {
    markRedisHealthy();
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

const getMethodFallback = (methodName: string) => {
  switch (methodName) {
    case "get":
    case "set":
    case "ping":
    case "call":
    case "eval":
      return null;
    case "ttl":
      return -1;
    case "del":
    case "expire":
    case "incr":
    case "zadd":
    case "zremrangebyscore":
    case "zcard":
    case "exists":
      return 0;
    case "mget":
    case "keys":
      return [];
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
        safeRedisCall(
          () => (value as (...methodArgs: unknown[]) => unknown).apply(target, args),
          getMethodFallback(String(property)),
          {
            operation: `${label}.${String(property)}`,
          }
        );
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

export const initRedis = () => ({
  shared: ensureSharedRedisClient(),
  queue: ensureQueueRedisClient(),
});

export const getSharedRedisConnection = () => ensureSharedRedisClient();

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
};

const redis = new Proxy({} as ManagedRedisClient, {
  get(_target, property) {
    return Reflect.get(ensureSharedRedisProxy(), property);
  },
}) as ManagedRedisClient;

export { isRedisHealthy } from "../redis/redisSafety";

export default redis;
