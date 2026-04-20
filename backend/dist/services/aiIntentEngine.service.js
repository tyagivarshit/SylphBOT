"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIntentReply = void 0;
const aiRuntime_service_1 = require("./aiRuntime.service");
const generateIntentReply = async ({ businessId, leadId, message, plan, }) => {
    try {
        const analysis = await (0, aiRuntime_service_1.analyzeUnifiedSalesIntent)({
            businessId,
            leadId,
            message,
            plan,
            source: "LEGACY_INTENT_ENGINE",
        });
        return {
            intent: analysis.intent,
            confidence: analysis.confidence,
        };
    }
    catch (error) {
        console.error("Intent Engine Error:", error);
        return {
            intent: "GENERAL",
            confidence: 0.5,
        };
    }
};
exports.generateIntentReply = generateIntentReply;
