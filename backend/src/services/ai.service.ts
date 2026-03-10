import OpenAI from "openai";
import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface AIInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* ---------------- USAGE + PLAN CHECK ---------------- */

const checkAndIncrementUsage = async (businessId: string) => {
  const { month, year } = getCurrentMonthYear();

  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });

  if (!subscription || subscription.status !== "ACTIVE") {
    throw new Error("Inactive subscription");
  }

  if (
    subscription.plan.name === "FREE_TRIAL" &&
    subscription.currentPeriodEnd &&
    new Date() > subscription.currentPeriodEnd
  ) {
    throw new Error("Trial expired. Please upgrade to continue.");
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
    throw new Error("Subscription plan not found");
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

/* ---------------- MEMORY ---------------- */

const getConversationMemory = async (leadId: string) => {
  const messages = await prisma.message.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  return messages.map((m) => ({
    role: m.sender === "AI" ? "assistant" : "user",
    content: m.content,
  }));
};

/* ---------------- LEAD EXTRACTION ---------------- */

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

/* ---------------- STAGE SYSTEM ---------------- */

const determineStage = (message: string) => {
  if (/price|cost|pricing/i.test(message)) return "INTERESTED";
  if (/buy|purchase|order/i.test(message)) return "READY_TO_BUY";
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

  console.log("AI SERVICE START", { businessId, leadId, message });

  try {

    /* -------- SAVE USER MESSAGE -------- */

    try {

      const savedUser = await prisma.message.create({
        data: {
          leadId,
          content: message,
          sender: "USER",
        },
      });

      console.log("USER MESSAGE SAVED:", savedUser.id);

    } catch (err) {

      console.error("USER MESSAGE SAVE FAILED:", err);

    }

    /* -------- PLAN CHECK -------- */

    await checkAndIncrementUsage(businessId);

    const client = await prisma.client.findFirst({
      where: {
        businessId,
        isActive: true,
      },
    });

    if (!client) {
      throw new Error("No active client found");
    }

    const memory = await getConversationMemory(leadId);

    const prompt = [
      {
        role: "system",
        content: `
You are a professional sales assistant.

Business Info:
${client.businessInfo || "Not provided"}

Pricing Details:
${client.pricingInfo || "Ask admin for pricing"}

Tone:
${client.aiTone || "Professional"}

Rules:
- Do NOT invent pricing.
- Only use provided pricing info.
- Stay within business context.
        `,
      },
      ...memory,
      { role: "user", content: message },
    ];

    console.log("CALLING GROQ AI");

    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: prompt as any,
    });

    const reply =
      response.choices?.[0]?.message?.content?.trim() ||
      "Thanks for reaching out!";

    console.log("AI REPLY:", reply);

    /* -------- SAVE AI MESSAGE -------- */

    try {

      const savedAI = await prisma.message.create({
        data: {
          leadId,
          content: reply,
          sender: "AI",
        },
      });

      console.log("AI MESSAGE SAVED:", savedAI.id);

    } catch (err) {

      console.error("AI MESSAGE SAVE FAILED:", err);

    }

    await extractLeadData(leadId, message);
    await updateStage(leadId, message);

    return reply;

  } catch (error: any) {

    console.error("AI SERVICE ERROR:", error);

    if (error.message === "Trial expired. Please upgrade to continue.") {
      return "Your 7-day trial has expired. Please upgrade to continue using our AI services.";
    }

    if (error.message === "Plan limit reached") {
      return "You have reached your monthly usage limit. Please upgrade your plan.";
    }

    if (error.message === "Inactive subscription") {
      return "Your subscription is inactive. Please upgrade your plan.";
    }

    return "Thanks for your message. Our team will respond shortly.";
  }
};