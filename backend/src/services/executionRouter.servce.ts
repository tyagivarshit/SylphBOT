import { resolveAIReply } from "./aiReplyOrchestrator.service";
import { buildSalesAgentRecoveryReply } from "./salesAgent/reply.service";
import logger from "../utils/logger";

export const handleIncomingMessage = async (data: any) => {
  const { businessId, leadId, message, plan, traceId, beforeAIReply } =
    data || {};

  try {
    return await resolveAIReply({
      businessId,
      leadId,
      message,
      plan: plan || null,
      traceId,
      beforeAIReply,
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
      ...buildSalesAgentRecoveryReply(message),
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
