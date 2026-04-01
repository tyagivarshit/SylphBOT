import OpenAI from "openai";
import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

/* FUNNEL */
import { generateAIFunnelReply } from "./aiFunnel.service";

/* MEMORY */
import {
  buildMemoryContext,
  updateMemory,
} from "./aiMemoryEngine.service";

/* SUMMARY */
import { generateConversationSummary } from "./conversationSummary.service";

/* RAG */
import { generateRAGReply } from "./rag.service";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface AIInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* ---------------- SYSTEM FILTER ---------------- */

const isSystemMessage = (message: string) => {
  const msg = message.toLowerCase();

  return (
    msg.includes("please wait") ||
    msg.includes("moment before sending") ||
    msg.includes("try again later") ||
    msg.includes("conversation limit reached")
  );
};

/* ---------------- ABUSE CHECK ---------------- */

const checkAIAbuse = async (leadId: string, message: string) => {
  const normalized = message.toLowerCase().trim();

  const recentMessages = await prisma.message.findMany({
    where: { leadId, sender: "USER" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const sameCount = recentMessages.filter(
    (m) => m.content?.toLowerCase().trim() === normalized
  ).length;

  if (sameCount >= 3) {
    return { blocked: true, reason: "SPAM" };
  }

  const aiCount = await prisma.message.count({
    where: { leadId, sender: "AI" },
  });

  if (aiCount >= 100) {
    return { blocked: true, reason: "LIMIT" };
  }

  return { blocked: false };
};

/* ---------------- USAGE ---------------- */

const checkUsage = async (businessId: string) => {
  const { month, year } = getCurrentMonthYear();

  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });

  if (!subscription || subscription.status !== "ACTIVE") {
    return { blocked: true, reason: "INACTIVE" };
  }

  let usage = await prisma.usage.findUnique({
    where: {
      businessId_month_year: { businessId, month, year },
    },
  });

  if (!usage) {
    usage = await prisma.usage.create({
      data: {
        businessId,
        month,
        year,
        aiCallsUsed: 0,
        messagesUsed: 0,
        followupsUsed: 0,
      },
    });
  }

  if (usage.aiCallsUsed >= subscription.plan.maxAiCalls) {
    return { blocked: true, reason: "LIMIT" };
  }

  return { blocked: false, plan: subscription.plan.name };
};

const incrementUsage = async (businessId: string) => {
  const { month, year } = getCurrentMonthYear();

  await prisma.usage.update({
    where: {
      businessId_month_year: { businessId, month, year },
    },
    data: {
      aiCallsUsed: { increment: 1 },
      messagesUsed: { increment: 1 },
    },
  });
};

/* ---------------- MAIN AI ---------------- */

export const generateAIReply = async ({
  businessId,
  leadId,
  message,
}: AIInput): Promise<string | null> => {
  try {
    const cleanMessage = message?.trim();

    if (!cleanMessage) return null;

    if (isSystemMessage(cleanMessage)) return null;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { isHumanActive: true },
    });

    if (lead?.isHumanActive) return null;

    const abuse = await checkAIAbuse(leadId, cleanMessage);
    if (abuse.blocked) {
      if (abuse.reason === "SPAM") {
        return "Please avoid repeating the same message.";
      }
      return null;
    }

    const usage = await checkUsage(businessId);
    if (usage.blocked) return null;

    const plan = usage.plan || "FREE";

    let finalReply: string | null = null;

    /* ============================= */
    /* FUNNEL */
    /* ============================= */

    if (plan === "PRO" || plan === "ENTERPRISE") {
      const reply = await generateAIFunnelReply({
        businessId,
        leadId,
        message: cleanMessage,
      });

      if (typeof reply === "string") {
        const cleaned = reply.trim();
        if (cleaned.length > 0) {
          finalReply = cleaned;
        }
      }
    }

    /* ============================= */
    /* FINAL CHECK */
    /* ============================= */

    if (!finalReply) return null;

    const safeReply = finalReply;

    /* SAVE */
    await prisma.message.create({
      data: {
        leadId,
        content: safeReply,
        sender: "AI",
      },
    });

    await incrementUsage(businessId);

    /* MEMORY */
    const cleanForMemory = safeReply.toLowerCase().trim();

    await buildMemoryContext(leadId);
    await updateMemory(leadId, cleanForMemory);

    /* SUMMARY */
    const count = await prisma.message.count({
      where: { leadId },
    });

    if (count % 10 === 0) {
      await generateConversationSummary(leadId);
    }

    return safeReply;
  } catch (error) {
    console.error("🚨 AI SERVICE ERROR:", error);
    return null;
  }
};