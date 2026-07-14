"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeStore = exports.searchKnowledge = void 0;
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../config/prisma"));
const performanceMetrics_1 = require("../observability/performanceMetrics");
const logger_1 = __importDefault(require("../utils/logger"));
const clientScope_service_1 = require("./clientScope.service");
const embedding_service_1 = require("./embedding.service");
const core_1 = require("../runtime/core");
const getMemoryEngine = () => core_1.container.has("IMemoryEngine") ? core_1.container.resolve("IMemoryEngine") : null;
const getMetricsEngine = () => core_1.container.has("IMetricsEngine") ? core_1.container.resolve("IMetricsEngine") : null;
const cosineSimilarity = require("cosine-similarity");
const parsePositiveInt = (raw, fallbackValue) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return fallbackValue;
    }
    return Math.max(1, Math.floor(parsed));
};
const SIMILARITY_THRESHOLD = 0.22;
const MAX_RESULTS = 6;
const KNOWLEDGE_SOURCE_TYPES = ["SYSTEM", "FAQ", "MANUAL", "AUTO_LEARN"];
const STOPWORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "about",
    "what",
    "when",
    "where",
    "have",
    "will",
    "would",
    "could",
    "please",
    "into",
    "them",
    "they",
    "their",
    "ours",
]);
const RETRIEVAL_MAX_CANDIDATES = parsePositiveInt(process.env.RETRIEVAL_MAX_CANDIDATES, 180);
const RETRIEVAL_KEYWORD_WINDOW = Math.min(RETRIEVAL_MAX_CANDIDATES, parsePositiveInt(process.env.RETRIEVAL_KEYWORD_WINDOW, 80));
const RETRIEVAL_PRIMARY_WINDOW = Math.min(RETRIEVAL_MAX_CANDIDATES, parsePositiveInt(process.env.RETRIEVAL_PRIMARY_WINDOW, 100));
const RETRIEVAL_RECENT_WINDOW = Math.min(RETRIEVAL_MAX_CANDIDATES, parsePositiveInt(process.env.RETRIEVAL_RECENT_WINDOW, 60));
const RETRIEVAL_MAX_SCORING = Math.min(RETRIEVAL_MAX_CANDIDATES, parsePositiveInt(process.env.RETRIEVAL_MAX_SCORING, 140));
const RETRIEVAL_SCORE_CHUNK_SIZE = parsePositiveInt(process.env.RETRIEVAL_SCORE_CHUNK_SIZE, 24);
const RETRIEVAL_COMPUTE_BUDGET_MS = parsePositiveInt(process.env.RETRIEVAL_COMPUTE_BUDGET_MS, 220);
const RETRIEVAL_MAX_CONCURRENT_COMPUTE = parsePositiveInt(process.env.RETRIEVAL_MAX_CONCURRENT_COMPUTE, 2);
const RETRIEVAL_MAX_QUEUED_COMPUTE = parsePositiveInt(process.env.RETRIEVAL_MAX_QUEUED_COMPUTE, 48);
const RETRIEVAL_MAX_QUEUE_WAIT_MS = parsePositiveInt(process.env.RETRIEVAL_MAX_QUEUE_WAIT_MS, 300);
const RETRIEVAL_CACHE_MAX_ENTRIES = parsePositiveInt(process.env.RETRIEVAL_CACHE_MAX_ENTRIES, 400);
const RETRIEVAL_CACHE_TTL_MS = parsePositiveInt(process.env.RETRIEVAL_CACHE_TTL_MS, 45000);
const RETRIEVAL_CACHE_STALE_TTL_MS = parsePositiveInt(process.env.RETRIEVAL_CACHE_STALE_TTL_MS, 180000);
const PRIORITY_WEIGHT = {
    HIGH: 0.16,
    MEDIUM: 0.08,
    LOW: 0.02,
};
const SOURCE_WEIGHT = {
    SYSTEM: 0.16,
    FAQ: 0.12,
    MANUAL: 0.1,
    AUTO_LEARN: 0.08,
};
const KNOWLEDGE_SELECT = {
    id: true,
    title: true,
    content: true,
    embedding: true,
    priority: true,
    sourceType: true,
    clientId: true,
    reinforcementScore: true,
    retrievalCount: true,
    successCount: true,
    lastRetrievedAt: true,
    lastReinforcedAt: true,
    createdAt: true,
    updatedAt: true,
};
const retrievalCache = new Map();
const retrievalInflight = new Map();
const retrievalQueue = [];
let activeRetrievalCompute = 0;
let retrievalDrainScheduled = false;
const normalizeText = (value) => String(value || "")
    .trim()
    .toLowerCase();
const cloneResults = (rows) => rows.map((row) => ({ ...row }));
const getCachedRetrieval = (key, nowMs) => {
    const cached = retrievalCache.get(key);
    if (!cached) {
        return null;
    }
    if (cached.expiresAt > nowMs) {
        retrievalCache.delete(key);
        retrievalCache.set(key, cached);
        return {
            value: cloneResults(cached.value),
            stale: false,
        };
    }
    if (cached.staleUntil > nowMs) {
        return {
            value: cloneResults(cached.value),
            stale: true,
        };
    }
    retrievalCache.delete(key);
    return null;
};
const setCachedRetrieval = (key, rows, nowMs) => {
    retrievalCache.delete(key);
    retrievalCache.set(key, {
        value: cloneResults(rows),
        updatedAt: nowMs,
        expiresAt: nowMs + RETRIEVAL_CACHE_TTL_MS,
        staleUntil: nowMs + RETRIEVAL_CACHE_STALE_TTL_MS,
    });
    if (retrievalCache.size <= RETRIEVAL_CACHE_MAX_ENTRIES) {
        return;
    }
    const oldestKey = retrievalCache.keys().next().value;
    if (oldestKey) {
        retrievalCache.delete(oldestKey);
    }
};
const emitRetrievalMetric = (input) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: input.name,
        value: input.value,
        businessId: input.businessId,
        route: "knowledge_search",
        metadata: input.metadata || null,
    });
};
const scoreScope = ({ itemClientId, normalizedClientId, }) => {
    if (normalizedClientId && itemClientId === normalizedClientId) {
        return 0.18;
    }
    if (!itemClientId) {
        return 0.03;
    }
    return 0;
};
const keywordScore = (query, content) => {
    const queryTokens = normalizeText(query).split(/\s+/).filter(Boolean);
    const contentText = normalizeText(content);
    if (!queryTokens.length || !contentText) {
        return 0;
    }
    const hits = queryTokens.filter((token) => contentText.includes(token)).length;
    return hits / queryTokens.length;
};
const businessIntentBoost = (query, content) => {
    const message = normalizeText(query);
    const text = normalizeText(content);
    let boost = 0;
    if (/\b(help|service|services|automation|reply|booking|offer|solution|support)\b/i.test(message) &&
        /\b(help|service|services|automation|reply|booking|offer|solution|support)\b/i.test(text)) {
        boost += 0.08;
    }
    if (/\b(price|pricing|cost|budget|package|plan)\b/i.test(message) &&
        /\b(price|pricing|cost|budget|package|plan)\b/i.test(text)) {
        boost += 0.06;
    }
    return boost;
};
const scoreRecency = (value) => {
    if (!value) {
        return 0;
    }
    const ageMs = Math.max(0, Date.now() - value.getTime());
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    return Math.max(0, 0.08 - ageDays * 0.0015);
};
const scoreReinforcement = ({ reinforcementScore, retrievalCount, successCount, }) => Math.min(0.25, Math.max(0, Number(reinforcementScore || 0)) * 0.08 +
    Math.max(0, Number(retrievalCount || 0)) * 0.004 +
    Math.max(0, Number(successCount || 0)) * 0.02);
const extractQueryTokens = (message) => Array.from(new Set(normalizeText(message)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token)))).slice(0, 6);
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));
const getPriorityBoost = (priority) => PRIORITY_WEIGHT[String(priority || "MEDIUM").toUpperCase()] || 0;
const getSourceBoost = (sourceType) => SOURCE_WEIGHT[String(sourceType || "MANUAL").toUpperCase()] || 0;
const parseEmbeddingVector = (value) => {
    if (!Array.isArray(value)) {
        return null;
    }
    const vector = value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry));
    return vector.length ? vector : null;
};
const safeCosineSimilarity = (left, right) => {
    if (!left.length || !right.length || left.length !== right.length) {
        return 0;
    }
    try {
        const score = Number(cosineSimilarity(left, right));
        return Number.isFinite(score) ? score : 0;
    }
    catch {
        return 0;
    }
};
const buildRetrievalCacheKey = ({ businessId, clientId, includeShared, message, }) => {
    const normalizedMessage = normalizeText(message).slice(0, 1000);
    const scope = String(clientId || "shared");
    const digest = (0, crypto_1.createHash)("sha256")
        .update(`${businessId}::${scope}::${includeShared ? "1" : "0"}::${normalizedMessage}`)
        .digest("hex");
    return `knowledge:${digest}`;
};
const assertWithinBudget = (context, label) => {
    if (Date.now() <= context.deadlineAt) {
        return;
    }
    throw new Error(`retrieval_budget_exceeded:${label}:${context.budgetMs}`);
};
const runQueueJob = (job) => {
    activeRetrievalCompute += 1;
    const budgetMs = RETRIEVAL_COMPUTE_BUDGET_MS;
    const context = {
        budgetMs,
        deadlineAt: Date.now() + budgetMs,
    };
    if (Date.now() - job.enqueuedAt > RETRIEVAL_MAX_QUEUE_WAIT_MS) {
        job.reject(new Error(`retrieval_budget_exceeded:queue_wait_timeout:${Date.now() - job.enqueuedAt}`));
        activeRetrievalCompute = Math.max(0, activeRetrievalCompute - 1);
        scheduleRetrievalDrain();
        return;
    }
    Promise.resolve()
        .then(() => job.run(context))
        .then(job.resolve)
        .catch((error) => {
        const typedError = error instanceof Error ? error : new Error(String(error || "retrieval_failed"));
        job.reject(typedError);
    })
        .finally(() => {
        activeRetrievalCompute = Math.max(0, activeRetrievalCompute - 1);
        scheduleRetrievalDrain();
    });
};
const drainRetrievalQueue = () => {
    while (activeRetrievalCompute < RETRIEVAL_MAX_CONCURRENT_COMPUTE &&
        retrievalQueue.length > 0) {
        const next = retrievalQueue.shift();
        if (!next) {
            break;
        }
        runQueueJob(next);
    }
};
const scheduleRetrievalDrain = () => {
    if (retrievalDrainScheduled) {
        return;
    }
    retrievalDrainScheduled = true;
    setImmediate(() => {
        retrievalDrainScheduled = false;
        drainRetrievalQueue();
    });
};
const queueRetrievalCompute = (run) => new Promise((resolve, reject) => {
    const job = {
        enqueuedAt: Date.now(),
        run,
        resolve,
        reject,
    };
    if (activeRetrievalCompute < RETRIEVAL_MAX_CONCURRENT_COMPUTE) {
        runQueueJob(job);
        return;
    }
    if (retrievalQueue.length >= RETRIEVAL_MAX_QUEUED_COMPUTE) {
        reject(new Error(`retrieval_budget_exceeded:queue_saturated:${retrievalQueue.length}:${RETRIEVAL_MAX_QUEUED_COMPUTE}`));
        return;
    }
    retrievalQueue.push(job);
});
const runRetrievalCompute = async (run) => {
    try {
        const value = await queueRetrievalCompute(run);
        return {
            status: "ok",
            value,
        };
    }
    catch (error) {
        const typedError = error instanceof Error ? error : new Error(String(error || "retrieval_failed"));
        const reason = String(typedError.message || "");
        if (reason.includes("retrieval_budget_exceeded")) {
            return {
                status: "budget_exceeded",
                reason,
                error: typedError,
            };
        }
        return {
            status: "failed",
            error: typedError,
        };
    }
};
const appendCandidatesBounded = (target, rows, context) => {
    for (const row of rows) {
        if (target.size >= RETRIEVAL_MAX_CANDIDATES) {
            return;
        }
        assertWithinBudget(context, "candidate_append");
        if (!target.has(row.id)) {
            target.set(row.id, row);
        }
    }
};
const fetchCandidateWindow = async (input) => {
    const candidateMap = new Map();
    const scopeWhere = {
        ...(0, clientScope_service_1.buildKnowledgeScopeFilter)({
            businessId: input.businessId,
            clientId: input.clientId,
            includeShared: input.includeShared,
        }),
        isActive: true,
        sourceType: {
            in: [...KNOWLEDGE_SOURCE_TYPES],
        },
    };
    const tokens = extractQueryTokens(input.message);
    const keywordFilters = [
        ...tokens.slice(0, 4).map((token) => ({
            title: {
                contains: token,
            },
        })),
        ...tokens.slice(0, 2).map((token) => ({
            content: {
                contains: token,
            },
        })),
    ];
    const memoryEngine = getMemoryEngine();
    const fetchCandidates = memoryEngine
        ? (where, orderBy, take) => memoryEngine.fetchKnowledgeCandidates(input.businessId, where, orderBy, take)
        : (where, orderBy, take) => prisma_1.default.knowledgeBase.findMany({ where: { ...where, businessId: input.businessId }, orderBy, take, select: KNOWLEDGE_SELECT });
    if (keywordFilters.length) {
        assertWithinBudget(input.context, "candidate_keyword_query");
        const keywordCandidates = await fetchCandidates({
            ...scopeWhere,
            AND: [
                {
                    OR: keywordFilters,
                },
            ],
        }, [
            { retrievalCount: "desc" },
            { successCount: "desc" },
            { updatedAt: "desc" },
        ], RETRIEVAL_KEYWORD_WINDOW);
        appendCandidatesBounded(candidateMap, keywordCandidates, input.context);
    }
    if (candidateMap.size < RETRIEVAL_MAX_CANDIDATES) {
        assertWithinBudget(input.context, "candidate_primary_query");
        const primaryCandidates = await fetchCandidates(scopeWhere, [
            { reinforcementScore: "desc" },
            { retrievalCount: "desc" },
            { successCount: "desc" },
            { updatedAt: "desc" },
        ], RETRIEVAL_PRIMARY_WINDOW);
        appendCandidatesBounded(candidateMap, primaryCandidates, input.context);
    }
    if (candidateMap.size < RETRIEVAL_MAX_CANDIDATES) {
        assertWithinBudget(input.context, "candidate_recent_query");
        const recentCandidates = await fetchCandidates(scopeWhere, [{ createdAt: "desc" }], RETRIEVAL_RECENT_WINDOW);
        appendCandidatesBounded(candidateMap, recentCandidates, input.context);
    }
    return Array.from(candidateMap.values());
};
const preRankCandidate = (item, message, normalizedClientId) => {
    const keyword = keywordScore(message, `${item.title || ""}\n${item.content || ""}`);
    const priorityBoost = getPriorityBoost(item.priority);
    const sourceBoost = getSourceBoost(item.sourceType);
    const scopeBoost = scoreScope({
        itemClientId: item.clientId || null,
        normalizedClientId,
    });
    const reinforcementBoost = scoreReinforcement({
        reinforcementScore: item.reinforcementScore,
        retrievalCount: item.retrievalCount,
        successCount: item.successCount,
    });
    const recencyBoost = scoreRecency(item.lastReinforcedAt || item.lastRetrievedAt || item.createdAt);
    const intentBoost = businessIntentBoost(message, item.content);
    return (keyword * 0.42 +
        priorityBoost +
        sourceBoost +
        scopeBoost +
        reinforcementBoost +
        recencyBoost +
        intentBoost);
};
const scoreCandidates = async (input) => {
    if (!input.candidates.length) {
        return {
            scored: [],
            candidateCount: 0,
            scoringCount: 0,
            degraded: false,
        };
    }
    const preRanked = input.candidates
        .map((item) => ({
        item,
        preRank: preRankCandidate(item, input.message, input.normalizedClientId),
    }))
        .sort((left, right) => right.preRank - left.preRank);
    const scoringCandidates = preRanked.slice(0, RETRIEVAL_MAX_SCORING);
    const degraded = preRanked.length > RETRIEVAL_MAX_SCORING;
    const scored = [];
    for (let index = 0; index < scoringCandidates.length; index += 1) {
        if (index > 0 && index % RETRIEVAL_SCORE_CHUNK_SIZE === 0) {
            await yieldToEventLoop();
            assertWithinBudget(input.context, "score_yield");
        }
        assertWithinBudget(input.context, "score_loop");
        const item = scoringCandidates[index].item;
        const embedding = parseEmbeddingVector(item.embedding);
        const semanticScore = embedding
            ? safeCosineSimilarity(input.messageEmbedding, embedding)
            : 0;
        const keyword = keywordScore(input.message, `${item.title || ""}\n${item.content || ""}`);
        const priorityBoost = getPriorityBoost(item.priority);
        const sourceBoost = getSourceBoost(item.sourceType);
        const scopeBoost = scoreScope({
            itemClientId: item.clientId || null,
            normalizedClientId: input.normalizedClientId,
        });
        const reinforcementBoost = scoreReinforcement({
            reinforcementScore: item.reinforcementScore,
            retrievalCount: item.retrievalCount,
            successCount: item.successCount,
        });
        const recencyBoost = scoreRecency(item.lastReinforcedAt || item.lastRetrievedAt || item.createdAt);
        const intentBoost = businessIntentBoost(input.message, item.content);
        const score = semanticScore * 0.55 +
            keyword * 0.2 +
            priorityBoost +
            sourceBoost +
            scopeBoost +
            reinforcementBoost +
            recencyBoost +
            intentBoost;
        scored.push({
            id: item.id,
            content: item.content,
            score,
            semanticScore,
            keywordScore: keyword,
            sourceType: item.sourceType || "MANUAL",
            priority: item.priority || "MEDIUM",
            clientId: item.clientId || null,
            reinforcementScore: Number(item.reinforcementScore || 0),
            retrievalCount: Number(item.retrievalCount || 0),
            successCount: Number(item.successCount || 0),
            lastRetrievedAt: item.lastRetrievedAt || null,
            lastReinforcedAt: item.lastReinforcedAt || null,
            createdAt: item.createdAt || null,
        });
    }
    const results = scored
        .filter((item) => item.score >= SIMILARITY_THRESHOLD)
        .sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        if (right.reinforcementScore !== left.reinforcementScore) {
            return right.reinforcementScore - left.reinforcementScore;
        }
        return right.semanticScore - left.semanticScore;
    })
        .slice(0, MAX_RESULTS);
    return {
        scored: results,
        candidateCount: input.candidates.length,
        scoringCount: scoringCandidates.length,
        degraded,
    };
};
const buildDegradedResults = async (input) => {
    const scopeWhere = {
        ...(0, clientScope_service_1.buildKnowledgeScopeFilter)({
            businessId: input.businessId,
            clientId: input.clientId,
            includeShared: input.includeShared,
        }),
        isActive: true,
        sourceType: {
            in: [...KNOWLEDGE_SOURCE_TYPES],
        },
    };
    const memoryEngine = getMemoryEngine();
    const rows = (memoryEngine
        ? await memoryEngine.fetchKnowledgeCandidates(input.businessId, scopeWhere, [
            { reinforcementScore: "desc" },
            { retrievalCount: "desc" },
            { updatedAt: "desc" },
        ], Math.max(MAX_RESULTS * 2, 12))
        : await prisma_1.default.knowledgeBase.findMany({
            where: scopeWhere,
            orderBy: [
                { reinforcementScore: "desc" },
                { retrievalCount: "desc" },
                { updatedAt: "desc" },
            ],
            take: Math.max(MAX_RESULTS * 2, 12),
            select: KNOWLEDGE_SELECT,
        }));
    if (!rows.length) {
        return [];
    }
    const ranked = await scoreCandidates({
        candidates: rows,
        messageEmbedding: input.messageEmbedding,
        message: input.message,
        normalizedClientId: input.normalizedClientId,
        context: {
            budgetMs: RETRIEVAL_COMPUTE_BUDGET_MS,
            deadlineAt: Date.now() + RETRIEVAL_COMPUTE_BUDGET_MS,
        },
    });
    return ranked.scored;
};
const searchKnowledge = async (businessId, message, options) => {
    const startedAtMs = Date.now();
    const normalizedClientId = String(options?.clientId || "").trim() || null;
    const includeShared = options?.includeShared !== false;
    const cacheKey = buildRetrievalCacheKey({
        businessId,
        clientId: normalizedClientId,
        includeShared,
        message,
    });
    const cached = getCachedRetrieval(cacheKey, Date.now());
    if (cached && !cached.stale) {
        emitRetrievalMetric({
            name: "retrieval_cache_hit",
            value: 1,
            businessId,
            metadata: {
                cacheKey,
                stale: false,
            },
        });
        emitRetrievalMetric({
            name: "retrieval_ms",
            value: Date.now() - startedAtMs,
            businessId,
            metadata: {
                source: "cache",
                stale: false,
            },
        });
        return cached.value;
    }
    emitRetrievalMetric({
        name: "retrieval_cache_hit",
        value: 0,
        businessId,
        metadata: {
            cacheKey,
            staleCandidate: Boolean(cached?.stale),
        },
    });
    const inflight = retrievalInflight.get(cacheKey);
    if (inflight) {
        return inflight.then((rows) => cloneResults(rows));
    }
    const run = (async () => {
        const metrics = getMetricsEngine();
        try {
            const messageEmbedding = await (0, embedding_service_1.createEmbedding)(message);
            if (metrics) {
                metrics.recordKnowledgeMetric("embedding_latency", Date.now() - startedAtMs);
            }
            if (!messageEmbedding.length) {
                if (metrics) {
                    metrics.recordKnowledgeMetric("embedding_failure", 1);
                }
                emitRetrievalMetric({
                    name: "retrieval_ms",
                    value: Date.now() - startedAtMs,
                    businessId,
                    metadata: {
                        source: "empty_embedding",
                    },
                });
                return [];
            }
            const computeOutcome = await runRetrievalCompute(async (context) => {
                assertWithinBudget(context, "candidate_start");
                const candidates = await fetchCandidateWindow({
                    businessId,
                    message,
                    clientId: normalizedClientId,
                    includeShared,
                    context,
                });
                const ranked = await scoreCandidates({
                    candidates,
                    messageEmbedding,
                    message,
                    normalizedClientId,
                    context,
                });
                return {
                    results: ranked.scored,
                    candidateCount: ranked.candidateCount,
                    scoringCount: ranked.scoringCount,
                    degraded: ranked.degraded,
                };
            });
            if (computeOutcome.status === "ok") {
                const nowMs = Date.now();
                setCachedRetrieval(cacheKey, computeOutcome.value.results, nowMs);
                const searchMs = Date.now() - startedAtMs;
                if (metrics) {
                    metrics.recordKnowledgeMetric("search_latency", searchMs);
                    metrics.recordKnowledgeMetric("retrieval_latency", searchMs);
                    if (computeOutcome.value.results.length > 0) {
                        metrics.recordKnowledgeMetric("hit", 1);
                    }
                    else {
                        metrics.recordKnowledgeMetric("miss", 1);
                    }
                }
                emitRetrievalMetric({
                    name: "candidate_count",
                    value: computeOutcome.value.candidateCount,
                    businessId,
                    metadata: {
                        cacheKey,
                    },
                });
                emitRetrievalMetric({
                    name: "scoring_count",
                    value: computeOutcome.value.scoringCount,
                    businessId,
                    metadata: {
                        cacheKey,
                    },
                });
                if (computeOutcome.value.degraded) {
                    emitRetrievalMetric({
                        name: "retrieval_degraded",
                        value: 1,
                        businessId,
                        metadata: {
                            cacheKey,
                            reason: "scoring_window_capped",
                            maxScoring: RETRIEVAL_MAX_SCORING,
                        },
                    });
                }
                emitRetrievalMetric({
                    name: "retrieval_ms",
                    value: Date.now() - startedAtMs,
                    businessId,
                    metadata: {
                        source: "compute",
                        degraded: computeOutcome.value.degraded,
                    },
                });
                return computeOutcome.value.results;
            }
            if (computeOutcome.status === "budget_exceeded") {
                if (metrics) {
                    metrics.recordKnowledgeMetric("vector_failure", 1);
                }
                emitRetrievalMetric({
                    name: "retrieval_budget_exceeded",
                    value: 1,
                    businessId,
                    metadata: {
                        cacheKey,
                        reason: computeOutcome.reason,
                    },
                });
                const fallbackRows = cached?.value?.length
                    ? cached.value
                    : await buildDegradedResults({
                        businessId,
                        message,
                        messageEmbedding,
                        clientId: normalizedClientId,
                        includeShared,
                        normalizedClientId,
                    });
                if (fallbackRows.length) {
                    emitRetrievalMetric({
                        name: "retrieval_degraded",
                        value: 1,
                        businessId,
                        metadata: {
                            cacheKey,
                            reason: "budget_exceeded_fallback",
                            staleFallback: Boolean(cached?.stale),
                        },
                    });
                }
                emitRetrievalMetric({
                    name: "candidate_count",
                    value: fallbackRows.length,
                    businessId,
                    metadata: {
                        cacheKey,
                        source: "fallback",
                    },
                });
                emitRetrievalMetric({
                    name: "scoring_count",
                    value: fallbackRows.length,
                    businessId,
                    metadata: {
                        cacheKey,
                        source: "fallback",
                    },
                });
                emitRetrievalMetric({
                    name: "retrieval_ms",
                    value: Date.now() - startedAtMs,
                    businessId,
                    metadata: {
                        source: "fallback",
                    },
                });
                return fallbackRows;
            }
            logger_1.default.error({
                businessId,
                err: computeOutcome.error,
            }, "Knowledge retrieval compute failed");
            emitRetrievalMetric({
                name: "retrieval_ms",
                value: Date.now() - startedAtMs,
                businessId,
                metadata: {
                    source: "failed",
                },
            });
            return [];
        }
        catch (error) {
            logger_1.default.error({
                businessId,
                err: error,
            }, "Knowledge search error");
            emitRetrievalMetric({
                name: "retrieval_ms",
                value: Date.now() - startedAtMs,
                businessId,
                metadata: {
                    source: "exception",
                },
            });
            return [];
        }
        finally {
            retrievalInflight.delete(cacheKey);
        }
    })();
    retrievalInflight.set(cacheKey, run);
    return run.then((rows) => cloneResults(rows));
};
exports.searchKnowledge = searchKnowledge;
class KnowledgeStore {
    async getKnowledgeItems(tenantId) {
        const rows = await prisma_1.default.knowledgeBase.findMany({
            where: {
                businessId: tenantId,
                isActive: true,
            },
        });
        return rows.map((row) => ({
            id: row.id,
            tenantId: row.businessId,
            category: row.sourceType || "generic",
            tags: row.clientId ? [row.clientId] : [],
            content: `${row.title}\n${row.content}`,
            confidence: 1.0,
        }));
    }
}
exports.KnowledgeStore = KnowledgeStore;
