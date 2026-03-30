import OpenAI from "openai";
import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

/* FUNNEL */
import { generateAIFunnelReply } from "./aiFunnel.service";

/* MEMORY ENGINE */
import {
  buildMemoryContext,
  updateMemory
} from "./aiMemoryEngine.service";

/* SUMMARY ENGINE */
import { generateConversationSummary } from "./conversationSummary.service";

/* ✅ RAG SERVICE */
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

/* ---------------------------------------------------
🔥 SYSTEM MESSAGE FILTER (STRONG)
--------------------------------------------------- */
const isSystemMessage = (message: string) => {
  const msg = message.toLowerCase();

  return (
    msg.includes("please wait") ||
    msg.includes("moment before sending") ||
    msg.includes("try again later") ||
    msg.includes("conversation limit reached")
  );
};

/* ---------------------------------------------------
🔥 ABUSE PROTECTION (NO LOOP)
--------------------------------------------------- */
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

/* ---------------------------------------------------
USAGE CHECK
--------------------------------------------------- */
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

/* ---------------------------------------------------
MAIN AI
--------------------------------------------------- */
export const generateAIReply = async ({
  businessId,
  leadId,
  message,
}: AIInput): Promise<string | null> => {
  try {
    const clean = message?.trim();

    /* ❌ EMPTY */
    if (!clean) return null;

    /* ❌ SYSTEM IGNORE */
    if (isSystemMessage(clean)) return null;

    /* ❌ HUMAN ACTIVE */
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { isHumanActive: true },
    });

    if (lead?.isHumanActive) return null;

    /* ❌ ABUSE */
    const abuse = await checkAIAbuse(leadId, clean);
    if (abuse.blocked) {
      if (abuse.reason === "SPAM") {
        return "Please avoid repeating the same message.";
      }
      return null; // 🔥 no loop
    }

    /* ❌ USAGE */
    const usage = await checkUsage(businessId);
    if (usage.blocked) {
      return null; // 🔥 no loop spam
    }

    const plan = usage.plan || "FREE";

    /* =================================================
    🔥 PRIORITY 1: FUNNEL AI (SALES)
    ================================================= */
    if (plan === "PRO" || plan === "ENTERPRISE") {
      const reply = await generateAIFunnelReply({
        businessId,
        leadId,
        message: clean,
      });

      await incrementUsage(businessId);

      return reply || null;
    }

    /* =================================================
    🔥 PRIORITY 2: RAG (INFO)
    ================================================= */
    const reply = await generateRAGReply(
      businessId,
      clean,
      leadId
    );

    if (!reply) return null;

    /* SAVE */
    await prisma.message.create({
      data: {
        leadId,
        content: reply,
        sender: "AI",
      },
    });

    await incrementUsage(businessId);

    /* MEMORY */
    await buildMemoryContext(leadId);
    await updateMemory(leadId, clean);

    /* SUMMARY */
    const count = await prisma.message.count({
      where: { leadId },
    });

    if (count % 10 === 0) {
      await generateConversationSummary(leadId);
    }

    return reply;

  } catch (error) {
    console.error("AI SERVICE ERROR:", error);
    return null;
  }
};