import OpenAI from "openai";
import prisma from "../config/prisma";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface FunnelInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* =================================================
🧠 HELPERS
================================================= */

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

const getBusinessContext = async (businessId: string) => {
  const client = await prisma.client.findFirst({
    where: { businessId, isActive: true },
  });

  if (!client) return null;

  return {
    businessInfo: client.businessInfo || "",
    pricingInfo: client.pricingInfo || "",
    aiTone: client.aiTone || "Professional",
  };
};

/* =================================================
🔥 MAIN FUNNEL
================================================= */

export const generateAIFunnelReply = async ({
  businessId,
  leadId,
  message,
}: FunnelInput) => {
  try {
    const context = await getBusinessContext(businessId);
    if (!context) return null;

    const memory = await getConversationMemory(leadId);

    const systemPrompt = `
You are a smart AI sales assistant.

Goal:
- Understand user first
- Then guide conversation
- Only suggest booking when user shows interest

Rules:
- Keep replies short (1-3 lines)
- Be human, not robotic
- Ask 1 natural follow-up question
- Never force booking
`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...memory,
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: messages as any,
      temperature: 0.7,
    });

    let reply =
      response.choices?.[0]?.message?.content?.trim() ||
      "Got it 👍 Tell me more.";

    if (reply.length > 300) {
      reply = reply.slice(0, 300);
    }

    /* SAVE */
    await prisma.message.create({
      data: {
        leadId,
        content: reply,
        sender: "AI",
      },
    });

    return reply;

  } catch (error) {
    console.error("AI FUNNEL ERROR:", error);
    return null;
  }
};