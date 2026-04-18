"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeAIQueue = exports.getAIQueueForLead = exports.getAIQueueNames = exports.getAIQueues = exports.addRouterJob = exports.addAIJob = exports.enqueueAIMessage = exports.enqueueAIBatch = exports.aiQueue = exports.AI_QUEUE_PARTITIONS = exports.AI_QUEUE_NAME = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bullmq_1 = require("bullmq");
const env_1 = require("../config/env");
const redis_1 = require("../config/redis");
const logger_1 = __importDefault(require("../utils/logger"));
exports.AI_QUEUE_NAME = env_1.env.AI_QUEUE_NAME;
exports.AI_QUEUE_PARTITIONS = 1;
const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: env_1.env.AI_JOB_BACKOFF_MS,
    },
    removeOnComplete: true,
    removeOnFail: true,
};
const globalForAIQueue = globalThis;
exports.aiQueue = globalForAIQueue.__sylphAIQueue ||
    new bullmq_1.Queue(exports.AI_QUEUE_NAME, {
        connection: (0, redis_1.getQueueRedisConnection)(),
        prefix: env_1.env.AI_QUEUE_PREFIX,
        defaultJobOptions,
        streams: {
            events: {
                maxLen: 1000,
            },
        },
    });
if (!globalForAIQueue.__sylphAIQueue) {
    globalForAIQueue.__sylphAIQueue = exports.aiQueue;
}
const normalizeMessage = (message) => ({
    ...message,
    businessId: String(message.businessId || "").trim(),
    leadId: String(message.leadId || "").trim(),
    message: String(message.message || "").trim(),
    kind: message.kind || "router",
    externalEventId: message.externalEventId?.trim(),
    idempotencyKey: message.idempotencyKey?.trim(),
    skipInboundPersist: Boolean(message.skipInboundPersist),
    retryCount: message.retryCount || 0,
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
    const normalizedMessages = messages
        .map(normalizeMessage)
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
const getAIQueues = () => [exports.aiQueue];
exports.getAIQueues = getAIQueues;
const getAIQueueNames = () => [exports.aiQueue.name];
exports.getAIQueueNames = getAIQueueNames;
const getAIQueueForLead = (_leadId) => exports.aiQueue;
exports.getAIQueueForLead = getAIQueueForLead;
const closeAIQueue = async () => {
    await exports.aiQueue.close();
    globalForAIQueue.__sylphAIQueue = undefined;
};
exports.closeAIQueue = closeAIQueue;
