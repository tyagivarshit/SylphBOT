"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmbeddingRuntimeReady = exports.getEmbeddingRuntimeState = exports.warmupEmbeddingRuntime = exports.createEmbeddingsBatch = exports.createEmbedding = void 0;
const openai_1 = __importDefault(require("openai"));
const transformers_1 = require("@xenova/transformers");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const startupIsolation_service_1 = require("../runtime/startupIsolation.service");
const logger_1 = __importDefault(require("../utils/logger"));
const parsePositiveInt = (raw, fallbackValue) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return fallbackValue;
    }
    return Math.max(1, Math.floor(parsed));
};
const MODE = "local";
const EMBEDDING_FINAL_CACHE_SIZE = parsePositiveInt(process.env.EMBEDDING_FINAL_CACHE_SIZE, 1200);
const EMBEDDING_VARIANT_CACHE_SIZE = parsePositiveInt(process.env.EMBEDDING_VARIANT_CACHE_SIZE, 2400);
const EMBEDDING_CACHE_TTL_MS = parsePositiveInt(process.env.EMBEDDING_CACHE_TTL_MS, 30 * 60 * 1000);
const EMBEDDING_MAX_CONCURRENT_COMPUTE = parsePositiveInt(process.env.EMBEDDING_MAX_CONCURRENT_COMPUTE, 2);
const EMBEDDING_MAX_QUEUE = parsePositiveInt(process.env.EMBEDDING_MAX_QUEUE, 96);
const EMBEDDING_MAX_QUEUE_WAIT_MS = parsePositiveInt(process.env.EMBEDDING_MAX_QUEUE_WAIT_MS, 5000);
const EMBEDDING_COMPUTE_BUDGET_MS = parsePositiveInt(process.env.EMBEDDING_COMPUTE_BUDGET_MS, 15000);
const EMBEDDING_LOCAL_YIELD_EVERY = parsePositiveInt(process.env.EMBEDDING_LOCAL_YIELD_EVERY, 2);
const EMBEDDING_BATCH_MAX_ITEMS = parsePositiveInt(process.env.EMBEDDING_BATCH_MAX_ITEMS, 64);
const EMBEDDING_BATCH_CONCURRENCY = parsePositiveInt(process.env.EMBEDDING_BATCH_CONCURRENCY, 4);
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
let extractorPromise = null;
let modelReady = false;
const embeddingWarmupState = {
    status: "idle",
    initiatedBy: null,
    attempts: 0,
    startedAt: null,
    completedAt: null,
    lastError: null,
    lastDurationMs: null,
};
const finalCache = new Map();
const variantCache = new Map();
const finalInflight = new Map();
const variantInflight = new Map();
const embeddingQueue = [];
let activeEmbeddingCompute = 0;
let embeddingDrainScheduled = false;
const normalizeText = (text) => String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const cloneVector = (value) => value.slice();
const emitEmbeddingMetric = (name, value, metadata) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name,
        value,
        route: "embedding_service",
        metadata: {
            mode: MODE,
            ...(metadata || {}),
        },
    });
};
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));
const emitEmbeddingConcurrency = (event) => {
    emitEmbeddingMetric("embedding_concurrency", activeEmbeddingCompute, {
        event,
        queueDepth: embeddingQueue.length,
    });
};
const getFromCache = (cache, key) => {
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
const saveToCache = (cache, key, value, maxEntries) => {
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
const sanitizeVector = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry));
};
const mergeEmbeddings = (vectors) => {
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
const generateVariants = (text) => {
    const base = normalizeText(text);
    if (!base) {
        return [];
    }
    return Array.from(new Set([
        base,
        base.replace(/\bprice\b/g, "cost"),
        base.replace(/\bcost\b/g, "price"),
        base.replace(/\bbuy\b/g, "purchase"),
        base.replace(/\bpurchase\b/g, "buy"),
    ])).filter(Boolean);
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
const runEmbeddingJob = (job) => {
    activeEmbeddingCompute += 1;
    emitEmbeddingConcurrency("job_started");
    const queueWaitMs = Date.now() - job.enqueuedAt;
    emitEmbeddingMetric("embedding_queue_wait_ms", queueWaitMs, {
        label: job.label,
        queueDepth: embeddingQueue.length,
    });
    if (queueWaitMs > EMBEDDING_MAX_QUEUE_WAIT_MS) {
        const error = new Error(`embedding_budget_exceeded:queue_wait_timeout:${queueWaitMs}:${job.label}`);
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
    const context = {
        queueWaitMs,
        startedAt: Date.now(),
        deadlineAt: Date.now() + Math.max(1, Math.floor(job.budgetMs)),
        budgetMs: Math.max(1, Math.floor(job.budgetMs)),
    };
    Promise.resolve()
        .then(() => job.run(context))
        .then(job.resolve)
        .catch((error) => {
        const typedError = error instanceof Error ? error : new Error(String(error || "embedding_failed"));
        job.reject(typedError);
    })
        .finally(() => {
        activeEmbeddingCompute = Math.max(0, activeEmbeddingCompute - 1);
        emitEmbeddingConcurrency("job_finished");
        scheduleEmbeddingDrain();
    });
};
const drainEmbeddingQueue = () => {
    while (activeEmbeddingCompute < EMBEDDING_MAX_CONCURRENT_COMPUTE &&
        embeddingQueue.length > 0) {
        const next = embeddingQueue.shift();
        if (!next) {
            break;
        }
        runEmbeddingJob(next);
    }
};
const queueEmbeddingCompute = (input) => new Promise((resolve, reject) => {
    const job = {
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
        const error = new Error(`embedding_budget_exceeded:queue_saturated:${embeddingQueue.length}:${EMBEDDING_MAX_QUEUE}:${input.label}`);
        emitEmbeddingMetric("embedding_budget_exceeded", 1, {
            reason: error.message,
            label: input.label,
            queueDepth: embeddingQueue.length,
        });
        reject(error);
        return;
    }
    embeddingQueue.push(job);
    emitEmbeddingConcurrency("job_enqueued");
});
const runWithEmbeddingBudget = async (input) => {
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
                let timeoutHandle = null;
                try {
                    const result = await Promise.race([
                        input.task(context),
                        new Promise((_, reject) => {
                            timeoutHandle = setTimeout(() => {
                                reject(new Error(`embedding_budget_exceeded:compute_timeout:${budgetMs}:${input.label}`));
                            }, budgetMs);
                        }),
                    ]);
                    computeMs = Date.now() - computeStartedAt;
                    emitEmbeddingMetric("embedding_compute_ms", computeMs, {
                        label: input.label,
                        queueWaitMs,
                    });
                    return result;
                }
                finally {
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
    }
    catch (error) {
        const typedError = error instanceof Error ? error : new Error(String(error || "embedding_failed"));
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
const assertBudget = (context, label) => {
    if (Date.now() <= context.deadlineAt) {
        return;
    }
    throw new Error(`embedding_budget_exceeded:budget_timeout:${context.budgetMs}:${label}`);
};
const getModel = async () => {
    if (!extractorPromise) {
        const startedAt = Date.now();
        logger_1.default.info("Loading local embedding model");
        embeddingWarmupState.status = "warming";
        embeddingWarmupState.startedAt = startedAt;
        embeddingWarmupState.completedAt = null;
        embeddingWarmupState.lastDurationMs = null;
        embeddingWarmupState.lastError = null;
        embeddingWarmupState.attempts += 1;
        extractorPromise = (0, transformers_1.pipeline)("feature-extraction", "Xenova/all-MiniLM-L6-v2")
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
                (0, startupIsolation_service_1.markAiRuntimeReady)({
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
            embeddingWarmupState.lastError = String(error?.message || error || "embedding_model_init_failed");
            throw error;
        });
    }
    return extractorPromise;
};
const computeEmbeddingsForTexts = async (texts, context) => {
    if (!texts.length) {
        return [];
    }
    if (MODE === "local") {
        const model = await getModel();
        const vectors = [];
        for (let index = 0; index < texts.length; index += 1) {
            assertBudget(context, "local_inference_loop");
            if (index > 0 && index % EMBEDDING_LOCAL_YIELD_EVERY === 0) {
                await yieldToEventLoop();
                assertBudget(context, "local_inference_yield");
            }
            const output = await model(texts[index], {
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
    const vectors = [];
    for (let index = 0; index < texts.length; index += 1) {
        vectors.push(sanitizeVector(rows[index]?.embedding || []));
    }
    return vectors;
};
const resolveVariantEmbeddings = async (variants) => {
    const uniqueVariants = Array.from(new Set(variants.map((variant) => normalizeText(variant)).filter(Boolean)));
    const embeddingsByVariant = new Map();
    const waiters = [];
    const missing = [];
    const degradationReasons = [];
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
            waiters.push(inflight
                .then((vector) => {
                if (vector.length) {
                    embeddingsByVariant.set(variant, cloneVector(vector));
                }
            })
                .catch((error) => {
                degraded = true;
                degradationReasons.push(`inflight_variant_failed:${variant}`);
                logger_1.default.warn({ variant, err: error }, "Inflight variant embedding failed");
            }));
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
            waiters.push(trackedPromise
                .then((vector) => {
                if (vector.length) {
                    embeddingsByVariant.set(variant, vector);
                    saveToCache(variantCache, key, vector, EMBEDDING_VARIANT_CACHE_SIZE);
                }
                else {
                    degraded = true;
                    degradationReasons.push(`empty_variant_vector:${variant}`);
                }
            })
                .catch((error) => {
                degraded = true;
                degradationReasons.push(`variant_compute_failed:${variant}`);
                logger_1.default.warn({ variant, err: error }, "Variant embedding compute failed");
            }));
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
const computeDirectEmbedding = async (text) => {
    const outcome = await runWithEmbeddingBudget({
        label: "embedding_direct_fallback",
        task: (context) => computeEmbeddingsForTexts([text], context).then((rows) => rows[0] || []),
    });
    if (outcome.ok === false) {
        throw outcome.error;
    }
    return outcome.value;
};
const createEmbedding = async (text) => {
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
            .filter((vector) => Array.isArray(vector) && vector.length > 0)
            .map((vector) => cloneVector(vector));
        if (!vectors.length) {
            try {
                const fallback = await computeDirectEmbedding(normalized);
                if (fallback.length) {
                    vectors.push(fallback);
                    degradationReasons.push("variant_batch_empty_fallback_used");
                    degraded = true;
                }
            }
            catch (error) {
                degraded = true;
                degradationReasons.push("direct_fallback_failed");
                logger_1.default.warn({ err: error }, "Embedding direct fallback failed");
            }
        }
        const finalEmbedding = mergeEmbeddings(vectors);
        if (!finalEmbedding.length) {
            degraded = true;
            degradationReasons.push("final_embedding_empty");
        }
        else {
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
    }
    catch (error) {
        logger_1.default.error({
            err: error,
        }, "Embedding error");
        if (String(error?.message || "").includes("embedding_budget_exceeded")) {
            emitEmbeddingMetric("embedding_budget_exceeded", 1, {
                reason: error?.message || "unknown",
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
    }
    finally {
        finalInflight.delete(finalKey);
    }
};
exports.createEmbedding = createEmbedding;
const createEmbeddingsBatch = async (texts) => {
    const values = Array.isArray(texts) ? texts : [];
    if (!values.length) {
        return [];
    }
    const results = new Array(values.length).fill([]).map(() => []);
    for (let start = 0; start < values.length; start += EMBEDDING_BATCH_MAX_ITEMS) {
        const end = Math.min(values.length, start + EMBEDDING_BATCH_MAX_ITEMS);
        const groups = new Map();
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
            const computed = await Promise.all(window.map(async ([normalizedText]) => ({
                normalizedText,
                embedding: await (0, exports.createEmbedding)(normalizedText),
            })));
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
exports.createEmbeddingsBatch = createEmbeddingsBatch;
const warmupEmbeddingRuntime = async (initiatedBy = "manual") => {
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
    }
    catch (error) {
        logger_1.default.warn({ err: error }, "Embedding warmup skipped");
        throw error;
    }
};
exports.warmupEmbeddingRuntime = warmupEmbeddingRuntime;
const getEmbeddingRuntimeState = () => ({
    mode: MODE,
    modelReady,
    warmup: {
        status: embeddingWarmupState.status,
        initiatedBy: embeddingWarmupState.initiatedBy,
        attempts: embeddingWarmupState.attempts,
        startedAt: embeddingWarmupState.startedAt !== null
            ? new Date(embeddingWarmupState.startedAt).toISOString()
            : null,
        completedAt: embeddingWarmupState.completedAt !== null
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
exports.getEmbeddingRuntimeState = getEmbeddingRuntimeState;
const isEmbeddingRuntimeReady = () => modelReady;
exports.isEmbeddingRuntimeReady = isEmbeddingRuntimeReady;
