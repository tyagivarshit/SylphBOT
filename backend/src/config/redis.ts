import Redis, { type ChainableCommander, type RedisOptions } from "ioredis";
import { env } from "./env";
import {
  createEmptyRedisStream,
  isRedisHealthy,
  markRedisFailure,
  markRedisHealthy,
  safeRedisCall,
} from "../redis/redisSafety";

const MANUAL_CLOSE_SYMBOL = Symbol.for("sylph.redis.manualClose");
const MAX_RECONNECT_ATTEMPTS = 5;

type ManagedRedisClient = Redis & {
  [MANUAL_CLOSE_SYMBOL]?: boolean;
};

const globalForRedis = globalThis as typeof globalThis & {
  __sylphRedis?: ManagedRedisClient;
  __sylphQueueRedis?: ManagedRedisClient;
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
    maxRetriesPerRequest: null,
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
  client.on("ready", () => {
    markRedisHealthy();
  });

  client.on("error", (error) => {
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
  const client = new Redis(
    env.REDIS_URL,
    buildRedisOptions(label)
  ) as ManagedRedisClient;

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
      return 0;
    case "mget":
      return [];
    default:
      return null;
  }
};

const buildChainFallback = (
  commands: Array<{ name: string }>
) => commands.map((command) => [null, getMethodFallback(command.name)]);

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

const createSafeRedisProxy = (
  client: ManagedRedisClient,
  label: string
) =>
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

const sharedRedisClient =
  globalForRedis.__sylphRedis || createRedisClient("shared");

if (!globalForRedis.__sylphRedis) {
  globalForRedis.__sylphRedis = sharedRedisClient;
}

const bullConnections =
  globalForRedis.__sylphBullConnections || new Set<ManagedRedisClient>();

if (!globalForRedis.__sylphBullConnections) {
  globalForRedis.__sylphBullConnections = bullConnections;
}

const trackBullConnection = (client: ManagedRedisClient) => {
  bullConnections.add(client);
  return client;
};

const untrackBullConnection = (client?: ManagedRedisClient) => {
  if (!client) {
    return;
  }

  bullConnections.delete(client);
};

const queueRedisClient =
  globalForRedis.__sylphQueueRedis ||
  trackBullConnection(createRedisClient("queue"));

if (!globalForRedis.__sylphQueueRedis) {
  globalForRedis.__sylphQueueRedis = queueRedisClient;
}

let workerConnectionCounter = 0;

export const redis = createSafeRedisProxy(sharedRedisClient, "redis");

export const getSharedRedisConnection = () => sharedRedisClient;

export const getQueueRedisConnection = () => queueRedisClient;

export const getWorkerRedisConnection = () =>
  trackBullConnection(
    createRedisClient(`worker:${++workerConnectionCounter}`)
  );

const closeClient = async (client?: ManagedRedisClient) => {
  if (!client) {
    return;
  }

  client[MANUAL_CLOSE_SYMBOL] = true;

  try {
    if (client.status === "end") {
      return;
    }

    await client.quit();
  } catch {
    client.disconnect(false);
  }
};

export const closeRedisConnection = async () => {
  const clients = Array.from(
    new Set([
      globalForRedis.__sylphRedis,
      globalForRedis.__sylphQueueRedis,
      ...Array.from(bullConnections.values()),
    ].filter(Boolean))
  );

  for (const client of clients) {
    await closeClient(client);
    untrackBullConnection(client);
  }

  globalForRedis.__sylphRedis = undefined;
  globalForRedis.__sylphQueueRedis = undefined;
  globalForRedis.__sylphBullConnections = undefined;
};

export { isRedisHealthy } from "../redis/redisSafety";

export default redis;
