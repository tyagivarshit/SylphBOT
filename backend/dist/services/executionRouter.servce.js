"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIncomingMessage = void 0;
const aiReplyOrchestrator_service_1 = require("./aiReplyOrchestrator.service");
const reply_service_1 = require("./salesAgent/reply.service");
const logger_1 = __importDefault(require("../utils/logger"));
const handleIncomingMessage = async (data) => {
    const { businessId, leadId, message, plan, traceId, source, beforeAIReply } = data || {};
    try {
        return await (0, aiReplyOrchestrator_service_1.resolveAIReply)({
            businessId,
            leadId,
            message,
            plan: plan || null,
            traceId,
            source: source || null,
            beforeAIReply,
        });
    }
    catch (error) {
        logger_1.default.error({
            businessId,
            leadId,
            traceId,
            error,
        }, "Execution router failed");
        return {
            ...(0, reply_service_1.buildSalesAgentRecoveryReply)(message),
            source: "SYSTEM",
            latencyMs: 0,
            traceId,
            meta: {
                source: "SYSTEM",
                latencyMs: 0,
                traceId,
            },
        };
    }
};
exports.handleIncomingMessage = handleIncomingMessage;
