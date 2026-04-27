"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorkerRuntime = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const sentry_1 = require("../observability/sentry");
const lifecycle_1 = require("../runtime/lifecycle");
let started = false;
let isShuttingDown = false;
const shouldRunWorker = process.env.RUN_WORKER === "true" ||
    process.env.RUN_WORKER === undefined;
const startWorkerRuntime = async () => {
    if (started) {
        return;
    }
    if (!shouldRunWorker) {
        logger_1.default.info({ runWorker: process.env.RUN_WORKER ?? null }, "Worker runtime disabled by RUN_WORKER flag");
        return;
    }
    try {
        started = true;
        (0, sentry_1.initializeSentry)();
        (0, lifecycle_1.initRedis)();
        (0, lifecycle_1.initQueues)();
        (0, lifecycle_1.initWorkers)({
            crmRefresh: true,
            revenueBrainEvents: true,
            aiPartition: true,
            followup: true,
        });
    }
    catch (error) {
        started = false;
        throw error;
    }
    const shutdownWorkerRuntime = async (exitCode = 0) => {
        if (isShuttingDown) {
            return;
        }
        isShuttingDown = true;
        await (0, lifecycle_1.shutdown)();
        process.exit(exitCode);
    };
    process.on("SIGINT", () => {
        void shutdownWorkerRuntime(0);
    });
    process.on("SIGTERM", () => {
        void shutdownWorkerRuntime(0);
    });
    process.on("uncaughtException", (error) => {
        logger_1.default.error({ error }, "AI worker uncaught exception");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                worker: "ai.partition",
                event: "uncaughtException",
            },
        });
        void shutdownWorkerRuntime(1);
    });
    process.on("unhandledRejection", (error) => {
        logger_1.default.error({ error }, "AI worker unhandled rejection");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                worker: "ai.partition",
                event: "unhandledRejection",
            },
        });
        void shutdownWorkerRuntime(1);
    });
};
exports.startWorkerRuntime = startWorkerRuntime;
if (require.main === module) {
    void (0, exports.startWorkerRuntime)().catch((error) => {
        logger_1.default.error({ error }, "AI worker failed to start");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                worker: "ai.partition",
                event: "startupFailure",
            },
        });
        process.exit(1);
    });
}
