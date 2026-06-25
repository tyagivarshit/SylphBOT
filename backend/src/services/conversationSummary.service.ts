import { container } from "../runtime/core";
import { IModelManager } from "../runtime/interfaces/core";
import prisma from "../config/prisma";

/*
=====================================================
CONFIG
=====================================================
*/

const SUMMARY_TRIGGER_COUNT = 20;
const KEEP_RECENT_MESSAGES = 12;
const MAX_CONTEXT_MESSAGES = 30;

/*
=====================================================
GENERATE SUMMARY
=====================================================
*/

export const generateConversationSummary = async (leadId: string) => {

  try {

    /* ------------------------------------------------
    FETCH LAST N MESSAGES FOR CONTEXT
    ------------------------------------------------ */

    const messages = await prisma.message.findMany({
      where: { leadId },
      orderBy: { createdAt: "asc" },
      take: MAX_CONTEXT_MESSAGES,
    });

    if (messages.length < SUMMARY_TRIGGER_COUNT) return;

    /* ------------------------------------------------
    BUILD CONVERSATION TEXT
    ------------------------------------------------ */

    const conversationText = messages
      .map((m) => `${m.sender}: ${m.content}`)
      .join("\n");

    /* ------------------------------------------------
    GENERATE SUMMARY
    ------------------------------------------------ */

    const compiler = container.resolve<any>("IPromptCompiler");
    const compiled = compiler.compile(
      "default_tenant",
      "conversation_summary",
      "1.0.0",
      {
        input: "",
      },
      {
        conversationText,
      }
    );

    const modelManager = container.resolve<IModelManager>("IModelManager");
    const response = await modelManager.generateCompletion([
      {
        role: "system",
        content: compiled.system,
      },
      {
        role: "user",
        content: compiled.user,
      },
    ], {
      model: "llama3-70b-8192",
      temperature: 0.2,
    });

    const summary = response.content?.trim() || "";

    if (!summary) return;

    /* ------------------------------------------------
    UPSERT SUMMARY
    ------------------------------------------------ */

    const existing = await prisma.conversationSummary.findFirst({
      where: { leadId },
    });

    if (existing) {

      await prisma.conversationSummary.update({
        where: { id: existing.id },
        data: {
          summary,
          updatedAt: new Date(),
        },
      });

    } else {

      await prisma.conversationSummary.create({
        data: {
          leadId,
          summary,
        },
      });

    }

    /* ------------------------------------------------
    CLEAN OLD MESSAGES (MEMORY OPTIMIZATION)
    ------------------------------------------------ */

    const messagesToDelete = await prisma.message.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
      skip: KEEP_RECENT_MESSAGES,
      select: { id: true },
    });

    if (messagesToDelete.length > 0) {

      await prisma.message.deleteMany({
        where: {
          id: {
            in: messagesToDelete.map((m) => m.id),
          },
        },
      });

    }

  } catch (error) {

    console.error("Conversation summary error:", error);

  }

};