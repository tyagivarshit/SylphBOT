"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIReply = void 0;
const aiRuntime_service_1 = require("./aiRuntime.service");
const securityGovernanceOS_service_1 = require("./security/securityGovernanceOS.service");
const generateAIReply = async ({ businessId, leadId, message, plan, source, preview, }) => {
    await (0, securityGovernanceOS_service_1.enforceSecurityGovernanceInfluence)({
        domain: "AI",
        action: "messages:enqueue",
        businessId,
        tenantId: businessId,
        actorId: "ai_runtime",
        actorType: "SERVICE",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
        resourceType: "AI_REPLY",
        resourceId: leadId,
        resourceTenantId: businessId,
        purpose: "GENERATE_REPLY",
        metadata: {
            preview: Boolean(preview),
            source: source || "LEGACY_AI_SERVICE",
        },
    });
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
