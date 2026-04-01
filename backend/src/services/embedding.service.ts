import OpenAI from "openai";
import { pipeline } from "@xenova/transformers";

/* ============================= */
/* CONFIG */
/* ============================= */

const MODE = "local"; // 🔥 FORCE SAME MODEL ALWAYS

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

  embeddingCache.delete(key);
  embeddingCache.set(key, val);

  return val;
};

const saveToCache = (key: string, value: number[]) => {
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(key, value);
};

/* ============================= */
/* TEXT NORMALIZATION */
/* ============================= */

const normalizeText = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // remove noise
    .trim();
};

/* ============================= */
/* 🔥 MULTI QUERY GENERATION */
/* ============================= */

const generateVariants = (text: string): string[] => {
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

export const createEmbedding = async (text: string) => {
  try {
    const variants = generateVariants(text);

    const embeddings: number[][] = [];

    for (const variant of variants) {
      const cached = getFromCache(variant);
      if (cached) {
        embeddings.push(cached);
        continue;
      }

      let embedding: number[] = [];

      /* 🔥 LOCAL MODE */
      if (MODE === "local") {
        const model = await getModel();

        const output: any = await model(variant, {
          pooling: "mean",
          normalize: true,
        });

        embedding = Array.from(output.data as Float32Array);
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

  } catch (error) {
    console.error("Embedding error:", error);
    return [];
  }
};