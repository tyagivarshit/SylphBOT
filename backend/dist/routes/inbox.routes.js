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
const aiRouter_service_1 = require("../services/aiRouter.service");
const message_service_1 = require("../services/message.service");
const Sentry = __importStar(require("@sentry/node"));
const worker = new bullmq_1.Worker("inboxQueue", async (job) => {
    const { businessId, leadId, message, plan } = job.data;
    try {
        /* =================================================
        🤖 AI
        ================================================= */
        const aiResponse = await (0, aiRouter_service_1.routeAIMessage)({
            businessId,
            leadId,
            message,
            plan,
        });
        const aiReply = typeof aiResponse === "string"
            ? aiResponse
            : aiResponse?.message;
        if (!aiReply)
            return;
        /* =================================================
        💬 SAVE + REALTIME (USING YOUR SERVICE 🔥)
        ================================================= */
        await (0, message_service_1.handleIncomingMessage)({
            leadId,
            content: aiReply,
            sender: "AI",
        });
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
    connection: { url: process.env.REDIS_URL }
});
exports.default = worker;
