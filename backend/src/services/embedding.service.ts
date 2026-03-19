import OpenAI from "openai";
import { pipeline } from "@xenova/transformers";

/* ============================= */
/* CONFIG */
/* ============================= */

const MODE = process.env.EMBEDDING_MODE || "local";

/* ============================= */
/* OPENAI */
/* ============================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ============================= */
/* LOCAL MODEL (SINGLETON) */
/* ============================= */

let extractorPromise: Promise<any> | null = null;

const getModel = async () => {
  if (!extractorPromise) {
    console.log("🔥 Loading embedding model...");
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  }
  return extractorPromise;
};

/* ============================= */
/* LRU CACHE */
/* ============================= */

const MAX_CACHE_SIZE = 1000;
const embeddingCache = new Map<string, number[]>();

const getFromCache = (key: string) => {
  const val = embeddingCache.get(key);
  if (!val) return null;

  // refresh LRU
  embeddingCache.delete(key);
  embeddingCache.set(key, val);

  return val;
};

const saveToCache = (key: string, value: number[]) => {
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(key, value);
};

/* ============================= */
/* TEXT NORMALIZATION */
/* ============================= */

const normalizeText = (text: string) => {
  return text.toLowerCase().trim();
};

/* ============================= */
/* MAIN FUNCTION */
/* ============================= */

export const createEmbedding = async (text: string) => {

  try {

    const normalized = normalizeText(text);

    /* ⚡ CACHE HIT */

    const cached = getFromCache(normalized);
    if (cached) return cached;

    /* 🔥 LOCAL MODE */

    if (MODE === "local") {

      const model = await getModel();

      const output: any = await model(normalized, {
        pooling: "mean",
        normalize: true,
      });

      const embedding = Array.from(output.data as Float32Array);

      saveToCache(normalized, embedding);

      return embedding;

    }

    /* 🔥 OPENAI MODE */

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: normalized,
    });

    return response.data[0].embedding;

  } catch (error) {

    console.error("Embedding error:", error);

    return [];

  }

};