import OpenAI from "openai";
import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface FunnelInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* ---------------------------------------------------
AI ABUSE PROTECTION
--------------------------------------------------- */

const checkAIAbuse = async (leadId: string, message: string) => {

  const recentMessages = await prisma.message.findMany({
    where: {
      leadId,
      sender: "USER",
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5,
  });

  const normalizedMessage = message.toLowerCase().trim();

  /* SAME MESSAGE SPAM */

  const sameMessageCount = recentMessages.filter(
    (m) =>
      m.content &&
      m.content.toLowerCase().trim() === normalizedMessage
  ).length;

  if (sameMessageCount >= 3) {
    return { blocked: true, reason: "SPAM_DETECTED" };
  }

  /* TOO FAST MESSAGE FIX */

  if (recentMessages.length > 1) {

    const previousMessage = recentMessages[1];

    if (previousMessage?.createdAt) {

      const last = new Date(previousMessage.createdAt).getTime();
      const now = Date.now();

      const diffSeconds = (now - last) / 1000;

      if (diffSeconds < 1) {
        return { blocked: true, reason: "TOO_FAST" };
      }

    }

  }

  /* AI MESSAGE LIMIT */

  const aiMessages = await prisma.message.count({
    where: {
      leadId,
      sender: "AI",
    },
  });

  if (aiMessages >= 50) {
    return { blocked: true, reason: "LIMIT_REACHED" };
  }

  return { blocked: false };

};

/* ---------------------------------------------------
PLAN USAGE CHECK
--------------------------------------------------- */

const checkUsage = async (businessId: string) => {

  const { month, year } = getCurrentMonthYear();

  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });

  if (!subscription || subscription.status !== "ACTIVE") {
    throw new Error("Inactive subscription");
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

  if (!subscription.plan) {
    throw new Error("Plan not found");
  }

  if (usage.aiCallsUsed >= subscription.plan.maxAiCalls) {
    throw new Error("Plan limit reached");
  }

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

/* ---------------------------------------------------
CONVERSATION MEMORY
--------------------------------------------------- */

const getConversationMemory = async (leadId: string) => {

  const messages = await prisma.message.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
    take: 15,
  });

  return messages.map((m) => ({
    role: m.sender === "AI" ? "assistant" : "user",
    content: m.content,
  }));

};

/* ---------------------------------------------------
BUSINESS CONTEXT
--------------------------------------------------- */

const getBusinessContext = async (businessId: string) => {

  const client = await prisma.client.findFirst({
    where: {
      businessId,
      isActive: true,
    },
  });

  if (!client) return null;

  return {
    businessInfo: client.businessInfo || "",
    pricingInfo: client.pricingInfo || "",
    aiTone: client.aiTone || "Professional",
  };

};

/* ---------------------------------------------------
LEAD DATA EXTRACTION
--------------------------------------------------- */

const extractLeadData = async (leadId: string, message: string) => {

  const emailMatch = message.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  );

  const phoneMatch = message.match(/\b\d{10,15}\b/);

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      email: emailMatch?.[0] || undefined,
      phone: phoneMatch?.[0] || undefined,
    },
  });

};

/* ---------------------------------------------------
LEAD STAGE DETECTION
--------------------------------------------------- */

const detectStage = (message: string) => {

  const msg = message.toLowerCase();

  if (/price|cost|pricing|package/.test(msg)) return "INTERESTED";
  if (/demo|call|meeting/.test(msg)) return "QUALIFIED";
  if (/buy|purchase|order|start|book/.test(msg)) return "READY_TO_BUY";

  return "NEW";

};

const updateStage = async (leadId: string, message: string) => {

  const stage = detectStage(message);

  await prisma.lead.update({
    where: { id: leadId },
    data: { stage },
  });

};

/* ---------------------------------------------------
LEAD SCORING
--------------------------------------------------- */

const scoreLead = (message: string) => {

  const msg = message.toLowerCase();

  let score = 0;

  if (/price|cost/.test(msg)) score += 2;
  if (/buy|purchase|order/.test(msg)) score += 5;
  if (/demo|call/.test(msg)) score += 3;

  return score;

};

const detectLeadTemperature = (score: number) => {

  if (score >= 7) return "HOT";
  if (score >= 4) return "WARM";
  return "COLD";

};

/* ---------------------------------------------------
MAIN AI FUNNEL
--------------------------------------------------- */

export const generateAIFunnelReply = async ({
  businessId,
  leadId,
  message,
}: FunnelInput) => {

  console.log("AI FUNNEL START");

  try {

    const abuseCheck = await checkAIAbuse(leadId, message);

    if (abuseCheck.blocked) {

      if (abuseCheck.reason === "SPAM_DETECTED") {
        return "Please avoid repeating the same message.";
      }

      if (abuseCheck.reason === "TOO_FAST") {
        return "Please wait a moment before sending another message.";
      }

      if (abuseCheck.reason === "LIMIT_REACHED") {
        return "Conversation limit reached. Our team will assist you shortly.";
      }

    }

    await checkUsage(businessId);

    const context = await getBusinessContext(businessId);

    if (!context) {
      return "Thanks for reaching out!";
    }

    const memory = await getConversationMemory(leadId);

    const systemPrompt = `
You are an elite AI sales assistant.

Your objective is to convert leads into paying customers.

Business Information:
${context.businessInfo}

Pricing Information:
${context.pricingInfo}

Communication Style:
${context.aiTone}

Sales Funnel Rules:

1. Understand the customer's need first
2. Ask qualifying questions
3. Build interest before revealing pricing
4. Handle objections politely
5. Move conversation toward booking a call or purchasing
6. Keep responses short and persuasive

Important Rules:

- Never invent pricing
- Use only provided business information
- Stay within business context
`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...memory,
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: messages as any,
    });

    const reply =
      response.choices?.[0]?.message?.content?.trim() ||
      "Thanks for your message!";

    await prisma.message.create({
      data: {
        leadId,
        content: reply,
        sender: "AI",
      },
    });

    await extractLeadData(leadId, message);

    await updateStage(leadId, message);

    const leadScore = scoreLead(message);
    const temperature = detectLeadTemperature(leadScore);

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        leadScore: { increment: leadScore },
        aiStage: temperature,
      },
    });

    console.log("Lead Score:", leadScore);
    console.log("Lead Temperature:", temperature);

    return reply;

  } catch (error: any) {

    console.error("AI FUNNEL ERROR:", error);

    if (error.message === "Plan limit reached") {
      return "You have reached your AI usage limit for this month.";
    }

    if (error.message === "Inactive subscription") {
      return "Your subscription is inactive.";
    }

    return "Thanks for your message. Our team will respond shortly.";
  }

};