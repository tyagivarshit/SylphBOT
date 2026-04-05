"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelFollowups = exports.scheduleFollowups = exports.followupQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const prisma_1 = __importDefault(require("../config/prisma"));
exports.followupQueue = new bullmq_1.Queue("followupQueue", {
    connection: redis_1.redisConnection,
    prefix: "sylph",
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000,
        },
        removeOnComplete: {
            age: 3600,
            count: 500,
        },
        removeOnFail: {
            age: 24 * 3600,
        },
    },
});
/* 🔥 LIMIT SAFETY */
const MAX_FOLLOWUPS_PER_LEAD = 3;
const scheduleFollowups = async (leadId) => {
    if (!leadId)
        return;
    /* 🔥 CHECK LEAD STATUS */
    const lead = await prisma_1.default.lead.findUnique({
        where: { id: leadId },
        select: { stage: true },
    });
    if (!lead || lead.stage === "CLOSED")
        return;
    const delays = [
        { label: "2hr", delay: 2 * 60 * 60 * 1000 },
        { label: "12hr", delay: 12 * 60 * 60 * 1000 },
        { label: "24hr", delay: 24 * 60 * 60 * 1000 },
    ];
    for (const item of delays.slice(0, MAX_FOLLOWUPS_PER_LEAD)) {
        const jobId = `followup:${leadId}:${item.label}`;
        /* 🔥 REMOVE EXISTING (avoid duplicates) */
        const existingJob = await exports.followupQueue.getJob(jobId);
        if (existingJob) {
            await existingJob.remove();
        }
        await exports.followupQueue.add("sendFollowup", {
            leadId,
            type: item.label,
        }, {
            delay: item.delay,
            jobId,
            removeOnComplete: true,
        });
    }
    console.log(`📅 Followups scheduled for lead ${leadId}`);
};
exports.scheduleFollowups = scheduleFollowups;
const cancelFollowups = async (leadId) => {
    if (!leadId)
        return;
    const jobIds = [
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
