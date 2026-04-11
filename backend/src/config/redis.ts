import Redis, { type RedisOptions } from "ioredis";
import { env } from "./env";

type RedisClientCache = {
  defaultRedis?: Redis;
  workerRedis?: Redis;
};

const globalForRedis = globalThis as typeof globalThis & {
  __sylphRedis?: RedisClientCache;
};

const isRetryableRedisError = (message: string) =>
  /ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|READONLY/i.test(message);

const buildRedisOptions = (connectionName: string): RedisOptions => {
  const usesTls = env.REDIS_URL.startsWith("rediss://");

  return {
    connectionName,
    enableReadyCheck: false,
    enableAutoPipelining: true,
    lazyConnect: true,
    keepAlive: 30000,
    maxRetriesPerRequest: null,
    connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy(attempts) {
      return Math.min(
        attempts * env.REDIS_RETRY_DELAY_MS,
        env.REDIS_MAX_RETRY_DELAY_MS
      );
    },
    reconnectOnError(error) {
      return isRetryableRedisError(error.message) ? 1 : false;
    },
    ...(usesTls ? { tls: {} } : {}),
  };
};

const attachRedisListeners = (client: Redis, label: string) => {
  client.on("error", (error) => {
    if (isRetryableRedisError(error.message)) {
      return;
    }

    console.error(`[redis:${label}] ${error.message}`);
  });
};

const createRedisClient = (label: string) => {
  const client = new Redis(env.REDIS_URL, buildRedisOptions(label));
  attachRedisListeners(client, label);
  return client;
};

const cache = globalForRedis.__sylphRedis || {};

export const redis = cache.defaultRedis || createRedisClient("app");
cache.defaultRedis = redis;
globalForRedis.__sylphRedis = cache;

export const getQueueRedisConnection = () => redis;

export const getWorkerRedisConnection = () => {
  if (!cache.workerRedis) {
    cache.workerRedis = createRedisClient("ai-worker");
    globalForRedis.__sylphRedis = cache;
  }

  return cache.workerRedis;
};

const closeClient = async (client?: Redis) => {
  if (!client) {
    return;
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
  const clients = Array.from(
    new Set([cache.defaultRedis, cache.workerRedis].filter(Boolean))
  ) as Redis[];

  await Promise.allSettled(clients.map((client) => closeClient(client)));

  cache.defaultRedis = undefined;
  cache.workerRedis = undefined;
  globalForRedis.__sylphRedis = cache;
};

export default redis;
