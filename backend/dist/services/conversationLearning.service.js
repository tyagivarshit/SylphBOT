"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveConversationLearning = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const saveConversationLearning = async ({ businessId, input, output, embedding, priority, }) => {
    try {
        /* =====================================================
        🔥 CLEAN & SAFE DEFAULTS
        ===================================================== */
        const finalPriority = priority || "LOW";
        const content = `User: ${input}\nAI: ${output}`;
        /* =====================================================
        🔥 STRICT DUPLICATE PREVENTION (IMPROVED)
        ===================================================== */
        const existing = await prisma_1.default.knowledgeBase.findFirst({
            where: {
                businessId,
                content,
                sourceType: "AUTO_LEARN", // 🔥 only check inside learning
            },
        });
        if (existing)
            return existing;
        /* =====================================================
        🔥 OPTIONAL: LENGTH FILTER (AVOID TRASH DATA)
        ===================================================== */
        if (!input || !output || content.length < 20) {
            return null;
        }
        /* =====================================================
        🔥 SAVE (ISOLATED MEMORY)
        ===================================================== */
        return await prisma_1.default.knowledgeBase.create({
            data: {
                businessId,
                title: input.slice(0, 80),
                content,
                embedding,
                sourceType: "AUTO_LEARN", // ✅ ALWAYS MEMORY
                priority: finalPriority, // LOW by default
                isActive: true,
            },
        });
    }
    catch (error) {
        console.error("Knowledge Save Error:", error);
        return null;
    }
};
exports.saveConversationLearning = saveConversationLearning;
