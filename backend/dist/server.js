"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "64";
const http_1 = __importDefault(require("http"));
const passport_1 = require("./config/passport");
const env_1 = require("./config/env");
const socket_server_1 = require("./sockets/socket.server");
const logger_1 = __importDefault(require("./utils/logger"));
const bcryptWorker_1 = require("./utils/bcryptWorker");
const sentry_1 = require("./observability/sentry");
const performanceMetrics_1 = require("./observability/performanceMetrics");
const stripeConfig_service_1 = require("./services/commerce/providers/stripeConfig.service");
const billingSettlement_service_1 = require("./services/billingSettlement.service");
const lifecycle_1 = require("./runtime/lifecycle");
const embedding_service_1 = require("./services/embedding.service");
const commerceProjection_service_1 = require("./services/commerceProjection.service");
const prisma_1 = __importDefault(require("./config/prisma"));
const redis_1 = require("./config/redis");
const startupIsolation_service_1 = require("./runtime/startupIsolation.service");
const prewarm_service_1 = require("./services/prewarm.service");
const bootstrap_1 = require("./runtime/kernel/bootstrap");
const diContainer_1 = require("./runtime/kernel/diContainer");
const plugin_1 = require("./services/executive/plugin");
const internalHealthDiagnostics_1 = require("./utils/internalHealthDiagnostics");
let isShuttingDown = false;
const parsePositiveInt = (raw, fallbackValue) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return fallbackValue;
    }
    return Math.max(1, Math.floor(parsed));
};
const STARTUP_EMBEDDING_WARMUP_DELAY_MS = parsePositiveInt(process.env.STARTUP_EMBEDDING_WARMUP_DELAY_MS, 12000);
const STARTUP_EMBEDDING_WARMUP_RETRY_DELAY_MS = parsePositiveInt(process.env.STARTUP_EMBEDDING_WARMUP_RETRY_DELAY_MS, 4000);
const STARTUP_EMBEDDING_WARMUP_MAX_ATTEMPTS = parsePositiveInt(process.env.STARTUP_EMBEDDING_WARMUP_MAX_ATTEMPTS, 8);
const STARTUP_LOW_PRIORITY_TASK_RETRY_DELAY_MS = parsePositiveInt(process.env.STARTUP_LOW_PRIORITY_TASK_RETRY_DELAY_MS, 1400);
const STARTUP_LOW_PRIORITY_TASK_MAX_DEFERRALS = parsePositiveInt(process.env.STARTUP_LOW_PRIORITY_TASK_MAX_DEFERRALS, 10);
const STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS = parsePositiveInt(process.env.STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS, 2400);
const STARTUP_QUEUE_INIT_RETRY_DELAY_MS = parsePositiveInt(process.env.STARTUP_QUEUE_INIT_RETRY_DELAY_MS, 2000);
const STARTUP_QUEUE_INIT_MAX_DEFERRALS = parsePositiveInt(process.env.STARTUP_QUEUE_INIT_MAX_DEFERRALS, 8);
const scheduleBackgroundStartupTask = (name, task, options) => {
    const priority = options?.priority || "low";
    const deferDelayMs = Math.max(200, Number(options?.deferDelayMs || STARTUP_LOW_PRIORITY_TASK_RETRY_DELAY_MS));
    const maxDeferrals = Math.max(0, Number(options?.maxDeferrals || STARTUP_LOW_PRIORITY_TASK_MAX_DEFERRALS));
    const metadata = options?.metadata || {};
    let attempts = 0;
    let deferredCount = 0;
    const scheduleAttempt = (delayMs) => {
        attempts += 1;
        (0, startupIsolation_service_1.recordStartupBackgroundTask)({
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
                const deferDecision = (0, startupIsolation_service_1.shouldDeferLowPriorityWarmup)();
                if (deferDecision.defer && deferredCount < maxDeferrals) {
                    deferredCount += 1;
                    (0, performanceMetrics_1.emitPerformanceMetric)({
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
                    (0, startupIsolation_service_1.recordStartupBackgroundTask)({
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
            (0, startupIsolation_service_1.recordStartupBackgroundTask)({
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
                (0, startupIsolation_service_1.recordStartupBackgroundTask)({
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
                logger_1.default.warn({
                    err: error,
                    task: name,
                }, "Startup background task failed");
                (0, startupIsolation_service_1.recordStartupBackgroundTask)({
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
    const runAttempt = (delayMs) => {
        attempts += 1;
        (0, startupIsolation_service_1.recordStartupBackgroundTask)({
            name: "embedding_runtime",
            status: "scheduled",
            attempts,
            metadata: {
                delayMs,
            },
        });
        const timer = setTimeout(() => {
            const deferDecision = (0, startupIsolation_service_1.shouldDeferLowPriorityWarmup)();
            if (deferDecision.defer && attempts < STARTUP_EMBEDDING_WARMUP_MAX_ATTEMPTS) {
                (0, performanceMetrics_1.emitPerformanceMetric)({
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
                (0, startupIsolation_service_1.recordStartupBackgroundTask)({
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
            (0, startupIsolation_service_1.recordStartupBackgroundTask)({
                name: "embedding_runtime",
                status: "started",
                attempts,
                metadata: {
                    deferred: deferDecision.defer,
                    reasons: deferDecision.reasons,
                },
            });
            const startedAt = Date.now();
            void (0, embedding_service_1.warmupEmbeddingRuntime)("startup_background")
                .then((outcome) => {
                const durationMs = Number(outcome.durationMs || Date.now() - startedAt);
                (0, startupIsolation_service_1.recordStartupBackgroundTask)({
                    name: "embedding_runtime",
                    status: "completed",
                    attempts,
                    durationMs,
                    metadata: {
                        deferred: deferDecision.defer,
                        reasons: deferDecision.reasons,
                    },
                });
                (0, startupIsolation_service_1.markEmbeddingWarmupReady)({
                    warmupMs: durationMs,
                    metadata: {
                        source: "startup_background",
                        attempts,
                    },
                });
            })
                .catch((error) => {
                (0, startupIsolation_service_1.recordStartupBackgroundTask)({
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
    const bootstrapPromise = (0, lifecycle_1.initQueues)()
        .then(() => true)
        .catch((error) => {
        logger_1.default.error({
            err: error,
        }, "Startup runtime infrastructure initialization failed");
        return false;
    });
    const budgetTimeoutPromise = new Promise((resolve) => {
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
        if (stripeConfigValidationCompleted &&
            commerceColdBootReplayCompleted &&
            entitlementReconcileReplayCompleted) {
            prewarm_service_1.PrewarmService.triggerAsyncPrewarm("startup_boot");
        }
    };
    scheduleBackgroundStartupTask("stripe_config_validation", async () => {
        try {
            await (0, stripeConfig_service_1.emitStripeConfigValidation)();
        }
        finally {
            stripeConfigValidationCompleted = true;
            checkAndRunPrewarm();
        }
    }, {
        priority: "critical",
    });
    scheduleBackgroundStartupTask("commerce_cold_boot_replay", async () => {
        try {
            const coldBootReplay = await commerceProjection_service_1.commerceProjectionService
                .replayPendingProviderWebhooks({
                provider: "STRIPE",
                businessId: null,
                limit: 100,
                includeClaimedOlderThanMinutes: 5,
            })
                .catch(() => null);
            if (coldBootReplay) {
                logger_1.default.info({ coldBootReplay }, "Commerce cold boot replay completed");
            }
        }
        finally {
            commerceColdBootReplayCompleted = true;
            checkAndRunPrewarm();
        }
    }, {
        priority: "critical",
    });
    scheduleBackgroundStartupTask("entitlement_reconcile_replay", async () => {
        try {
            const entitlementReplay = await (0, billingSettlement_service_1.reconcilePendingEntitlementSync)({
                limit: 100,
            }).catch(() => null);
            if (entitlementReplay && entitlementReplay.pending > 0) {
                logger_1.default.info({
                    entitlementReplay,
                }, "Commerce entitlement reconcile replay completed");
            }
        }
        finally {
            entitlementReconcileReplayCompleted = true;
            checkAndRunPrewarm();
        }
    }, {
        priority: "critical",
    });
    scheduleBackgroundStartupTask("worker_bootstrap_core", async () => {
        (0, lifecycle_1.initWorkers)({
            authEmail: true,
        });
    }, {
        priority: "critical",
    });
    scheduleBackgroundStartupTask("worker_bootstrap_integration", async () => {
        (0, lifecycle_1.initWorkers)({
            integrationOnboardingProjection: true,
            metaOAuthContinuation: true,
        });
    }, {
        priority: "low",
    });
    scheduleBackgroundStartupTask("cron_bootstrap", async () => {
        (0, lifecycle_1.initCriticalRecoveryCron)();
        if (process.env.ENABLE_CRON === "true") {
            (0, lifecycle_1.initCrons)();
        }
    }, {
        priority: "low",
    });
    scheduleDeferredEmbeddingWarmup();
};
const startServer = async () => {
    (0, sentry_1.initializeSentry)();
    (0, passport_1.configurePassport)();
    const isIsolationEnabled = process.env.STARTUP_ISOLATION_ENABLED !== "false";
    // 1. Minimal Env Validation
    if (!env_1.env.PORT || !env_1.env.REDIS_URL || !process.env.DATABASE_URL) {
        logger_1.default.error("Critical environment variables missing during startup validation");
        process.exit(1);
    }
    // 2. Initialize DB pool
    logger_1.default.info("Initializing database connection pool...");
    const startWarmup = Date.now();
    try {
        await prisma_1.default.$connect();
        // Warm up the pool and run a lightweight validation query
        await prisma_1.default.user.findFirst({ select: { id: true } });
        (0, startupIsolation_service_1.markDbReady)(true);
        const warmupMs = Date.now() - startWarmup;
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "startup_pool_warmup_ms",
            value: warmupMs,
            route: "startup_isolation",
        });
        logger_1.default.info(`Database connection pool warmed up in ${warmupMs}ms`);
    }
    catch (error) {
        logger_1.default.error({ err: error }, "Database connection failed or deferred during startup");
        (0, startupIsolation_service_1.markDbReady)(false);
        if (isIsolationEnabled) {
            logger_1.default.error("Critical: Database pool warmup failed and startup isolation is enabled. Exiting.");
            process.exit(1);
        }
    }
    // 3. Queue / Redis initialization within budget before HTTP listen
    let readyWithinBudget = false;
    let durationMs = 0;
    if (isIsolationEnabled) {
        logger_1.default.info("Initializing runtime queues (blocking Redis readiness)...");
        const queueStart = Date.now();
        try {
            await (0, lifecycle_1.initQueues)();
            readyWithinBudget = true;
            (0, startupIsolation_service_1.markRedisReady)(true);
            logger_1.default.info(`Runtime queues initialized in ${Date.now() - queueStart}ms`);
        }
        catch (error) {
            logger_1.default.error({ err: error }, "Critical: Queue/Redis initialization failed during startup. Exiting.");
            process.exit(1);
        }
    }
    else {
        const runtimeInfrastructure = await waitForRuntimeInfrastructureWithinBudget();
        readyWithinBudget = runtimeInfrastructure.readyWithinBudget;
        durationMs = runtimeInfrastructure.durationMs;
        if (!readyWithinBudget) {
            logger_1.default.warn({
                startupQueueInitBudgetMs: STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS,
                startupQueueInitElapsedMs: durationMs,
            }, "Runtime infrastructure exceeded startup critical budget; continuing with deferred initialization");
            (0, startupIsolation_service_1.markRedisReady)(false);
        }
    }
    // Bootstrap Universal Core Runtime and mount Executive Platform plugin
    try {
        plugin_1.executiveStartupMetrics.bootstrapStartTime = Date.now();
        logger_1.default.info({ event: "Runtime Kernel Bootstrapping" }, "Bootstrapping Universal Core Runtime...");
        if (!diContainer_1.container.has("IMemoryEngine")) {
            await bootstrap_1.bootstrapper.bootstrap();
        }
        plugin_1.executiveStartupMetrics.bootstrapEndTime = Date.now();
        plugin_1.executiveStartupMetrics.pluginRegisterStartTime = Date.now();
        const memStart = process.memoryUsage().heapUsed;
        logger_1.default.info({ event: "Executive Plugin Registration" }, "Mounting Executive Plugin...");
        const pluginRegistry = diContainer_1.container.resolve("IPluginRegistry");
        if (!pluginRegistry.getPlugin("plugin.executive.identity")) {
            await pluginRegistry.registerPlugin(new plugin_1.ExecutiveIdentityPlugin());
        }
        const memEnd = process.memoryUsage().heapUsed;
        plugin_1.executiveStartupMetrics.pluginRegisterEndTime = Date.now();
        plugin_1.executiveStartupMetrics.startupTime = plugin_1.executiveStartupMetrics.bootstrapEndTime - plugin_1.executiveStartupMetrics.bootstrapStartTime;
        plugin_1.executiveStartupMetrics.initializationTime = plugin_1.executiveStartupMetrics.pluginRegisterEndTime - plugin_1.executiveStartupMetrics.pluginRegisterStartTime;
        plugin_1.executiveStartupMetrics.memoryOverheadBytes = Math.max(0, memEnd - memStart);
        plugin_1.executiveStartupMetrics.isHealthy = true;
        logger_1.default.info({
            event: "Executive Platform Wire Complete",
            startupTimeMs: plugin_1.executiveStartupMetrics.startupTime,
            initializationTimeMs: plugin_1.executiveStartupMetrics.initializationTime,
            memoryOverheadBytes: plugin_1.executiveStartupMetrics.memoryOverheadBytes
        }, "Universal Core Runtime bootstrapped and Executive Plugin registered successfully.");
    }
    catch (err) {
        plugin_1.executiveStartupMetrics.isHealthy = false;
        plugin_1.executiveStartupMetrics.error = err.message || String(err);
        logger_1.default.error({ err, event: "Executive Platform Wire Failed" }, "Failed to bootstrap Universal Core Runtime or mount Executive Plugin");
        // In production, we fail fast if our core platform fails to start
        process.exit(1);
    }
    const { default: app } = await Promise.resolve().then(() => __importStar(require("./app")));
    const server = http_1.default.createServer(app);
    (0, socket_server_1.initSocket)(server);
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    // Keep server-level request timeout slightly above route-level timeouts
    // so app middleware remains the primary response timeout authority.
    server.requestTimeout = 16000;
    const shutdownServer = async (signal, exitCode = 0) => {
        if (isShuttingDown) {
            return;
        }
        isShuttingDown = true;
        logger_1.default.info({ signal }, "Server shutdown started");
        try {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }
        catch (error) {
            logger_1.default.error({
                err: error,
                signal,
            }, "Server close failed during shutdown");
        }
        await (0, lifecycle_1.shutdown)();
        process.exit(exitCode);
    };
    process.on("SIGINT", () => {
        void shutdownServer("SIGINT");
    });
    process.on("SIGTERM", () => {
        void shutdownServer("SIGTERM");
    });
    process.on("uncaughtException", (error) => {
        logger_1.default.error({ err: error }, "Server uncaught exception");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                layer: "server",
                event: "uncaughtException",
            },
        });
        void shutdownServer("uncaughtException", 1);
    });
    process.on("unhandledRejection", (error) => {
        logger_1.default.error({
            err: error,
        }, "Server unhandled rejection");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                layer: "server",
                event: "unhandledRejection",
            },
        });
    });
    return await new Promise((resolve) => {
        server.listen(env_1.env.PORT, () => {
            logger_1.default.info({ port: env_1.env.PORT }, "Server listening");
            logger_1.default.info({
                event: "internal_health_startup_diagnostics",
                ...(0, internalHealthDiagnostics_1.getInternalApiKeyMetadata)(),
                nodeEnv: process.env.NODE_ENV,
                serviceName: (0, internalHealthDiagnostics_1.getServiceName)(),
                gitCommit: (0, internalHealthDiagnostics_1.getGitCommit)(),
                startupTimestamp: internalHealthDiagnostics_1.startupTimestamp,
            }, "Internal health startup diagnostics");
            logger_1.default.info({
                event: "deployment_metadata",
                ...(0, internalHealthDiagnostics_1.getDeploymentMetadata)(),
            }, "Deployment metadata");
            const libName = (0, bcryptWorker_1.getBcryptLibraryName)();
            console.log(`AUTH_BCRYPT_RUNTIME {\n  library: ${libName}\n}`);
            // Projection recovery initialization before runtime ready
            startPostListenBootstrap();
            // Mark app boot ready
            (0, startupIsolation_service_1.markAppBootReady)();
            if (!readyWithinBudget) {
                scheduleBackgroundStartupTask("runtime_queue_init_recovery", async () => {
                    await (0, lifecycle_1.initQueues)();
                    (0, startupIsolation_service_1.markRedisReady)((0, redis_1.isRedisWritable)());
                }, {
                    priority: "critical",
                    deferDelayMs: STARTUP_QUEUE_INIT_RETRY_DELAY_MS,
                    maxDeferrals: STARTUP_QUEUE_INIT_MAX_DEFERRALS,
                    metadata: {
                        startupQueueInitBudgetMs: STARTUP_QUEUE_INIT_CRITICAL_BUDGET_MS,
                    },
                });
            }
            resolve(server);
        });
    });
};
exports.startServer = startServer;
if (require.main === module) {
    void (0, exports.startServer)();
}
