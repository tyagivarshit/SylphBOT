"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeAIQueue = exports.getAIQueueForLead = exports.getAIQueueNames = exports.getAIQueues = exports.addRouterJob = exports.addAIJob = exports.enqueueAIMessage = exports.enqueueAIBatch = exports.legacyAIQueue = exports.aiQueue = exports.AI_QUEUE_PARTITIONS = exports.LEGACY_AI_QUEUE_NAME = exports.AI_QUEUE_NAME = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bullmq_1 = require("bullmq");
const env_1 = require("../config/env");
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
const logger_1 = __importDefault(require("../utils/logger"));
const requestContext_1 = require("../observability/requestContext");
exports.AI_QUEUE_NAME = "ai-high";
exports.LEGACY_AI_QUEUE_NAME = env_1.env.AI_QUEUE_NAME;
exports.AI_QUEUE_PARTITIONS = 1;
const defaultJobOptions = {
    ...(0, queue_defaults_1.buildQueueJobOptions)({
        backoff: {
            type: "exponential",
            delay: env_1.env.AI_JOB_BACKOFF_MS,
        },
    }),
};
const queueConnection = (0, redis_1.getQueueRedisConnection)();
const globalForAIQueue = globalThis;
exports.aiQueue = globalForAIQueue.__sylphAIHighQueue ||
    new bullmq_1.Queue(exports.AI_QUEUE_NAME, {
        connection: queueConnection,
        prefix: env_1.env.AI_QUEUE_PREFIX,
        defaultJobOptions,
        streams: {
            events: {
                maxLen: 1000,
            },
        },
    });
if (!globalForAIQueue.__sylphAIHighQueue) {
    globalForAIQueue.__sylphAIHighQueue = exports.aiQueue;
}
exports.legacyAIQueue = exports.LEGACY_AI_QUEUE_NAME === exports.AI_QUEUE_NAME
    ? exports.aiQueue
    : globalForAIQueue.__sylphAILegacyQueue ||
        new bullmq_1.Queue(exports.LEGACY_AI_QUEUE_NAME, {
            connection: queueConnection,
            prefix: env_1.env.AI_QUEUE_PREFIX,
            defaultJobOptions,
            streams: {
                events: {
                    maxLen: 1000,
                },
            },
        });
if (exports.LEGACY_AI_QUEUE_NAME !== exports.AI_QUEUE_NAME &&
    !globalForAIQueue.__sylphAILegacyQueue) {
    globalForAIQueue.__sylphAILegacyQueue = exports.legacyAIQueue;
}
const setMetadataFieldIfMissing = (metadata, key, value) => {
    if (metadata[key] !== undefined || value === undefined) {
        return;
    }
    metadata[key] = value;
};
const buildMessageMetadata = (message, context = (0, requestContext_1.getRequestContext)()) => {
    const metadata = {
        ...(message.metadata || {}),
    };
    setMetadataFieldIfMissing(metadata, "requestId", context?.requestId);
    setMetadataFieldIfMissing(metadata, "userId", context?.userId);
    setMetadataFieldIfMissing(metadata, "businessId", context?.businessId);
    const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
    return entries.length
        ? Object.fromEntries(entries)
        : undefined;
};
const normalizeMessage = (message, context = (0, requestContext_1.getRequestContext)()) => ({
    ...message,
    businessId: String(message.businessId || "").trim(),
    leadId: String(message.leadId || "").trim(),
    message: String(message.message || "").trim(),
    kind: message.kind || "router",
    externalEventId: message.externalEventId?.trim(),
    idempotencyKey: message.idempotencyKey?.trim(),
    skipInboundPersist: Boolean(message.skipInboundPersist),
    retryCount: message.retryCount || 0,
    metadata: buildMessageMetadata(message, context),
});
const chunkMessages = (messages, chunkSize) => {
    const chunks = [];
    for (let index = 0; index < messages.length; index += chunkSize) {
        chunks.push(messages.slice(index, index + chunkSize));
    }
    return chunks;
};
const buildStableToken = (messages, idempotencyKey) => {
    if (idempotencyKey) {
        return idempotencyKey;
    }
    const messageTokens = messages
        .map((message) => message.idempotencyKey || message.externalEventId)
        .filter(Boolean);
    if (!messageTokens.length) {
        return undefined;
    }
    return crypto_1.default
        .createHash("sha1")
        .update(messageTokens.join("|"))
        .digest("hex");
};
const buildJobId = (messages, chunkIndex, options) => {
    if (options?.forceUniqueJobId) {
        return `ai_${crypto_1.default.randomUUID()}`;
    }
    const stableToken = buildStableToken(messages, options?.idempotencyKey);
    if (stableToken) {
        return `ai_${stableToken}_${chunkIndex}`;
    }
    return `ai_${crypto_1.default.randomUUID()}`;
};
const enqueueAIBatch = async (messages, options) => {
    const requestContext = (0, requestContext_1.getRequestContext)();
    const normalizedMessages = messages
        .map((message) => normalizeMessage(message, requestContext))
        .filter((message) => message.businessId && message.leadId && message.message);
    if (!normalizedMessages.length) {
        throw new Error("At least one valid message is required");
    }
    const chunks = chunkMessages(normalizedMessages, env_1.env.AI_JOB_BATCH_SIZE);
    const jobs = chunks.map((chunk, chunkIndex) => ({
        name: "process",
        data: {
            batchId: crypto_1.default.randomUUID(),
            source: options?.source || "api",
            createdAt: new Date().toISOString(),
            messages: chunk,
        },
        opts: {
            jobId: buildJobId(chunk, chunkIndex, options),
            delay: options?.delayMs || 0,
        },
    }));
    logger_1.default.info({
        queue: exports.AI_QUEUE_NAME,
        source: options?.source || "api",
        requestedMessages: messages.length,
        acceptedMessages: normalizedMessages.length,
        chunks: chunks.length,
        leadIds: Array.from(new Set(normalizedMessages.map((item) => item.leadId))),
        idempotencyKey: options?.idempotencyKey || null,
    }, "AI reply batch enqueue requested");
    const createdJobs = await exports.aiQueue.addBulk(jobs);
    logger_1.default.info({
        queue: exports.AI_QUEUE_NAME,
        source: options?.source || "api",
        jobs: createdJobs.map((job) => String(job.id)),
    }, "AI reply batch enqueued");
    return createdJobs;
};
exports.enqueueAIBatch = enqueueAIBatch;
const enqueueAIMessage = async (message, options) => {
    const [job] = await (0, exports.enqueueAIBatch)([message], options);
    return job;
};
exports.enqueueAIMessage = enqueueAIMessage;
const addAIJob = async (data) => (0, exports.enqueueAIMessage)({
    ...data,
    kind: data.kind || "message",
    skipInboundPersist: data.skipInboundPersist ?? false,
}, {
    source: "message",
    idempotencyKey: data.idempotencyKey || data.externalEventId,
});
exports.addAIJob = addAIJob;
const addRouterJob = async (data) => (0, exports.enqueueAIMessage)({
    ...data,
    kind: "router",
    skipInboundPersist: data.skipInboundPersist ?? true,
}, {
    source: "router",
    idempotencyKey: data.idempotencyKey || data.externalEventId,
});
exports.addRouterJob = addRouterJob;
const getAIQueues = () => exports.LEGACY_AI_QUEUE_NAME === exports.AI_QUEUE_NAME
    ? [exports.aiQueue]
    : [exports.aiQueue, exports.legacyAIQueue];
exports.getAIQueues = getAIQueues;
const getAIQueueNames = () => (0, exports.getAIQueues)().map((queue) => queue.name);
exports.getAIQueueNames = getAIQueueNames;
const getAIQueueForLead = (_leadId) => exports.aiQueue;
exports.getAIQueueForLead = getAIQueueForLead;
const closeAIQueue = async () => {
    await Promise.allSettled((0, exports.getAIQueues)().map((queue) => queue.close()));
    globalForAIQueue.__sylphAIHighQueue = undefined;
    globalForAIQueue.__sylphAILegacyQueue = undefined;
};
exports.closeAIQueue = closeAIQueue;
