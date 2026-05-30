import prisma from "../config/prisma";
import { primeAuthBootstrapContext } from "./authBootstrap.service";
import { bootstrapInfrastructureResilienceOS } from "./reliability/infrastructureResilienceOS.service";
import { bootstrapSecurityGovernanceOS } from "./security/securityGovernanceOS.service";
import { getSharedRedisConnection, getQueueRedisConnection } from "../config/redis";
import logger from "../utils/logger";
import { prewarmState } from "./prewarmState";

let prewarmInFlight: Promise<void> | null = null;
let lastPrewarmAt = 0;
let billingPrewarmer: ((businessId: string) => Promise<void>) | null = null;

export const registerBillingPrewarmer = (fn: (businessId: string) => Promise<void>) => {
  billingPrewarmer = fn;
};

export const PrewarmService = {
  isRecovering() {
    return prewarmState.isCold;
  },

  noteRequest() {
    const now = Date.now();
    const idlePeriod = now - prewarmState.lastRequestAt;
    prewarmState.lastRequestAt = now;

    // Detect long idle period (e.g., > 5 minutes)
    if (idlePeriod > 5 * 60 * 1000 && !prewarmState.isCold) {
      logger.info({ idlePeriod }, "Lightweight wake detection: Long idle period detected. Triggering async prewarm.");
      this.triggerAsyncPrewarm("long_idle_wake");
    }
  },

  triggerAsyncPrewarm(reason: string) {
    const now = Date.now();
    if (now - lastPrewarmAt < 30 * 1000) {
      // Throttle prewarming to prevent storm
      return;
    }

    if (prewarmInFlight) {
      return;
    }

    prewarmInFlight = (async () => {
      lastPrewarmAt = Date.now();
      logger.info({ reason }, "Starting critical-only prewarm pipeline...");

      try {
        // 1. Redis writable pre-verification & stabilization
        const shared = getSharedRedisConnection();
        const queue = getQueueRedisConnection();

        await Promise.allSettled([
          shared.status === "ready" ? Promise.resolve() : shared.connect().catch(() => undefined),
          queue.status === "ready" ? Promise.resolve() : queue.connect().catch(() => undefined)
        ]);

        // Ping test to verify writability
        if (shared.status === "ready") {
          await shared.set("prewarm:ping", "1", "EX", 10).catch(() => undefined);
        }

        // Database pool warmup & connectivity check
        const dbWarmupStartedAt = Date.now();
        await Promise.race([
          prisma.user.findFirst({ select: { id: true } }),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("Database warmup timeout")), 2500)
          ),
        ]).then(() => {
          logger.info({ durationMs: Date.now() - dbWarmupStartedAt }, "Database pool warmed up successfully during prewarm");
        }).catch((err) => {
          logger.warn({ err, durationMs: Date.now() - dbWarmupStartedAt }, "Database warmup/ping failed or timed out during prewarm");
        });

        // 2. Critical runtime coordinators
        await Promise.allSettled([
          bootstrapInfrastructureResilienceOS().catch(() => undefined),
          bootstrapSecurityGovernanceOS().catch(() => undefined)
        ]);

        // 3. Prewarm Auth cache & Billing/subscription contexts for recently active users
        // Startup-safe query: if DB is not ready, this will just fail/catch safely
        const activeUsers = await prisma.user.findMany({
          where: { isActive: true, deletedAt: null },
          orderBy: { id: "desc" },
          take: 5,
          select: { id: true, businessId: true, name: true, email: true, avatar: true }
        }).catch(() => []);

        for (const user of activeUsers) {
          // Prewarm auth bootstrap cache
          primeAuthBootstrapContext({
            userId: user.id,
            preferredBusinessId: user.businessId,
            profileSeed: {
              name: user.name,
              email: user.email,
              avatar: user.avatar,
            }
          });

          // Prewarm billing/subscription context using registered prewarmer
          if (user.businessId && billingPrewarmer) {
            billingPrewarmer(user.businessId).catch(() => undefined);
          }

          // Spread out DB pool allocation requests to smooth warmup
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        prewarmState.isCold = false;
        logger.info("Critical-only prewarm pipeline completed successfully.");
        if (reason === "startup_boot") {
          startInfrastructureHeartbeat();
        }
      } catch (err) {
        logger.warn({ err }, "Error during prewarm pipeline execution");
      } finally {
        prewarmInFlight = null;
      }
    })();
  }
};

let heartbeatInterval: NodeJS.Timeout | null = null;

export const startInfrastructureHeartbeat = () => {
  if (heartbeatInterval || process.env.NODE_ENV === "test" || process.env.NODE_ENV === "testing") {
    return;
  }

  logger.info("Starting lightweight infrastructure health heartbeat (60s interval)...");

  heartbeatInterval = setInterval(async () => {
    try {
      const shared = getSharedRedisConnection();
      const queue = getQueueRedisConnection();

      // Shared Redis check
      if (shared) {
        if (shared.status === "ready") {
          await Promise.race([
            shared.ping(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Shared Ping timeout")), 1000))
          ]).catch(async (err) => {
            logger.warn({ err }, "Shared Redis protocol ping failed, triggering reconnection...");
            if (shared.status === "end" || shared.status === "wait") {
              await shared.connect().catch(() => undefined);
            }
          });
        } else if (shared.status === "end" || shared.status === "wait") {
          logger.info({ status: shared.status }, "Shared Redis in disconnected state, triggering background reconnect...");
          await shared.connect().catch(() => undefined);
        }
      }

      // Queue Redis check
      if (queue) {
        if (queue.status === "ready") {
          await Promise.race([
            queue.ping(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Queue Ping timeout")), 1000))
          ]).catch(async (err) => {
            logger.warn({ err }, "Queue Redis protocol ping failed, triggering reconnection...");
            if (queue.status === "end" || queue.status === "wait") {
              await queue.connect().catch(() => undefined);
            }
          });
        } else if (queue.status === "end" || queue.status === "wait") {
          logger.info({ status: queue.status }, "Queue Redis in disconnected state, triggering background reconnect...");
          await queue.connect().catch(() => undefined);
        }
      }

      // 2. Check DB connection health (Prisma)
      await Promise.race([
        prisma.user.findFirst({ select: { id: true } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DB ping timeout")), 1500))
      ]).catch((err) => {
        logger.warn({ err }, "Database heartbeat probe failed, triggering pool warmup...");
        PrewarmService.triggerAsyncPrewarm("db_heartbeat_fail");
      });

    } catch (error) {
      logger.error({ error }, "Error during infrastructure heartbeat check");
    }
  }, 60 * 1000);

  // Run immediately in background to detect startup degradation
  setImmediate(async () => {
    const queue = getQueueRedisConnection();
    if (queue && (queue.status === "end" || queue.status === "wait")) {
      await queue.connect().catch(() => undefined);
    }
  });
};
