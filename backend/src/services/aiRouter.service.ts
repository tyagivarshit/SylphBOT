import {
  buildSalesAgentRecoveryReply,
  generateSalesAgentReply,
} from "./salesAgent/reply.service";
import { getConversationState } from "./conversationState.service";
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
    const reply = await generateSalesAgentReply({
      businessId,
      leadId,
      message: normalizedMessage,
      plan,
      source: "AI_ROUTER",
    });

    if (!reply) {
      return null;
    }

    return {
      ...reply,
      meta: {
        ...(reply.meta || {}),
        aiGenerated: true,
        source: "AI_ROUTER",
      },
    };
  } catch (error) {
    let previousIntent: string | null = null;
    let lastAction: string | null = null;

    try {
      const state = await getConversationState(leadId);
      const salesState = (state?.context?.salesAgent || {}) as {
        previousIntent?: string | null;
        lastAction?: string | null;
      };

      previousIntent = salesState.previousIntent || null;
      lastAction = salesState.lastAction || null;
    } catch {}

    logger.error(
      {
        businessId,
        leadId,
        error,
      },
      "AI router failed"
    );

    const recovery = buildSalesAgentRecoveryReply(normalizedMessage, {
      previousIntent,
      lastAction,
    });

    return {
      ...recovery,
      meta: {
        aiGenerated: false,
        source: "SYSTEM",
      },
      reason: "router_fallback",
    };
  }
};
