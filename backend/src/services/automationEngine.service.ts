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
    ACTIVE EXECUTION CHECK
    ================================================== */

    const activeExecution = await prisma.automationExecution.findFirst({
      where: {
        leadId,
        flow: {
          businessId,
        },
        status: "ACTIVE",
      },
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        flow: true,
      },
    });

    if (activeExecution) {

      const step = await prisma.automationStep.findFirst({
        where: {
          flowId: activeExecution.flowId,
          stepKey: activeExecution.currentStep,
        },
      });

      if (!step) return null;

      /* -------- ANALYTICS -------- */

      await trackStepView(activeExecution.flowId, step.stepKey);

      /* -------- EXECUTE STEP -------- */

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
        await trackStepConversion(activeExecution.flowId, step.stepKey);
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
    });

    if (!flow) return null;

    /* ==================================================
    GET FIRST STEP (SAFER)
    ================================================== */

    const firstStep = await prisma.automationStep.findFirst({
      where: {
        flowId: flow.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!firstStep) return null;

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
    });

    /* -------- EVENT BUS -------- */

    emitAutomationStarted(leadId, flow.id);

    /* -------- ANALYTICS -------- */

    await trackStepView(flow.id, firstStep.stepKey);

    /* ==================================================
    EXECUTE FIRST STEP
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
      await trackStepConversion(flow.id, firstStep.stepKey);
    }

    return reply || null;

  } catch (error) {

    console.error("🚨 Automation engine error:", error);

    return null;

  }

};