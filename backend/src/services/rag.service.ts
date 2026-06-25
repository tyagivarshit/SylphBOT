import prisma from "../config/prisma";
import { searchKnowledge } from "./knowledgeSearch.service";
import { container } from "../runtime/core";
import { IModelManager } from "../runtime/interfaces/core";
import redis from "../config/redis";
import { getSystemClient } from "./clientScope.service";

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

/* ---------------- CACHE ---------------- */

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
You are an elite AI sales assistant.

STRICT RULES:
- Answer ONLY from the Knowledge section
- If answer not found → reply EXACTLY: "No information available"
- Do NOT guess

STYLE:
- Short replies
- Human-like tone
- Conversion focused
`;

/* =================================================
🔥 NEW: STAGE BASED TONE ENGINE
================================================= */

const applyStageTone = (
  reply: string,
  stage: string,
  intent: string
) => {

  if (!reply) return reply;

  /* ❄️ COLD */
  if (stage === "COLD" || stage === "NEW") {
    return reply;
  }

  /* 🌤 WARM */
  if (stage === "WARM" || stage === "INTERESTED") {
    return reply + "\n\nWant me to guide you step by step?";
  }

  /* 🔥 HOT */
  if (stage === "HOT" || stage === "READY_TO_BUY") {

    if (intent === "PRICE") {
      return reply + "\n\nI can suggest the best plan and book it for you 👍";
    }

    return reply + "\n\nI can book this for you right now 👍";
  }

  return reply;
};

/* =================================================
🔥 GET LEAD STAGE
================================================= */

const getLeadStage = async (leadId?: string) => {
  if (!leadId) return "NEW";

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      stage: true,
      aiStage: true,
    },
  });

  return lead?.aiStage || lead?.stage || "NEW";
};

/* ---------------- MAIN ---------------- */

export const generateRAGReply = async (
  businessId: string,
  message: string,
  leadId?: string
) => {
  try {

    const intent = detectIntent(message);
    const lead = leadId
      ? await prisma.lead.findUnique({
          where: { id: leadId },
          select: {
            clientId: true,
          },
        })
      : null;
    const scopedClientId = lead?.clientId || null;

    const businessKey = `biz:${businessId}:client:${scopedClientId || "shared"}`;

    /* ================= SEARCH ================= */

    const queries = generateQueries(message);

    let allResults: any[] = [];

    for (const q of queries) {
      const res = await searchKnowledge(businessId, q, {
        clientId: scopedClientId,
        includeShared: true,
      });
      allResults.push(...res);
    }

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

    /* ---------------- BUSINESS QUERY FIX ---------------- */

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
      const [leadClient, systemClient] = await Promise.all([
        scopedClientId
          ? prisma.client.findFirst({
              where: {
                id: scopedClientId,
                businessId,
                isActive: true,
              },
              select: {
                businessInfo: true,
                pricingInfo: true,
                aiTone: true,
                salesInstructions: true,
              },
            })
          : null,
        getSystemClient(businessId),
      ]);

      businessData = {
        businessInfo:
          leadClient?.businessInfo || systemClient.businessInfo || "",
        pricingInfo:
          leadClient?.pricingInfo || systemClient.pricingInfo || "",
        aiTone: leadClient?.aiTone || systemClient.aiTone || "Friendly",
        salesInstructions:
          leadClient?.salesInstructions ||
          systemClient.salesInstructions ||
          "",
      };
      await setCache(businessKey, businessData, 300);
    }

    /* ================= PROMPT ================= */

    const intentMap: any = {
      PRICE: "Explain pricing clearly and guide user.",
      OBJECTION_PRICE: "Handle objection and justify value.",
      HESITATION: "Build trust and remove hesitation.",
      READY: "Push toward conversion.",
      GENERAL: "Be helpful and guide user.",
    };

    const compiler = container.resolve<any>("IPromptCompiler");
    const compiled = compiler.compile(
      "default_tenant",
      "rag_prompt",
      "1.0.0",
      {
        input: "",
      },
      {
        businessInfo: businessData.businessInfo || "",
        pricingInfo: businessData.pricingInfo || "",
        aiTone: businessData.aiTone || "Friendly",
        salesInstructions: businessData.salesInstructions || "",
        finalContext: finalContext || "",
        message: message || "",
        intentDescription: intentMap[intent] || "",
      }
    );

    const modelManager = container.resolve<IModelManager>("IModelManager");
    const response = await modelManager.generateCompletion([
      { role: "system", content: compiled.system },
      { role: "user", content: compiled.user },
    ], {
      model: "llama3-70b-8192",
      temperature: 0.2,
      maxTokens: 200,
    });

    let reply = response.content?.trim() || "";

    /* =================================================
    🔥 APPLY SALES BRAIN (NEW)
    ================================================= */

    const stage = await getLeadStage(leadId);

    reply = applyStageTone(reply, stage, intent);

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
