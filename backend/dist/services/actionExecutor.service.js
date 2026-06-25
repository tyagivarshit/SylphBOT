"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAutomationActions = void 0;
const core_1 = require("../runtime/core");
const executeAutomationActions = async ({ businessId, leadId, trigger, message, }) => {
    try {
        const toolExecutor = core_1.container.resolve("IToolExecutor");
        const result = await toolExecutor.executeTool("automation_step", {
            step: trigger.step,
            trigger,
            message,
            businessId,
            leadId
        }, {
            businessId,
            tenantId: businessId,
            correlationId: trigger.executionId
        });
        if (!result.success) {
            throw new Error(result.error);
        }
        return result.output;
    }
    catch (error) {
        console.error("Automation executor error:", error);
        return null;
    }
};
exports.executeAutomationActions = executeAutomationActions;
