"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAIBookingIntent = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const booking_service_1 = require("./booking.service");
const conversationState_service_1 = require("./conversationState.service");
const booking_ai_utils_1 = require("../utils/booking-ai.utils");
const slotLock_service_1 = require("./slotLock.service");
const ownerNotification_service_1 = require("./ownerNotification.service");
const bookingReminder_queue_1 = require("../queues/bookingReminder.queue");
/* ================================================= */
const isCancelIntent = (msg) => ["cancel", "delete", "remove"].some((k) => msg.includes(k));
const isRescheduleIntent = (msg) => ["reschedule", "change time", "change slot"].some((k) => msg.includes(k));
/* ================================================= */
const getContext = (state) => state?.context || {};
/* ================================================= */
const handleAIBookingIntent = async (businessId, leadId, message) => {
    try {
        const clean = message.toLowerCase().trim();
        const state = await (0, conversationState_service_1.getConversationState)(leadId);
        const context = getContext(state);
        /* ================= CANCEL ================= */
        if (isCancelIntent(clean)) {
            try {
                await (0, booking_service_1.cancelAppointmentByLead)(leadId);
                await (0, conversationState_service_1.clearConversationState)(leadId);
                await (0, ownerNotification_service_1.sendOwnerWhatsAppNotification)({
                    businessId,
                    leadId,
                    type: "CANCELLED",
                });
                return {
                    handled: true,
                    message: "❌ Your booking has been cancelled.",
                };
            }
            catch {
                return { handled: true, message: "No active booking found." };
            }
        }
        /* ================= RESCHEDULE ================= */
        if (isRescheduleIntent(clean)) {
            try {
                /* 🔥 CANCEL OLD BOOKING FIRST */
                await (0, booking_service_1.cancelAppointmentByLead)(leadId);
                await (0, conversationState_service_1.clearConversationState)(leadId);
                await (0, conversationState_service_1.setConversationState)(leadId, "RESCHEDULE_FLOW", {});
                await (0, ownerNotification_service_1.sendOwnerWhatsAppNotification)({
                    businessId,
                    leadId,
                    type: "RESCHEDULED",
                });
                return {
                    handled: true,
                    message: "Sure 👍 Tell me new date & time.",
                };
            }
            catch {
                return {
                    handled: true,
                    message: "Tell me new date & time 👍",
                };
            }
        }
        /* =================================================
        🔥 CONFIRMATION
        ================================================= */
        if (state?.state === "BOOKING_CONFIRMATION") {
            const slotISO = context?.slot;
            if (!slotISO) {
                await (0, conversationState_service_1.clearConversationState)(leadId);
                return { handled: true, message: "Session expired." };
            }
            const selectedSlot = new Date(slotISO);
            if (clean.includes("yes") || clean.includes("confirm")) {
                const lockedBy = await (0, slotLock_service_1.isSlotLocked)(slotISO);
                if (lockedBy && lockedBy !== leadId) {
                    await (0, conversationState_service_1.clearConversationState)(leadId);
                    return {
                        handled: true,
                        message: "⚠️ Slot already booked.",
                    };
                }
                /* 🔥 PREVENT DOUBLE BOOKING */
                const existing = await prisma_1.default.appointment.findFirst({
                    where: {
                        leadId,
                        status: "CONFIRMED",
                    },
                });
                if (existing) {
                    return {
                        handled: true,
                        message: "⚠️ You already have a booking.",
                    };
                }
                try {
                    const endTime = new Date(selectedSlot.getTime() + 30 * 60000);
                    const lead = await prisma_1.default.lead.findUnique({
                        where: { id: leadId },
                    });
                    const appointment = await (0, booking_service_1.createNewAppointment)({
                        businessId,
                        leadId,
                        name: lead?.name || "Customer",
                        email: lead?.email || null,
                        phone: lead?.phone || null,
                        startTime: selectedSlot,
                        endTime,
                    });
                    (0, bookingReminder_queue_1.scheduleReminderJobs)(appointment.id).catch(() => { });
                    await (0, slotLock_service_1.releaseSlotLock)(slotISO);
                    await (0, conversationState_service_1.clearConversationState)(leadId);
                    await (0, ownerNotification_service_1.sendOwnerWhatsAppNotification)({
                        businessId,
                        leadId,
                        slot: selectedSlot,
                        type: "BOOKED",
                    });
                    return {
                        handled: true,
                        message: `✅ Booked for ${selectedSlot.toLocaleString()}`,
                    };
                }
                catch {
                    await (0, slotLock_service_1.releaseSlotLock)(slotISO);
                    return {
                        handled: true,
                        message: "⚠️ Booking failed. Try another slot.",
                    };
                }
            }
            if (clean.includes("change")) {
                await (0, conversationState_service_1.setConversationState)(leadId, "BOOKING_SELECTION", {});
                return { handled: true, message: "Okay 👍 Select another slot." };
            }
            return {
                handled: true,
                message: "Reply YES to confirm or CHANGE.",
            };
        }
        /* ================= SMART PARSING ================= */
        let parsedDate = (0, booking_ai_utils_1.parseDateFromText)(message);
        let parsedTime = (0, booking_ai_utils_1.parseTimeFromText)(message);
        const lower = message.toLowerCase();
        if (!parsedDate && lower.includes("aaj"))
            parsedDate = new Date();
        if (!parsedDate && lower.includes("kal")) {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            parsedDate = d;
        }
        if (!parsedDate && parsedTime)
            parsedDate = new Date();
        if (parsedTime && lower.includes("evening") && parsedTime.hours < 12)
            parsedTime.hours += 12;
        if (parsedTime && lower.includes("night") && parsedTime.hours < 12)
            parsedTime.hours += 12;
        if (parsedTime && lower.includes("morning") && parsedTime.hours >= 12)
            parsedTime.hours -= 12;
        /* =================================================
        🎯 DIRECT SLOT MATCH
        ================================================= */
        if (parsedDate && parsedTime) {
            const requested = new Date(parsedDate);
            requested.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
            const normalizedDate = new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()));
            const available = await (0, booking_service_1.fetchAvailableSlots)(businessId, normalizedDate);
            if (!available.length) {
                return { handled: true, message: "No slots available." };
            }
            const closest = (0, booking_ai_utils_1.findClosestSlot)(requested, available);
            if (!closest) {
                return { handled: true, message: "No suitable slot found." };
            }
            await (0, conversationState_service_1.setConversationState)(leadId, "BOOKING_CONFIRMATION", {
                context: { slot: closest.toISOString() },
            });
            return {
                handled: true,
                message: `Closest slot:\n\n📅 ${closest.toLocaleString()}\n\nReply YES to confirm.`,
            };
        }
        /* =================================================
        📅 SHOW SLOTS
        ================================================= */
        const today = new Date();
        const slotResults = [];
        for (let i = 0; i < 3; i++) {
            const checkDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
            const slots = await (0, booking_service_1.fetchAvailableSlots)(businessId, checkDate);
            for (const s of slots) {
                slotResults.push(s);
                if (slotResults.length >= 5)
                    break;
            }
            if (slotResults.length >= 5)
                break;
        }
        if (!slotResults.length) {
            return { handled: true, message: "No slots available." };
        }
        await (0, conversationState_service_1.setConversationState)(leadId, "BOOKING_SELECTION", {
            context: { slots: slotResults.map((s) => s.toISOString()) },
        });
        return {
            handled: true,
            message: "Available slots:\n\n" +
                slotResults
                    .map((slot, i) => `${i + 1}. ${slot.toLocaleDateString()} at ${slot.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                })}`)
                    .join("\n") +
                "\n\nReply with slot number 👍",
        };
    }
    catch (error) {
        console.error("BOOKING ENGINE ERROR:", error);
        return { handled: false, message: "" };
    }
};
exports.handleAIBookingIntent = handleAIBookingIntent;
