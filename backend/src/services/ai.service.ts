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

/* KNOWLEDGE SEARCH */
import { searchKnowledge } from "./knowledgeSearch.service";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface AIInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* ---------------- SYSTEM MESSAGE FILTER ---------------- */

const isSystemMessage = (message: string) => {

  const msg = message.toLowerCase();

  if (
    msg.includes("please wait a moment") ||
    msg.includes("moment before sending") ||
    msg.includes("try again later")
  ) {
    return true;
  }

  return false;

};

/* ---------------- AI ABUSE PROTECTION ---------------- */

const checkAIAbuse = async (leadId: string, message: string) => {

  const recentMessages = await prisma.message.findMany({
    where: {
      leadId,
      sender: "USER",
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (recentMessages.length === 5) {

    const allSame = recentMessages.every(
      (m) =>
        m.content.toLowerCase().trim() ===
        message.toLowerCase().trim()
    );

    if (allSame) {
      return { blocked: true, reason: "SPAM_DETECTED" };
    }

  }

  const aiMessages = await prisma.message.count({
    where: {
      leadId,
      sender: "AI",
    },
  });

  if (aiMessages >= 500) {
    return { blocked: true, reason: "LIMIT_REACHED" };
  }

  return { blocked: false };

};

/* ---------------- PLAN + USAGE ---------------- */

const checkUsage = async (businessId: string) => {

  const { month, year } = getCurrentMonthYear();

  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });

  if (!subscription || subscription.status !== "ACTIVE") {
    return { blocked: true, reason: "INACTIVE_SUBSCRIPTION" };
  }

  if (
    subscription.plan.name === "FREE_TRIAL" &&
    subscription.currentPeriodEnd &&
    new Date() > subscription.currentPeriodEnd
  ) {
    return { blocked: true, reason: "TRIAL_EXPIRED" };
  }

  let usage = await prisma.usage.findUnique({
    where: {
      businessId_month_year: {
        businessId,
        month,
        year,
      },
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
    return { blocked: true, reason: "PLAN_LIMIT" };
  }

  return { blocked: false, plan: subscription.plan.name };

};

const incrementUsage = async (businessId: string) => {

  const { month, year } = getCurrentMonthYear();

  await prisma.usage.update({
    where: {
      businessId_month_year: {
        businessId,
        month,
        year,
      },
    },
    data: {
      aiCallsUsed: { increment: 1 },
      messagesUsed: { increment: 1 },
    },
  });

};

/* ---------------- LEAD DATA EXTRACTION ---------------- */

const extractLeadData = async (leadId: string, message: string) => {

  const emailMatch = message.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  );

  const phoneMatch = message.match(/\b\d{10,15}\b/);

  if (!emailMatch && !phoneMatch) return;

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      email: emailMatch?.[0] || undefined,
      phone: phoneMatch?.[0] || undefined,
    },
  });

};

/* ---------------- STAGE SYSTEM ---------------- */

const determineStage = (message: string) => {

  const msg = message.toLowerCase();

  if (/price|cost|pricing/.test(msg)) return "INTERESTED";
  if (/buy|purchase|order/.test(msg)) return "READY_TO_BUY";

  return "NEW";

};

const updateStage = async (leadId: string, message: string) => {

  const stage = determineStage(message);

  await prisma.lead.update({
    where: { id: leadId },
    data: { stage },
  });

};

/* ---------------- MAIN AI FUNCTION ---------------- */

export const generateAIReply = async ({
  businessId,
  leadId,
  message,
}: AIInput) => {

  console.log("AI SERVICE START", { businessId, leadId });

  try {

    /* EMPTY MESSAGE PROTECTION */

    if (!message || !message.trim()) {
      return "Thanks for reaching out!";
    }

    /* SYSTEM MESSAGE PROTECTION */

    if (isSystemMessage(message)) {
      console.log("System message blocked:", message);
      return "";
    }

    const abuseCheck = await checkAIAbuse(leadId, message);

    if (abuseCheck.blocked) {

      if (abuseCheck.reason === "SPAM_DETECTED") {
        return "Please avoid repeating the same message.";
      }

      if (abuseCheck.reason === "LIMIT_REACHED") {
        return "Conversation limit reached. Our team will assist you shortly.";
      }

    }

    const usageCheck = await checkUsage(businessId);

    if (usageCheck.blocked) {

      if (usageCheck.reason === "TRIAL_EXPIRED") {
        return "Your trial has expired. Please upgrade.";
      }

      if (usageCheck.reason === "PLAN_LIMIT") {
        return "You have reached your monthly AI usage limit.";
      }

      if (usageCheck.reason === "INACTIVE_SUBSCRIPTION") {
        return "Your subscription is inactive.";
      }

    }

    const planName = usageCheck.plan || "FREE_TRIAL";

    if (planName === "PRO" || planName === "ENTERPRISE") {

      const reply = await generateAIFunnelReply({
        businessId,
        leadId,
        message,
      });

      await incrementUsage(businessId);

      return reply;

    }

    const client = await prisma.client.findFirst({
      where: {
        businessId,
        isActive: true,
      },
    });

    if (!client) {
      return "No active client found.";
    }

    const memoryContext = await buildMemoryContext(leadId);

    const knowledgeResults = await searchKnowledge(
      businessId,
      message
    );

    const knowledgeText = knowledgeResults
      .map(k => `${k.title}: ${k.content}`)
      .join("\n");

    const systemPrompt = `
You are a helpful AI assistant for a business.

Business Information:
${client.businessInfo || "Not provided"}

Pricing Information:
${client.pricingInfo || "Ask admin for pricing"}

FAQ Knowledge:
${client.faqKnowledge || "No FAQ knowledge provided"}

Sales Instructions:
${client.salesInstructions || "Be helpful and guide the customer"}

Knowledge Base:
${knowledgeText || "No additional knowledge provided"}

Communication Style:
${client.aiTone || "Professional"}

Customer Memory:
${memoryContext.memory}

Conversation Summary:
${memoryContext.summary}

Rules:
- Use only provided business information
- Never invent pricing
- Follow the sales instructions if provided
- Use FAQ knowledge when relevant
- Use knowledge base if relevant
- Be concise and helpful
`;

    const prompt = [
      { role: "system", content: systemPrompt },
      ...memoryContext.conversation,
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: prompt as any,
    });

    const reply =
      response.choices?.[0]?.message?.content?.trim() ||
      "Thanks for reaching out!";

    await prisma.message.create({
      data: {
        leadId,
        content: reply,
        sender: "AI",
      },
    });

    await incrementUsage(businessId);

    await updateMemory(leadId, message);

    const messageCount = await prisma.message.count({
      where: { leadId },
    });

    if (messageCount % 10 === 0) {
      await generateConversationSummary(leadId);
    }

    await extractLeadData(leadId, message);
    await updateStage(leadId, message);

    return reply;

  } catch (error: any) {

    console.error("AI SERVICE ERROR:", error);

    return "Thanks for your message. Our team will respond shortly.";

  }

};