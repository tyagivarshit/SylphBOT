import prisma from "../config/prisma";

export const saveConversationLearning = async ({
  businessId,
  input,
  output,
  embedding,
  priority,
}: any) => {
  try {

    /* =====================================================
    🔥 CLEAN & SAFE DEFAULTS
    ===================================================== */

    const finalPriority = priority || "LOW";

    const content = `User: ${input}\nAI: ${output}`;

    /* =====================================================
    🔥 STRICT DUPLICATE PREVENTION (IMPROVED)
    ===================================================== */

    const existing = await prisma.knowledgeBase.findFirst({
      where: {
        businessId,
        content,
        sourceType: "AUTO_LEARN", // 🔥 only check inside learning
      },
    });

    if (existing) return existing;

    /* =====================================================
    🔥 OPTIONAL: LENGTH FILTER (AVOID TRASH DATA)
    ===================================================== */

    if (!input || !output || content.length < 20) {
      return null;
    }

    /* =====================================================
    🔥 SAVE (ISOLATED MEMORY)
    ===================================================== */

    return await prisma.knowledgeBase.create({
      data: {
        businessId,
        title: input.slice(0, 80),
        content,
        embedding,
        sourceType: "AUTO_LEARN", // ✅ ALWAYS MEMORY
        priority: finalPriority,  // LOW by default
        isActive: true,
      },
    });

  } catch (error) {
    console.error("Knowledge Save Error:", error);
    return null;
  }
};