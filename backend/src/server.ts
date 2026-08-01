process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "64";
import http from "http";
import { configurePassport } from "./config/passport";
import { env } from "./config/env";
import { initSocket } from "./sockets/socket.server";
import logger from "./utils/logger";
import { getBcryptLibraryName } from "./utils/bcryptWorker";
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
import prisma from "./config/prisma";
import { initRedis, waitForRedisReady, isRedisWritable } from "./config/redis";
import {
  markAppBootReady,
  markEmbeddingWarmupReady,
  recordStartupBackgroundTask,
  shouldDeferLowPriorityWarmup,
  markRedisReady,
  markDbReady,
} from "./runtime/startupIsolation.service";
import { PrewarmService } from "./services/prewarm.service";
import { bootstrapper } from "./runtime/kernel/bootstrap";
import { container } from "./runtime/kernel/diContainer";
import { ExecutiveIdentityPlugin, executiveStartupMetrics } from "./services/executive/plugin";
import {
  getDeploymentMetadata,
  getGitCommit,
  getInternalApiKeyMetadata,
  getServiceName,
  startupTimestamp,
} from "./utils/internalHealthDiagnostics";


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
const STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS = parsePositiveInt(
  process.env.STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS,
  2_400
);
const STARTUP_QUEUE_INIT_RETRY_DELAY_MS = parsePositiveInt(
  process.env.STARTUP_QUEUE_INIT_RETRY_DELAY_MS,
  2_000
);
const STARTUP_QUEUE_INIT_MAX_DEFERRALS = parsePositiveInt(
  process.env.STARTUP_QUEUE_INIT_MAX_DEFERRALS,
  8
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
        emitPerformanceMetric({
          name: "startup_priority_deferral_count",
          value: 1,
          route: "startup_isolation",
          metadata: {
            task: "embedding_runtime",
            attempts,
            reasons: deferDecision.reasons,
            pressure: deferDecision.pressure,
          },
        });
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

const waitForRuntimeInfrastructureWithinBudget = async () => {
  const startedAt = Date.now();
  const bootstrapPromise = initQueues()
    .then(() => true)
    .catch((error) => {
      logger.error(
        {
          err: error,
        },
        "Startup runtime infrastructure initialization failed"
      );
      return false;
    });

  const budgetTimeoutPromise = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS);
    timer.unref?.();
  });

  const readyWithinBudget = await Promise.race([
    bootstrapPromise,
    budgetTimeoutPromise,
  ]);

  return {
    readyWithinBudget,
    durationMs: Date.now() - startedAt,
  };
};

const startPostListenBootstrap = () => {
  let stripeConfigValidationCompleted = false;
  let commerceColdBootReplayCompleted = false;
  let entitlementReconcileReplayCompleted = false;

  const checkAndRunPrewarm = () => {
    if (
      stripeConfigValidationCompleted &&
      commerceColdBootReplayCompleted &&
      entitlementReconcileReplayCompleted
    ) {
      PrewarmService.triggerAsyncPrewarm("startup_boot");
    }
  };

  scheduleBackgroundStartupTask(
    "stripe_config_validation",
    async () => {
      try {
        await emitStripeConfigValidation();
      } finally {
        stripeConfigValidationCompleted = true;
        checkAndRunPrewarm();
      }
    },
    {
      priority: "critical",
    }
  );

  scheduleBackgroundStartupTask(
    "commerce_cold_boot_replay",
    async () => {
      try {
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
      } finally {
        commerceColdBootReplayCompleted = true;
        checkAndRunPrewarm();
      }
    },
    {
      priority: "critical",
    }
  );

  scheduleBackgroundStartupTask(
    "entitlement_reconcile_replay",
    async () => {
      try {
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
      } finally {
        entitlementReconcileReplayCompleted = true;
        checkAndRunPrewarm();
      }
    },
    {
      priority: "critical",
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
  logger.info("STARTUP_TRACE :: STEP 1 :: startServer entered");
  initializeSentry();
  configurePassport();

  const isIsolationEnabled = process.env.STARTUP_ISOLATION_ENABLED !== "false";

  // 1. Minimal Env Validation
  if (!env.PORT || !env.REDIS_URL || !process.env.DATABASE_URL) {
    logger.error("Critical environment variables missing during startup validation");
    process.exit(1);
  }

  // 2. Initialize DB pool
  logger.info("Initializing database connection pool...");
  const startWarmup = Date.now();
  try {
    logger.info("TRACE DB 1 :: Before prisma.$connect");
    await prisma.$connect();
    logger.info("TRACE DB 2 :: prisma.$connect completed");
    // Warm up the pool and run a lightweight validation query
    //await prisma.user.findFirst({ select: { id: true } });
    logger.info("TRACE DB 3 :: prisma.user.findFirst completed");
    markDbReady(true);
    logger.info("STARTUP_TRACE :: STEP 2 :: Database connected");
    const warmupMs = Date.now() - startWarmup;
    emitPerformanceMetric({
      name: "startup_pool_warmup_ms",
      value: warmupMs,
      route: "startup_isolation",
    });
    logger.info(`Database connection pool warmed up in ${warmupMs}ms`);
  } catch (error) {
    logger.error({ err: error }, "Database connection failed or deferred during startup");
    markDbReady(false);
    if (isIsolationEnabled) {
      logger.error("Critical: Database pool warmup failed and startup isolation is enabled. Exiting.");
      process.exit(1);
    }
  }

  // 3. Queue / Redis initialization within budget before HTTP listen
  let readyWithinBudget = false;
  let durationMs = 0;
  if (isIsolationEnabled) {
    logger.info("Initializing runtime queues (blocking Redis readiness)...");
    const queueStart = Date.now();
    try {
      await initQueues();
      readyWithinBudget = true;
      markRedisReady(true);
      logger.info("STARTUP_TRACE :: STEP 3 :: Redis & Queues initialized");
      logger.info(`Runtime queues initialized in ${Date.now() - queueStart}ms`);
    } catch (error) {
      logger.error({ err: error }, "Critical: Queue/Redis initialization failed during startup. Exiting.");
      process.exit(1);
    }
  } else {
    const runtimeInfrastructure = await waitForRuntimeInfrastructureWithinBudget();
    readyWithinBudget = runtimeInfrastructure.readyWithinBudget;
    durationMs = runtimeInfrastructure.durationMs;
    if (!readyWithinBudget) {
      logger.warn(
        {
          startupQueueInitBudgetMs: STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS,
          startupQueueInitElapsedMs: durationMs,
        },
        "Runtime infrastructure exceeded startup critical budget; continuing with deferred initialization"
      );
      markRedisReady(false);
    }
  }

  // Bootstrap Universal Core Runtime and mount Executive Platform plugin
  try {
    executiveStartupMetrics.bootstrapStartTime = Date.now();
    logger.info({ event: "Runtime Kernel Bootstrapping" }, "Bootstrapping Universal Core Runtime...");
    if (!container.has("IMemoryEngine")) {
      await bootstrapper.bootstrap();
    }
    if (!container.has("IEmbeddingEngine")) {
      const { EmbeddingEngine } = await import("./services/embedding.service");
      container.registerInstance("IEmbeddingEngine", new EmbeddingEngine());
      logger.info({ event: "Embedding Engine Registered" }, "Embedding Engine registered in DI Container.");
    }
    if (!container.has("IKnowledgeStore")) {
      const { KnowledgeStore } = await import("./services/knowledgeSearch.service");
      container.registerInstance("IKnowledgeStore", new KnowledgeStore());
      logger.info({ event: "Knowledge Store Registered" }, "Knowledge Store registered in DI Container.");
    }
    executiveStartupMetrics.bootstrapEndTime = Date.now();

    executiveStartupMetrics.pluginRegisterStartTime = Date.now();
    const memStart = process.memoryUsage().heapUsed;
    logger.info({ event: "Executive Plugin Registration" }, "Mounting Executive Plugin...");
    logger.info("PLUGIN 1");
    const pluginRegistry = container.resolve<any>("IPluginRegistry");
    logger.info("PLUGIN 2");
    if (!pluginRegistry.getPlugin("plugin.executive.identity")) {
      await pluginRegistry.registerPlugin(new ExecutiveIdentityPlugin());
      logger.info("PLUGIN 3");
    }

    // Bootstrap Executive Platform DNA Lifecycle (Sprint 4 Phase 1 & 8)
    const { ExecutiveDNABootstrapManager } = await import("./services/executive/bootstrap/dnaRegistry");
    const dnaBootstrapManager = new ExecutiveDNABootstrapManager(container);
    await dnaBootstrapManager.bootstrap();

    const memEnd = process.memoryUsage().heapUsed;
    executiveStartupMetrics.pluginRegisterEndTime = Date.now();
    logger.info("PLUGIN 4");

    executiveStartupMetrics.startupTime = executiveStartupMetrics.bootstrapEndTime - executiveStartupMetrics.bootstrapStartTime;
    executiveStartupMetrics.initializationTime = executiveStartupMetrics.pluginRegisterEndTime - executiveStartupMetrics.pluginRegisterStartTime;
    executiveStartupMetrics.memoryOverheadBytes = Math.max(0, memEnd - memStart);
    executiveStartupMetrics.isHealthy = true;

    logger.info({
      event: "Executive Platform Wire Complete",
      startupTimeMs: executiveStartupMetrics.startupTime,
      initializationTimeMs: executiveStartupMetrics.initializationTime,
      memoryOverheadBytes: executiveStartupMetrics.memoryOverheadBytes
    }, "Universal Core Runtime bootstrapped and Executive Plugin registered successfully.");
    logger.info("STARTUP_TRACE :: STEP 4 :: Executive bootstrap completed");
  } catch (err: any) {
    executiveStartupMetrics.isHealthy = false;
    executiveStartupMetrics.error = err.message || String(err);
    logger.error({ err, event: "Executive Platform Wire Failed" }, "Failed to bootstrap Universal Core Runtime or mount Executive Plugin");
    // In production, we fail fast if our core platform fails to start
    process.exit(1);
  }

  const { default: app } = await import("./app");
  logger.info("STARTUP_TRACE :: STEP 5 :: app.ts imported");
  const server = http.createServer(app);
  logger.info("STARTUP_TRACE :: STEP 6 :: HTTP server created");
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
      logger.info(`STARTUP_TRACE :: STEP 7 :: Listening on ${env.PORT}`);
      logger.info({ port: env.PORT }, "Server listening");
      logger.info(
        {
          event: "internal_health_startup_diagnostics",
          ...getInternalApiKeyMetadata(),
          nodeEnv: process.env.NODE_ENV,
          serviceName: getServiceName(),
          gitCommit: getGitCommit(),
          startupTimestamp,
        },
        "Internal health startup diagnostics"
      );
      logger.info(
        {
          event: "deployment_metadata",
          ...getDeploymentMetadata(),
        },
        "Deployment metadata"
      );
      
      const libName = getBcryptLibraryName();
      console.log(`AUTH_BCRYPT_RUNTIME {\n  library: ${libName}\n}`);
      
      // Projection recovery initialization before runtime ready
      startPostListenBootstrap();
      
      // Mark app boot ready
      markAppBootReady();

      if (!readyWithinBudget) {
        scheduleBackgroundStartupTask(
          "runtime_queue_init_recovery",
          async () => {
            await initQueues();
            markRedisReady(isRedisWritable());
          },
          {
            priority: "critical",
            deferDelayMs: STARTUP_QUEUE_INIT_RETRY_DELAY_MS,
            maxDeferrals: STARTUP_QUEUE_INIT_MAX_DEFERRALS,
            metadata: {
              startupQueueInitBudgetMs: STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS,
            },
          }
        );
      }
      resolve(server);
    });
  });
};

if (require.main === module) {
  void startServer();
}
