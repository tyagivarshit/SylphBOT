import http from "http";
import { configurePassport } from "./config/passport";
import { env } from "./config/env";
import { initSocket } from "./sockets/socket.server";
import logger from "./utils/logger";
import {
  captureExceptionWithContext,
  initializeSentry,
} from "./observability/sentry";
import { emitPerformanceMetric } from "./observability/performanceMetrics";
import { emitStripeConfigValidation } from "./services/commerce/providers/stripeConfig.service";
import { reconcilePendingEntitlementSync } from "./services/billingSettlement.service";
import {
  initCrons,
  initCriticalRecoveryCron,
  initWorkers,
  initQueues,
  shutdown,
} from "./runtime/lifecycle";
import { warmupEmbeddingRuntime } from "./services/embedding.service";
import { commerceProjectionService } from "./services/commerceProjection.service";
import {
  markAppBootReady,
  markEmbeddingWarmupReady,
  recordStartupBackgroundTask,
  shouldDeferLowPriorityWarmup,
} from "./runtime/startupIsolation.service";

let isShuttingDown = false;

const parsePositiveInt = (raw: string | undefined, fallbackValue: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.max(1, Math.floor(parsed));
};

const STARTUP_EMBEDDING_WARMUP_DELAY_MS = parsePositiveInt(
  process.env.STARTUP_EMBEDDING_WARMUP_DELAY_MS,
  12_000
);
const STARTUP_EMBEDDING_WARMUP_RETRY_DELAY_MS = parsePositiveInt(
  process.env.STARTUP_EMBEDDING_WARMUP_RETRY_DELAY_MS,
  4_000
);
const STARTUP_EMBEDDING_WARMUP_MAX_ATTEMPTS = parsePositiveInt(
  process.env.STARTUP_EMBEDDING_WARMUP_MAX_ATTEMPTS,
  8
);
const STARTUP_LOW_PRIORITY_TASK_RETRY_DELAY_MS = parsePositiveInt(
  process.env.STARTUP_LOW_PRIORITY_TASK_RETRY_DELAY_MS,
  1_400
);
const STARTUP_LOW_PRIORITY_TASK_MAX_DEFERRALS = parsePositiveInt(
  process.env.STARTUP_LOW_PRIORITY_TASK_MAX_DEFERRALS,
  10
);

type StartupTaskPriority = "critical" | "low";

const scheduleBackgroundStartupTask = (
  name: string,
  task: () => Promise<unknown>,
  options?: {
    metadata?: Record<string, unknown>;
    priority?: StartupTaskPriority;
    deferDelayMs?: number;
    maxDeferrals?: number;
  }
) => {
  const priority = options?.priority || "low";
  const deferDelayMs = Math.max(
    200,
    Number(options?.deferDelayMs || STARTUP_LOW_PRIORITY_TASK_RETRY_DELAY_MS)
  );
  const maxDeferrals = Math.max(
    0,
    Number(options?.maxDeferrals || STARTUP_LOW_PRIORITY_TASK_MAX_DEFERRALS)
  );
  const metadata = options?.metadata || {};

  let attempts = 0;
  let deferredCount = 0;

  const scheduleAttempt = (delayMs: number) => {
    attempts += 1;
    recordStartupBackgroundTask({
      name,
      status: "scheduled",
      attempts,
      metadata: {
        ...metadata,
        priority,
        delayMs,
        deferredCount,
      },
    });

    const timer = setTimeout(() => {
      if (priority === "low") {
        const deferDecision = shouldDeferLowPriorityWarmup();
        if (deferDecision.defer && deferredCount < maxDeferrals) {
          deferredCount += 1;
          emitPerformanceMetric({
            name: "startup_priority_deferral_count",
            value: 1,
            route: "startup_isolation",
            metadata: {
              task: name,
              priority,
              deferredCount,
              reasons: deferDecision.reasons,
              pressure: deferDecision.pressure,
              requestPriority: deferDecision.prioritySnapshot,
            },
          });
          recordStartupBackgroundTask({
            name,
            status: "deferred",
            attempts,
            metadata: {
              ...metadata,
              priority,
              deferredCount,
              reasons: deferDecision.reasons,
              pressure: deferDecision.pressure,
              requestPriority: deferDecision.prioritySnapshot,
            },
          });
          scheduleAttempt(deferDelayMs);
          return;
        }
      }

      const startedAt = Date.now();
      recordStartupBackgroundTask({
        name,
        status: "started",
        attempts,
        metadata: {
          ...metadata,
          priority,
          deferredCount,
        },
      });

      void task()
        .then(() => {
          recordStartupBackgroundTask({
            name,
            status: "completed",
            attempts,
            durationMs: Date.now() - startedAt,
            metadata: {
              ...metadata,
              priority,
              deferredCount,
            },
          });
        })
        .catch((error) => {
          logger.warn(
            {
              err: error,
              task: name,
            },
            "Startup background task failed"
          );
          recordStartupBackgroundTask({
            name,
            status: "failed",
            attempts,
            durationMs: Date.now() - startedAt,
            error,
            metadata: {
              ...metadata,
              priority,
              deferredCount,
            },
          });
        });
    }, delayMs);

    timer.unref?.();
  };

  scheduleAttempt(0);
};

const scheduleDeferredEmbeddingWarmup = () => {
  let attempts = 0;

  const runAttempt = (delayMs: number) => {
    attempts += 1;
    recordStartupBackgroundTask({
      name: "embedding_runtime",
      status: "scheduled",
      attempts,
      metadata: {
        delayMs,
      },
    });

    const timer = setTimeout(() => {
      const deferDecision = shouldDeferLowPriorityWarmup();

      if (deferDecision.defer && attempts < STARTUP_EMBEDDING_WARMUP_MAX_ATTEMPTS) {
        recordStartupBackgroundTask({
          name: "embedding_runtime",
          status: "deferred",
          attempts,
          metadata: {
            reasons: deferDecision.reasons,
            pressure: deferDecision.pressure,
            priority: deferDecision.prioritySnapshot,
          },
        });
        runAttempt(STARTUP_EMBEDDING_WARMUP_RETRY_DELAY_MS);
        return;
      }

      recordStartupBackgroundTask({
        name: "embedding_runtime",
        status: "started",
        attempts,
        metadata: {
          deferred: deferDecision.defer,
          reasons: deferDecision.reasons,
        },
      });
      const startedAt = Date.now();

      void warmupEmbeddingRuntime("startup_background")
        .then((outcome) => {
          const durationMs = Number(outcome.durationMs || Date.now() - startedAt);
          recordStartupBackgroundTask({
            name: "embedding_runtime",
            status: "completed",
            attempts,
            durationMs,
            metadata: {
              deferred: deferDecision.defer,
              reasons: deferDecision.reasons,
            },
          });
          markEmbeddingWarmupReady({
            warmupMs: durationMs,
            metadata: {
              source: "startup_background",
              attempts,
            },
          });
        })
        .catch((error) => {
          recordStartupBackgroundTask({
            name: "embedding_runtime",
            status: "failed",
            attempts,
            durationMs: Date.now() - startedAt,
            error,
          });
          if (attempts < STARTUP_EMBEDDING_WARMUP_MAX_ATTEMPTS) {
            runAttempt(STARTUP_EMBEDDING_WARMUP_RETRY_DELAY_MS);
          }
        });
    }, delayMs);

    timer.unref?.();
  };

  runAttempt(STARTUP_EMBEDDING_WARMUP_DELAY_MS);
};

const startPostListenBootstrap = () => {
  scheduleBackgroundStartupTask(
    "stripe_config_validation",
    async () => {
      await emitStripeConfigValidation();
    },
    {
      priority: "low",
    }
  );

  scheduleBackgroundStartupTask(
    "commerce_cold_boot_replay",
    async () => {
      const coldBootReplay = await commerceProjectionService
        .replayPendingProviderWebhooks({
          provider: "STRIPE",
          businessId: null,
          limit: 100,
          includeClaimedOlderThanMinutes: 5,
        })
        .catch(() => null);
      if (coldBootReplay) {
        logger.info({ coldBootReplay }, "Commerce cold boot replay completed");
      }
    },
    {
      priority: "low",
    }
  );

  scheduleBackgroundStartupTask(
    "entitlement_reconcile_replay",
    async () => {
      const entitlementReplay = await reconcilePendingEntitlementSync({
        limit: 100,
      }).catch(() => null);
      if (entitlementReplay && entitlementReplay.pending > 0) {
        logger.info(
          {
            entitlementReplay,
          },
          "Commerce entitlement reconcile replay completed"
        );
      }
    },
    {
      priority: "low",
    }
  );

  scheduleBackgroundStartupTask(
    "worker_bootstrap_core",
    async () => {
      initWorkers({
        authEmail: true,
      });
    },
    {
      priority: "critical",
    }
  );

  scheduleBackgroundStartupTask(
    "worker_bootstrap_integration",
    async () => {
      initWorkers({
        integrationOnboardingProjection: true,
        metaOAuthContinuation: true,
      });
    },
    {
      priority: "low",
    }
  );

  scheduleBackgroundStartupTask(
    "cron_bootstrap",
    async () => {
      initCriticalRecoveryCron();
      if (process.env.ENABLE_CRON === "true") {
        initCrons();
      }
    },
    {
      priority: "low",
    }
  );

  scheduleDeferredEmbeddingWarmup();
};

export const startServer = async () => {
  initializeSentry();
  configurePassport();
  await initQueues();

  const { default: app } = await import("./app");
  const server = http.createServer(app);
  initSocket(server);
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  // Keep server-level request timeout slightly above route-level timeouts
  // so app middleware remains the primary response timeout authority.
  server.requestTimeout = 16_000;

  const shutdownServer = async (signal: string, exitCode = 0) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "Server shutdown started");

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          signal,
        },
        "Server close failed during shutdown"
      );
    }

    await shutdown();
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void shutdownServer("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdownServer("SIGTERM");
  });

  process.on("uncaughtException", (error) => {
    logger.error({ err: error }, "Server uncaught exception");
    captureExceptionWithContext(error, {
      tags: {
        layer: "server",
        event: "uncaughtException",
      },
    });
    void shutdownServer("uncaughtException", 1);
  });

  process.on("unhandledRejection", (error) => {
    logger.error(
      {
        err: error,
      },
      "Server unhandled rejection"
    );
    captureExceptionWithContext(error, {
      tags: {
        layer: "server",
        event: "unhandledRejection",
      },
    });
  });

  return await new Promise<http.Server>((resolve) => {
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "Server listening");
      markAppBootReady();
      startPostListenBootstrap();
      resolve(server);
    });
  });
};

if (require.main === module) {
  void startServer();
}
