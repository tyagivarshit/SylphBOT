"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAutomationEngine = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const triggerMatcher_service_1 = require("./triggerMatcher.service");
const actionExecutor_service_1 = require("./actionExecutor.service");
const eventBus_service_1 = require("./eventBus.service");
const funnelAnalytics_service_1 = require("./funnelAnalytics.service");
const runAutomationEngine = async ({ businessId, leadId, message, }) => {
    try {
        const lowerMessage = message.toLowerCase().trim();
        /* ==================================================
        🔒 FAST ACTIVE EXECUTION CHECK
        ================================================== */
        const activeExecution = await prisma_1.default.automationExecution.findFirst({
            where: {
                leadId,
                status: "ACTIVE",
            },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                flowId: true,
                currentStep: true,
            },
        });
        /* ==================================================
        CONTINUE EXISTING FLOW
        ================================================== */
        if (activeExecution) {
            const step = await prisma_1.default.automationStep.findFirst({
                where: {
                    flowId: activeExecution.flowId,
                    stepKey: activeExecution.currentStep,
                },
            });
            if (!step)
                return null;
            (0, funnelAnalytics_service_1.trackStepView)(activeExecution.flowId, step.stepKey).catch(() => { });
            const result = await (0, actionExecutor_service_1.executeAutomationActions)({
                businessId,
                leadId,
                trigger: {
                    flowId: activeExecution.flowId,
                    step,
                    executionId: activeExecution.id,
                },
                message: lowerMessage,
            });
            if (result) {
                (0, funnelAnalytics_service_1.trackStepConversion)(activeExecution.flowId, step.stepKey).catch(() => { });
            }
            return result || null;
        }
        /* ==================================================
        TRIGGER MATCH
        ================================================== */
        const trigger = (await (0, triggerMatcher_service_1.matchAutomationTrigger)({
            businessId,
            message: lowerMessage,
        }));
        if (!trigger)
            return null;
        const flow = await prisma_1.default.automationFlow.findFirst({
            where: {
                id: trigger.flowId,
                status: "ACTIVE",
            },
            select: {
                id: true,
                steps: {
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
        });
        if (!flow || flow.steps.length === 0)
            return null;
        const firstStep = flow.steps[0];
        /* 🔥 SAFETY FIX */
        if (!firstStep || !firstStep.stepType)
            return null;
        /* ==================================================
        🔒 DUPLICATE FLOW GUARD
        ================================================== */
        const alreadyRunning = await prisma_1.default.automationExecution.findFirst({
            where: {
                leadId,
                flowId: flow.id,
                status: "ACTIVE",
            },
            select: { id: true },
        });
        if (alreadyRunning)
            return null;
        /* ==================================================
        CREATE EXECUTION
        ================================================== */
        const execution = await prisma_1.default.automationExecution.create({
            data: {
                flowId: flow.id,
                leadId,
                currentStep: firstStep.stepKey,
                status: "ACTIVE",
            },
            select: {
                id: true,
            },
        });
        (0, eventBus_service_1.emitAutomationStarted)(leadId, flow.id);
        (0, funnelAnalytics_service_1.trackStepView)(flow.id, firstStep.stepKey).catch(() => { });
        /* ==================================================
        EXECUTE FLOW
        ================================================== */
        const reply = await (0, actionExecutor_service_1.executeAutomationActions)({
            businessId,
            leadId,
            trigger: {
                flowId: flow.id,
                step: firstStep,
                executionId: execution.id,
            },
            message: lowerMessage,
        });
        if (reply) {
            (0, funnelAnalytics_service_1.trackStepConversion)(flow.id, firstStep.stepKey).catch(() => { });
        }
        return reply || null;
    }
    catch (error) {
        console.error("🚨 Automation engine error:", error);
        return null;
    }
};
exports.runAutomationEngine = runAutomationEngine;
