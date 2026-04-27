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
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeLegacyInboxRouteWorker = exports.initLegacyInboxRouteWorker = void 0;
const bullmq_1 = require("bullmq");
const Sentry = __importStar(require("@sentry/node"));
const redis_1 = require("../config/redis");
const ai_queue_1 = require("../queues/ai.queue");
const queue_defaults_1 = require("../queues/queue.defaults");
const shouldRunWorker = process.env.RUN_WORKER === "true" ||
    process.env.RUN_WORKER === undefined;
const globalForInboxRouteWorker = globalThis;
const initLegacyInboxRouteWorker = () => {
    if (!shouldRunWorker) {
        console.log("[routes/inbox.routes] RUN_WORKER disabled, worker not started");
        return null;
    }
    if (globalForInboxRouteWorker.__sylphInboxRouteWorker) {
        return globalForInboxRouteWorker.__sylphInboxRouteWorker;
    }
    const worker = new bullmq_1.Worker("inboxQueue", (0, queue_defaults_1.withRedisWorkerFailSafe)("inboxQueue", async (job) => {
        const { businessId, leadId, message, plan } = job.data;
        try {
            await (0, ai_queue_1.enqueueAIBatch)([
                {
                    businessId,
                    leadId,
                    message,
                    plan,
                },
            ]);
        }
        catch (error) {
            if (error instanceof Error) {
                console.error("Worker failed:", error.message);
                Sentry.captureException(error);
            }
            else {
                console.error("Worker failed:", error);
            }
            throw error;
        }
    }), {
        connection: (0, redis_1.getWorkerRedisConnection)(),
    });
    globalForInboxRouteWorker.__sylphInboxRouteWorker = worker;
    return worker;
};
exports.initLegacyInboxRouteWorker = initLegacyInboxRouteWorker;
const closeLegacyInboxRouteWorker = async () => {
    await globalForInboxRouteWorker.__sylphInboxRouteWorker?.close().catch(() => undefined);
    globalForInboxRouteWorker.__sylphInboxRouteWorker = undefined;
};
exports.closeLegacyInboxRouteWorker = closeLegacyInboxRouteWorker;
