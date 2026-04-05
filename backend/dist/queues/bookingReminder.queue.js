"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleReminderJobs = exports.bookingReminderQueue = exports.BOOKING_REMINDER_QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const prisma_1 = __importDefault(require("../config/prisma"));
/*
=========================================================
BOOKING REMINDER QUEUE (SAAS LEVEL)
=========================================================
*/
exports.BOOKING_REMINDER_QUEUE_NAME = "booking-reminder-queue";
exports.bookingReminderQueue = new bullmq_1.Queue(exports.BOOKING_REMINDER_QUEUE_NAME, {
    connection: redis_1.redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});
/*
=========================================================
🔥 CORE: SCHEDULE ALL REMINDERS (IMPORTANT)
=========================================================
*/
const scheduleReminderJobs = async (appointmentId) => {
    try {
        const appointment = await prisma_1.default.appointment.findUnique({
            where: { id: appointmentId },
        });
        if (!appointment) {
            console.log("❌ No appointment found for reminders");
            return;
        }
        const now = Date.now();
        const startTime = new Date(appointment.startTime).getTime();
        /* =================================================
        🔥 1. INSTANT CONFIRMATION
        ================================================= */
        await exports.bookingReminderQueue.add("confirmation", {
            type: "CONFIRMATION",
            appointmentId,
        });
        /* =================================================
        🌅 2. MORNING REMINDER (9 AM SAME DAY)
        ================================================= */
        const morningTime = new Date(appointment.startTime);
        morningTime.setHours(9, 0, 0, 0);
        const morningDelay = morningTime.getTime() - now;
        if (morningDelay > 0) {
            await exports.bookingReminderQueue.add("morning", {
                type: "MORNING",
                appointmentId,
            }, { delay: morningDelay });
        }
        /* =================================================
        ⏰ 3. 30 MIN BEFORE REMINDER
        ================================================= */
        const before30 = startTime - 30 * 60 * 1000;
        const before30Delay = before30 - now;
        if (before30Delay > 0) {
            await exports.bookingReminderQueue.add("before_30", {
                type: "BEFORE_30_MIN",
                appointmentId,
            }, { delay: before30Delay });
        }
        console.log("✅ Reminder jobs scheduled:", appointmentId);
    }
    catch (error) {
        console.error("❌ REMINDER SCHEDULER ERROR:", error);
    }
};
exports.scheduleReminderJobs = scheduleReminderJobs;
