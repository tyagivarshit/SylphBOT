import os from "os";
import prisma from "../config/prisma";
import redis from "../config/redis";
import { recordMetricSnapshot } from "./reliability/reliabilityOS.service";

const getCpuUsagePercent = () => {
  const usage = process.cpuUsage();
  const totalMicros = usage.user + usage.system;
  const uptimeSeconds = Math.max(process.uptime(), 1);
  const cpuCores = Math.max(os.cpus().length, 1);

  return Number(
    ((totalMicros / 1000 / (uptimeSeconds * 1000 * cpuCores)) * 100).toFixed(2)
  );
};

const getMemoryUsage = () => {
  const memory = process.memoryUsage();

  return {
    rss: memory.rss,
    heapTotal: memory.heapTotal,
    heapUsed: memory.heapUsed,
    external: memory.external,
  };
};

const getRedisStatus = async () => {
  const startedAt = Date.now();

  try {
    const pong = await redis.ping();

    return {
      status: pong === "PONG" ? "ok" : "error",
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: "error",
      latencyMs: Date.now() - startedAt,
    };
  }
};

const getDatabaseStatus = async () => {
  const startedAt = Date.now();

  try {
    await prisma.user.findFirst({
      select: { id: true },
    });

    return {
      status: "ok",
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: "error",
      latencyMs: Date.now() - startedAt,
    };
  }
};

export const getSystemHealth = async () => {
  const [redisStatus, databaseStatus] = await Promise.all([
    getRedisStatus(),
    getDatabaseStatus(),
  ]);

  const snapshot = {
    uptime: process.uptime(),
    memory: getMemoryUsage(),
    cpu: {
      cores: os.cpus().length,
      usagePercent: getCpuUsagePercent(),
    },
    redis: redisStatus,
    database: databaseStatus,
  };

  void recordMetricSnapshot({
    subsystem: "SYSTEM",
    throughput: 0,
    queueLag: 0,
    workerUtilization: 0,
    dlqRate: 0,
    retryRate: 0,
    lockContention: 0,
    providerErrorRate:
      redisStatus.status === "ok" && databaseStatus.status === "ok" ? 0 : 1,
    latencyP50Ms: Math.min(redisStatus.latencyMs, databaseStatus.latencyMs),
    latencyP95Ms: Math.max(redisStatus.latencyMs, databaseStatus.latencyMs),
    latencyP99Ms: Math.max(redisStatus.latencyMs, databaseStatus.latencyMs) * 1.2,
    memoryUsage: snapshot.memory.heapUsed,
    cpuUsage: snapshot.cpu.usagePercent,
    storageGrowth: snapshot.memory.rss,
    metadata: {
      redis: redisStatus,
      database: databaseStatus,
    },
  }).catch(() => undefined);

  return snapshot;
};
