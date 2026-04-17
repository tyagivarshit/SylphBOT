import { enqueueLearning } from "./learningQueue.service"

export const processAutoLearning = async ({
  businessId,
  clientId,
  message,
  aiReply,
}: any) => {
  try {
    if (!message || !aiReply) return;

    await enqueueLearning({
      businessId,
      clientId,
      input: message,
      output: aiReply,
    });

  } catch (err) {
    console.error("Auto learning error:", err);
  }
};
