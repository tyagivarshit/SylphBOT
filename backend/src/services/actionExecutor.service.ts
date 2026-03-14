import prisma from "../config/prisma";

interface ActionInput {
  businessId: string;
  leadId: string;
  trigger: {
    flowId: string;
    step: any;
    executionId: string;
  };
  message: string;
}

export const executeAutomationActions = async ({
  businessId,
  leadId,
  trigger,
  message,
}: ActionInput): Promise<string | null> => {

  try {

    const { step, executionId, flowId } = trigger;

    if (!step) return null;

    /* ============================= */
    /* SEND MESSAGE STEP */
    /* ============================= */

    if (step.stepType === "SEND_MESSAGE") {

      if (!step.message) return null;

      return step.message;

    }

    /* ============================= */
    /* CONDITION STEP */
    /* ============================= */

    if (step.stepType === "CONDITION") {

      const condition = step.condition?.toLowerCase();

      if (!condition) return null;

      const conditionMatched = message.includes(condition);

      if (!conditionMatched) return null;

      const nextStep = await prisma.automationStep.findFirst({
        where: {
          flowId: flowId,
          stepKey: step.nextStep || "",
        },
      });

      if (!nextStep) return null;

      /* UPDATE EXECUTION */

      await prisma.automationExecution.update({
        where: { id: executionId },
        data: {
          currentStep: nextStep.stepKey,
        },
      });

      return nextStep.message || null;

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

      await prisma.automationExecution.update({
        where: { id: executionId },
        data: {
          status: "COMPLETED",
        },
      });

      return null;

    }

    return null;

  } catch (error) {

    console.error("Automation executor error:", error);

    return null;

  }

};