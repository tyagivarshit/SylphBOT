import prisma from "../config/prisma";

interface TriggerInput {
  businessId: string;
  message: string;
}

export const matchAutomationTrigger = async ({
  businessId,
  message,
}: TriggerInput) => {

  const text = message.toLowerCase().trim();

  const flows = await prisma.automationFlow.findMany({
    where: {
      businessId,
      status: "ACTIVE",
    },
  });

  for (const flow of flows) {

    if (!flow.triggerValue) continue;

    const triggerValue = flow.triggerValue.toLowerCase().trim();

    if (text.includes(triggerValue)) {

      return {
        flowId: flow.id,
      };

    }

  }

  return null;

};