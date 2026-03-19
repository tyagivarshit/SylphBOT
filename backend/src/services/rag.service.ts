import prisma from "../config/prisma";
import { searchKnowledge } from "./knowledgeSearch.service";
import OpenAI from "openai";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const detectIntent = (message: string) => {
  const msg = message.toLowerCase();

  if (/price|cost|pricing/.test(msg)) return "PRICE";
  if (/expensive|costly|high price/.test(msg)) return "OBJECTION_PRICE";
  if (/not sure|thinking|later/.test(msg)) return "HESITATION";
  if (/buy|purchase|order|start/.test(msg)) return "READY";

  return "GENERAL";
};

export const generateRAGReply = async (
  businessId: string,
  message: string,
  leadId?: string
) => {

  try {

    const intent = detectIntent(message);

    /* KNOWLEDGE */

    const results = await searchKnowledge(businessId, message);

    const knowledgeContext = results
      .map((r) => `- ${r.content}`)
      .join("\n");

    /* MEMORY */

    let memoryText = "";
    let summaryText = "";

    if (leadId) {

      const memories = await prisma.memory.findMany({
        where: { leadId },
        take: 5,
        orderBy: { createdAt: "desc" }
      });

      memoryText = memories
        .map(m => `${m.key}: ${m.value}`)
        .join("\n");

      const summary = await prisma.conversationSummary.findFirst({
        where: { leadId },
        orderBy: { updatedAt: "desc" }
      });

      summaryText = summary?.summary || "";

    }

    /* BUSINESS */

    const client = await prisma.client.findFirst({
      where: { businessId, isActive: true }
    });

    /* 🎯 INTENT BASED INSTRUCTIONS */

    let intentInstruction = "";

    if (intent === "PRICE") {
      intentInstruction = "Explain pricing clearly and guide user to best plan.";
    }

    if (intent === "OBJECTION_PRICE") {
      intentInstruction = "Handle objection. Justify value and reduce price concern.";
    }

    if (intent === "HESITATION") {
      intentInstruction = "Reduce hesitation and build trust.";
    }

    if (intent === "READY") {
      intentInstruction = "User is ready. Push strongly to close the deal.";
    }

    /* FINAL PROMPT */

    const prompt = `
You are a high-converting AI sales agent.

BUSINESS INFO:
${client?.businessInfo || ""}

PRICING:
${client?.pricingInfo || ""}

TONE:
${client?.aiTone || "Friendly and persuasive"}

SALES INSTRUCTIONS:
${client?.salesInstructions || ""}

KNOWLEDGE:
${knowledgeContext}

CUSTOMER MEMORY:
${memoryText}

SUMMARY:
${summaryText}

USER MESSAGE:
${message}

INTENT:
${intent}

SPECIAL INSTRUCTION:
${intentInstruction}

RULES:
- Always move conversation towards conversion
- Handle objections smartly
- Be human and persuasive
- Ask 1 relevant question if needed
- Keep response short
- Never sound robotic
`;

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a top sales closer" },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    return response.choices[0].message.content || "";

  } catch (error) {

    console.error("Closer AI error:", error);
    return "Let me help you with that!";

  }

};