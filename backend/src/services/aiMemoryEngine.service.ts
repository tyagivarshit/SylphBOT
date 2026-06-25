import prisma from "../config/prisma";
import { container } from "../runtime/core";
import { IModelManager } from "../runtime/interfaces/core";
import {
  areMemoryValuesEquivalent,
  clampMemoryConfidence,
  collapseMemoryFacts,
  selectRelevantMemoryFacts,
  summarizeMemoryFacts,
} from "./revenueBrain/memory.utils";

type ExtractedMemoryFact = {
  key: string;
  value: string;
  confidence: number;
  source: string;
};

const normalizeText = (value?: string | null) => String(value || "").trim();

const getRecentMessages = async (leadId: string) => {
  const messages = await prisma.message.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return messages.reverse().map((message) => ({
    role: message.sender === "AI" ? ("assistant" as const) : ("user" as const),
    content: message.content,
  }));
};

const getConversationSummary = async (leadId: string) => {
  const summary = await prisma.conversationSummary.findFirst({
    where: { leadId },
    orderBy: { updatedAt: "desc" },
  });

  return summary?.summary || "";
};

const getStoredMemoryFacts = async (leadId: string) => {
  const runtimeMemory = container.resolve<any>("IMemoryEngine");
  return runtimeMemory.getStoredMemoryFacts(leadId);
};

const buildFact = (
  key: string,
  value: unknown,
  confidence: number,
  source: string
): ExtractedMemoryFact | null => {
  const normalizedKey = normalizeText(key).toLowerCase();
  const normalizedValue = normalizeText(
    typeof value === "string" || typeof value === "number" ? String(value) : ""
  );

  if (!normalizedKey || !normalizedValue) {
    return null;
  }

  return {
    key: normalizedKey,
    value: normalizedValue,
    confidence: clampMemoryConfidence(confidence),
    source,
  };
};

const mergeExtractedFacts = (...groups: ExtractedMemoryFact[][]) => {
  const merged = new Map<string, ExtractedMemoryFact>();

  for (const group of groups) {
    for (const fact of group) {
      const existing = merged.get(fact.key);

      if (!existing) {
        merged.set(fact.key, fact);
        continue;
      }

      if (areMemoryValuesEquivalent(existing.value, fact.value)) {
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

const extractBudget = (message: string) => {
  const match = message.match(
    /(?:rs\.?|inr|\$|usd)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|lakh|lakhs)?/i
  );

  return match?.[0] || null;
};

const extractTimeline = (message: string) => {
  const match = message.match(
    /\b(today|tomorrow|this week|next week|this month|next month|asap|urgent|immediately|48 hours?)\b/i
  );

  return match?.[0] || null;
};

const extractService = (message: string) => {
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

const extractName = (message: string) => {
  const match = message.match(
    /\b(?:my name is|i am|i'm|this is)\s+([a-z][a-z\s'-]{1,40})\b/i
  );

  return match?.[1]?.trim() || null;
};

const extractHeuristicFacts = (message: string): ExtractedMemoryFact[] => {
  const facts = [
    buildFact("name", extractName(message), 0.84, "heuristic"),
    buildFact("budget", extractBudget(message), 0.82, "heuristic"),
    buildFact("timeline", extractTimeline(message), 0.76, "heuristic"),
    buildFact("service", extractService(message), 0.74, "heuristic"),
  ].filter(Boolean) as ExtractedMemoryFact[];

  return facts;
};

const normalizeModelFact = (
  key: string,
  rawValue: unknown
): ExtractedMemoryFact | null => {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (
    typeof rawValue === "object" &&
    rawValue &&
    !Array.isArray(rawValue)
  ) {
    const record = rawValue as {
      value?: unknown;
      confidence?: unknown;
      source?: unknown;
    };

    return buildFact(
      key,
      record.value,
      typeof record.confidence === "number"
        ? record.confidence
        : Number(record.confidence) || 0.68,
      typeof record.source === "string" ? record.source : "llm"
    );
  }

  return buildFact(key, rawValue, 0.68, "llm");
};

const normalizeModelFacts = (payload: unknown): ExtractedMemoryFact[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as {
          key?: unknown;
          value?: unknown;
          confidence?: unknown;
          source?: unknown;
        };

        return buildFact(
          String(record.key || ""),
          record.value,
          typeof record.confidence === "number"
            ? record.confidence
            : Number(record.confidence) || 0.68,
          typeof record.source === "string" ? record.source : "llm"
        );
      })
      .filter(Boolean) as ExtractedMemoryFact[];
  }

  const record = payload as Record<string, unknown>;
  const arrayPayload = Array.isArray(record.facts) ? record.facts : null;

  if (arrayPayload) {
    return normalizeModelFacts(arrayPayload);
  }

  return Object.entries(record)
    .map(([key, value]) => normalizeModelFact(key, value))
    .filter(Boolean) as ExtractedMemoryFact[];
};

const extractFactsWithModel = async (
  message: string
): Promise<ExtractedMemoryFact[]> => {
  if (!process.env.GROQ_API_KEY) {
    return [];
  }

  try {
    const compiler = container.resolve<any>("IPromptCompiler");
    const compiled = compiler.compile(
      "default_tenant",
      "crm_fact_extraction",
      "1.0.0",
      {
        input: "",
      },
      {
        message,
      }
    );

    const modelManager = container.resolve<IModelManager>("IModelManager");
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
    } catch {
      return [];
    }
  } catch {
    return [];
  }
};

const extractFacts = async (message: string): Promise<ExtractedMemoryFact[]> => {
  const heuristicFacts = extractHeuristicFacts(message);
  const modelFacts = await extractFactsWithModel(message);
  return mergeExtractedFacts(heuristicFacts, modelFacts);
};

const storeMemory = async (leadId: string, facts: ExtractedMemoryFact[]) => {
  if (!facts.length) {
    return;
  }

  // Phase 2: Flow writes through the Runtime Memory Engine
  if (container.has("IMemoryEngine")) {
    const runtimeMemory = container.resolve<any>("IMemoryEngine");
    for (const fact of facts) {
      runtimeMemory.writeMemory(leadId, "customer", fact.key, fact.value, fact.confidence, ["admin"], { source: fact.source }).catch(() => {});
    }
  }

  const existingMemories = await getStoredMemoryFacts(leadId);
  const collapsed = collapseMemoryFacts(existingMemories);
  const existingByKey = new Map(collapsed.map((fact) => [fact.key, fact]));
  const writes: Promise<unknown>[] = [];
  const runtimeMemory = container.resolve<any>("IMemoryEngine");

  for (const fact of facts) {
    const existing = existingByKey.get(fact.key);

    if (!existing?.id) {
      writes.push(
        runtimeMemory.createMemoryFact(leadId, fact.key, fact.value, fact.confidence, fact.source)
      );
      continue;
    }

    const sameValue = areMemoryValuesEquivalent(existing.value, fact.value);

    writes.push(
      runtimeMemory.updateMemoryFact(
        existing.id,
        fact.value,
        sameValue
          ? clampMemoryConfidence(
              Math.max(existing.confidence, fact.confidence) + 0.04
            )
          : fact.confidence,
        fact.source
      )
    );
  }

  await Promise.all(writes);
};

export const buildMemoryContext = async (
  leadId: string,
  options?: {
    message?: string | null;
    limit?: number;
  }
) => {
  const [conversation, storedFacts, summary] = await Promise.all([
    getRecentMessages(leadId),
    getStoredMemoryFacts(leadId),
    getConversationSummary(leadId),
  ]);

  const facts = selectRelevantMemoryFacts({
    inputs: storedFacts,
    message: options?.message,
    limit: options?.limit ?? 6,
  });

  return {
    conversation,
    memory: summarizeMemoryFacts(facts),
    summary,
    facts,
  };
};

export const updateMemory = async (leadId: string, message: string) => {
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
  } catch (error) {
    console.error("Memory extraction error:", error);
    return [];
  }
};
