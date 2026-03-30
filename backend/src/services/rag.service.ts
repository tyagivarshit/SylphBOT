import prisma from "../config/prisma";
import { searchKnowledge } from "./knowledgeSearch.service";
import OpenAI from "openai";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string);

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/* ---------------- INTENT ---------------- */

const detectIntent = (message: string) => {
  const msg = message.toLowerCase();

  if (/price|cost|pricing/.test(msg)) return "PRICE";
  if (/expensive|costly|high price/.test(msg)) return "OBJECTION_PRICE";
  if (/not sure|thinking|later/.test(msg)) return "HESITATION";
  if (/buy|purchase|order|start/.test(msg)) return "READY";

  return "GENERAL";
};

/* ---------------- CACHE HELPERS ---------------- */

const getCache = async (key: string) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const setCache = async (key: string, value: any, ttl = 60) => {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch {}
};

/* ---------------- MAIN ---------------- */

export const generateRAGReply = async (
  businessId: string,
  message: string,
  leadId?: string
) => {
  try {
    const intent = detectIntent(message);

    /* =========================
       🔥 CACHE KEYS
    ========================= */

    const memoryKey = `mem:${leadId}`;
    const summaryKey = `sum:${leadId}`;
    const businessKey = `biz:${businessId}`;

    /* =========================
       🔥 PARALLEL FETCH
    ========================= */

    const [knowledgeResults, cachedMemory, cachedSummary, cachedBusiness] =
      await Promise.all([
        searchKnowledge(businessId, message),

        leadId ? getCache(memoryKey) : null,
        leadId ? getCache(summaryKey) : null,
        getCache(businessKey),
      ]);

    /* =========================
       🔥 LIMIT KNOWLEDGE
    ========================= */

    const knowledgeContext = (knowledgeResults || [])
      .slice(0, 5) // 🔥 LIMIT
      .map((r) => `- ${r.content}`)
      .join("\n");

    /* =========================
       🔥 MEMORY (WITH CACHE)
    ========================= */

    let memoryText = cachedMemory || "";
    let summaryText = cachedSummary || "";

    if (leadId && !cachedMemory) {
      const memories = await prisma.memory.findMany({
        where: { leadId },
        take: 3, // 🔥 reduced
        orderBy: { createdAt: "desc" },
      });

      memoryText = memories
        .map((m) => `${m.key}: ${m.value}`)
        .join("\n");

      await setCache(memoryKey, memoryText, 120);
    }

    if (leadId && !cachedSummary) {
      const summary = await prisma.conversationSummary.findFirst({
        where: { leadId },
        orderBy: { updatedAt: "desc" },
      });

      summaryText = summary?.summary || "";
      await setCache(summaryKey, summaryText, 120);
    }

    /* =========================
       🔥 BUSINESS CACHE
    ========================= */

    let businessData = cachedBusiness;

    if (!businessData) {
      const client = await prisma.client.findFirst({
        where: { businessId, isActive: true },
        select: {
          businessInfo: true,
          pricingInfo: true,
          aiTone: true,
          salesInstructions: true,
        },
      });

      businessData = client || {};
      await setCache(businessKey, businessData, 300);
    }

    /* =========================
       🔥 INTENT INSTRUCTION
    ========================= */

    const intentMap: any = {
      PRICE: "Explain pricing clearly and guide user to best plan.",
      OBJECTION_PRICE: "Handle objection and justify value.",
      HESITATION: "Build trust and reduce hesitation.",
      READY: "Push strongly to close the deal.",
    };

    /* =========================
       🔥 SHORT PROMPT (OPTIMIZED)
    ========================= */

    const prompt = `
Business:
${businessData.businessInfo || ""}

Pricing:
${businessData.pricingInfo || ""}

Knowledge:
${knowledgeContext}

Memory:
${memoryText}

Summary:
${summaryText}

User:
${message}

Instruction:
${intentMap[intent] || "Be helpful and convert user"}

Rules:
- Short replies
- Human tone
- Move toward conversion
`;

    /* =========================
       🔥 TIMEOUT + RETRY SAFE
    ========================= */

    const response: any = await Promise.race([
  groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: "You are a sales closer" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  }),

  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI timeout")), 8000)
  ),
]);

return response?.choices?.[0]?.message?.content || "Let me help you!";

  } catch (error) {
    console.error("RAG ERROR:", error);
    return "Let me help you with that!";
  }
};