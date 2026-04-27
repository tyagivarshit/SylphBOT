import prisma from "../../config/prisma";
import type { SalesAgentContext } from "../salesAgent/types";
import type { RevenueBrainConversationMemorySnapshot } from "./types";

const getLastMessageByRole = (
  messages: RevenueBrainConversationMemorySnapshot["recentConversation"],
  role: "assistant" | "user"
) => {
  const hit = [...messages].reverse().find((item) => item.role === role);
  return hit?.content || null;
};

export const getConversationMemorySnapshot = async ({
  leadId,
  salesContext,
}: {
  leadId: string;
  salesContext?: SalesAgentContext | null;
}): Promise<RevenueBrainConversationMemorySnapshot> => {
  const messageCountPromise = prisma.message.count({
    where: {
      leadId,
    },
  });

  if (salesContext) {
    const recentConversation = salesContext.memory.conversation.slice(-8);
    const messageCount = await messageCountPromise;

    return {
      summary: salesContext.memory.summary || "",
      recentConversation,
      messageCount,
      lastUserMessage: getLastMessageByRole(recentConversation, "user"),
      lastAssistantMessage: getLastMessageByRole(recentConversation, "assistant"),
    };
  }

  const [messages, summary, messageCount] = await Promise.all([
    prisma.message.findMany({
      where: {
        leadId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      select: {
        content: true,
        sender: true,
      },
    }),
    prisma.conversationSummary.findFirst({
      where: {
        leadId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        summary: true,
      },
    }),
    messageCountPromise,
  ]);

  const recentConversation = messages
    .reverse()
    .map((item) => ({
      role: item.sender === "AI" ? ("assistant" as const) : ("user" as const),
      content: item.content,
    }));

  return {
    summary: summary?.summary || "",
    recentConversation,
    messageCount,
    lastUserMessage: getLastMessageByRole(recentConversation, "user"),
    lastAssistantMessage: getLastMessageByRole(recentConversation, "assistant"),
  };
};
