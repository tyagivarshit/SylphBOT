import { bookingPriorityRouter } from "../../bookingPriorityRouter.service";
import type {
  RevenueBrainBookingToolResult,
  RevenueBrainContext,
  RevenueBrainToolExecution,
} from "../types";

const normalizeBookingAngle = (message?: string | null) => {
  const text = String(message || "").toLowerCase();

  if (/confirm|booked|reserved/.test(text)) {
    return "urgency" as const;
  }

  if (/slot|available|select|reply with slot/.test(text)) {
    return "value" as const;
  }

  return "personalization" as const;
};

const normalizeBookingCta = (message?: string | null) => {
  const text = String(message || "").toLowerCase();

  if (/yes|confirm|slot|available|book/.test(text)) {
    return "BOOK_CALL" as const;
  }

  return "REPLY_DM" as const;
};

export const runBookingTool = async ({
  context,
}: {
  context: RevenueBrainContext;
}): Promise<{
  execution: RevenueBrainToolExecution;
  result: RevenueBrainBookingToolResult;
}> => {
  try {
    const message = await bookingPriorityRouter({
      businessId: context.businessId,
      leadId: context.leadId,
      message: context.inputMessage,
      plan: context.planContext.plan,
    });

    if (!message) {
      return {
        execution: {
          name: "booking",
          phase: "before_reply",
          status: "skipped",
          payload: {
            reason: "booking_not_handled",
          },
        },
        result: {
          handled: false,
          message: null,
          cta: null,
          angle: null,
          reason: "booking_not_handled",
        },
      };
    }

    return {
      execution: {
        name: "booking",
        phase: "before_reply",
        status: "applied",
        payload: {
          handled: true,
        },
      },
      result: {
        handled: true,
        message,
        cta: normalizeBookingCta(message),
        angle: normalizeBookingAngle(message),
        reason: "booking_flow_handled",
      },
    };
  } catch (error: any) {
    return {
      execution: {
        name: "booking",
        phase: "before_reply",
        status: "failed",
        error: error?.message || "booking_tool_failed",
      },
      result: {
        handled: false,
        message: null,
        cta: null,
        angle: null,
        reason: error?.message || "booking_tool_failed",
      },
    };
  }
};
