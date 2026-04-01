import { createEmbedding } from "./embedding.service";
import { saveConversationLearning } from "./conversationLearning.service";

export const ingestKnowledge = async ({
  businessId,
  input,
  output,
}: any) => {
  try {
    const content = `User: ${input}\nAI: ${output}`;

    const embedding = await createEmbedding(content);

    await saveConversationLearning({
      businessId,
      input,
      output,
      embedding,
    });

  } catch (err) {
    console.error("Ingestion error:", err);
  }
};