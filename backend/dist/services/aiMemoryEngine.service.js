"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMemory = exports.buildMemoryContext = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const core_1 = require("../runtime/core");
const memory_utils_1 = require("./revenueBrain/memory.utils");
const normalizeText = (value) => String(value || "").trim();
const getRecentMessages = async (leadId) => {
    const messages = await prisma_1.default.message.findMany({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        take: 8,
    });
    return messages.reverse().map((message) => ({
        role: message.sender === "AI" ? "assistant" : "user",
        content: message.content,
    }));
};
const getConversationSummary = async (leadId) => {
    const summary = await prisma_1.default.conversationSummary.findFirst({
        where: { leadId },
        orderBy: { updatedAt: "desc" },
    });
    return summary?.summary || "";
};
const getStoredMemoryFacts = async (leadId) => {
    const runtimeMemory = core_1.container.resolve("IMemoryEngine");
    return runtimeMemory.getStoredMemoryFacts(leadId);
};
const buildFact = (key, value, confidence, source) => {
    const normalizedKey = normalizeText(key).toLowerCase();
    const normalizedValue = normalizeText(typeof value === "string" || typeof value === "number" ? String(value) : "");
    if (!normalizedKey || !normalizedValue) {
        return null;
    }
    return {
        key: normalizedKey,
        value: normalizedValue,
        confidence: (0, memory_utils_1.clampMemoryConfidence)(confidence),
        source,
    };
};
const mergeExtractedFacts = (...groups) => {
    const merged = new Map();
    for (const group of groups) {
        for (const fact of group) {
            const existing = merged.get(fact.key);
            if (!existing) {
                merged.set(fact.key, fact);
                continue;
            }
            if ((0, memory_utils_1.areMemoryValuesEquivalent)(existing.value, fact.value)) {
                merged.set(fact.key, {
                    ...existing,
                    confidence: Math.max(existing.confidence, fact.confidence),
                    source: fact.source || existing.source,
                });
                continue;
            }
            if (fact.confidence >= existing.confidence) {
                merged.set(fact.key, fact);
            }
        }
    }
    return Array.from(merged.values());
};
const extractBudget = (message) => {
    const match = message.match(/(?:rs\.?|inr|\$|usd)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|lakh|lakhs)?/i);
    return match?.[0] || null;
};
const extractTimeline = (message) => {
    const match = message.match(/\b(today|tomorrow|this week|next week|this month|next month|asap|urgent|immediately|48 hours?)\b/i);
    return match?.[0] || null;
};
const extractService = (message) => {
    const patterns = [
        /need\s+(.+?)(?:\.|,|$)/i,
        /looking for\s+(.+?)(?:\.|,|$)/i,
        /want\s+(.+?)(?:\.|,|$)/i,
        /help with\s+(.+?)(?:\.|,|$)/i,
    ];
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match?.[1]) {
            return match[1].trim();
        }
    }
    return null;
};
const extractName = (message) => {
    const match = message.match(/\b(?:my name is|i am|i'm|this is)\s+([a-z][a-z\s'-]{1,40})\b/i);
    return match?.[1]?.trim() || null;
};
const extractHeuristicFacts = (message) => {
    const facts = [
        buildFact("name", extractName(message), 0.84, "heuristic"),
        buildFact("budget", extractBudget(message), 0.82, "heuristic"),
        buildFact("timeline", extractTimeline(message), 0.76, "heuristic"),
        buildFact("service", extractService(message), 0.74, "heuristic"),
    ].filter(Boolean);
    return facts;
};
const normalizeModelFact = (key, rawValue) => {
    if (rawValue === null || rawValue === undefined) {
        return null;
    }
    if (typeof rawValue === "object" &&
        rawValue &&
        !Array.isArray(rawValue)) {
        const record = rawValue;
        return buildFact(key, record.value, typeof record.confidence === "number"
            ? record.confidence
            : Number(record.confidence) || 0.68, typeof record.source === "string" ? record.source : "llm");
    }
    return buildFact(key, rawValue, 0.68, "llm");
};
const normalizeModelFacts = (payload) => {
    if (!payload || typeof payload !== "object") {
        return [];
    }
    if (Array.isArray(payload)) {
        return payload
            .map((item) => {
            if (!item || typeof item !== "object") {
                return null;
            }
            const record = item;
            return buildFact(String(record.key || ""), record.value, typeof record.confidence === "number"
                ? record.confidence
                : Number(record.confidence) || 0.68, typeof record.source === "string" ? record.source : "llm");
        })
            .filter(Boolean);
    }
    const record = payload;
    const arrayPayload = Array.isArray(record.facts) ? record.facts : null;
    if (arrayPayload) {
        return normalizeModelFacts(arrayPayload);
    }
    return Object.entries(record)
        .map(([key, value]) => normalizeModelFact(key, value))
        .filter(Boolean);
};
const extractFactsWithModel = async (message) => {
    if (!process.env.GROQ_API_KEY) {
        return [];
    }
    try {
        const compiler = core_1.container.resolve("IPromptCompiler");
        const compiled = compiler.compile("default_tenant", "crm_fact_extraction", "1.0.0", {
            input: "",
        }, {
            message,
        });
        const modelManager = core_1.container.resolve("IModelManager");
        const response = await modelManager.generateCompletion([
            {
                role: "system",
                content: compiled.system,
            },
            {
                role: "user",
                content: compiled.user,
            },
        ], {
            model: "llama3-70b-8192",
            temperature: 0,
            jsonMode: true,
        });
        const content = response.content?.trim() || "";
        if (!content) {
            return [];
        }
        try {
            return normalizeModelFacts(JSON.parse(content));
        }
        catch {
            return [];
        }
    }
    catch {
        return [];
    }
};
const extractFacts = async (message) => {
    const heuristicFacts = extractHeuristicFacts(message);
    const modelFacts = await extractFactsWithModel(message);
    return mergeExtractedFacts(heuristicFacts, modelFacts);
};
const storeMemory = async (leadId, facts) => {
    if (!facts.length) {
        return;
    }
    // Phase 2: Flow writes through the Runtime Memory Engine
    if (core_1.container.has("IMemoryEngine")) {
        const runtimeMemory = core_1.container.resolve("IMemoryEngine");
        for (const fact of facts) {
            runtimeMemory.writeMemory(leadId, "customer", fact.key, fact.value, fact.confidence, ["admin"], { source: fact.source }).catch(() => { });
        }
    }
    const existingMemories = await getStoredMemoryFacts(leadId);
    const collapsed = (0, memory_utils_1.collapseMemoryFacts)(existingMemories);
    const existingByKey = new Map(collapsed.map((fact) => [fact.key, fact]));
    const writes = [];
    const runtimeMemory = core_1.container.resolve("IMemoryEngine");
    for (const fact of facts) {
        const existing = existingByKey.get(fact.key);
        if (!existing?.id) {
            writes.push(runtimeMemory.createMemoryFact(leadId, fact.key, fact.value, fact.confidence, fact.source));
            continue;
        }
        const sameValue = (0, memory_utils_1.areMemoryValuesEquivalent)(existing.value, fact.value);
        writes.push(runtimeMemory.updateMemoryFact(existing.id, fact.value, sameValue
            ? (0, memory_utils_1.clampMemoryConfidence)(Math.max(existing.confidence, fact.confidence) + 0.04)
            : fact.confidence, fact.source));
    }
    await Promise.all(writes);
};
const buildMemoryContext = async (leadId, options) => {
    const [conversation, storedFacts, summary] = await Promise.all([
        getRecentMessages(leadId),
        getStoredMemoryFacts(leadId),
        getConversationSummary(leadId),
    ]);
    const facts = (0, memory_utils_1.selectRelevantMemoryFacts)({
        inputs: storedFacts,
        message: options?.message,
        limit: options?.limit ?? 6,
    });
    return {
        conversation,
        memory: (0, memory_utils_1.summarizeMemoryFacts)(facts),
        summary,
        facts,
    };
};
exports.buildMemoryContext = buildMemoryContext;
const updateMemory = async (leadId, message) => {
    try {
        if (normalizeText(message).length < 3) {
            return [];
        }
        const facts = await extractFacts(message);
        if (!facts.length) {
            return [];
        }
        await storeMemory(leadId, facts);
        return facts;
    }
    catch (error) {
        console.error("Memory extraction error:", error);
        return [];
    }
};
exports.updateMemory = updateMemory;
