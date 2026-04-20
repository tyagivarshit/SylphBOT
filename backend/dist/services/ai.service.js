"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIReply = void 0;
const aiRuntime_service_1 = require("./aiRuntime.service");
const generateAIReply = async ({ businessId, leadId, message, plan, source, preview, }) => {
    return (0, aiRuntime_service_1.generateUnifiedAIReplyText)({
        businessId,
        leadId,
        message,
        plan,
        source: source || "LEGACY_AI_SERVICE",
        preview,
    });
};
exports.generateAIReply = generateAIReply;
