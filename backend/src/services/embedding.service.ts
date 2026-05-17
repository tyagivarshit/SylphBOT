import OpenAI from "openai";
import { pipeline } from "@xenova/transformers";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { markAiRuntimeReady } from "../runtime/startupIsolation.service";
import logger from "../utils/logger";

type CacheEntry = {
  value: number[];
  expiresAt: number;
};

type QueueRunContext = {
  queueWaitMs: number;
  startedAt: number;
  deadlineAt: number;
  budgetMs: number;
};

type QueueJob<T> = {
  label: string;
  enqueuedAt: number;
  budgetMs: number;
  run: (context: QueueRunContext) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

type EmbeddingBudgetOutcome<T> =
  | {
      ok: true;
      value: T;
      computeMs: number;
      queueWaitMs: number;
      elapsedMs: number;
    }
  | {
      ok: false;
      error: Error;
      computeMs: number;
      queueWaitMs: number;
      elapsedMs: number;
    };

type ResolveVariantEmbeddingsResult = {
  embeddingsByVariant: Map<string, number[]>;
  variantCacheHits: number;
  inflightDeduped: number;
  degraded: boolean;
  degradationReasons: string[];
};

type EmbeddingWarmupState = {
  status: "idle" | "warming" | "ready" | "failed";
  initiatedBy: string | null;
  attempts: number;
  startedAt: number | null;
  completedAt: number | null;
  lastError: string | null;
  lastDurationMs: number | null;
};

const parsePositiveInt = (raw: string | undefined, fallbackValue: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.max(1, Math.floor(parsed));
};

const MODE = "local";
const EMBEDDING_FINAL_CACHE_SIZE = parsePositiveInt(
  process.env.EMBEDDING_FINAL_CACHE_SIZE,
  1200
);
const EMBEDDING_VARIANT_CACHE_SIZE = parsePositiveInt(
  process.env.EMBEDDING_VARIANT_CACHE_SIZE,
  2400
);
const EMBEDDING_CACHE_TTL_MS = parsePositiveInt(
  process.env.EMBEDDING_CACHE_TTL_MS,
  30 * 60 * 1000
);
const EMBEDDING_MAX_CONCURRENT_COMPUTE = parsePositiveInt(
  process.env.EMBEDDING_MAX_CONCURRENT_COMPUTE,
  2
);
const EMBEDDING_MAX_QUEUE = parsePositiveInt(process.env.EMBEDDING_MAX_QUEUE, 96);
const EMBEDDING_MAX_QUEUE_WAIT_MS = parsePositiveInt(
  process.env.EMBEDDING_MAX_QUEUE_WAIT_MS,
  5_000
);
const EMBEDDING_COMPUTE_BUDGET_MS = parsePositiveInt(
  process.env.EMBEDDING_COMPUTE_BUDGET_MS,
  15_000
);
const EMBEDDING_LOCAL_YIELD_EVERY = parsePositiveInt(
  process.env.EMBEDDING_LOCAL_YIELD_EVERY,
  2
);
const EMBEDDING_BATCH_MAX_ITEMS = parsePositiveInt(
  process.env.EMBEDDING_BATCH_MAX_ITEMS,
  64
);
const EMBEDDING_BATCH_CONCURRENCY = parsePositiveInt(
  process.env.EMBEDDING_BATCH_CONCURRENCY,
  4
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let extractorPromise: Promise<any> | null = null;
let modelReady = false;
const embeddingWarmupState: EmbeddingWarmupState = {
  status: "idle",
  initiatedBy: null,
  attempts: 0,
  startedAt: null,
  completedAt: null,
  lastError: null,
  lastDurationMs: null,
};

const finalCache = new Map<string, CacheEntry>();
const variantCache = new Map<string, CacheEntry>();
const finalInflight = new Map<string, Promise<number[]>>();
const variantInflight = new Map<string, Promise<number[]>>();

const embeddingQueue: Array<QueueJob<unknown>> = [];
let activeEmbeddingCompute = 0;
let embeddingDrainScheduled = false;

const normalizeText = (text: string) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cloneVector = (value: number[]) => value.slice();

const emitEmbeddingMetric = (
  name:
    | "embedding_ms"
    | "embedding_compute_ms"
    | "embedding_queue_wait_ms"
    | "embedding_cache_hit"
    | "embedding_inflight_deduped"
    | "embedding_budget_exceeded"
    | "embedding_concurrency"
    | "embedding_cold_start_ms"
    | "embedding_degraded",
  value: number,
  metadata?: Record<string, unknown>
) => {
  emitPerformanceMetric({
    name,
    value,
    route: "embedding_service",
    metadata: {
      mode: MODE,
      ...(metadata || {}),
    },
  });
};

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

const emitEmbeddingConcurrency = (event: string) => {
  emitEmbeddingMetric("embedding_concurrency", activeEmbeddingCompute, {
    event,
    queueDepth: embeddingQueue.length,
  });
};

const getFromCache = (cache: Map<string, CacheEntry>, key: string): number[] | null => {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  cache.delete(key);
  cache.set(key, entry);
  return cloneVector(entry.value);
};

const saveToCache = (
  cache: Map<string, CacheEntry>,
  key: string,
  value: number[],
  maxEntries: number
) => {
  cache.delete(key);
  cache.set(key, {
    value: cloneVector(value),
    expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS,
  });

  if (cache.size <= maxEntries) {
    return;
  }

  const firstKey = cache.keys().next().value;
  if (firstKey) {
    cache.delete(firstKey);
  }
};

const sanitizeVector = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
};

const mergeEmbeddings = (vectors: number[][]): number[] => {
  const valid = vectors.filter((entry) => entry.length > 0);
  if (!valid.length) {
    return [];
  }

  const dimensions = Math.min(...valid.map((entry) => entry.length));
  if (dimensions <= 0) {
    return [];
  }

  const merged = new Array(dimensions).fill(0);

  for (const vector of valid) {
    for (let index = 0; index < dimensions; index += 1) {
      merged[index] += vector[index];
    }
  }

  return merged.map((value) => value / valid.length);
};

const generateVariants = (text: string): string[] => {
  const base = normalizeText(text);
  if (!base) {
    return [];
  }

  return Array.from(
    new Set([
      base,
      base.replace(/\bprice\b/g, "cost"),
      base.replace(/\bcost\b/g, "price"),
      base.replace(/\bbuy\b/g, "purchase"),
      base.replace(/\bpurchase\b/g, "buy"),
    ])
  ).filter(Boolean);
};

const scheduleEmbeddingDrain = () => {
  if (embeddingDrainScheduled) {
    return;
  }

  embeddingDrainScheduled = true;
  setImmediate(() => {
    embeddingDrainScheduled = false;
    drainEmbeddingQueue();
  });
};

const runEmbeddingJob = <T>(job: QueueJob<T>) => {
  activeEmbeddingCompute += 1;
  emitEmbeddingConcurrency("job_started");

  const queueWaitMs = Date.now() - job.enqueuedAt;
  emitEmbeddingMetric("embedding_queue_wait_ms", queueWaitMs, {
    label: job.label,
    queueDepth: embeddingQueue.length,
  });

  if (queueWaitMs > EMBEDDING_MAX_QUEUE_WAIT_MS) {
    const error = new Error(
      `embedding_budget_exceeded:queue_wait_timeout:${queueWaitMs}:${job.label}`
    );
    emitEmbeddingMetric("embedding_budget_exceeded", 1, {
      reason: error.message,
      label: job.label,
      queueWaitMs,
      queueDepth: embeddingQueue.length,
    });
    job.reject(error);
    activeEmbeddingCompute = Math.max(0, activeEmbeddingCompute - 1);
    emitEmbeddingConcurrency("job_skipped_timeout");
    scheduleEmbeddingDrain();
    return;
  }

  const context: QueueRunContext = {
    queueWaitMs,
    startedAt: Date.now(),
    deadlineAt: Date.now() + Math.max(1, Math.floor(job.budgetMs)),
    budgetMs: Math.max(1, Math.floor(job.budgetMs)),
  };

  Promise.resolve()
    .then(() => job.run(context))
    .then(job.resolve)
    .catch((error) => {
      const typedError =
        error instanceof Error ? error : new Error(String(error || "embedding_failed"));
      job.reject(typedError);
    })
    .finally(() => {
      activeEmbeddingCompute = Math.max(0, activeEmbeddingCompute - 1);
      emitEmbeddingConcurrency("job_finished");
      scheduleEmbeddingDrain();
    });
};

const drainEmbeddingQueue = () => {
  while (
    activeEmbeddingCompute < EMBEDDING_MAX_CONCURRENT_COMPUTE &&
    embeddingQueue.length > 0
  ) {
    const next = embeddingQueue.shift();
    if (!next) {
      break;
    }
    runEmbeddingJob(next);
  }
};

const queueEmbeddingCompute = <T>(input: {
  label: string;
  budgetMs: number;
  run: (context: QueueRunContext) => Promise<T>;
}) =>
  new Promise<T>((resolve, reject) => {
    const job: QueueJob<T> = {
      label: input.label,
      enqueuedAt: Date.now(),
      budgetMs: Math.max(1, Math.floor(input.budgetMs)),
      run: input.run,
      resolve,
      reject,
    };

    if (activeEmbeddingCompute < EMBEDDING_MAX_CONCURRENT_COMPUTE) {
      runEmbeddingJob(job);
      return;
    }

    if (embeddingQueue.length >= EMBEDDING_MAX_QUEUE) {
      const error = new Error(
        `embedding_budget_exceeded:queue_saturated:${embeddingQueue.length}:${EMBEDDING_MAX_QUEUE}:${input.label}`
      );
      emitEmbeddingMetric("embedding_budget_exceeded", 1, {
        reason: error.message,
        label: input.label,
        queueDepth: embeddingQueue.length,
      });
      reject(error);
      return;
    }

    embeddingQueue.push(job as QueueJob<unknown>);
    emitEmbeddingConcurrency("job_enqueued");
  });

const runWithEmbeddingBudget = async <T>(input: {
  label: string;
  task: (context: QueueRunContext) => Promise<T>;
  budgetMs?: number;
}): Promise<EmbeddingBudgetOutcome<T>> => {
  const elapsedStartedAt = Date.now();
  const budgetMs = Math.max(1, Math.floor(input.budgetMs || EMBEDDING_COMPUTE_BUDGET_MS));
  let queueWaitMs = 0;
  let computeMs = 0;

  try {
    const value = await queueEmbeddingCompute({
      label: input.label,
      budgetMs,
      run: async (context) => {
        queueWaitMs = context.queueWaitMs;
        const computeStartedAt = Date.now();
        let timeoutHandle: NodeJS.Timeout | null = null;

        try {
          const result = await Promise.race([
            input.task(context),
            new Promise<T>((_, reject) => {
              timeoutHandle = setTimeout(() => {
                reject(
                  new Error(
                    `embedding_budget_exceeded:compute_timeout:${budgetMs}:${input.label}`
                  )
                );
              }, budgetMs);
            }),
          ]);
          computeMs = Date.now() - computeStartedAt;
          emitEmbeddingMetric("embedding_compute_ms", computeMs, {
            label: input.label,
            queueWaitMs,
          });
          return result;
        } finally {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        }
      },
    });

    return {
      ok: true,
      value,
      computeMs,
      queueWaitMs,
      elapsedMs: Date.now() - elapsedStartedAt,
    };
  } catch (error) {
    const typedError =
      error instanceof Error ? error : new Error(String(error || "embedding_failed"));
    if (typedError.message.includes("embedding_budget_exceeded")) {
      emitEmbeddingMetric("embedding_budget_exceeded", 1, {
        label: input.label,
        reason: typedError.message,
        queueWaitMs,
        computeMs,
      });
    }

    return {
      ok: false,
      error: typedError,
      computeMs,
      queueWaitMs,
      elapsedMs: Date.now() - elapsedStartedAt,
    };
  }
};

const assertBudget = (context: QueueRunContext, label: string) => {
  if (Date.now() <= context.deadlineAt) {
    return;
  }
  throw new Error(`embedding_budget_exceeded:budget_timeout:${context.budgetMs}:${label}`);
};

const getModel = async () => {
  if (!extractorPromise) {
    const startedAt = Date.now();
    logger.info("Loading local embedding model");
    embeddingWarmupState.status = "warming";
    embeddingWarmupState.startedAt = startedAt;
    embeddingWarmupState.completedAt = null;
    embeddingWarmupState.lastDurationMs = null;
    embeddingWarmupState.lastError = null;
    embeddingWarmupState.attempts += 1;

    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")
      .then((model) => {
        const coldStartMs = Date.now() - startedAt;
        if (!modelReady) {
          modelReady = true;
          embeddingWarmupState.status = "ready";
          embeddingWarmupState.completedAt = Date.now();
          embeddingWarmupState.lastDurationMs = coldStartMs;
          embeddingWarmupState.lastError = null;
          emitEmbeddingMetric("embedding_cold_start_ms", coldStartMs, {
            source: "model_init",
          });
          markAiRuntimeReady({
            source: embeddingWarmupState.initiatedBy || "embedding_runtime",
            mode: MODE,
            warmupMs: coldStartMs,
          });
        }
        return model;
      })
      .catch((error) => {
        extractorPromise = null;
        modelReady = false;
        embeddingWarmupState.status = "failed";
        embeddingWarmupState.completedAt = Date.now();
        embeddingWarmupState.lastDurationMs = Date.now() - startedAt;
        embeddingWarmupState.lastError = String(
          (error as { message?: unknown })?.message || error || "embedding_model_init_failed"
        );
        throw error;
      });
  }

  return extractorPromise;
};

const computeEmbeddingsForTexts = async (
  texts: string[],
  context: QueueRunContext
): Promise<number[][]> => {
  if (!texts.length) {
    return [];
  }

  if (MODE === "local") {
    const model = await getModel();
    const vectors: number[][] = [];

    for (let index = 0; index < texts.length; index += 1) {
      assertBudget(context, "local_inference_loop");
      if (index > 0 && index % EMBEDDING_LOCAL_YIELD_EVERY === 0) {
        await yieldToEventLoop();
        assertBudget(context, "local_inference_yield");
      }

      const output: any = await model(texts[index], {
        pooling: "mean",
        normalize: true,
      });
      vectors.push(sanitizeVector(Array.from(output?.data || [])));
    }

    return vectors;
  }

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  const rows = Array.isArray(response.data) ? response.data : [];
  const vectors: number[][] = [];

  for (let index = 0; index < texts.length; index += 1) {
    vectors.push(sanitizeVector(rows[index]?.embedding || []));
  }

  return vectors;
};

const resolveVariantEmbeddings = async (
  variants: string[]
): Promise<ResolveVariantEmbeddingsResult> => {
  const uniqueVariants = Array.from(new Set(variants.map((variant) => normalizeText(variant)).filter(Boolean)));
  const embeddingsByVariant = new Map<string, number[]>();
  const waiters: Array<Promise<void>> = [];
  const missing: string[] = [];
  const degradationReasons: string[] = [];
  let degraded = false;
  let variantCacheHits = 0;
  let inflightDeduped = 0;

  for (const variant of uniqueVariants) {
    const key = `variant:${variant}`;
    const cached = getFromCache(variantCache, key);

    if (cached?.length) {
      embeddingsByVariant.set(variant, cached);
      variantCacheHits += 1;
      continue;
    }

    const inflight = variantInflight.get(key);
    if (inflight) {
      inflightDeduped += 1;
      waiters.push(
        inflight
          .then((vector) => {
            if (vector.length) {
              embeddingsByVariant.set(variant, cloneVector(vector));
            }
          })
          .catch((error) => {
            degraded = true;
            degradationReasons.push(`inflight_variant_failed:${variant}`);
            logger.warn({ variant, err: error }, "Inflight variant embedding failed");
          })
      );
      continue;
    }

    missing.push(variant);
  }

  if (missing.length > 0) {
    const batchPromise = (async () => {
      const outcome = await runWithEmbeddingBudget({
        label: "embedding_variant_batch",
        task: (context) => computeEmbeddingsForTexts(missing, context),
      });

      if (outcome.ok === false) {
        throw outcome.error;
      }

      return outcome.value;
    })();

    for (let index = 0; index < missing.length; index += 1) {
      const variant = missing[index];
      const key = `variant:${variant}`;
      const trackedPromise = batchPromise
        .then((vectors) => cloneVector(vectors[index] || []))
        .finally(() => {
          variantInflight.delete(key);
        });

      variantInflight.set(key, trackedPromise);
      waiters.push(
        trackedPromise
          .then((vector) => {
            if (vector.length) {
              embeddingsByVariant.set(variant, vector);
              saveToCache(variantCache, key, vector, EMBEDDING_VARIANT_CACHE_SIZE);
            } else {
              degraded = true;
              degradationReasons.push(`empty_variant_vector:${variant}`);
            }
          })
          .catch((error) => {
            degraded = true;
            degradationReasons.push(`variant_compute_failed:${variant}`);
            logger.warn({ variant, err: error }, "Variant embedding compute failed");
          })
      );
    }
  }

  await Promise.allSettled(waiters);

  if (inflightDeduped > 0) {
    emitEmbeddingMetric("embedding_inflight_deduped", inflightDeduped, {
      layer: "variant",
    });
  }

  return {
    embeddingsByVariant,
    variantCacheHits,
    inflightDeduped,
    degraded,
    degradationReasons,
  };
};

const computeDirectEmbedding = async (text: string) => {
  const outcome = await runWithEmbeddingBudget({
    label: "embedding_direct_fallback",
    task: (context) => computeEmbeddingsForTexts([text], context).then((rows) => rows[0] || []),
  });

  if (outcome.ok === false) {
    throw outcome.error;
  }

  return outcome.value;
};

export const createEmbedding = async (text: string) => {
  const startedAt = Date.now();
  const normalized = normalizeText(text);

  if (!normalized) {
    emitEmbeddingMetric("embedding_cache_hit", 1, {
      layer: "final",
      source: "empty_input",
    });
    emitEmbeddingMetric("embedding_ms", Date.now() - startedAt, {
      source: "empty_input",
    });
    return [];
  }

  const finalKey = `final:${normalized}`;
  const finalCached = getFromCache(finalCache, finalKey);
  if (finalCached?.length) {
    emitEmbeddingMetric("embedding_cache_hit", 1, {
      layer: "final",
      source: "final_cache",
    });
    emitEmbeddingMetric("embedding_ms", Date.now() - startedAt, {
      source: "final_cache",
    });
    return finalCached;
  }

  emitEmbeddingMetric("embedding_cache_hit", 0, {
    layer: "final",
    source: "cache_miss",
  });

  const inflightFinal = finalInflight.get(finalKey);
  if (inflightFinal) {
    emitEmbeddingMetric("embedding_inflight_deduped", 1, {
      layer: "final",
    });
    const value = await inflightFinal;
    emitEmbeddingMetric("embedding_ms", Date.now() - startedAt, {
      source: "final_inflight",
    });
    return cloneVector(value);
  }

  const promise = (async () => {
    const variants = generateVariants(normalized);
    if (!variants.length) {
      return [];
    }

    const resolved = await resolveVariantEmbeddings(variants);
    let degradationReasons = resolved.degradationReasons.slice();
    let degraded = resolved.degraded;

    emitEmbeddingMetric("embedding_cache_hit", resolved.variantCacheHits, {
      layer: "variant",
      variants: variants.length,
    });

    const vectors = variants
      .map((variant) => resolved.embeddingsByVariant.get(variant))
      .filter((vector): vector is number[] => Array.isArray(vector) && vector.length > 0)
      .map((vector) => cloneVector(vector));

    if (!vectors.length) {
      try {
        const fallback = await computeDirectEmbedding(normalized);
        if (fallback.length) {
          vectors.push(fallback);
          degradationReasons.push("variant_batch_empty_fallback_used");
          degraded = true;
        }
      } catch (error) {
        degraded = true;
        degradationReasons.push("direct_fallback_failed");
        logger.warn({ err: error }, "Embedding direct fallback failed");
      }
    }

    const finalEmbedding = mergeEmbeddings(vectors);

    if (!finalEmbedding.length) {
      degraded = true;
      degradationReasons.push("final_embedding_empty");
    } else {
      saveToCache(finalCache, finalKey, finalEmbedding, EMBEDDING_FINAL_CACHE_SIZE);
    }

    if (degraded) {
      emitEmbeddingMetric("embedding_degraded", 1, {
        reasons: Array.from(new Set(degradationReasons)).slice(0, 8),
        variants: variants.length,
      });
    }

    emitEmbeddingMetric("embedding_ms", Date.now() - startedAt, {
      source: "computed",
      variants: variants.length,
      variantCacheHits: resolved.variantCacheHits,
      inflightDeduped: resolved.inflightDeduped,
      degraded,
    });

    return finalEmbedding;
  })();

  finalInflight.set(finalKey, promise);

  try {
    return await promise;
  } catch (error) {
    logger.error(
      {
        err: error,
      },
      "Embedding error"
    );

    if (String((error as Error)?.message || "").includes("embedding_budget_exceeded")) {
      emitEmbeddingMetric("embedding_budget_exceeded", 1, {
        reason: (error as Error)?.message || "unknown",
        layer: "final",
      });
    }

    emitEmbeddingMetric("embedding_degraded", 1, {
      reasons: ["embedding_exception"],
    });
    emitEmbeddingMetric("embedding_ms", Date.now() - startedAt, {
      source: "failed",
    });
    return [];
  } finally {
    finalInflight.delete(finalKey);
  }
};

export const createEmbeddingsBatch = async (texts: string[]): Promise<number[][]> => {
  const values = Array.isArray(texts) ? texts : [];
  if (!values.length) {
    return [];
  }

  const results: number[][] = new Array(values.length).fill([]).map(() => []);

  for (let start = 0; start < values.length; start += EMBEDDING_BATCH_MAX_ITEMS) {
    const end = Math.min(values.length, start + EMBEDDING_BATCH_MAX_ITEMS);
    const groups = new Map<string, number[]>();

    for (let index = start; index < end; index += 1) {
      const normalized = normalizeText(values[index]);
      if (!normalized) {
        results[index] = [];
        continue;
      }

      const bucket = groups.get(normalized) || [];
      bucket.push(index);
      groups.set(normalized, bucket);
    }

    const entries = Array.from(groups.entries());

    for (let offset = 0; offset < entries.length; offset += EMBEDDING_BATCH_CONCURRENCY) {
      const window = entries.slice(offset, offset + EMBEDDING_BATCH_CONCURRENCY);
      const computed = await Promise.all(
        window.map(async ([normalizedText]) => ({
          normalizedText,
          embedding: await createEmbedding(normalizedText),
        }))
      );

      for (const item of computed) {
        const positions = groups.get(item.normalizedText) || [];
        for (const position of positions) {
          results[position] = cloneVector(item.embedding);
        }
      }

      if (offset + EMBEDDING_BATCH_CONCURRENCY < entries.length) {
        await yieldToEventLoop();
      }
    }
  }

  return results;
};

export const warmupEmbeddingRuntime = async (
  initiatedBy = "manual"
) => {
  if (MODE !== "local") {
    return {
      mode: MODE,
      ready: true,
      skipped: true,
      durationMs: 0,
    };
  }

  embeddingWarmupState.initiatedBy = String(initiatedBy || "manual").trim() || "manual";
  const startedAt = Date.now();

  try {
    await getModel();
    const durationMs = Date.now() - startedAt;
    if (!embeddingWarmupState.lastDurationMs) {
      embeddingWarmupState.lastDurationMs = durationMs;
    }
    return {
      mode: MODE,
      ready: true,
      skipped: false,
      durationMs,
    };
  } catch (error) {
    logger.warn({ err: error }, "Embedding warmup skipped");
    throw error;
  }
};

export const getEmbeddingRuntimeState = () => ({
  mode: MODE,
  modelReady,
  warmup: {
    status: embeddingWarmupState.status,
    initiatedBy: embeddingWarmupState.initiatedBy,
    attempts: embeddingWarmupState.attempts,
    startedAt:
      embeddingWarmupState.startedAt !== null
        ? new Date(embeddingWarmupState.startedAt).toISOString()
        : null,
    completedAt:
      embeddingWarmupState.completedAt !== null
        ? new Date(embeddingWarmupState.completedAt).toISOString()
        : null,
    durationMs: embeddingWarmupState.lastDurationMs,
    lastError: embeddingWarmupState.lastError,
  },
  queue: {
    activeCompute: activeEmbeddingCompute,
    queued: embeddingQueue.length,
    maxQueue: EMBEDDING_MAX_QUEUE,
    maxConcurrentCompute: EMBEDDING_MAX_CONCURRENT_COMPUTE,
  },
  cache: {
    final: finalCache.size,
    variant: variantCache.size,
    inflightFinal: finalInflight.size,
    inflightVariant: variantInflight.size,
  },
});

export const isEmbeddingRuntimeReady = () => modelReady;
