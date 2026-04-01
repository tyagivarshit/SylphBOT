import { enqueueLearning } from "./learningQueue.service"

export const processAutoLearning = async ({
  businessId,
  message,
  aiReply,
}: any) => {
  try {
    if (!message || !aiReply) return;

    await enqueueLearning({
      businessId,
      input: message,
      output: aiReply,
    });

  } catch (err) {
    console.error("Auto learning error:", err);
  }
};