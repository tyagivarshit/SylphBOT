"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisReconnectSnapshot = exports.__redisRuntimeTestInternals = exports.isRedisHealthy = exports.closeRedisConnection = exports.getWorkerRedisConnection = exports.getQueueRedisConnection = exports.getResilientSharedRedisConnection = exports.getSharedRedisConnection = exports.waitForRedisReady = exports.ensureBackgroundQueueRecovery = exports.isRedisWritable = exports.isQueueRedisWritable = exports.isSharedRedisWritable = exports.initRedis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
const redisSafety_1 = require("../redis/redisSafety");
const logger_1 = __importDefault(require("../utils/logger"));
const requestLifecycle_1 = require("../utils/requestLifecycle");
const MANUAL_CLOSE_SYMBOL = Symbol.for("sylph.redis.manualClose");
const MAX_RECONNECT_ATTEMPTS = Math.max(3, Number(process.env.REDIS_MAX_RECONNECT_ATTEMPTS || 8));
const REDIS_READY_POLL_MS = 50;
const REDIS_RECONNECT_JITTER_MS = Math.max(10, Number(process.env.REDIS_RECONNECT_JITTER_MS || 180));
const globalForRedis = globalThis;
const isRetryableRedisError = (error) => (0, redisSafety_1.isRedisTransientError)(error);
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
const noteRedisReconnectAttempt = (connectionName, attempt, delayMs) => {
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
const noteRedisConnectionReady = (connectionName) => {
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
            // If the Redis circuit is open or Redis is not healthy, back off aggressively
            // to prevent DNS reconnect storms and threadpool starvation.
            if ((0, redisSafety_1.isRedisCircuitOpen)() || !(0, redisSafety_1.isRedisHealthy)()) {
                const backoffDelay = 15000 + Math.floor(Math.random() * 5000); // 15-20 seconds jittered
                noteRedisReconnectAttempt(connectionName, attempts, backoffDelay);
                return backoffDelay;
            }
            const exponentialDelay = Math.min(env_1.env.REDIS_RETRY_DELAY_MS * 2 ** Math.max(attempts - 1, 0), env_1.env.REDIS_MAX_RETRY_DELAY_MS);
            const jitterMs = Math.floor(Math.random() * REDIS_RECONNECT_JITTER_MS);
            const delayMs = Math.min(env_1.env.REDIS_MAX_RETRY_DELAY_MS, exponentialDelay + jitterMs);
            noteRedisReconnectAttempt(connectionName, attempts, delayMs);
            return delayMs;
        },
        reconnectOnError(error) {
            return isRetryableRedisError(error) ? 1 : false;
        },
        tls: isTlsRedisUrl ? { rejectUnauthorized: false } : undefined,
    };
};
const attachRedisListeners = (client, label) => {
    client.on("connect", () => {
        logger_1.default.info({ label }, "Redis client connected");
    });
    client.on("ready", () => {
        noteRedisConnectionReady(label);
        (0, redisSafety_1.markRedisHealthy)();
    });
    client.on("reconnecting", (delay) => {
        noteRedisReconnectAttempt(label, 0, Number(delay) || 0);
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
const shouldBypassRedisCommandDuringReconnect = (methodName) => methodName.length > 0 && !REDIS_CONTROL_METHODS.has(methodName.toLowerCase());
const getMethodFallback = (methodName) => {
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
        const methodName = String(property);
        if (REDIS_CONTROL_METHODS.has(methodName.toLowerCase())) {
            return (...args) => value.apply(target, args);
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
        return (...args) => {
            const operation = `${label}.${methodName}`;
            if (!isRedisClientWritable(target) &&
                shouldBypassRedisCommandDuringReconnect(methodName)) {
                if ((0, redisSafety_1.shouldLogRedisSkip)(`${operation}:redis_not_ready`)) {
                    logger_1.default.warn({
                        operation,
                        status: target.status,
                    }, "Redis command bypassed while connection is not writable");
                }
                return Promise.resolve(getMethodFallback(methodName));
            }
            return (0, redisSafety_1.safeRedisCall)(() => value.apply(target, args), getMethodFallback(methodName), {
                operation,
            });
        };
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
    // Fail fast immediately if the circuit breaker is open or Redis is down
    if ((0, redisSafety_1.isRedisCircuitOpen)() || !(0, redisSafety_1.isRedisHealthy)()) {
        throw new Error(`redis_not_ready:${label} (circuit open)`);
    }
    let lastError = null;
    const onError = (error) => {
        lastError = error;
    };
    client.on("error", onError);
    const deadline = Date.now() + timeoutMs;
    try {
        // Initiate connect once; do not loop client.connect() to prevent DNS spam
        try {
            await maybeConnectClient(client);
        }
        catch (error) {
            lastError = error;
        }
        while (Date.now() <= deadline) {
            if (isRedisClientWritable(client)) {
                return;
            }
            // Check if circuit breaker opened during wait
            if ((0, redisSafety_1.isRedisCircuitOpen)() || !(0, redisSafety_1.isRedisHealthy)()) {
                throw new Error(`redis_not_ready:${label} (circuit opened during wait)`);
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
let lastQueueRecoveryAttemptAt = 0;
const QUEUE_RECOVERY_COOLDOWN_MS = 30000; // 30 seconds cooldown
const ensureBackgroundQueueRecovery = () => {
    const queueClient = globalForRedis.__sylphQueueRedis;
    if (!queueClient) {
        return;
    }
    // Stop recovery attempts if circuit is open/unhealthy
    if ((0, redisSafety_1.isRedisCircuitOpen)() || !(0, redisSafety_1.isRedisHealthy)()) {
        return;
    }
    const now = Date.now();
    if (now - lastQueueRecoveryAttemptAt < QUEUE_RECOVERY_COOLDOWN_MS) {
        return;
    }
    if (queueClient.status === "end" || queueClient.status === "wait") {
        lastQueueRecoveryAttemptAt = now;
        logger_1.default.info({ status: queueClient.status }, "Background Queue Recovery: queue Redis in wait/end state, initiating reconnect...");
        queueClient.connect().catch((err) => {
            if (!isAlreadyConnectedError(err)) {
                logger_1.default.warn({ err }, "Background Queue Recovery reconnect attempt failed");
            }
        });
    }
};
exports.ensureBackgroundQueueRecovery = ensureBackgroundQueueRecovery;
const waitForRedisReady = async (input) => {
    const store = requestLifecycle_1.requestStorage.getStore();
    const isRequestPath = Boolean(store);
    let timeoutMs = input?.timeoutMs;
    if (timeoutMs === undefined || timeoutMs === null) {
        if (isRequestPath) {
            const remainingMs = (0, requestLifecycle_1.getRequestRemainingMs)(null, 2000);
            timeoutMs = Math.min(2000, remainingMs);
        }
        else {
            timeoutMs = Math.max(env_1.env.REDIS_CONNECT_TIMEOUT_MS * 3, 15000);
        }
    }
    else {
        if (isRequestPath) {
            const remainingMs = (0, requestLifecycle_1.getRequestRemainingMs)(null, timeoutMs);
            timeoutMs = Math.min(timeoutMs, remainingMs);
        }
    }
    timeoutMs = Math.max(1000, Math.floor(Number(timeoutMs)));
    const shared = ensureSharedRedisClient();
    try {
        await waitForClientReady(shared, "shared", timeoutMs);
    }
    catch (error) {
        if (isRequestPath) {
            logger_1.default.warn({ error, timeoutMs }, "Redis shared client not ready on request path, failing open/stale and continuing async recovery");
        }
        else {
            throw error;
        }
    }
    if (input?.requireQueue === false || isRequestPath) {
        if (isRequestPath) {
            const queueClient = ensureQueueRedisClient();
            if (queueClient.status !== "ready") {
                logger_1.default.info({ status: queueClient.status }, "Queue Redis not ready on request path, triggering background recovery");
                (0, exports.ensureBackgroundQueueRecovery)();
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
exports.waitForRedisReady = waitForRedisReady;
const getSharedRedisConnection = () => ensureSharedRedisClient();
exports.getSharedRedisConnection = getSharedRedisConnection;
const getResilientSharedRedisConnection = () => ensureSharedRedisProxy();
exports.getResilientSharedRedisConnection = getResilientSharedRedisConnection;
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
    globalForRedis.__sylphRedisReconnectStats = undefined;
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
const getRedisReconnectSnapshot = () => {
    const stats = getRedisReconnectStats();
    return {
        attempts: stats.attempts,
        lastAttemptAtMs: stats.lastAttemptAtMs,
        lastDelayMs: stats.lastDelayMs,
        byConnection: { ...stats.byConnection },
    };
};
exports.getRedisReconnectSnapshot = getRedisReconnectSnapshot;
exports.default = redis;
const bullmq_1 = require("bullmq");
// Safely suppress unhandled RedisConnection error events during shutdown/initializing race conditions to prevent crashes.
const originalEmit = bullmq_1.RedisConnection.prototype.emit;
bullmq_1.RedisConnection.prototype.emit = function (event, ...args) {
    if (event === "error") {
        if (this.listenerCount("error") === 0) {
            logger_1.default.warn({ err: args[0] }, "Suppressing unhandled RedisConnection error event to prevent crash");
            return false;
        }
    }
    return originalEmit.apply(this, [event, ...args]);
};
