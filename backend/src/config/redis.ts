import Redis, { type RedisOptions } from "ioredis";
import { env } from "./env";

const MANUAL_CLOSE_SYMBOL = Symbol.for("sylph.redis.manualClose");
const RECONNECT_TIMEOUT_SYMBOL = Symbol.for("sylph.redis.reconnectTimeout");

type ManagedRedisClient = Redis & {
  [MANUAL_CLOSE_SYMBOL]?: boolean;
  [RECONNECT_TIMEOUT_SYMBOL]?: NodeJS.Timeout | null;
};

const globalForRedis = globalThis as typeof globalThis & {
  __sylphRedis?: ManagedRedisClient;
};

const isRetryableRedisError = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message || error || "");

  return /ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|READONLY|Connection is closed|Socket closed unexpectedly/i.test(
    message
  );
};

const scheduleReconnect = (client: ManagedRedisClient, label: string) => {
  if (client[MANUAL_CLOSE_SYMBOL]) {
    return;
  }

  if (
    client.status === "ready" ||
    client.status === "connect" ||
    client.status === "connecting" ||
    client.status === "reconnecting"
  ) {
    return;
  }

  if (client[RECONNECT_TIMEOUT_SYMBOL]) {
    return;
  }

  client[RECONNECT_TIMEOUT_SYMBOL] = setTimeout(() => {
    client[RECONNECT_TIMEOUT_SYMBOL] = null;

    if (
      client[MANUAL_CLOSE_SYMBOL] ||
      (client.status !== "wait" && client.status !== "end")
    ) {
      return;
    }

    void client.connect().catch((error) => {
      console.error(
        `[redis:${label}] reconnect failed: ${String(
          (error as { message?: unknown })?.message || error
        )}`
      );
      scheduleReconnect(client, label);
    });
  }, env.REDIS_RETRY_DELAY_MS);

  client[RECONNECT_TIMEOUT_SYMBOL]?.unref?.();
};

const buildRedisOptions = (connectionName: string): RedisOptions => {
  if (!env.REDIS_URL.startsWith("rediss://")) {
    throw new Error("REDIS_URL must use rediss:// for Upstash TLS connections");
  }

  return {
    connectionName,
    enableReadyCheck: false,
    enableAutoPipelining: true,
    enableOfflineQueue: true,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
    lazyConnect: true,
    keepAlive: 30000,
    noDelay: true,
    maxRetriesPerRequest: null,
    connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy(attempts) {
      return Math.min(
        attempts * env.REDIS_RETRY_DELAY_MS,
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
  client.on("error", (error) => {
    console.error(`[redis:${label}] ${error.message}`);
  });

  client.on("close", () => {
    console.warn(`[redis:${label}] connection closed`);
    scheduleReconnect(client, label);
  });

  client.on("reconnecting", (delay?: number) => {
    console.warn(
      `[redis:${label}] reconnecting in ${delay ?? env.REDIS_RETRY_DELAY_MS}ms`
    );
  });

  client.on("end", () => {
    console.warn(`[redis:${label}] connection ended`);
    scheduleReconnect(client, label);
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

export const redis = globalForRedis.__sylphRedis || createRedisClient("shared");
globalForRedis.__sylphRedis = redis;

export const getQueueRedisConnection = () => redis;

export const getWorkerRedisConnection = () => redis;

const closeClient = async (client?: ManagedRedisClient) => {
  if (!client) {
    return;
  }

  client[MANUAL_CLOSE_SYMBOL] = true;

  if (client[RECONNECT_TIMEOUT_SYMBOL]) {
    clearTimeout(client[RECONNECT_TIMEOUT_SYMBOL]);
    client[RECONNECT_TIMEOUT_SYMBOL] = null;
  }

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
  await closeClient(globalForRedis.__sylphRedis);
  globalForRedis.__sylphRedis = undefined;
};

export default redis;
