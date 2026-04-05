"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmbedding = void 0;
const openai_1 = __importDefault(require("openai"));
const transformers_1 = require("@xenova/transformers");
/* ============================= */
/* CONFIG */
/* ============================= */
const MODE = "local"; // 🔥 FORCE SAME MODEL ALWAYS
/* ============================= */
/* OPENAI */
/* ============================= */
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
/* ============================= */
/* LOCAL MODEL (SINGLETON) */
/* ============================= */
let extractorPromise = null;
const getModel = async () => {
    if (!extractorPromise) {
        console.log("🔥 Loading embedding model...");
        extractorPromise = (0, transformers_1.pipeline)("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    return extractorPromise;
};
/* ============================= */
/* LRU CACHE */
/* ============================= */
const MAX_CACHE_SIZE = 1000;
const embeddingCache = new Map();
const getFromCache = (key) => {
    const val = embeddingCache.get(key);
    if (!val)
        return null;
    embeddingCache.delete(key);
    embeddingCache.set(key, val);
    return val;
};
const saveToCache = (key, value) => {
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
        const firstKey = embeddingCache.keys().next().value;
        if (firstKey)
            embeddingCache.delete(firstKey);
    }
    embeddingCache.set(key, value);
};
/* ============================= */
/* TEXT NORMALIZATION */
/* ============================= */
const normalizeText = (text) => {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, "") // remove noise
        .trim();
};
/* ============================= */
/* 🔥 MULTI QUERY GENERATION */
/* ============================= */
const generateVariants = (text) => {
    const base = normalizeText(text);
    return [
        base,
        base.replace("price", "cost"),
        base.replace("cost", "price"),
        base.replace("buy", "purchase"),
        base.replace("purchase", "buy"),
    ];
};
/* ============================= */
/* MAIN FUNCTION */
/* ============================= */
const createEmbedding = async (text) => {
    try {
        const variants = generateVariants(text);
        const embeddings = [];
        for (const variant of variants) {
            const cached = getFromCache(variant);
            if (cached) {
                embeddings.push(cached);
                continue;
            }
            let embedding = [];
            /* 🔥 LOCAL MODE */
            if (MODE === "local") {
                const model = await getModel();
                const output = await model(variant, {
                    pooling: "mean",
                    normalize: true,
                });
                embedding = Array.from(output.data);
            }
            /* 🔥 OPENAI MODE (fallback only) */
            else {
                const response = await openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: variant,
                });
                embedding = response.data[0].embedding;
            }
            saveToCache(variant, embedding);
            embeddings.push(embedding);
        }
        /* ============================= */
        /* 🔥 MERGE EMBEDDINGS (AVG) */
        /* ============================= */
        const finalEmbedding = embeddings[0].map((_, i) => {
            let sum = 0;
            for (const emb of embeddings) {
                sum += emb[i];
            }
            return sum / embeddings.length;
        });
        return finalEmbedding;
    }
    catch (error) {
        console.error("Embedding error:", error);
        return [];
    }
};
exports.createEmbedding = createEmbedding;
