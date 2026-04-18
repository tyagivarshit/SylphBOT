"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelFollowups = exports.scheduleFollowups = exports.followupQueue = void 0;
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const followup_service_1 = require("../services/salesAgent/followup.service");
exports.followupQueue = new bullmq_1.Queue("followupQueue", {
    connection: (0, redis_1.getQueueRedisConnection)(),
    prefix: "sylph",
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: true,
    },
});
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
        const existingJob = await exports.followupQueue.getJob(jobId);
        if (existingJob) {
            await existingJob.remove();
        }
        await exports.followupQueue.add("sendFollowup", {
            leadId,
            type: item.step,
            trigger: item.trigger,
            scheduledFor: new Date(Date.now() + item.delayMs).toISOString(),
        }, {
            delay: item.delayMs,
            jobId,
            removeOnComplete: true,
            removeOnFail: true,
            attempts: 3,
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
            const job = await exports.followupQueue.getJob(jobId);
            if (job) {
                await job.remove();
            }
        }
        catch (err) {
            console.log("Followup removal error", err);
        }
    }
    console.log(`🛑 Followups cancelled for lead ${leadId}`);
};
exports.cancelFollowups = cancelFollowups;
