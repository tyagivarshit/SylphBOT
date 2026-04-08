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
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
/* SENTRY MONITORING */
const Sentry = __importStar(require("@sentry/node"));
const worker = new bullmq_1.Worker("funnelQueue", async (job) => {
    const { executionId } = job.data;
    try {
        const execution = await prisma_1.default.automationExecution.findUnique({
            where: { id: executionId },
        });
        if (!execution)
            return;
        console.log("Running funnel job:", executionId);
    }
    catch (error) {
        console.error("Funnel worker error:", error);
        Sentry.captureException(error);
        throw error;
    }
}, {
    connection: { url: process.env.REDIS_URL },
    concurrency: 3,
});
/* WORKER FAILURE MONITORING */
worker.on("failed", (job, err) => {
    console.error("Funnel Worker Failed:", job?.id, err);
    Sentry.captureException(err);
});
console.log("🚀 Funnel Worker Started");
