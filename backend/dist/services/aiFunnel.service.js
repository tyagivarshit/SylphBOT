"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIFunnelReply = void 0;
const aiRuntime_service_1 = require("./aiRuntime.service");
const generateAIFunnelReply = async ({ businessId, leadId, message, plan, }) => {
    return (0, aiRuntime_service_1.generateUnifiedAIReplyText)({
        businessId,
        leadId,
        message,
        plan,
        source: "LEGACY_FUNNEL",
    });
};
exports.generateAIFunnelReply = generateAIFunnelReply;
