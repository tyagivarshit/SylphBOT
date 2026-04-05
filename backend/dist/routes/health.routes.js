"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const os_1 = __importDefault(require("os"));
const bullmq_1 = require("bullmq");
const rateLimiter_redis_1 = require("../redis/rateLimiter.redis");
const redis_1 = require("../config/redis");
const router = (0, express_1.Router)();
/* =============================
QUEUE INSTANCES
============================= */
const aiQueue = new bullmq_1.Queue("aiQueue", {
    connection: redis_1.redisConnection,
});
const funnelQueue = new bullmq_1.Queue("funnelQueue", {
    connection: redis_1.redisConnection,
});
/* =============================
SYSTEM STATS
============================= */
const getSystemStats = () => {
    const memory = process.memoryUsage();
    return {
        uptime: process.uptime(),
        cpuCores: os_1.default.cpus().length,
        loadAverage: os_1.default.loadavg(),
        memory: {
            rss: memory.rss,
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed,
            external: memory.external,
        },
    };
};
/* =============================
REDIS HEALTH
============================= */
const checkRedis = async () => {
    try {
        const start = Date.now();
        const pong = await rateLimiter_redis_1.redis.ping();
        const latency = Date.now() - start;
        return {
            status: pong === "PONG" ? "ok" : "error",
            latency,
        };
    }
    catch (error) {
        return {
            status: "error",
            error: String(error),
        };
    }
};
/* =============================
QUEUE HEALTH
============================= */
const checkQueues = async () => {
    try {
        const [aiWaiting, aiActive, aiFailed, aiDelayed, funnelWaiting, funnelActive, funnelFailed,] = await Promise.all([
            aiQueue.getWaitingCount(),
            aiQueue.getActiveCount(),
            aiQueue.getFailedCount(),
            aiQueue.getDelayedCount(),
            funnelQueue.getWaitingCount(),
            funnelQueue.getActiveCount(),
            funnelQueue.getFailedCount(),
        ]);
        return {
            aiQueue: {
                waiting: aiWaiting,
                active: aiActive,
                failed: aiFailed,
                delayed: aiDelayed,
            },
            funnelQueue: {
                waiting: funnelWaiting,
                active: funnelActive,
                failed: funnelFailed,
            },
        };
    }
    catch (error) {
        return {
            status: "error",
            error: String(error),
        };
    }
};
/* =============================
GLOBAL HEALTH
============================= */
router.get("/", async (req, res) => {
    try {
        const [redisHealth, queueHealth] = await Promise.all([
            checkRedis(),
            checkQueues(),
        ]);
        const system = getSystemStats();
        const healthy = redisHealth.status === "ok" &&
            !queueHealth?.status;
        res.send({
            status: healthy ? "healthy" : "degraded",
            timestamp: new Date(),
            system,
            redis: redisHealth,
            queues: queueHealth,
        });
    }
    catch (error) {
        res.status(500).send({
            status: "error",
            error: String(error),
        });
    }
});
/* =============================
REDIS ONLY CHECK
============================= */
router.get("/redis", async (req, res) => {
    const redisHealth = await checkRedis();
    res.send(redisHealth);
});
/* =============================
QUEUE ONLY CHECK
============================= */
router.get("/queues", async (req, res) => {
    const queues = await checkQueues();
    res.send(queues);
});
/* =============================
SYSTEM STATS ONLY
============================= */
router.get("/system", (req, res) => {
    res.send(getSystemStats());
});
exports.default = router;
