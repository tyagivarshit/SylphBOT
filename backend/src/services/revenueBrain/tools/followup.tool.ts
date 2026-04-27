import type {
  RevenueBrainContext,
  RevenueBrainDecision,
  RevenueBrainFollowupDirective,
  RevenueBrainRoute,
  RevenueBrainToolExecution,
} from "../types";

export const resolveFollowupDirective = ({
  context,
  decision,
  route,
  hasReply,
}: {
  context: RevenueBrainContext;
  decision: RevenueBrainDecision;
  route: RevenueBrainRoute;
  hasReply: boolean;
}): {
  execution: RevenueBrainToolExecution;
  result: RevenueBrainFollowupDirective;
} => {
  if (context.preview) {
    return {
      execution: {
        name: "followup",
        phase: "deferred",
        status: "skipped",
        payload: {
          reason: "preview_mode",
        },
      },
      result: {
        action: "skip",
        trigger: null,
        reason: "preview_mode",
      },
    };
  }

  if (!hasReply || route === "NO_REPLY") {
    return {
      execution: {
        name: "followup",
        phase: "deferred",
        status: "skipped",
        payload: {
          reason: "no_reply_generated",
        },
      },
      result: {
        action: "skip",
        trigger: null,
        reason: "no_reply_generated",
      },
    };
  }

  if (
    route === "BOOKING" ||
    route === "ESCALATE" ||
    context.leadMemory.isHumanActive ||
    context.salesContext.leadState.state === "CONVERTED" ||
    context.crmIntelligence.stateGraph.booking.state === "SCHEDULED"
  ) {
    return {
      execution: {
        name: "followup",
        phase: "deferred",
        status: "applied",
        payload: {
          action: "cancel",
          reason: "handoff_or_conversion",
        },
      },
      result: {
        action: "cancel",
        trigger: null,
        reason: "handoff_or_conversion",
      },
    };
  }

  return {
      execution: {
        name: "followup",
        phase: "deferred",
        status: "applied",
        payload: {
        action: "schedule",
        reason: `route:${route.toLowerCase()}`,
        actionType: decision.salesDecision?.action || null,
      },
    },
    result: {
      action: "schedule",
      trigger: null,
      reason: `route:${route.toLowerCase()}`,
    },
  };
};
