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

/* ---------------- MULTI QUERY ---------------- */

const generateQueries = (message: string): string[] => {
  const base = message.toLowerCase();
  return [
    base,
    base + " details",
    base + " information",
  ];
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

const setCache = async (key: string, value: any, ttl = 120) => {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch {}
};

/* ---------------- SYSTEM PROMPT ---------------- */

const SYSTEM_PROMPT = `
You are an elite AI assistant.

STRICT RULES:
- Answer ONLY from the Knowledge section
- If answer not found → reply EXACTLY: "No information available"
- Do NOT guess

STYLE:
- Short replies
- Human-like tone
- Clear and helpful
`;

/* ---------------- MAIN ---------------- */

export const generateRAGReply = async (
  businessId: string,
  message: string,
  leadId?: string
) => {
  try {

    const intent = detectIntent(message);

    const businessKey = `biz:${businessId}`;

    /* ================= MULTI QUERY SEARCH ================= */

    const queries = generateQueries(message);

    let allResults: any[] = [];

    for (const q of queries) {
      const res = await searchKnowledge(businessId, q);
      allResults.push(...res);
    }

    /* ================= DEDUPE ================= */

    const uniqueMap = new Map();

    for (const item of allResults) {
      if (!uniqueMap.has(item.content)) {
        uniqueMap.set(item.content, item);
      }
    }

    const finalResults = Array.from(uniqueMap.values())
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5);

    const knowledgeContext = finalResults
      .map((r: any) => `• ${r.content}`)
      .join("\n");

    /* =================================================
    🔥 FIX 1: SMART FORCE MATCH FOR BUSINESS QUESTIONS
    ================================================= */
    const lowerMsg = message.toLowerCase();

    const isBusinessQuery =
      lowerMsg.includes("business") ||
      lowerMsg.includes("service") ||
      lowerMsg.includes("kya karte") ||
      lowerMsg.includes("what do you do");

    if (!knowledgeContext.trim() && !isBusinessQuery) {
      return {
        found: false,
        reply: null,
        context: "",
      };
    }

    /* =================================================
    🔥 FIX 2: FALLBACK CONTEXT (PREVENT EMPTY RAG)
    ================================================= */
    let finalContext = knowledgeContext;

    if (!finalContext.trim()) {
      const top = finalResults[0];
      if (top) {
        finalContext = `• ${top.content}`;
      }
    }

    /* ================= BUSINESS CACHE ================= */

    let businessData = await getCache(businessKey);

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

    /* ================= INTENT INSTRUCTION ================= */

    const intentMap: any = {
      PRICE: "Explain pricing clearly and guide user.",
      OBJECTION_PRICE: "Handle objection and justify value.",
      HESITATION: "Build trust and remove hesitation.",
      READY: "Push toward conversion.",
      GENERAL: "Be helpful and guide user.",
    };

    /* ================= FINAL PROMPT ================= */

    const prompt = `
Business:
${businessData.businessInfo || ""}

Pricing:
${businessData.pricingInfo || ""}

Tone:
${businessData.aiTone || "Friendly"}

Instructions:
${businessData.salesInstructions || ""}

Knowledge:
${finalContext}

User:
${message}

Intent:
${intentMap[intent]}
`;

    /* ================= AI CALL ================= */

    const response: any = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const reply = response?.choices?.[0]?.message?.content?.trim();

    return {
      found: true,
      reply: reply || null,
      context: finalContext,
    };

  } catch (error) {
    console.error("RAG ERROR:", error);

    return {
      found: false,
      reply: null,
      context: "",
    };
  }
};