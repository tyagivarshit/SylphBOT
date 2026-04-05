"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingReminderWorker = void 0;
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const whatsapp_service_1 = require("../services/whatsapp.service");
const redis_1 = require("../config/redis");
const bookingReminder_queue_1 = require("../queues/bookingReminder.queue");
exports.bookingReminderWorker = new bullmq_1.Worker(bookingReminder_queue_1.BOOKING_REMINDER_QUEUE_NAME, async (job) => {
    const { type, appointmentId } = job.data;
    try {
        console.log(`🔔 Processing ${type} for ${appointmentId}`);
        /* =================================================
        FETCH APPOINTMENT
        ================================================= */
        const appointment = await prisma_1.default.appointment.findUnique({
            where: { id: appointmentId },
            include: { lead: true },
        });
        if (!appointment) {
            console.log("❌ Appointment not found:", appointmentId);
            return;
        }
        /* =================================================
        SAFETY CHECKS
        ================================================= */
        if (appointment.status !== "BOOKED") {
            console.log("⚠️ Skipping - not active booking");
            return;
        }
        if (new Date(appointment.startTime).getTime() < Date.now()) {
            console.log("⚠️ Skipping - past appointment");
            return;
        }
        const lead = appointment.lead;
        if (!lead?.phone) {
            console.log("❌ No phone number for lead");
            return;
        }
        /* =================================================
        🔥 DUPLICATE PROTECTION
        ================================================= */
        const existing = await prisma_1.default.reminderLog.findFirst({
            where: {
                appointmentId,
                type,
            },
        });
        if (existing) {
            console.log("⚠️ Reminder already sent, skipping");
            return;
        }
        /* =================================================
        📞 FORMAT PHONE (FIXED)
        ================================================= */
        const rawPhone = lead.phone.replace(/\D/g, "");
        const finalPhone = rawPhone.startsWith("91") ? rawPhone : `91${rawPhone}`;
        console.log("📤 Sending reminder to:", finalPhone);
        /* =================================================
        MESSAGE BUILDER
        ================================================= */
        const formattedTime = new Date(appointment.startTime).toLocaleString();
        let message = "";
        switch (type) {
            case "CONFIRMATION":
                message = `✅ Your meeting is confirmed!

📅 ${formattedTime}

We’ll connect with you soon 🚀`;
                break;
            case "MORNING":
                message = `🌅 Good morning!

Reminder: You have a meeting today.

📅 ${formattedTime}

See you soon 👍`;
                break;
            case "BEFORE_30_MIN":
                message = `⏰ Your meeting starts in 30 minutes.

📅 ${formattedTime}

Please be ready 🚀`;
                break;
            default:
                console.log("❌ Unknown reminder type:", type);
                return;
        }
        /* =================================================
        SEND WHATSAPP
        ================================================= */
        const sent = await (0, whatsapp_service_1.sendWhatsAppMessage)({
            to: finalPhone,
            message,
        });
        if (!sent) {
            throw new Error("WhatsApp send failed");
        }
        console.log(`✅ ${type} sent to ${finalPhone}`);
        /* =================================================
        SAVE LOG (FOR DUPLICATE PREVENTION)
        ================================================= */
        await prisma_1.default.reminderLog.create({
            data: {
                appointmentId,
                type,
            },
        });
    }
    catch (error) {
        console.error("❌ REMINDER WORKER ERROR:", error);
        throw error; // retry
    }
}, {
    connection: redis_1.redisConnection,
    concurrency: 5,
});
