import { ingestKnowledge } from "./knowledgeIngestion.service";
import { shouldLearn } from "./learningFilter.service";

export const processAutoLearning = async ({
  businessId,
  clientId,
  message,
  aiReply,
}: any) => {
  try {
    if (!message || !aiReply) {
      return;
    }

    if (!shouldLearn(message, aiReply)) {
      return;
    }

    await ingestKnowledge({
      businessId,
      clientId,
      input: message,
      output: aiReply,
    });
  } catch (err) {
    console.error("Auto learning error:", err);
  }
};
