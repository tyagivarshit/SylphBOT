"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeFollowupQueue = exports.cancelFollowups = exports.scheduleFollowups = exports.getFollowupQueues = exports.getLegacyFollowupQueue = exports.getFollowupQueue = exports.initFollowupQueues = exports.LEGACY_FOLLOWUP_QUEUE_NAME = exports.FOLLOWUP_QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
const leadControlState_service_1 = require("../services/leadControlState.service");
const followup_service_1 = require("../services/salesAgent/followup.service");
exports.FOLLOWUP_QUEUE_NAME = "ai-low";
exports.LEGACY_FOLLOWUP_QUEUE_NAME = "followupQueue";
const globalForFollowupQueue = globalThis;
const defaultJobOptions = (0, queue_defaults_1.buildQueueJobOptions)({
    backoff: {
        type: "exponential",
        delay: 5000,
    },
});
const initFollowupQueues = () => {
    if (!globalForFollowupQueue.__sylphFollowupQueue) {
        globalForFollowupQueue.__sylphFollowupQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(exports.FOLLOWUP_QUEUE_NAME, {
            connection: (0, redis_1.getQueueRedisConnection)(),
            prefix: "sylph",
            defaultJobOptions,
        }), exports.FOLLOWUP_QUEUE_NAME);
    }
    if (exports.LEGACY_FOLLOWUP_QUEUE_NAME !== exports.FOLLOWUP_QUEUE_NAME &&
        !globalForFollowupQueue.__sylphLegacyFollowupQueue) {
        globalForFollowupQueue.__sylphLegacyFollowupQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(exports.LEGACY_FOLLOWUP_QUEUE_NAME, {
            connection: (0, redis_1.getQueueRedisConnection)(),
            prefix: "sylph",
            defaultJobOptions,
        }), exports.LEGACY_FOLLOWUP_QUEUE_NAME);
    }
    return (0, exports.getFollowupQueues)();
};
exports.initFollowupQueues = initFollowupQueues;
const getFollowupQueue = () => {
    if (!globalForFollowupQueue.__sylphFollowupQueue) {
        (0, exports.initFollowupQueues)();
    }
    return globalForFollowupQueue.__sylphFollowupQueue;
};
exports.getFollowupQueue = getFollowupQueue;
const getLegacyFollowupQueue = () => {
    if (exports.LEGACY_FOLLOWUP_QUEUE_NAME === exports.FOLLOWUP_QUEUE_NAME) {
        return (0, exports.getFollowupQueue)();
    }
    if (!globalForFollowupQueue.__sylphLegacyFollowupQueue) {
        (0, exports.initFollowupQueues)();
    }
    return globalForFollowupQueue.__sylphLegacyFollowupQueue;
};
exports.getLegacyFollowupQueue = getLegacyFollowupQueue;
const getFollowupQueues = () => exports.LEGACY_FOLLOWUP_QUEUE_NAME === exports.FOLLOWUP_QUEUE_NAME
    ? [(0, exports.getFollowupQueue)()]
    : [(0, exports.getFollowupQueue)(), (0, exports.getLegacyFollowupQueue)()];
exports.getFollowupQueues = getFollowupQueues;
const scheduleFollowups = async (leadId, options) => {
    if (!leadId)
        return;
    const lead = await prisma_1.default.lead.findUnique({
        where: { id: leadId },
        select: { stage: true },
    });
    if (!lead || lead.stage === "CLOSED")
        return;
    const schedule = await (0, followup_service_1.getSalesFollowupSchedule)(leadId, options);
    const controlState = await (0, leadControlState_service_1.getLeadControlAuthority)({
        leadId,
    });
    const queue = (0, exports.getFollowupQueue)();
    const legacyQueue = (0, exports.getLegacyFollowupQueue)();
    for (const item of schedule) {
        const jobId = `followup:${leadId}:${item.step}`;
        const existingJob = (await queue.getJob(jobId)) ||
            (await legacyQueue.getJob(jobId));
        if (existingJob) {
            await existingJob.remove().catch(() => undefined);
        }
        await queue.add("sendFollowup", {
            leadId,
            type: item.step,
            trigger: item.trigger,
            scheduledFor: new Date(Date.now() + item.delayMs).toISOString(),
            cancelTokenVersion: controlState?.cancelTokenVersion ?? 0,
        }, {
            jobId,
            ...(0, queue_defaults_1.buildQueueJobOptions)({
                delay: item.delayMs,
            }),
        });
    }
    console.log("Followups scheduled for lead", leadId);
};
exports.scheduleFollowups = scheduleFollowups;
const cancelFollowups = async (leadId) => {
    if (!leadId)
        return;
    const jobIds = [
        `followup:${leadId}:1h`,
        `followup:${leadId}:24h`,
        `followup:${leadId}:48h`,
        `followup:${leadId}:NO_REPLY_1H`,
        `followup:${leadId}:NO_REPLY_24H`,
        `followup:${leadId}:NO_REPLY_48H`,
        `followup:${leadId}:OPENED_NO_RESPONSE`,
        `followup:${leadId}:CLICKED_NOT_BOOKED`,
        `followup:${leadId}:2hr`,
        `followup:${leadId}:12hr`,
        `followup:${leadId}:24hr`,
    ];
    const queue = (0, exports.getFollowupQueue)();
    const legacyQueue = (0, exports.getLegacyFollowupQueue)();
    for (const jobId of jobIds) {
        try {
            const job = (await queue.getJob(jobId)) || (await legacyQueue.getJob(jobId));
            if (job) {
                await job.remove().catch(() => undefined);
            }
        }
        catch (err) {
            console.log("Followup removal error", err);
        }
    }
    console.log("Followups cancelled for lead", leadId);
};
exports.cancelFollowups = cancelFollowups;
const closeFollowupQueue = async () => {
    await Promise.allSettled([
        globalForFollowupQueue.__sylphFollowupQueue,
        globalForFollowupQueue.__sylphLegacyFollowupQueue,
    ]
        .filter(Boolean)
        .map((queue) => queue.close()));
    globalForFollowupQueue.__sylphFollowupQueue = undefined;
    globalForFollowupQueue.__sylphLegacyFollowupQueue = undefined;
};
exports.closeFollowupQueue = closeFollowupQueue;
