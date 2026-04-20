"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeRedisConnection = exports.getWorkerRedisConnection = exports.getQueueRedisConnection = exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
const MANUAL_CLOSE_SYMBOL = Symbol.for("sylph.redis.manualClose");
const RECONNECT_TIMEOUT_SYMBOL = Symbol.for("sylph.redis.reconnectTimeout");
const globalForRedis = globalThis;
const isRetryableRedisError = (error) => {
    const message = String(error?.message || error || "");
    return /ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|READONLY|Connection is closed|Socket closed unexpectedly/i.test(message);
};
const scheduleReconnect = (client, label) => {
    if (client[MANUAL_CLOSE_SYMBOL]) {
        return;
    }
    if (client.status === "ready" ||
        client.status === "connect" ||
        client.status === "connecting" ||
        client.status === "reconnecting") {
        return;
    }
    if (client[RECONNECT_TIMEOUT_SYMBOL]) {
        return;
    }
    client[RECONNECT_TIMEOUT_SYMBOL] = setTimeout(() => {
        client[RECONNECT_TIMEOUT_SYMBOL] = null;
        if (client[MANUAL_CLOSE_SYMBOL] ||
            (client.status !== "wait" && client.status !== "end")) {
            return;
        }
        void client.connect().catch((error) => {
            console.error(`[redis:${label}] reconnect failed: ${String(error?.message || error)}`);
            scheduleReconnect(client, label);
        });
    }, env_1.env.REDIS_RETRY_DELAY_MS);
    client[RECONNECT_TIMEOUT_SYMBOL]?.unref?.();
};
const buildRedisOptions = (connectionName) => {
    if (!env_1.env.REDIS_URL.startsWith("rediss://")) {
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
        connectTimeout: env_1.env.REDIS_CONNECT_TIMEOUT_MS,
        retryStrategy(attempts) {
            return Math.min(attempts * env_1.env.REDIS_RETRY_DELAY_MS, env_1.env.REDIS_MAX_RETRY_DELAY_MS);
        },
        reconnectOnError(error) {
            return isRetryableRedisError(error) ? 1 : false;
        },
        tls: {},
    };
};
const attachRedisListeners = (client, label) => {
    client.on("error", (error) => {
        console.error(`[redis:${label}] ${error.message}`);
    });
    client.on("close", () => {
        console.warn(`[redis:${label}] connection closed`);
        scheduleReconnect(client, label);
    });
    client.on("reconnecting", (delay) => {
        console.warn(`[redis:${label}] reconnecting in ${delay ?? env_1.env.REDIS_RETRY_DELAY_MS}ms`);
    });
    client.on("end", () => {
        console.warn(`[redis:${label}] connection ended`);
        scheduleReconnect(client, label);
    });
};
const createRedisClient = (label) => {
    const client = new ioredis_1.default(env_1.env.REDIS_URL, buildRedisOptions(label));
    attachRedisListeners(client, label);
    return client;
};
exports.redis = globalForRedis.__sylphRedis || createRedisClient("shared");
globalForRedis.__sylphRedis = exports.redis;
const bullConnections = globalForRedis.__sylphBullConnections || new Set();
if (!globalForRedis.__sylphBullConnections) {
    globalForRedis.__sylphBullConnections = bullConnections;
}
const trackBullConnection = (client) => {
    bullConnections.add(client);
    return client;
};
const untrackBullConnection = (client) => {
    if (!client) {
        return;
    }
    bullConnections.delete(client);
};
const queueRedis = globalForRedis.__sylphQueueRedis ||
    trackBullConnection(createRedisClient("queue"));
if (!globalForRedis.__sylphQueueRedis) {
    globalForRedis.__sylphQueueRedis = queueRedis;
}
let workerConnectionCounter = 0;
const getQueueRedisConnection = () => queueRedis;
exports.getQueueRedisConnection = getQueueRedisConnection;
const getWorkerRedisConnection = () => trackBullConnection(createRedisClient(`worker:${++workerConnectionCounter}`));
exports.getWorkerRedisConnection = getWorkerRedisConnection;
const closeClient = async (client) => {
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
    }
    catch {
        client.disconnect(false);
    }
};
const closeRedisConnection = async () => {
    const clients = Array.from(new Set([
        globalForRedis.__sylphRedis,
        globalForRedis.__sylphQueueRedis,
        ...Array.from(bullConnections.values()),
    ].filter(Boolean)));
    for (const client of clients) {
        await closeClient(client);
        untrackBullConnection(client);
    }
    globalForRedis.__sylphRedis = undefined;
    globalForRedis.__sylphQueueRedis = undefined;
    globalForRedis.__sylphBullConnections = undefined;
};
exports.closeRedisConnection = closeRedisConnection;
exports.default = exports.redis;
