import prisma from "../config/prisma";

const PRIORITY_REINFORCEMENT: Record<string, number> = {
  HIGH: 0.24,
  MEDIUM: 0.16,
  LOW: 0.08,
};

export const saveConversationLearning = async ({
  businessId,
  clientId,
  input,
  output,
  embedding,
  priority,
}: any) => {
  try {
    const finalPriority = String(priority || "LOW").toUpperCase();
    const content = `User: ${input}\nAI: ${output}`;
    const reinforcementSeed =
      PRIORITY_REINFORCEMENT[finalPriority] || PRIORITY_REINFORCEMENT.LOW;

    if (!input || !output || content.length < 20) {
      return null;
    }

    const existing = await prisma.knowledgeBase.findFirst({
      where: {
        businessId,
        clientId: clientId || null,
        content,
        sourceType: "AUTO_LEARN",
      },
    });

    if (existing) {
      return prisma.knowledgeBase.update({
        where: {
          id: existing.id,
        },
        data: {
          isActive: true,
          priority: finalPriority,
          embedding: existing.embedding || embedding,
          reinforcementScore: {
            increment: reinforcementSeed / 2,
          },
          lastReinforcedAt: new Date(),
        },
      });
    }

    return prisma.knowledgeBase.create({
      data: {
        businessId,
        clientId: clientId || null,
        title: String(input).slice(0, 80),
        content,
        embedding,
        sourceType: "AUTO_LEARN",
        priority: finalPriority,
        reinforcementScore: reinforcementSeed,
        isActive: true,
      },
    });
  } catch (error) {
    console.error("Knowledge Save Error:", error);
    return null;
  }
};
