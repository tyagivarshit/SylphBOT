import prisma from "../config/prisma";
import { container } from "../runtime/core";

const PRIORITY_REINFORCEMENT: Record<string, number> = {
  HIGH: 0.24,
  MEDIUM: 0.16,
  LOW: 0.08,
};

const getMemoryEngine = () => container.has("IMemoryEngine") ? container.resolve<any>("IMemoryEngine") : null;
const getMetricsEngine = () => container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;

export const saveConversationLearning = async ({
  businessId,
  clientId,
  input,
  output,
  embedding,
  priority,
}: any) => {
  const startedAt = Date.now();
  try {
    const finalPriority = String(priority || "LOW").toUpperCase();
    const content = `User: ${input}\nAI: ${output}`;
    const reinforcementSeed =
      PRIORITY_REINFORCEMENT[finalPriority] || PRIORITY_REINFORCEMENT.LOW;

    if (!input || !output || content.length < 20) {
      return null;
    }

    const memoryEngine = getMemoryEngine();
    const existing = memoryEngine
      ? await memoryEngine.findFirstKnowledge(businessId, {
          clientId: clientId || null,
          content,
          sourceType: "AUTO_LEARN",
        })
      : await prisma.knowledgeBase.findFirst({
          where: {
            businessId,
            clientId: clientId || null,
            content,
            sourceType: "AUTO_LEARN",
          },
        });

    let result;
    if (existing) {
      result = memoryEngine
        ? await memoryEngine.updateKnowledge(businessId, existing.id, {
            isActive: true,
            priority: finalPriority,
            embedding: existing.embedding || embedding,
            reinforcementScore: {
              increment: reinforcementSeed / 2,
            },
            lastReinforcedAt: new Date(),
          })
        : await prisma.knowledgeBase.update({
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
    } else {
      result = memoryEngine
        ? await memoryEngine.createKnowledge(businessId, {
            clientId: clientId || null,
            title: String(input).slice(0, 80),
            content,
            embedding,
            sourceType: "AUTO_LEARN",
            priority: finalPriority,
            reinforcementScore: reinforcementSeed,
            isActive: true,
          })
        : await prisma.knowledgeBase.create({
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
    }

    const metrics = getMetricsEngine();
    if (metrics) {
      metrics.recordKnowledgeMetric("import_latency", Date.now() - startedAt);
    }
    return result;
  } catch (error) {
    console.error("Knowledge Save Error:", error);
    return null;
  }
};
