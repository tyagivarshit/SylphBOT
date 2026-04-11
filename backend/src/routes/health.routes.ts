import { Router } from "express";
import os from "os";
const router = Router();
import redis from "../config/redis";
import { getAIQueues } from "../queues/ai.queue";
import { funnelQueue } from "../queues/funnel.queue";

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
    cpuCores: os.cpus().length,
    loadAverage: os.loadavg(),
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
    const pong = await redis?.ping();
    const latency = Date.now() - start;

    return {
      status: pong === "PONG" ? "ok" : "error",
      latency,
    };
  } catch (error) {
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
    const aiQueues = getAIQueues();
    const aiQueueStats = await Promise.all(
      aiQueues.map(async (queue) => ({
        name: queue.name,
        waiting: await queue.getWaitingCount(),
        active: await queue.getActiveCount(),
        failed: await queue.getFailedCount(),
        delayed: await queue.getDelayedCount(),
      }))
    );

    const [
      funnelWaiting,
      funnelActive,
      funnelFailed,
    ] = await Promise.all([
      funnelQueue.getWaitingCount(),
      funnelQueue.getActiveCount(),
      funnelQueue.getFailedCount(),
    ]);

    const aiWaiting = aiQueueStats.reduce(
      (total, queue) => total + queue.waiting,
      0
    );
    const aiActive = aiQueueStats.reduce(
      (total, queue) => total + queue.active,
      0
    );
    const aiFailed = aiQueueStats.reduce(
      (total, queue) => total + queue.failed,
      0
    );
    const aiDelayed = aiQueueStats.reduce(
      (total, queue) => total + queue.delayed,
      0
    );

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
  } catch (error) {
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

    const healthy =
      redisHealth.status === "ok" &&
      !queueHealth?.status;

    res.send({
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date(),
      system,
      redis: redisHealth,
      queues: queueHealth,
    });
  } catch (error) {
    res.status(500).send({
      status: "error",
      error: String(error),
    });
  }
});

export default router;
