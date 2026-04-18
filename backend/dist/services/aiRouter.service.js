"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeAIMessage = void 0;
const reply_service_1 = require("./salesAgent/reply.service");
const conversationState_service_1 = require("./conversationState.service");
const logger_1 = __importDefault(require("../utils/logger"));
const routeAIMessage = async ({ businessId, leadId, message, plan, }) => {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
        return (0, reply_service_1.buildSalesAgentRecoveryReply)(normalizedMessage);
    }
    try {
        return await (0, reply_service_1.generateSalesAgentReply)({
            businessId,
            leadId,
            message: normalizedMessage,
            plan,
            source: "AI_ROUTER",
        });
    }
    catch (error) {
        let previousIntent = null;
        let lastAction = null;
        try {
            const state = await (0, conversationState_service_1.getConversationState)(leadId);
            const salesState = (state?.context?.salesAgent || {});
            previousIntent = salesState.previousIntent || null;
            lastAction = salesState.lastAction || null;
        }
        catch { }
        logger_1.default.error({
            businessId,
            leadId,
            error,
        }, "AI router failed");
        return {
            ...(0, reply_service_1.buildSalesAgentRecoveryReply)(normalizedMessage, {
                previousIntent,
                lastAction,
            }),
            reason: "router_fallback",
        };
    }
};
exports.routeAIMessage = routeAIMessage;
