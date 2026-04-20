"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleReminderJobs = exports.legacyBookingReminderQueue = exports.bookingReminderQueue = exports.LEGACY_BOOKING_REMINDER_QUEUE_NAME = exports.BOOKING_REMINDER_QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
exports.BOOKING_REMINDER_QUEUE_NAME = "booking";
exports.LEGACY_BOOKING_REMINDER_QUEUE_NAME = "booking-reminder-queue";
const queueConnection = (0, redis_1.getQueueRedisConnection)();
const defaultJobOptions = (0, queue_defaults_1.buildQueueJobOptions)({
    backoff: {
        type: "exponential",
        delay: 5000,
    },
});
exports.bookingReminderQueue = new bullmq_1.Queue(exports.BOOKING_REMINDER_QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions,
});
exports.legacyBookingReminderQueue = exports.LEGACY_BOOKING_REMINDER_QUEUE_NAME === exports.BOOKING_REMINDER_QUEUE_NAME
    ? exports.bookingReminderQueue
    : new bullmq_1.Queue(exports.LEGACY_BOOKING_REMINDER_QUEUE_NAME, {
        connection: queueConnection,
        defaultJobOptions,
    });
/*
=========================================================
CORE: SCHEDULE ALL REMINDERS (IMPORTANT)
=========================================================
*/
const scheduleReminderJobs = async (appointmentId) => {
    try {
        const appointment = await prisma_1.default.appointment.findUnique({
            where: { id: appointmentId },
        });
        if (!appointment) {
            console.log("No appointment found for reminders");
            return;
        }
        const queueReminderJob = async (name, type, delay = 0) => {
            const jobId = `booking:${appointmentId}:${type}`;
            const existing = (await exports.bookingReminderQueue.getJob(jobId)) ||
                (await exports.legacyBookingReminderQueue.getJob(jobId));
            if (existing) {
                await existing.remove().catch(() => undefined);
            }
            await exports.bookingReminderQueue.add(name, {
                type,
                appointmentId,
            }, (0, queue_defaults_1.buildQueueJobOptions)({
                jobId,
                delay,
            }));
        };
        const now = Date.now();
        const startTime = new Date(appointment.startTime).getTime();
        await queueReminderJob("confirmation", "CONFIRMATION");
        const morningTime = new Date(appointment.startTime);
        morningTime.setHours(9, 0, 0, 0);
        const morningDelay = morningTime.getTime() - now;
        if (morningDelay > 0) {
            await queueReminderJob("morning", "MORNING", morningDelay);
        }
        const before30 = startTime - 30 * 60 * 1000;
        const before30Delay = before30 - now;
        if (before30Delay > 0) {
            await queueReminderJob("before_30", "BEFORE_30_MIN", before30Delay);
        }
        console.log("Reminder jobs scheduled:", appointmentId);
    }
    catch (error) {
        console.error("REMINDER SCHEDULER ERROR:", error);
    }
};
exports.scheduleReminderJobs = scheduleReminderJobs;
