import OpenAI from "openai";
import prisma from "../config/prisma";
import { getSystemClient } from "./clientScope.service";

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
    select: {
      sender: true,
      content: true,
    },
  });

  return messages.map((m) => ({
    role: m.sender === "AI" ? "assistant" : "user",
    content: m.content,
  }));
};

const getBusinessContext = async (businessId: string, leadId: string) => {
  const lead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    select: {
      clientId: true,
    },
  });

  const [leadClient, systemClient] = await Promise.all([
    lead?.clientId
      ? prisma.client.findFirst({
          where: {
            id: lead.clientId,
            businessId,
            isActive: true,
          },
          select: {
            businessInfo: true,
            pricingInfo: true,
            aiTone: true,
          },
        })
      : null,
    getSystemClient(businessId),
  ]);

  return {
    businessInfo: leadClient?.businessInfo || systemClient.businessInfo || "",
    pricingInfo: leadClient?.pricingInfo || systemClient.pricingInfo || "",
    aiTone: leadClient?.aiTone || systemClient.aiTone || "Professional",
  };
};

/* =================================================
🔥 MAIN FUNNEL (UPGRADED 🔥)
================================================= */

export const generateAIFunnelReply = async ({
  businessId,
  leadId,
  message,
}: FunnelInput) => {
  try {
    const context = await getBusinessContext(businessId, leadId);
    if (!context) return null;

    const memory = await getConversationMemory(leadId);

    /* =================================================
    🔥 NEW: STRICT BUSINESS GROUNDING
    ================================================= */

    const systemPrompt = `
You are a high-converting AI sales assistant.

BUSINESS CONTEXT:
${context.businessInfo}

PRICING:
${context.pricingInfo}

GOAL:
- Understand user intent deeply
- Guide them naturally toward conversion
- Increase booking probability

STRICT RULES:
- ONLY talk about the given business
- DO NOT invent services
- If info not available → ask clarification

CONVERSATION STYLE:
- Hinglish / natural human tone
- Short replies (max 2-3 lines)
- Ask 1 smart follow-up question
- No long paragraphs

SALES BEHAVIOR:
- If user asks info → explain + soft CTA
- If user shows interest → suggest next step
- If user hesitates → reduce friction
- NEVER force booking
- Suggest booking only when relevant

EXAMPLES:
User: price kya hai  
→ "Pricing depends on your requirement 👍  
Want me to suggest best option?"

User: kya services dete ho  
→ "We help businesses with digital growth 👍  
Want me to explain services or suggest best option?"

IMPORTANT:
- Be helpful first, sales second
`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...memory,
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: messages as any,
      max_tokens: 120,
      temperature: 0.6, // 🔥 controlled (less random)
    });

    let reply =
      response.choices?.[0]?.message?.content?.trim() ||
      "Got it 👍 Tell me more.";

    /* 🔥 HARD LIMIT */
    if (reply.length > 250) {
      reply = reply.slice(0, 250);
    }

    /* =================================================
    🔥 SAVE
    ================================================= */

    if (false) await prisma.message.create({
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
