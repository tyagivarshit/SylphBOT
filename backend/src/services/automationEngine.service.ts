import prisma from "../config/prisma";
import { matchAutomationTrigger } from "./triggerMatcher.service";
import { executeAutomationActions } from "./actionExecutor.service";
import { emitAutomationStarted } from "./eventBus.service";
import {
  trackStepView,
  trackStepConversion,
} from "./funnelAnalytics.service";

interface AutomationInput {
  businessId: string;
  leadId: string;
  message: string;
}

interface AutomationTrigger {
  flowId: string;
}

export const runAutomationEngine = async ({
  businessId,
  leadId,
  message,
}: AutomationInput) => {
  try {
    const lowerMessage = message.toLowerCase().trim();

    /* ==================================================
    🔒 FAST ACTIVE EXECUTION CHECK (INDEX FRIENDLY)
    ================================================== */

    const activeExecution = await prisma.automationExecution.findFirst({
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
      const step = await prisma.automationStep.findFirst({
        where: {
          flowId: activeExecution.flowId,
          stepKey: activeExecution.currentStep,
        },
      });

      if (!step) return null;

      /* 🔥 fire & forget analytics (non-blocking) */
      trackStepView(activeExecution.flowId, step.stepKey).catch(() => {});

      const result = await executeAutomationActions({
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
        trackStepConversion(
          activeExecution.flowId,
          step.stepKey
        ).catch(() => {});
      }

      return result || null;
    }

    /* ==================================================
    TRIGGER MATCH
    ================================================== */

    const trigger = (await matchAutomationTrigger({
      businessId,
      message: lowerMessage,
    })) as AutomationTrigger | null;

    if (!trigger) return null;

    const flow = await prisma.automationFlow.findFirst({
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

    if (!flow || flow.steps.length === 0) return null;

    const firstStep = flow.steps[0];

    /* ==================================================
    🔒 DUPLICATE FLOW GUARD (CRITICAL)
    ================================================== */

    const alreadyRunning = await prisma.automationExecution.findFirst({
      where: {
        leadId,
        flowId: flow.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (alreadyRunning) return null;

    /* ==================================================
    CREATE EXECUTION
    ================================================== */

    const execution = await prisma.automationExecution.create({
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

    /* 🔥 non-blocking event */
    emitAutomationStarted(leadId, flow.id);

    /* 🔥 analytics async */
    trackStepView(flow.id, firstStep.stepKey).catch(() => {});

    /* ==================================================
    EXECUTE FLOW
    ================================================== */

    const reply = await executeAutomationActions({
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
      trackStepConversion(flow.id, firstStep.stepKey).catch(() => {});
    }

    return reply || null;
  } catch (error) {
    console.error("🚨 Automation engine error:", error);
    return null;
  }
};