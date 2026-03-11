import prisma from "../config/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/* ----------------------------------
SHORT TERM MEMORY
---------------------------------- */

const getRecentMessages = async (leadId: string) => {

  const messages = await prisma.message.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return messages.reverse().map((m) => ({
    role: m.sender === "AI" ? "assistant" : "user",
    content: m.content,
  }));
};

/* ----------------------------------
LONG TERM MEMORY
---------------------------------- */

const getLongTermMemory = async (leadId: string) => {

  const memories = await prisma.memory.findMany({
    where: { leadId },
  });

  if (!memories.length) return "";

  return memories
    .map((m) => `${m.key}: ${m.value}`)
    .join("\n");
};

/* ----------------------------------
FACT EXTRACTION
---------------------------------- */

const extractFacts = async (message: string) => {

  const prompt = `
Extract useful customer information.

Possible keys:
name
budget
service
timeline

Return JSON.

Message:
${message}
`;

  const response = await openai.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: "Extract structured data." },
      { role: "user", content: prompt },
    ],
  });

  try {
    return JSON.parse(
      response.choices?.[0]?.message?.content || "{}"
    );
  } catch {
    return {};
  }
};

/* ----------------------------------
STORE MEMORY
---------------------------------- */

const storeMemory = async (
  leadId: string,
  facts: Record<string, any>
) => {

  const entries = Object.entries(facts);

  for (const [key, value] of entries) {

    if (!value) continue;

    await prisma.memory.create({
      data: {
        leadId,
        key,
        value: String(value),
      },
    });

  }

};

/* ----------------------------------
CONTEXT BUILDER
---------------------------------- */

export const buildMemoryContext = async (
  leadId: string
) => {

  const shortMemory = await getRecentMessages(leadId);

  const longMemory = await getLongTermMemory(leadId);

  return {
    conversation: shortMemory,
    memory: longMemory,
  };

};

/* ----------------------------------
MEMORY UPDATE PIPELINE
---------------------------------- */

export const updateMemory = async (
  leadId: string,
  message: string
) => {

  try {

    const facts = await extractFacts(message);

    if (Object.keys(facts).length > 0) {
      await storeMemory(leadId, facts);
    }

  } catch (error) {

    console.error("Memory extraction error:", error);

  }

};