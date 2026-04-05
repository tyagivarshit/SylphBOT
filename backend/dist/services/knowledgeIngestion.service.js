"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestKnowledge = void 0;
const embedding_service_1 = require("./embedding.service");
const conversationLearning_service_1 = require("./conversationLearning.service");
const ingestKnowledge = async ({ businessId, input, output, }) => {
    try {
        /* 🔥 SAFE GUARD */
        if (!input || !output)
            return;
        const content = `User: ${input}\nAI: ${output}`;
        const embedding = await (0, embedding_service_1.createEmbedding)(content);
        /* =====================================================
        🔥 PRIORITY DETECTION (NEW - SMART SCORING BASE)
        ===================================================== */
        const text = (input + " " + output).toLowerCase();
        let priority = "LOW";
        if (text.includes("price") ||
            text.includes("cost") ||
            text.includes("book") ||
            text.includes("appointment") ||
            text.includes("buy")) {
            priority = "HIGH";
        }
        else if (text.includes("service") ||
            text.includes("details") ||
            text.includes("info")) {
            priority = "MEDIUM";
        }
        /* =====================================================
        🔥 SAVE WITH SOURCE + PRIORITY
        ===================================================== */
        await (0, conversationLearning_service_1.saveConversationLearning)({
            businessId,
            input,
            output,
            embedding,
            source: "AUTO", // 🔥 SEPARATION
            priority, // 🔥 SCORING SYSTEM
        });
    }
    catch (err) {
        console.error("Ingestion error:", err);
    }
};
exports.ingestKnowledge = ingestKnowledge;
