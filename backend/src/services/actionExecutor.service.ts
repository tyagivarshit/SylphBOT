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

    if (
      step.stepType === "MESSAGE" ||
      step.stepType === "SEND_MESSAGE"
    ) {
      if (!step.message) return null;

      /* 🔥 MOVE TO NEXT STEP */
      if (step.nextStep) {
        await prisma.automationExecution.update({
          where: { id: executionId },
          data: {
            currentStep: step.nextStep,
          },
        });
      } else {
        /* END FLOW */
        await prisma.automationExecution.update({
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

      if (!condition) return null;

      const regex = new RegExp(`\\b${condition}\\b`);
      const matched = regex.test(cleanMessage);

      if (!matched) return null;

      const nextStep = await prisma.automationStep.findFirst({
        where: {
          flowId,
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

      if (
        nextStep.stepType === "MESSAGE" ||
        nextStep.stepType === "SEND_MESSAGE"
      ) {
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