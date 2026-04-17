import { clearConversationState } from "./conversationState.service";
import {
  buildSalesAgentRecoveryReply,
  generateSalesAgentReply,
} from "./salesAgent/reply.service";
import logger from "../utils/logger";

interface RouterInput {
  businessId: string;
  leadId: string;
  message: string;
  plan: any;
}

type RouterReply = {
  message: string;
  cta?: string;
  angle?: string;
  reason?: string | null;
  meta?: Record<string, unknown>;
};

const isGreeting = (msg: string) =>
  ["hi", "hello", "hey", "hii", "yo"].includes(msg.trim().toLowerCase());

export const routeAIMessage = async ({
  businessId,
  leadId,
  message,
  plan,
}: RouterInput): Promise<RouterReply | null> => {
  const normalizedMessage = String(message || "").trim();

  if (!normalizedMessage) {
    return buildSalesAgentRecoveryReply(normalizedMessage);
  }

  try {
    if (isGreeting(normalizedMessage)) {
      void clearConversationState(leadId).catch(() => {});
    }

    return await generateSalesAgentReply({
      businessId,
      leadId,
      message: normalizedMessage,
      plan,
      source: "AI_ROUTER",
    });
  } catch (error) {
    logger.error(
      {
        businessId,
        leadId,
        error,
      },
      "AI router failed"
    );

    return {
      ...buildSalesAgentRecoveryReply(normalizedMessage),
      reason: "router_fallback",
    };
  }
};
