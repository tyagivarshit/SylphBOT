"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMemory = exports.buildMemoryContext = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});
/* ----------------------------------
SHORT TERM MEMORY
(last 8 messages instead of 6 for better context)
---------------------------------- */
const getRecentMessages = async (leadId) => {
    const messages = await prisma_1.default.message.findMany({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        take: 8,
    });
    return messages
        .reverse()
        .map((m) => ({
        role: m.sender === "AI" ? "assistant" : "user",
        content: m.content,
    }));
};
/* ----------------------------------
LONG TERM MEMORY
(customer facts)
---------------------------------- */
const getLongTermMemory = async (leadId) => {
    const memories = await prisma_1.default.memory.findMany({
        where: { leadId },
        orderBy: { createdAt: "asc" },
    });
    if (!memories.length)
        return "";
    return memories
        .map((m) => `${m.key}: ${m.value}`)
        .join("\n");
};
/* ----------------------------------
CONVERSATION SUMMARY
---------------------------------- */
const getConversationSummary = async (leadId) => {
    const summary = await prisma_1.default.conversationSummary.findFirst({
        where: { leadId },
        orderBy: { updatedAt: "desc" },
    });
    return summary?.summary || "";
};
/* ----------------------------------
FACT EXTRACTION (HARDENED)
---------------------------------- */
const extractFacts = async (message) => {
    try {
        const prompt = `
Extract useful structured customer information.

Possible keys:
name
budget
service
timeline

Return ONLY valid JSON.

Example:
{
"name": "John",
"budget": "2000",
"service": "Website development",
"timeline": "2 weeks"
}

Message:
${message}
`;
        const response = await openai.chat.completions.create({
            model: "llama-3.1-8b-instant",
            temperature: 0,
            messages: [
                { role: "system", content: "Extract structured CRM data." },
                { role: "user", content: prompt },
            ],
        });
        const content = response.choices?.[0]?.message?.content?.trim() || "{}";
        try {
            return JSON.parse(content);
        }
        catch {
            return {};
        }
    }
    catch {
        return {};
    }
};
/* ----------------------------------
STORE MEMORY
(avoid duplicates + normalize)
---------------------------------- */
const storeMemory = async (leadId, facts) => {
    const entries = Object.entries(facts);
    if (!entries.length)
        return;
    const existingMemories = await prisma_1.default.memory.findMany({
        where: { leadId },
    });
    const existingKeys = new Set(existingMemories.map((m) => m.key.toLowerCase()));
    const createData = [];
    for (const [key, value] of entries) {
        if (!value)
            continue;
        const normalizedKey = key.toLowerCase().trim();
        if (existingKeys.has(normalizedKey))
            continue;
        createData.push({
            leadId,
            key: normalizedKey,
            value: String(value).trim(),
        });
    }
    if (createData.length) {
        await prisma_1.default.memory.createMany({
            data: createData,
        });
    }
};
/* ----------------------------------
CONTEXT BUILDER
(optimized AI context)
---------------------------------- */
const buildMemoryContext = async (leadId) => {
    const [shortMemory, longMemory, summary] = await Promise.all([
        getRecentMessages(leadId),
        getLongTermMemory(leadId),
        getConversationSummary(leadId),
    ]);
    return {
        conversation: shortMemory,
        memory: longMemory,
        summary,
    };
};
exports.buildMemoryContext = buildMemoryContext;
/* ----------------------------------
MEMORY UPDATE PIPELINE
---------------------------------- */
const updateMemory = async (leadId, message) => {
    try {
        if (!message || message.length < 3)
            return;
        const facts = await extractFacts(message);
        if (!facts || typeof facts !== "object")
            return;
        if (Object.keys(facts).length > 0) {
            await storeMemory(leadId, facts);
        }
    }
    catch (error) {
        console.error("Memory extraction error:", error);
    }
};
exports.updateMemory = updateMemory;
