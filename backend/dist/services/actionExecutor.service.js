"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAutomationActions = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const executeAutomationActions = async ({ businessId, leadId, trigger, message, }) => {
    try {
        const { step, executionId, flowId } = trigger;
        if (!step)
            return null;
        /* ============================= */
        /* SEND MESSAGE STEP */
        /* ============================= */
        if (step.stepType === "MESSAGE" ||
            step.stepType === "SEND_MESSAGE") {
            if (!step.message)
                return null;
            /* 🔥 MOVE TO NEXT STEP */
            if (step.nextStep) {
                await prisma_1.default.automationExecution.update({
                    where: { id: executionId },
                    data: {
                        currentStep: step.nextStep,
                    },
                });
            }
            else {
                /* END FLOW */
                await prisma_1.default.automationExecution.update({
                    where: { id: executionId },
                    data: { status: "COMPLETED" },
                });
            }
            return step.message;
        }
        /* ============================= */
        /* CONDITION STEP */
        /* ============================= */
        if (step.stepType === "CONDITION") {
            const cleanMessage = message
                .toLowerCase()
                .replace(/[^\w\s]/g, "");
            const condition = step.condition
                ?.toLowerCase()
                .replace(/[^\w\s]/g, "");
            if (!condition)
                return null;
            const regex = new RegExp(`\\b${condition}\\b`);
            const matched = regex.test(cleanMessage);
            if (!matched)
                return null;
            const nextStep = await prisma_1.default.automationStep.findFirst({
                where: {
                    flowId,
                    stepKey: step.nextStep || "",
                },
            });
            if (!nextStep)
                return null;
            /* UPDATE EXECUTION */
            await prisma_1.default.automationExecution.update({
                where: { id: executionId },
                data: {
                    currentStep: nextStep.stepKey,
                },
            });
            if (nextStep.stepType === "MESSAGE" ||
                nextStep.stepType === "SEND_MESSAGE") {
                return nextStep.message || null;
            }
            return null;
        }
        /* ============================= */
        /* DELAY STEP */
        /* ============================= */
        if (step.stepType === "DELAY") {
            return null;
        }
        /* ============================= */
        /* END STEP */
        /* ============================= */
        if (step.stepType === "END") {
            await prisma_1.default.automationExecution.update({
                where: { id: executionId },
                data: {
                    status: "COMPLETED",
                },
            });
            return null;
        }
        return null;
    }
    catch (error) {
        console.error("Automation executor error:", error);
        return null;
    }
};
exports.executeAutomationActions = executeAutomationActions;
