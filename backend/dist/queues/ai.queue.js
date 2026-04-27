"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeAIQueue = exports.getAIQueueForLead = exports.getAIQueueNames = exports.getAIQueues = exports.addRouterJob = exports.addAIJob = exports.enqueueCommentReplyJob = exports.enqueueAIMessage = exports.enqueueAIBatch = exports.initAIQueues = exports.AI_QUEUE_PARTITIONS = exports.LEGACY_AI_QUEUE_NAME = exports.AI_QUEUE_NAME = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bullmq_1 = require("bullmq");
const env_1 = require("../config/env");
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
const leadControlState_service_1 = require("../services/leadControlState.service");
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
const globalForAIQueue = globalThis;
const initAIQueues = () => {
    if (!globalForAIQueue.__sylphAIHighQueue) {
        globalForAIQueue.__sylphAIHighQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(exports.AI_QUEUE_NAME, {
            connection: (0, redis_1.getQueueRedisConnection)(),
            prefix: env_1.env.AI_QUEUE_PREFIX,
            defaultJobOptions,
            streams: {
                events: {
                    maxLen: 1000,
                },
            },
        }), exports.AI_QUEUE_NAME);
    }
    if (exports.LEGACY_AI_QUEUE_NAME !== exports.AI_QUEUE_NAME &&
        !globalForAIQueue.__sylphAILegacyQueue) {
        globalForAIQueue.__sylphAILegacyQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(exports.LEGACY_AI_QUEUE_NAME, {
            connection: (0, redis_1.getQueueRedisConnection)(),
            prefix: env_1.env.AI_QUEUE_PREFIX,
            defaultJobOptions,
            streams: {
                events: {
                    maxLen: 1000,
                },
            },
        }), exports.LEGACY_AI_QUEUE_NAME);
    }
    return (0, exports.getAIQueues)();
};
exports.initAIQueues = initAIQueues;
const getAIQueue = () => {
    if (!globalForAIQueue.__sylphAIHighQueue) {
        (0, exports.initAIQueues)();
    }
    return globalForAIQueue.__sylphAIHighQueue;
};
const getLegacyAIQueue = () => {
    if (exports.LEGACY_AI_QUEUE_NAME === exports.AI_QUEUE_NAME) {
        return getAIQueue();
    }
    if (!globalForAIQueue.__sylphAILegacyQueue) {
        (0, exports.initAIQueues)();
    }
    return globalForAIQueue.__sylphAILegacyQueue;
};
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
    source: message.source?.trim(),
    externalEventId: message.externalEventId?.trim(),
    idempotencyKey: message.idempotencyKey?.trim(),
    skipInboundPersist: Boolean(message.skipInboundPersist),
    retryCount: message.retryCount || 0,
    cancelTokenVersion: typeof message.cancelTokenVersion === "number"
        ? message.cancelTokenVersion
        : null,
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
    const cancelTokenVersions = await (0, leadControlState_service_1.getLeadCancelTokenVersions)(normalizedMessages.map((message) => message.leadId));
    const controlledMessages = normalizedMessages.map((message) => ({
        ...message,
        cancelTokenVersion: typeof message.cancelTokenVersion === "number"
            ? message.cancelTokenVersion
            : cancelTokenVersions.get(message.leadId) ?? 0,
    }));
    const chunks = chunkMessages(controlledMessages, env_1.env.AI_JOB_BATCH_SIZE);
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
        acceptedMessages: controlledMessages.length,
        chunks: chunks.length,
        leadIds: Array.from(new Set(controlledMessages.map((item) => item.leadId))),
        idempotencyKey: options?.idempotencyKey || null,
    }, "AI reply batch enqueue requested");
    const createdJobs = await getAIQueue().addBulk(jobs);
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
const normalizeCommentReplyPayload = (payload) => ({
    type: "comment-reply",
    businessId: String(payload.businessId || "").trim(),
    clientId: String(payload.clientId || "").trim(),
    instagramUserId: payload.instagramUserId?.trim(),
    senderId: payload.senderId?.trim(),
    reelId: payload.reelId?.trim(),
    mediaId: payload.mediaId?.trim(),
    commentText: payload.commentText?.trim(),
    text: payload.text?.trim(),
    commentId: payload.commentId?.trim(),
});
const enqueueCommentReplyJob = async (payload) => {
    const normalizedPayload = normalizeCommentReplyPayload(payload);
    const jobId = normalizedPayload.commentId
        ? `comment_reply_${normalizedPayload.commentId}`
        : `comment_reply_${crypto_1.default.randomUUID()}`;
    logger_1.default.info({
        queue: exports.AI_QUEUE_NAME,
        source: "comment-reply",
        businessId: normalizedPayload.businessId,
        clientId: normalizedPayload.clientId,
        commentId: normalizedPayload.commentId || null,
        mediaId: normalizedPayload.mediaId || normalizedPayload.reelId || null,
    }, "Comment reply job enqueue requested");
    const job = await getAIQueue().add("ai-high", normalizedPayload, {
        jobId,
    });
    logger_1.default.info({
        queue: exports.AI_QUEUE_NAME,
        source: "comment-reply",
        jobId: job?.id || null,
        commentId: normalizedPayload.commentId || null,
    }, "Comment reply job enqueued");
    return job;
};
exports.enqueueCommentReplyJob = enqueueCommentReplyJob;
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
    ? [getAIQueue()]
    : [getAIQueue(), getLegacyAIQueue()];
exports.getAIQueues = getAIQueues;
const getAIQueueNames = () => (0, exports.getAIQueues)().map((queue) => queue.name);
exports.getAIQueueNames = getAIQueueNames;
const getAIQueueForLead = (_leadId) => getAIQueue();
exports.getAIQueueForLead = getAIQueueForLead;
const closeAIQueue = async () => {
    await Promise.allSettled([
        globalForAIQueue.__sylphAIHighQueue,
        globalForAIQueue.__sylphAILegacyQueue,
    ]
        .filter(Boolean)
        .map((queue) => queue.close()));
    globalForAIQueue.__sylphAIHighQueue = undefined;
    globalForAIQueue.__sylphAILegacyQueue = undefined;
};
exports.closeAIQueue = closeAIQueue;
