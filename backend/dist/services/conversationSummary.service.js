"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConversationSummary = void 0;
const core_1 = require("../runtime/core");
const prisma_1 = __importDefault(require("../config/prisma"));
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
const generateConversationSummary = async (leadId) => {
    try {
        /* ------------------------------------------------
        FETCH LAST N MESSAGES FOR CONTEXT
        ------------------------------------------------ */
        const messages = await prisma_1.default.message.findMany({
            where: { leadId },
            orderBy: { createdAt: "asc" },
            take: MAX_CONTEXT_MESSAGES,
        });
        if (messages.length < SUMMARY_TRIGGER_COUNT)
            return;
        /* ------------------------------------------------
        BUILD CONVERSATION TEXT
        ------------------------------------------------ */
        const conversationText = messages
            .map((m) => `${m.sender}: ${m.content}`)
            .join("\n");
        /* ------------------------------------------------
        GENERATE SUMMARY
        ------------------------------------------------ */
        const compiler = core_1.container.resolve("IPromptCompiler");
        const compiled = compiler.compile("default_tenant", "conversation_summary", "1.0.0", {
            input: "",
        }, {
            conversationText,
        });
        const modelManager = core_1.container.resolve("IModelManager");
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
        if (!summary)
            return;
        /* ------------------------------------------------
        UPSERT SUMMARY
        ------------------------------------------------ */
        const existing = await prisma_1.default.conversationSummary.findFirst({
            where: { leadId },
        });
        if (existing) {
            await prisma_1.default.conversationSummary.update({
                where: { id: existing.id },
                data: {
                    summary,
                    updatedAt: new Date(),
                },
            });
        }
        else {
            await prisma_1.default.conversationSummary.create({
                data: {
                    leadId,
                    summary,
                },
            });
        }
        /* ------------------------------------------------
        CLEAN OLD MESSAGES (MEMORY OPTIMIZATION)
        ------------------------------------------------ */
        const messagesToDelete = await prisma_1.default.message.findMany({
            where: { leadId },
            orderBy: { createdAt: "desc" },
            skip: KEEP_RECENT_MESSAGES,
            select: { id: true },
        });
        if (messagesToDelete.length > 0) {
            await prisma_1.default.message.deleteMany({
                where: {
                    id: {
                        in: messagesToDelete.map((m) => m.id),
                    },
                },
            });
        }
    }
    catch (error) {
        console.error("Conversation summary error:", error);
    }
};
exports.generateConversationSummary = generateConversationSummary;
