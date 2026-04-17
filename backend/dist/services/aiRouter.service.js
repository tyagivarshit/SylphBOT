"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeAIMessage = void 0;
const conversationState_service_1 = require("./conversationState.service");
const reply_service_1 = require("./salesAgent/reply.service");
const logger_1 = __importDefault(require("../utils/logger"));
const isGreeting = (msg) => ["hi", "hello", "hey", "hii", "yo"].includes(msg.trim().toLowerCase());
const routeAIMessage = async ({ businessId, leadId, message, plan, }) => {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
        return (0, reply_service_1.buildSalesAgentRecoveryReply)(normalizedMessage);
    }
    try {
        if (isGreeting(normalizedMessage)) {
            void (0, conversationState_service_1.clearConversationState)(leadId).catch(() => { });
        }
        return await (0, reply_service_1.generateSalesAgentReply)({
            businessId,
            leadId,
            message: normalizedMessage,
            plan,
            source: "AI_ROUTER",
        });
    }
    catch (error) {
        logger_1.default.error({
            businessId,
            leadId,
            error,
        }, "AI router failed");
        return {
            ...(0, reply_service_1.buildSalesAgentRecoveryReply)(normalizedMessage),
            reason: "router_fallback",
        };
    }
};
exports.routeAIMessage = routeAIMessage;
