"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeBookingReminderQueue = exports.scheduleReminderJobs = exports.getBookingReminderQueue = exports.initBookingReminderQueue = exports.BOOKING_REMINDER_QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
exports.BOOKING_REMINDER_QUEUE_NAME = "booking";
const globalForBookingReminderQueue = globalThis;
const defaultJobOptions = (0, queue_defaults_1.buildQueueJobOptions)({
    backoff: {
        type: "exponential",
        delay: 5000,
    },
});
const initBookingReminderQueue = () => {
    if (!globalForBookingReminderQueue.__sylphBookingReminderQueue) {
        globalForBookingReminderQueue.__sylphBookingReminderQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(exports.BOOKING_REMINDER_QUEUE_NAME, {
            connection: (0, redis_1.getQueueRedisConnection)(),
            defaultJobOptions,
        }), exports.BOOKING_REMINDER_QUEUE_NAME);
    }
    return globalForBookingReminderQueue.__sylphBookingReminderQueue;
};
exports.initBookingReminderQueue = initBookingReminderQueue;
const getBookingReminderQueue = () => (0, exports.initBookingReminderQueue)();
exports.getBookingReminderQueue = getBookingReminderQueue;
const scheduleReminderJobs = async ({ appointmentId, businessId, }) => {
    try {
        const appointment = await prisma_1.default.appointment.findFirst({
            where: {
                id: appointmentId,
                businessId,
            },
        });
        if (!appointment) {
            console.log("No appointment found for reminders");
            return;
        }
        const queueReminderJob = async (name, type, delay = 0) => {
            const queue = (0, exports.getBookingReminderQueue)();
            const jobId = `booking:${businessId}:${appointmentId}:${type}`;
            const existing = await queue.getJob(jobId);
            if (existing) {
                await existing.remove().catch(() => undefined);
            }
            await queue.add(name, {
                type,
                appointmentId,
                businessId,
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
const closeBookingReminderQueue = async () => {
    await globalForBookingReminderQueue.__sylphBookingReminderQueue
        ?.close()
        .catch(() => undefined);
    globalForBookingReminderQueue.__sylphBookingReminderQueue = undefined;
};
exports.closeBookingReminderQueue = closeBookingReminderQueue;
