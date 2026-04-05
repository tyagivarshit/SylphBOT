"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIntentReply = void 0;
const openai_1 = __importDefault(require("openai"));
const prisma_1 = __importDefault(require("../config/prisma"));
const openai = new openai_1.default({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});
/* =====================================================
🔥 FAST RULE-BASED INTENT (NO API)
===================================================== */
const detectIntentFast = (msg) => {
    const text = msg.toLowerCase();
    if (["hi", "hello", "hey"].includes(text)) {
        return { intent: "GREETING", confidence: 0.95 };
    }
    if (/price|cost|fees|pricing/.test(text)) {
        return { intent: "PRICING", confidence: 0.85 };
    }
    if (/book|schedule|appointment|call/.test(text)) {
        return { intent: "BOOKING", confidence: 0.75 };
    }
    if (/buy|purchase|pay/.test(text)) {
        return { intent: "BUYING", confidence: 0.9 };
    }
    return null;
};
/* =====================================================
🔥 AI INTENT (ONLY WHEN NEEDED)
===================================================== */
const detectIntentWithAI = async (message) => {
    const prompt = `
Classify user intent.

Options:
GREETING
PRICING
PRODUCT_INFO
BOOKING
NEGOTIATION
BUYING
SUPPORT
GENERAL

Message:
"${message}"

Return JSON:
{ "intent": "...", "confidence": 0-1 }
`;
    const response = await openai.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0,
        messages: [
            { role: "system", content: "You classify user intent." },
            { role: "user", content: prompt },
        ],
    });
    try {
        const text = response.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(text);
        return {
            intent: parsed.intent || "GENERAL",
            confidence: parsed.confidence || 0.5,
        };
    }
    catch {
        return { intent: "GENERAL", confidence: 0.5 };
    }
};
/* =====================================================
🔥 LEAD UPDATE (SMARTER)
===================================================== */
const updateLeadScore = async (leadId, intent, confidence) => {
    let base = 0;
    if (intent === "PRICING")
        base = 3;
    if (intent === "BOOKING")
        base = 5;
    if (intent === "NEGOTIATION")
        base = 4;
    if (intent === "BUYING")
        base = 10;
    const score = Math.round(base * confidence);
    if (!score)
        return;
    await prisma_1.default.lead.update({
        where: { id: leadId },
        data: {
            leadScore: { increment: score },
        },
    });
};
const updateStage = async (leadId, intent) => {
    let stage = "NEW";
    if (intent === "PRICING")
        stage = "INTERESTED";
    if (intent === "BOOKING")
        stage = "QUALIFIED";
    if (intent === "BUYING")
        stage = "READY_TO_BUY";
    await prisma_1.default.lead.update({
        where: { id: leadId },
        data: { stage },
    });
};
/* =====================================================
🔥 MAIN ENGINE
===================================================== */
const generateIntentReply = async ({ businessId, leadId, message, }) => {
    try {
        /* =================================================
        1️⃣ FAST PATH (NO API)
        ================================================= */
        const fast = detectIntentFast(message);
        let intent = "GENERAL";
        let confidence = 0.5;
        if (fast) {
            intent = fast.intent;
            confidence = fast.confidence;
        }
        else {
            /* =================================================
            2️⃣ AI FALLBACK
            ================================================= */
            const ai = await detectIntentWithAI(message);
            intent = ai.intent;
            confidence = ai.confidence;
        }
        console.log("Intent:", intent, "Confidence:", confidence);
        /* =================================================
        3️⃣ UPDATE CRM
        ================================================= */
        await updateLeadScore(leadId, intent, confidence);
        await updateStage(leadId, intent);
        return {
            intent,
            confidence,
        };
    }
    catch (error) {
        console.error("Intent Engine Error:", error);
        return {
            intent: "GENERAL",
            confidence: 0.5,
        };
    }
};
exports.generateIntentReply = generateIntentReply;
