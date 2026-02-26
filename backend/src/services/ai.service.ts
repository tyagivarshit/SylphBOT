import OpenAI from "openai";
import prisma from "../config/prisma";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface AIInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* ---------------- USAGE CHECK ---------------- */

const checkUsage = async (businessId: string) => {
  const usage = await prisma.usage.findUnique({
    where: { businessId },
  });

  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
  });

  if (!usage || !subscription) {
    throw new Error("Subscription not found");
  }

  const limit = subscription.plan === "FREE" ? 100 : 10000;

  if (usage.messagesUsed >= limit) {
    throw new Error("Usage limit exceeded");
  }

  return usage;
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
      email: emailMatch?.[0],
      phone: phoneMatch?.[0],
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
  try {
    await checkUsage(businessId);

    // 🔥 Fetch client for client-specific AI
    const client = await prisma.client.findFirst({
      where: {
        businessId,
        isActive: true,
      },
    });

    const memory = await getConversationMemory(leadId);

    // 🔥 Dynamic system prompt
    const prompt = [
      {
        role: "system",
        content: `
You are a professional sales assistant.

Business Info:
${client?.businessInfo || "Not provided"}

Pricing Details:
${client?.pricingInfo || "Ask admin for pricing"}

Tone:
${client?.aiTone || "Professional"}

Rules:
- Do NOT invent pricing.
- Only use provided pricing info.
- Stay within business context.
        `,
      },
      ...memory,
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: prompt as any,
    });

    const reply =
      response.choices?.[0]?.message?.content ||
      "Thanks for reaching out!";

    // Save AI reply
    await prisma.message.create({
      data: {
        leadId,
        content: reply,
        sender: "AI",
      },
    });

    // Save user message
    await prisma.message.create({
      data: {
        leadId,
        content: message,
        sender: "USER",
      },
    });

    await extractLeadData(leadId, message);
    await updateStage(leadId, message);

    await prisma.usage.update({
      where: { businessId },
      data: { messagesUsed: { increment: 1 } },
    });

    return reply;
  } catch (error) {
    console.error("AI Error:", error);
    return "Thanks for your message. Our team will respond shortly.";
  }
};