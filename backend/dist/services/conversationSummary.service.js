"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConversationSummary = void 0;
const openai_1 = __importDefault(require("openai"));
const prisma_1 = __importDefault(require("../config/prisma"));
const openai = new openai_1.default({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});
/*
=====================================================
CONFIG
=====================================================
*/
const SUMMARY_TRIGGER_COUNT = 20;
const KEEP_RECENT_MESSAGES = 12;
const MAX_CONTEXT_MESSAGES = 30;
/*
=====================================================
GENERATE SUMMARY
=====================================================
*/
const generateConversationSummary = async (leadId) => {
    try {
        /* ------------------------------------------------
        FETCH LAST N MESSAGES FOR CONTEXT
        ------------------------------------------------ */
        const messages = await prisma_1.default.message.findMany({
            where: { leadId },
            orderBy: { createdAt: "asc" },
            take: MAX_CONTEXT_MESSAGES,
        });
        if (messages.length < SUMMARY_TRIGGER_COUNT)
            return;
        /* ------------------------------------------------
        BUILD CONVERSATION TEXT
        ------------------------------------------------ */
        const conversationText = messages
            .map((m) => `${m.sender}: ${m.content}`)
            .join("\n");
        /* ------------------------------------------------
        GENERATE SUMMARY
        ------------------------------------------------ */
        const prompt = `
Summarize this customer conversation for CRM storage.

Focus on extracting:

- Customer intent
- Budget information
- Interested services
- Objections or concerns
- Buying signals
- Important personal information

Return a concise structured summary.

Conversation:
${conversationText}
`;
        const response = await openai.chat.completions.create({
            model: "llama-3.1-8b-instant",
            temperature: 0.2,
            messages: [
                {
                    role: "system",
                    content: "You summarize conversations for CRM memory systems. Be concise and factual.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });
        const summary = response.choices?.[0]?.message?.content?.trim() || "";
        if (!summary)
            return;
        /* ------------------------------------------------
        UPSERT SUMMARY
        ------------------------------------------------ */
        const existing = await prisma_1.default.conversationSummary.findFirst({
            where: { leadId },
        });
        if (existing) {
            await prisma_1.default.conversationSummary.update({
                where: { id: existing.id },
                data: {
                    summary,
                    updatedAt: new Date(),
                },
            });
        }
        else {
            await prisma_1.default.conversationSummary.create({
                data: {
                    leadId,
                    summary,
                },
            });
        }
        /* ------------------------------------------------
        CLEAN OLD MESSAGES (MEMORY OPTIMIZATION)
        ------------------------------------------------ */
        const messagesToDelete = await prisma_1.default.message.findMany({
            where: { leadId },
            orderBy: { createdAt: "desc" },
            skip: KEEP_RECENT_MESSAGES,
            select: { id: true },
        });
        if (messagesToDelete.length > 0) {
            await prisma_1.default.message.deleteMany({
                where: {
                    id: {
                        in: messagesToDelete.map((m) => m.id),
                    },
                },
            });
        }
    }
    catch (error) {
        console.error("Conversation summary error:", error);
    }
};
exports.generateConversationSummary = generateConversationSummary;
