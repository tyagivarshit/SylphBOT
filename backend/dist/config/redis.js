"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__redisRuntimeTestInternals = exports.isRedisHealthy = exports.closeRedisConnection = exports.getWorkerRedisConnection = exports.getQueueRedisConnection = exports.getSharedRedisConnection = exports.waitForRedisReady = exports.isRedisWritable = exports.isQueueRedisWritable = exports.isSharedRedisWritable = exports.initRedis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
const redisSafety_1 = require("../redis/redisSafety");
const logger_1 = __importDefault(require("../utils/logger"));
const MANUAL_CLOSE_SYMBOL = Symbol.for("sylph.redis.manualClose");
const MAX_RECONNECT_ATTEMPTS = 5;
const REDIS_READY_POLL_MS = 50;
const globalForRedis = globalThis;
const isRetryableRedisError = (error) => {
    const message = String(error?.message || error || "");
    return /ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|READONLY|Connection is closed|Socket closed unexpectedly|Connection is in closed state/i.test(message);
};
const buildRedisOptions = (connectionName) => {
    const isTlsRedisUrl = env_1.env.REDIS_URL.startsWith("rediss://");
    const isPlainRedisUrl = env_1.env.REDIS_URL.startsWith("redis://");
    const allowPlainRedis = process.env.NODE_ENV === "integration" || process.env.NODE_ENV === "test";
    if (!isTlsRedisUrl && !(allowPlainRedis && isPlainRedisUrl)) {
        throw new Error("REDIS_URL must use rediss:// (or redis:// in integration/test mode)");
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
        connectTimeout: env_1.env.REDIS_CONNECT_TIMEOUT_MS,
        retryStrategy(attempts) {
            if (attempts > MAX_RECONNECT_ATTEMPTS) {
                return null;
            }
            return Math.min(env_1.env.REDIS_RETRY_DELAY_MS * 2 ** Math.max(attempts - 1, 0), env_1.env.REDIS_MAX_RETRY_DELAY_MS);
        },
        reconnectOnError(error) {
            return isRetryableRedisError(error) ? 1 : false;
        },
        tls: isTlsRedisUrl ? {} : undefined,
    };
};
const attachRedisListeners = (client, label) => {
    client.on("connect", () => {
        (0, redisSafety_1.markRedisHealthy)();
        logger_1.default.info({ label }, "Redis client connected");
    });
    client.on("ready", () => {
        (0, redisSafety_1.markRedisHealthy)();
    });
    client.on("error", (error) => {
        logger_1.default.error({ err: error, label }, "Redis client error");
        (0, redisSafety_1.markRedisFailure)(error, `redis:${label}:error`);
    });
    client.on("close", () => {
        if (client[MANUAL_CLOSE_SYMBOL]) {
            return;
        }
        (0, redisSafety_1.markRedisFailure)(new Error("Redis connection closed"), `redis:${label}:close`);
    });
    client.on("end", () => {
        if (client[MANUAL_CLOSE_SYMBOL]) {
            return;
        }
        (0, redisSafety_1.markRedisFailure)(new Error("Redis connection ended"), `redis:${label}:end`);
    });
};
const createRedisClient = (label) => {
    const client = new ioredis_1.default(env_1.env.REDIS_URL, buildRedisOptions(label));
    attachRedisListeners(client, label);
    return client;
};
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const isAlreadyConnectedError = (error) => /already connecting|already connected/i.test(String(error?.message || error || ""));
const isRedisClientWritable = (client) => Boolean(client && client.status === "ready");
const getMethodFallback = (methodName) => {
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
const buildChainFallback = (commands) => commands.map((command) => [null, getMethodFallback(command.name)]);
const createSafeCommandChainProxy = (chain, label) => {
    const commands = [];
    let proxy;
    proxy = new Proxy(chain, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== "function") {
                return value;
            }
            if (property === "exec" || property === "execBuffer") {
                return (...args) => (0, redisSafety_1.safeRedisCall)(() => value.apply(target, args), () => buildChainFallback(commands), {
                    operation: `${label}.${String(property)}`,
                });
            }
            return (...args) => {
                const result = value.apply(target, args);
                commands.push({
                    name: String(property),
                });
                return result === target ? proxy : result;
            };
        },
    });
    return proxy;
};
const createSafeRedisProxy = (client, label) => new Proxy(client, {
    get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") {
            return value;
        }
        if (property === "multi" || property === "pipeline") {
            return (...args) => createSafeCommandChainProxy(value.apply(target, args), `${label}.${String(property)}`);
        }
        if (property === "scanStream") {
            return (...args) => {
                if (!(0, redisSafety_1.isRedisHealthy)()) {
                    return (0, redisSafety_1.createEmptyRedisStream)();
                }
                try {
                    return value.apply(target, args);
                }
                catch (error) {
                    (0, redisSafety_1.markRedisFailure)(error, `${label}.scanStream`);
                    return (0, redisSafety_1.createEmptyRedisStream)();
                }
            };
        }
        return (...args) => (0, redisSafety_1.safeRedisCall)(() => value.apply(target, args), getMethodFallback(String(property)), {
            operation: `${label}.${String(property)}`,
        });
    },
});
const getBullConnections = () => {
    if (!globalForRedis.__sylphBullConnections) {
        globalForRedis.__sylphBullConnections = new Set();
    }
    return globalForRedis.__sylphBullConnections;
};
const trackBullConnection = (client) => {
    getBullConnections().add(client);
    return client;
};
const untrackBullConnection = (client) => {
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
    if (!globalForRedis.__sylphRedisProxy ||
        globalForRedis.__sylphRedisProxyClient !== client) {
        globalForRedis.__sylphRedisProxy = createSafeRedisProxy(client, "redis");
        globalForRedis.__sylphRedisProxyClient = client;
    }
    return globalForRedis.__sylphRedisProxy;
};
let workerConnectionCounter = 0;
const maybeConnectClient = async (client) => {
    if (client.status !== "wait" && client.status !== "end") {
        return;
    }
    try {
        await client.connect();
    }
    catch (error) {
        if (!isAlreadyConnectedError(error)) {
            throw error;
        }
    }
};
const waitForClientReady = async (client, label, timeoutMs) => {
    if (isRedisClientWritable(client)) {
        return;
    }
    let lastError = null;
    const onError = (error) => {
        lastError = error;
    };
    client.on("error", onError);
    const deadline = Date.now() + timeoutMs;
    try {
        while (Date.now() <= deadline) {
            if (isRedisClientWritable(client)) {
                return;
            }
            try {
                await maybeConnectClient(client);
            }
            catch (error) {
                lastError = error;
            }
            if (isRedisClientWritable(client)) {
                return;
            }
            await sleep(REDIS_READY_POLL_MS);
        }
    }
    finally {
        client.off("error", onError);
    }
    const suffix = lastError
        ? `: ${String(lastError?.message || lastError)}`
        : "";
    throw new Error(`redis_not_ready:${label}${suffix}`);
};
const initRedis = () => ({
    shared: ensureSharedRedisClient(),
    queue: ensureQueueRedisClient(),
});
exports.initRedis = initRedis;
const isSharedRedisWritable = () => isRedisClientWritable(globalForRedis.__sylphRedis);
exports.isSharedRedisWritable = isSharedRedisWritable;
const isQueueRedisWritable = () => isRedisClientWritable(globalForRedis.__sylphQueueRedis);
exports.isQueueRedisWritable = isQueueRedisWritable;
const isRedisWritable = () => (0, exports.isSharedRedisWritable)();
exports.isRedisWritable = isRedisWritable;
const waitForRedisReady = async (input) => {
    const timeoutMs = Math.max(1000, Math.floor(Number(input?.timeoutMs ?? Math.max(env_1.env.REDIS_CONNECT_TIMEOUT_MS * 3, 15000))));
    const shared = ensureSharedRedisClient();
    await waitForClientReady(shared, "shared", timeoutMs);
    if (input?.requireQueue === false) {
        return {
            shared,
            queue: null,
        };
    }
    const queue = ensureQueueRedisClient();
    await waitForClientReady(queue, "queue", timeoutMs);
    return {
        shared,
        queue,
    };
};
exports.waitForRedisReady = waitForRedisReady;
const getSharedRedisConnection = () => ensureSharedRedisClient();
exports.getSharedRedisConnection = getSharedRedisConnection;
const getQueueRedisConnection = () => ensureQueueRedisClient();
exports.getQueueRedisConnection = getQueueRedisConnection;
const getWorkerRedisConnection = () => trackBullConnection(createRedisClient(`worker:${++workerConnectionCounter}`));
exports.getWorkerRedisConnection = getWorkerRedisConnection;
const closeClient = async (client) => {
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
    }
    catch {
        client.disconnect(false);
    }
};
const closeRedisConnection = async () => {
    const clients = Array.from(new Set([
        globalForRedis.__sylphRedis,
        globalForRedis.__sylphQueueRedis,
        ...Array.from(getBullConnections().values()),
    ].filter(Boolean)));
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
exports.closeRedisConnection = closeRedisConnection;
const redis = new Proxy({}, {
    get(_target, property) {
        return Reflect.get(ensureSharedRedisProxy(), property);
    },
});
var redisSafety_2 = require("../redis/redisSafety");
Object.defineProperty(exports, "isRedisHealthy", { enumerable: true, get: function () { return redisSafety_2.isRedisHealthy; } });
exports.__redisRuntimeTestInternals = {
    isAlreadyConnectedError,
    isRedisClientWritable,
    waitForClientReady,
};
exports.default = redis;
