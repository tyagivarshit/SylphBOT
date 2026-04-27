import { activateRevenueBrainEscalation } from "../escalation.service";
import type {
  RevenueBrainContext,
  RevenueBrainEscalationResult,
  RevenueBrainToolExecution,
} from "../types";

export const runEscalateTool = async ({
  context,
  reason,
}: {
  context: RevenueBrainContext;
  reason: string;
}): Promise<{
  execution: RevenueBrainToolExecution;
  result: RevenueBrainEscalationResult;
}> => {
  if (context.preview) {
    return {
      execution: {
        name: "escalate",
        phase: "before_reply",
        status: "skipped",
        payload: {
          reason: "preview_mode",
          activated: false,
        },
      },
      result: {
        requested: true,
        activated: false,
        reason: "preview_mode",
        responseMessage:
          "Preview mode skipped the human handoff, but a human takeover would be required here.",
      },
    };
  }

  try {
    const activation = await activateRevenueBrainEscalation({
      businessId: context.businessId,
      leadId: context.leadId,
      title: "Human takeover requested",
      message: `Lead ${context.leadId} requested a human handoff.`,
    });

    return {
      execution: {
        name: "escalate",
        phase: "before_reply",
        status: "applied",
        payload: {
          reason,
          activated: true,
          ownerId: activation.ownerId,
          notificationId: activation.notificationId,
        },
      },
      result: {
        requested: true,
        activated: true,
        reason,
        responseMessage:
          "A human teammate is stepping in and will reply shortly.",
      },
    };
  } catch (error: any) {
    return {
      execution: {
        name: "escalate",
        phase: "before_reply",
        status: "failed",
        error: error?.message || "escalation_failed",
      },
      result: {
        requested: true,
        activated: false,
        reason: error?.message || "escalation_failed",
        responseMessage:
          "I could not activate the human handoff safely. Please retry in a moment.",
      },
    };
  }
};
