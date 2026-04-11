"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addRouterJob = exports.addAIJob = exports.getAIQueueForLead = exports.getAIQueueNames = exports.getAIQueues = exports.aiQueue = exports.aiQueues = exports.AI_QUEUE_PARTITIONS = void 0;
const bullmq_1 = require("bullmq");
const env_1 = require("../config/env");
exports.AI_QUEUE_PARTITIONS = Math.max(1, Number(process.env.AI_QUEUE_PARTITIONS || 24));
const AI_QUEUE_BASE_NAME = "aiQueue";
const defaultJobOptions = {
    attempts: 8,
    backoff: {
        type: "fixed",
        delay: 500,
    },
    removeOnComplete: {
        age: 3600,
        count: 10000,
    },
    removeOnFail: {
        age: 24 * 3600,
    },
};
const buildQueueName = (partition) => `${AI_QUEUE_BASE_NAME}-p${partition}`;
const getLeadPartition = (leadId) => {
    let hash = 0;
    for (let index = 0; index < leadId.length; index += 1) {
        hash = (hash * 31 + leadId.charCodeAt(index)) >>> 0;
    }
    return hash % exports.AI_QUEUE_PARTITIONS;
};
exports.aiQueues = Array.from({ length: exports.AI_QUEUE_PARTITIONS }, (_, partition) => new bullmq_1.Queue(buildQueueName(partition), {
    connection: {
        url: env_1.env.REDIS_URL,
    },
    defaultJobOptions,
}));
exports.aiQueue = exports.aiQueues[0];
const getAIQueues = () => exports.aiQueues;
exports.getAIQueues = getAIQueues;
const getAIQueueNames = () => exports.aiQueues.map((queue) => queue.name);
exports.getAIQueueNames = getAIQueueNames;
const getAIQueueForLead = (leadId) => exports.aiQueues[getLeadPartition(leadId)];
exports.getAIQueueForLead = getAIQueueForLead;
const buildJobId = (name, data) => {
    if (!data.externalEventId) {
        return undefined;
    }
    return `${name}:${(data.platform || "UNKNOWN").toUpperCase()}:${data.externalEventId}`;
};
const addLeadScopedJob = (name, data) => {
    const queue = (0, exports.getAIQueueForLead)(data.leadId);
    const jobId = buildJobId(name, data);
    return queue.add(name, data, jobId ? { jobId } : undefined);
};
const addAIJob = async (data) => addLeadScopedJob("message", data);
exports.addAIJob = addAIJob;
const addRouterJob = async (data) => addLeadScopedJob("router", data);
exports.addRouterJob = addRouterJob;
