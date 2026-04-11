"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const os_1 = __importDefault(require("os"));
const router = (0, express_1.Router)();
const redis_1 = __importDefault(require("../config/redis"));
const ai_queue_1 = require("../queues/ai.queue");
const funnel_queue_1 = require("../queues/funnel.queue");
/* ================================
   QUEUE INSTANCES (FIXED)
================================ */
/* ================================
   SYSTEM STATS
================================ */
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
/* ================================
   REDIS HEALTH
================================ */
const checkRedis = async () => {
    try {
        const start = Date.now();
        const pong = await redis_1.default?.ping();
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
/* ================================
   QUEUE HEALTH
================================ */
const checkQueues = async () => {
    try {
        const aiQueues = (0, ai_queue_1.getAIQueues)();
        const aiQueueStats = await Promise.all(aiQueues.map(async (queue) => ({
            name: queue.name,
            waiting: await queue.getWaitingCount(),
            active: await queue.getActiveCount(),
            failed: await queue.getFailedCount(),
            delayed: await queue.getDelayedCount(),
        })));
        const [funnelWaiting, funnelActive, funnelFailed,] = await Promise.all([
            funnel_queue_1.funnelQueue.getWaitingCount(),
            funnel_queue_1.funnelQueue.getActiveCount(),
            funnel_queue_1.funnelQueue.getFailedCount(),
        ]);
        const aiWaiting = aiQueueStats.reduce((total, queue) => total + queue.waiting, 0);
        const aiActive = aiQueueStats.reduce((total, queue) => total + queue.active, 0);
        const aiFailed = aiQueueStats.reduce((total, queue) => total + queue.failed, 0);
        const aiDelayed = aiQueueStats.reduce((total, queue) => total + queue.delayed, 0);
        return {
            aiQueue: {
                waiting: aiWaiting,
                active: aiActive,
                failed: aiFailed,
                delayed: aiDelayed,
                partitions: aiQueueStats,
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
/* ================================
   ROUTES
================================ */
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
exports.default = router;
