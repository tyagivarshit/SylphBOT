"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelFollowups = exports.scheduleFollowups = exports.legacyFollowupQueue = exports.followupQueue = exports.LEGACY_FOLLOWUP_QUEUE_NAME = exports.FOLLOWUP_QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
const followup_service_1 = require("../services/salesAgent/followup.service");
exports.FOLLOWUP_QUEUE_NAME = "ai-low";
exports.LEGACY_FOLLOWUP_QUEUE_NAME = "followupQueue";
const queueConnection = (0, redis_1.getQueueRedisConnection)();
const defaultJobOptions = (0, queue_defaults_1.buildQueueJobOptions)({
    backoff: {
        type: "exponential",
        delay: 5000,
    },
});
exports.followupQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(exports.FOLLOWUP_QUEUE_NAME, {
    connection: queueConnection,
    prefix: "sylph",
    defaultJobOptions,
}), exports.FOLLOWUP_QUEUE_NAME);
exports.legacyFollowupQueue = exports.LEGACY_FOLLOWUP_QUEUE_NAME === exports.FOLLOWUP_QUEUE_NAME
    ? exports.followupQueue
    : (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(exports.LEGACY_FOLLOWUP_QUEUE_NAME, {
        connection: queueConnection,
        prefix: "sylph",
        defaultJobOptions,
    }), exports.LEGACY_FOLLOWUP_QUEUE_NAME);
const scheduleFollowups = async (leadId, options) => {
    if (!leadId)
        return;
    /* 🔥 CHECK LEAD STATUS */
    const lead = await prisma_1.default.lead.findUnique({
        where: { id: leadId },
        select: { stage: true },
    });
    if (!lead || lead.stage === "CLOSED")
        return;
    const schedule = await (0, followup_service_1.getSalesFollowupSchedule)(leadId, options);
    for (const item of schedule) {
        const jobId = `followup:${leadId}:${item.step}`;
        /* 🔥 REMOVE EXISTING (avoid duplicates) */
        const existingJob = (await exports.followupQueue.getJob(jobId)) ||
            (await exports.legacyFollowupQueue.getJob(jobId));
        if (existingJob) {
            await existingJob.remove().catch(() => undefined);
        }
        await exports.followupQueue.add("sendFollowup", {
            leadId,
            type: item.step,
            trigger: item.trigger,
            scheduledFor: new Date(Date.now() + item.delayMs).toISOString(),
        }, {
            jobId,
            ...(0, queue_defaults_1.buildQueueJobOptions)({
                delay: item.delayMs,
            }),
        });
    }
    console.log(`📅 Followups scheduled for lead ${leadId}`);
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
    for (const jobId of jobIds) {
        try {
            const job = (await exports.followupQueue.getJob(jobId)) || (await exports.legacyFollowupQueue.getJob(jobId));
            if (job) {
                await job.remove().catch(() => undefined);
            }
        }
        catch (err) {
            console.log("Followup removal error", err);
        }
    }
    console.log(`🛑 Followups cancelled for lead ${leadId}`);
};
exports.cancelFollowups = cancelFollowups;
