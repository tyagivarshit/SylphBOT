import { container } from "../runtime/core";

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
    const toolExecutor = container.resolve<any>("IToolExecutor");
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
  } catch (error) {
    console.error("Automation executor error:", error);
    return null;
  }
};