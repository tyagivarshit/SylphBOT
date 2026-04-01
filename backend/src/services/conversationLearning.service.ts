import prisma from "../config/prisma";

export const saveConversationLearning = async ({
  businessId,
  input,
  output,
  embedding,
}: any) => {
  return prisma.knowledgeBase.create({
    data: {
      businessId,
      title: input.slice(0, 80),
      content: `User: ${input}\nAI: ${output}`,
      embedding,
      sourceType: "AUTO_LEARN",
      isActive: true,
    },
  });
};