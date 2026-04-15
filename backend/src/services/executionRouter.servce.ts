import { resolveAIReply } from "./aiReplyOrchestrator.service";
import logger from "../utils/logger";

export const handleIncomingMessage = async (data: any) => {
  const { businessId, leadId, message, plan, traceId } = data || {};

  try {
    return await resolveAIReply({
      businessId,
      leadId,
      message,
      plan: plan || null,
      traceId,
    });
  } catch (error) {
    logger.error(
      {
        businessId,
        leadId,
        traceId,
        error,
      },
      "Execution router failed"
    );

    return {
      message:
        "I got your message. Tell me if you want pricing, details, or booking help.",
      cta: "NONE",
      source: "SYSTEM",
      latencyMs: 0,
      traceId,
      meta: {
        source: "SYSTEM",
        latencyMs: 0,
        traceId,
      },
    };
  }
};
