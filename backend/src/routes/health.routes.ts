import { Router } from "express";
import os from "os";
import { Queue } from "bullmq";
import { redis } from "../redis/rateLimiter.redis";
import { redisConnection } from "../config/redis";

const router = Router();

/* =============================
QUEUE INSTANCES
============================= */

const aiQueue = new Queue("aiQueue", {
  connection: redisConnection,
});

const funnelQueue = new Queue("funnelQueue", {
  connection: redisConnection,
});

/* =============================
SYSTEM STATS
============================= */

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

/* =============================
REDIS HEALTH
============================= */

const checkRedis = async () => {

  try {

    const start = Date.now();

    const pong = await redis.ping();

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

/* =============================
QUEUE HEALTH
============================= */

const checkQueues = async () => {

  try {

    const [
      aiWaiting,
      aiActive,
      aiFailed,
      aiDelayed,
      funnelWaiting,
      funnelActive,
      funnelFailed,
    ] = await Promise.all([
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

  } catch (error) {

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

export default router;