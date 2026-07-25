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
exports.startWorkerRuntime = void 0;
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "64";
const logger_1 = __importDefault(require("../utils/logger"));
const sentry_1 = require("../observability/sentry");
const lifecycle_1 = require("../runtime/lifecycle");
const prewarm_service_1 = require("../services/prewarm.service");
const bootstrap_1 = require("../runtime/kernel/bootstrap");
const diContainer_1 = require("../runtime/kernel/diContainer");
const plugin_1 = require("../services/executive/plugin");
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
        prewarm_service_1.PrewarmService.triggerAsyncPrewarm("worker_boot");
        // Bootstrap Universal Core Runtime
        if (!diContainer_1.container.has("IMemoryEngine")) {
            await bootstrap_1.bootstrapper.bootstrap();
        }
        if (!diContainer_1.container.has("IEmbeddingEngine")) {
            const { EmbeddingEngine } = await Promise.resolve().then(() => __importStar(require("../services/embedding.service")));
            diContainer_1.container.registerInstance("IEmbeddingEngine", new EmbeddingEngine());
        }
        if (!diContainer_1.container.has("IKnowledgeStore")) {
            const { KnowledgeStore } = await Promise.resolve().then(() => __importStar(require("../services/knowledgeSearch.service")));
            diContainer_1.container.registerInstance("IKnowledgeStore", new KnowledgeStore());
        }
        const pluginRegistry = diContainer_1.container.resolve("IPluginRegistry");
        if (!pluginRegistry.getPlugin("plugin.executive.identity")) {
            await pluginRegistry.registerPlugin(new plugin_1.ExecutiveIdentityPlugin());
        }
        await (0, lifecycle_1.initQueues)();
        (0, lifecycle_1.initWorkers)({
            crmRefresh: true,
            revenueBrainEvents: true,
            aiPartition: true,
            followup: true,
            authEmail: true,
            appointmentOps: true,
            calendarSync: true,
            receptionRuntime: true,
            humanReminder: true,
            webhookIntake: true,
            integrationOnboardingProjection: true,
            metaOAuthContinuation: true,
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
