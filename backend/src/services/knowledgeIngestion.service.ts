import { createEmbedding } from "./embedding.service";
import { saveConversationLearning } from "./conversationLearning.service";

export const ingestKnowledge = async ({
  businessId,
  clientId,
  input,
  output,
}: any) => {
  try {

    /* 🔥 SAFE GUARD */
    if (!input || !output) return;

    const content = `User: ${input}\nAI: ${output}`;

    const embedding = await createEmbedding(content);

    /* =====================================================
    🔥 PRIORITY DETECTION (NEW - SMART SCORING BASE)
    ===================================================== */

    const text = (input + " " + output).toLowerCase();

    let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";

    if (
      text.includes("price") ||
      text.includes("cost") ||
      text.includes("book") ||
      text.includes("appointment") ||
      text.includes("buy")
    ) {
      priority = "HIGH";
    } else if (
      text.includes("service") ||
      text.includes("details") ||
      text.includes("info")
    ) {
      priority = "MEDIUM";
    }

    /* =====================================================
    🔥 SAVE WITH SOURCE + PRIORITY
    ===================================================== */

    await saveConversationLearning({
      businessId,
      clientId,
      input,
      output,
      embedding,
      source: "AUTO", // 🔥 SEPARATION
      priority,       // 🔥 SCORING SYSTEM
    });

  } catch (err) {
    console.error("Ingestion error:", err);
  }
};
