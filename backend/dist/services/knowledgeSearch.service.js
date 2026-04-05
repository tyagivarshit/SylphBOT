"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchKnowledge = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const cosineSimilarity = require("cosine-similarity");
const embedding_service_1 = require("./embedding.service");
/* ------------------------------------------ */
/* CONFIG */
/* ------------------------------------------ */
const SIMILARITY_THRESHOLD = 0.25;
const MAX_RESULTS = 5;
/* 🔥 PRIORITY WEIGHTS (TUNED) */
const PRIORITY_WEIGHT = {
    HIGH: 0.3,
    MEDIUM: 0.15,
    LOW: 0,
};
/* ------------------------------------------ */
/* 🔥 KEYWORD SCORE */
/* ------------------------------------------ */
const keywordScore = (query, content) => {
    const qWords = query.toLowerCase().split(" ").filter(Boolean);
    const cText = content.toLowerCase();
    let match = 0;
    for (const word of qWords) {
        if (cText.includes(word)) {
            match++;
        }
    }
    return qWords.length ? match / qWords.length : 0;
};
/* ------------------------------------------ */
/* 🔥 SEARCH KNOWLEDGE (FINAL CLEAN)
------------------------------------------- */
const searchKnowledge = async (businessId, message) => {
    try {
        /* 🔥 CREATE EMBEDDING */
        const messageEmbedding = await (0, embedding_service_1.createEmbedding)(message);
        /* =================================================
        🔥 CRITICAL FIX: ONLY TRAINED + TRUSTED DATA
        ================================================= */
        const knowledge = await prisma_1.default.knowledgeBase.findMany({
            where: {
                businessId,
                isActive: true,
                sourceType: {
                    in: ["SYSTEM", "FAQ", "MANUAL"], // ✅ NO AUTO_LEARN
                },
            },
            select: {
                id: true,
                content: true,
                embedding: true,
                priority: true,
            },
        });
        if (!knowledge.length)
            return [];
        /* =================================================
        🔥 SCORING ENGINE (ELITE LEVEL)
        ================================================= */
        const scored = knowledge.map((item) => {
            let semantic = 0;
            let keyword = 0;
            if (item.embedding) {
                semantic = cosineSimilarity(messageEmbedding, item.embedding);
            }
            keyword = keywordScore(message, item.content);
            /* 🔥 GENERIC BOOST */
            let boost = 0;
            const text = item.content.toLowerCase();
            if (text.includes("service") ||
                text.includes("business") ||
                text.includes("company") ||
                text.includes("digital")) {
                boost = 0.1;
            }
            /* 🔥 PRIORITY BOOST (SAFE) */
            const priorityKey = item.priority || "MEDIUM";
            const priorityBoost = PRIORITY_WEIGHT[priorityKey] || 0;
            /* 🔥 FINAL SCORE */
            const finalScore = semantic * 0.7 +
                keyword * 0.3 +
                boost +
                priorityBoost;
            return {
                id: item.id,
                content: item.content,
                score: finalScore,
            };
        });
        /* =================================================
        🔥 FORCE MATCH (SMART UX FIX)
        ================================================= */
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes("business") ||
            lowerMsg.includes("service") ||
            lowerMsg.includes("kya karte") ||
            lowerMsg.includes("what do you do")) {
            return scored
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);
        }
        /* =================================================
        🔥 NORMAL FILTER
        ================================================= */
        const filtered = scored
            .filter((item) => item.score >= SIMILARITY_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS);
        return filtered;
    }
    catch (error) {
        console.error("Knowledge search error:", error);
        return [];
    }
};
exports.searchKnowledge = searchKnowledge;
