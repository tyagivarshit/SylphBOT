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
const bullmq_1 = require("bullmq");
const ai_queue_1 = require("../queues/ai.queue");
const Sentry = __importStar(require("@sentry/node"));
const redis_1 = require("../config/redis");
const worker = process.env.RUN_WORKER === "true"
    ? new bullmq_1.Worker("inboxQueue", async (job) => {
        const { businessId, leadId, message, plan } = job.data;
        try {
            /*
            🤖 AI
            ================================================= */
            await (0, ai_queue_1.enqueueAIBatch)([
                {
                    businessId,
                    leadId,
                    message,
                    plan,
                },
            ]);
            /* =================================================
            💬 SAVE + REALTIME (USING YOUR SERVICE 🔥)
            ================================================= */
        }
        catch (error) {
            if (error instanceof Error) {
                console.error("❌ Worker failed:", error.message);
                Sentry.captureException(error);
            }
            else {
                console.error("❌ Worker failed:", error);
            }
            throw error;
        }
    }, {
        connection: (0, redis_1.getWorkerRedisConnection)()
    })
    : null;
exports.default = worker;
