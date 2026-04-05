"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIFunnelReply = void 0;
const openai_1 = __importDefault(require("openai"));
const prisma_1 = __importDefault(require("../config/prisma"));
const openai = new openai_1.default({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});
/* =================================================
🧠 HELPERS
================================================= */
const getConversationMemory = async (leadId) => {
    const messages = await prisma_1.default.message.findMany({
        where: { leadId },
        orderBy: { createdAt: "asc" },
        take: 10,
    });
    return messages.map((m) => ({
        role: m.sender === "AI" ? "assistant" : "user",
        content: m.content,
    }));
};
const getBusinessContext = async (businessId) => {
    const client = await prisma_1.default.client.findFirst({
        where: { businessId, isActive: true },
    });
    if (!client)
        return null;
    return {
        businessInfo: client.businessInfo || "",
        pricingInfo: client.pricingInfo || "",
        aiTone: client.aiTone || "Professional",
    };
};
/* =================================================
🔥 MAIN FUNNEL (UPGRADED 🔥)
================================================= */
const generateAIFunnelReply = async ({ businessId, leadId, message, }) => {
    try {
        const context = await getBusinessContext(businessId);
        if (!context)
            return null;
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
            messages: messages,
            temperature: 0.6, // 🔥 controlled (less random)
        });
        let reply = response.choices?.[0]?.message?.content?.trim() ||
            "Got it 👍 Tell me more.";
        /* 🔥 HARD LIMIT */
        if (reply.length > 250) {
            reply = reply.slice(0, 250);
        }
        /* =================================================
        🔥 SAVE
        ================================================= */
        await prisma_1.default.message.create({
            data: {
                leadId,
                content: reply,
                sender: "AI",
            },
        });
        return reply;
    }
    catch (error) {
        console.error("AI FUNNEL ERROR:", error);
        return null;
    }
};
exports.generateAIFunnelReply = generateAIFunnelReply;
