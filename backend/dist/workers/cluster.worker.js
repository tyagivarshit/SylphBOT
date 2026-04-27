"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorkerCluster = void 0;
const cluster_1 = __importDefault(require("cluster"));
const sentry_1 = require("../observability/sentry");
const logger_1 = __importDefault(require("../utils/logger"));
const ai_worker_1 = require("./ai.worker");
const workerManager_1 = require("./workerManager");
const shouldRunWorker = process.env.RUN_WORKER === "true" ||
    process.env.RUN_WORKER === undefined;
const readPositiveInteger = (name, fallback, min = 1) => {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed) || parsed < min) {
        return fallback;
    }
    return Math.floor(parsed);
};
const CLUSTER_WORKER_RESPAWN_BASE_DELAY_MS = readPositiveInteger("CLUSTER_WORKER_RESPAWN_BASE_DELAY_MS", 1000, 100);
const CLUSTER_WORKER_RESPAWN_MAX_DELAY_MS = readPositiveInteger("CLUSTER_WORKER_RESPAWN_MAX_DELAY_MS", 30000, CLUSTER_WORKER_RESPAWN_BASE_DELAY_MS);
const CLUSTER_WORKER_RESTART_CAP = readPositiveInteger("CLUSTER_WORKER_RESTART_CAP", 5);
const CLUSTER_WORKER_COOLDOWN_WINDOW_MS = readPositiveInteger("CLUSTER_WORKER_COOLDOWN_WINDOW_MS", 60000, 1000);
const CLUSTER_WORKER_HEALTHY_UPTIME_MS = readPositiveInteger("CLUSTER_WORKER_HEALTHY_UPTIME_MS", 300000, 1000);
const CLUSTER_WORKER_SHUTDOWN_GRACE_MS = readPositiveInteger("CLUSTER_WORKER_SHUTDOWN_GRACE_MS", 30000, 1000);
let recentFailureTimestamps = [];
let failureEpoch = 0;
let breakerOpen = false;
let shuttingDownPrimary = false;
let shutdownExitCode = 0;
let forceShutdownTimer;
const pendingRestartTimers = new Set();
const workerStates = new Map();
const pruneRecentFailures = (now = Date.now()) => {
    recentFailureTimestamps = recentFailureTimestamps.filter((timestamp) => now - timestamp <= CLUSTER_WORKER_COOLDOWN_WINDOW_MS);
    return recentFailureTimestamps;
};
const getLiveWorkers = () => Object.values(cluster_1.default.workers ?? {}).filter((worker) => Boolean(worker) && !worker.isDead());
const clearPendingRestarts = () => {
    for (const timer of pendingRestartTimers) {
        clearTimeout(timer);
    }
    pendingRestartTimers.clear();
};
const clearWorkerState = (workerId) => {
    const state = workerStates.get(workerId);
    if (state?.healthyResetTimer) {
        clearTimeout(state.healthyResetTimer);
    }
    workerStates.delete(workerId);
};
const resetFailureCounter = (reason, context) => {
    if (!recentFailureTimestamps.length) {
        return;
    }
    recentFailureTimestamps = [];
    logger_1.default.info(context, reason);
};
const maybeExitPrimary = () => {
    if (!shuttingDownPrimary || getLiveWorkers().length > 0) {
        return;
    }
    if (forceShutdownTimer) {
        clearTimeout(forceShutdownTimer);
        forceShutdownTimer = undefined;
    }
    process.exit(shutdownExitCode);
};
const beginPrimaryShutdown = (reason, exitCode) => {
    if (shuttingDownPrimary) {
        return;
    }
    shuttingDownPrimary = true;
    shutdownExitCode = exitCode;
    clearPendingRestarts();
    const liveWorkers = getLiveWorkers();
    logger_1.default.warn({
        exitCode,
        liveWorkerCount: liveWorkers.length,
        shutdownGraceMs: CLUSTER_WORKER_SHUTDOWN_GRACE_MS,
    }, reason);
    for (const worker of liveWorkers) {
        logger_1.default.info({
            workerId: worker.id,
            pid: worker.process.pid ?? null,
        }, "Stopping cluster worker");
        worker.process.kill("SIGTERM");
    }
    if (!liveWorkers.length) {
        process.exit(exitCode);
        return;
    }
    forceShutdownTimer = setTimeout(() => {
        const stuckWorkers = getLiveWorkers();
        if (stuckWorkers.length) {
            logger_1.default.error({
                workerIds: stuckWorkers.map((worker) => worker.id),
                pids: stuckWorkers.map((worker) => worker.process.pid ?? null),
                shutdownGraceMs: CLUSTER_WORKER_SHUTDOWN_GRACE_MS,
            }, "Cluster worker shutdown grace window elapsed; forcing remaining workers to exit");
        }
        for (const worker of stuckWorkers) {
            worker.process.kill("SIGKILL");
        }
        process.exit(exitCode);
    }, CLUSTER_WORKER_SHUTDOWN_GRACE_MS);
    forceShutdownTimer.unref();
};
const registerHealthyReset = (worker, state) => {
    const timer = setTimeout(() => {
        state.healthyResetTimer = undefined;
        const liveWorker = cluster_1.default.workers?.[worker.id];
        if (!liveWorker || liveWorker.isDead() || breakerOpen || shuttingDownPrimary) {
            return;
        }
        if (failureEpoch !== state.observedFailureEpoch) {
            return;
        }
        resetFailureCounter("Cluster worker healthy uptime reached; failure counter reset", {
            workerId: worker.id,
            pid: liveWorker.process.pid ?? null,
            healthyUptimeMs: CLUSTER_WORKER_HEALTHY_UPTIME_MS,
        });
    }, CLUSTER_WORKER_HEALTHY_UPTIME_MS);
    timer.unref();
    state.healthyResetTimer = timer;
};
const forkClusterWorker = (reason) => {
    if (!cluster_1.default.isPrimary || breakerOpen || shuttingDownPrimary) {
        return;
    }
    const worker = cluster_1.default.fork();
    const state = {
        startedAt: Date.now(),
        observedFailureEpoch: failureEpoch,
    };
    workerStates.set(worker.id, state);
    registerHealthyReset(worker, state);
    logger_1.default.info({
        workerId: worker.id,
        pid: worker.process.pid ?? null,
        reason,
    }, "Cluster worker forked");
};
const scheduleWorkerRestart = (delayMs, context) => {
    const timer = setTimeout(() => {
        pendingRestartTimers.delete(timer);
        if (breakerOpen || shuttingDownPrimary) {
            return;
        }
        forkClusterWorker("restart");
    }, delayMs);
    timer.unref();
    pendingRestartTimers.add(timer);
    logger_1.default.warn({
        ...context,
        delayMs,
    }, "Scheduling cluster worker restart");
};
const openCircuitBreaker = (context) => {
    if (breakerOpen) {
        return;
    }
    breakerOpen = true;
    clearPendingRestarts();
    logger_1.default.error({
        ...context,
        restartCap: CLUSTER_WORKER_RESTART_CAP,
        cooldownWindowMs: CLUSTER_WORKER_COOLDOWN_WINDOW_MS,
    }, "Cluster worker circuit breaker opened");
    (0, sentry_1.captureExceptionWithContext)(new Error("Cluster worker circuit breaker opened"), {
        tags: {
            worker: "cluster.primary",
            event: "circuitBreakerOpen",
        },
        extras: {
            ...context,
            restartCap: CLUSTER_WORKER_RESTART_CAP,
            cooldownWindowMs: CLUSTER_WORKER_COOLDOWN_WINDOW_MS,
        },
    });
    beginPrimaryShutdown("Cluster worker restart cap reached; stopping cluster gracefully", 1);
};
const calculateBackoffDelay = (failureCount) => {
    const exponent = Math.max(0, failureCount - 1);
    const backoffMultiplier = 2 ** exponent;
    return Math.min(CLUSTER_WORKER_RESPAWN_BASE_DELAY_MS * backoffMultiplier, CLUSTER_WORKER_RESPAWN_MAX_DELAY_MS);
};
const registerPrimaryHandlers = () => {
    process.once("SIGINT", () => {
        beginPrimaryShutdown("Cluster primary received SIGINT", 0);
    });
    process.once("SIGTERM", () => {
        beginPrimaryShutdown("Cluster primary received SIGTERM", 0);
    });
    cluster_1.default.on("exit", (worker, code, signal) => {
        const state = workerStates.get(worker.id);
        clearWorkerState(worker.id);
        const now = Date.now();
        const uptimeMs = state ? now - state.startedAt : 0;
        const exitContext = {
            workerId: worker.id,
            pid: worker.process.pid ?? null,
            code: code ?? null,
            signal: signal ?? null,
            uptimeMs,
        };
        if (shuttingDownPrimary) {
            logger_1.default.info(exitContext, "Cluster worker exited during primary shutdown");
            maybeExitPrimary();
            return;
        }
        if (uptimeMs >= CLUSTER_WORKER_HEALTHY_UPTIME_MS) {
            resetFailureCounter("Cluster worker exited after healthy uptime; failure counter reset", exitContext);
            scheduleWorkerRestart(CLUSTER_WORKER_RESPAWN_BASE_DELAY_MS, {
                ...exitContext,
                failureCount: 0,
            });
            return;
        }
        failureEpoch += 1;
        pruneRecentFailures(now);
        recentFailureTimestamps.push(now);
        const failureCount = recentFailureTimestamps.length;
        const restartDelayMs = calculateBackoffDelay(failureCount);
        const failureContext = {
            ...exitContext,
            failureCount,
            cooldownWindowMs: CLUSTER_WORKER_COOLDOWN_WINDOW_MS,
            restartDelayMs,
        };
        logger_1.default.warn(failureContext, "Cluster worker exited before healthy uptime");
        if (failureCount >= CLUSTER_WORKER_RESTART_CAP) {
            openCircuitBreaker(failureContext);
            return;
        }
        scheduleWorkerRestart(restartDelayMs, failureContext);
    });
};
const startWorkerCluster = () => {
    if (!shouldRunWorker) {
        logger_1.default.info("[cluster.worker] RUN_WORKER disabled, cluster not started");
        return;
    }
    (0, sentry_1.initializeSentry)();
    if (cluster_1.default.isPrimary) {
        const workers = (0, workerManager_1.getWorkerCount)();
        logger_1.default.info({
            workers,
            restartCap: CLUSTER_WORKER_RESTART_CAP,
            cooldownWindowMs: CLUSTER_WORKER_COOLDOWN_WINDOW_MS,
            healthyUptimeMs: CLUSTER_WORKER_HEALTHY_UPTIME_MS,
            backoffBaseDelayMs: CLUSTER_WORKER_RESPAWN_BASE_DELAY_MS,
            backoffMaxDelayMs: CLUSTER_WORKER_RESPAWN_MAX_DELAY_MS,
        }, "Starting worker cluster");
        registerPrimaryHandlers();
        for (let index = 0; index < workers; index += 1) {
            forkClusterWorker("initial");
        }
        return;
    }
    logger_1.default.info({ pid: process.pid }, "Cluster worker process started");
    void (0, ai_worker_1.startWorkerRuntime)().catch((error) => {
        logger_1.default.error({ error, pid: process.pid }, "Cluster worker runtime failed to start");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                worker: "cluster.runtime",
                event: "startupFailure",
            },
            extras: {
                pid: process.pid,
            },
        });
        process.exit(1);
    });
};
exports.startWorkerCluster = startWorkerCluster;
if (require.main === module) {
    try {
        (0, exports.startWorkerCluster)();
    }
    catch (error) {
        logger_1.default.error({ error }, "Cluster worker supervisor failed to start");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                worker: "cluster.primary",
                event: "startupFailure",
            },
        });
        process.exit(1);
    }
}
