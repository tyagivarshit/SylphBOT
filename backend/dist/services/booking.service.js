"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rescheduleAppointment = exports.cancelExistingAppointment = exports.autoCompleteAppointments = exports.rescheduleByLead = exports.cancelAppointmentByLead = exports.getUpcomingAppointment = exports.createNewAppointment = exports.fetchAvailableSlots = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const bookingReminder_queue_1 = require("../queues/bookingReminder.queue");
const ownerNotification_service_1 = require("./ownerNotification.service");
/*
=====================================================
🔥 FETCH AVAILABLE SLOTS (FIXED)
=====================================================
*/
const fetchAvailableSlots = async (businessId, date) => {
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayOfWeek = utcDate.getUTCDay();
    const slots = await prisma_1.default.bookingSlot.findMany({
        where: {
            businessId,
            dayOfWeek,
            isActive: true,
        },
        orderBy: { startTime: "asc" },
    });
    if (!slots.length)
        return [];
    const startOfDay = new Date(utcDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(utcDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const appointments = await prisma_1.default.appointment.findMany({
        where: {
            businessId,
            startTime: { gte: startOfDay, lte: endOfDay },
            status: "CONFIRMED", // ✅ FIXED
        },
        select: { startTime: true, endTime: true },
    });
    const appointmentRanges = appointments.map((a) => ({
        start: a.startTime.getTime(),
        end: a.endTime.getTime(),
    }));
    const now = new Date();
    const availableSlots = [];
    for (const slot of slots) {
        const [startHour, startMinute] = slot.startTime.split(":").map(Number);
        const [endHour, endMinute] = slot.endTime.split(":").map(Number);
        const slotDuration = slot.slotDuration || 30;
        const bufferTime = slot.bufferTime || 0;
        let current = new Date(utcDate);
        current.setUTCHours(startHour, startMinute, 0, 0);
        const end = new Date(utcDate);
        end.setUTCHours(endHour, endMinute, 0, 0);
        while (current < end) {
            const slotStart = new Date(current);
            const slotEnd = new Date(current.getTime() + slotDuration * 60000);
            const hasConflict = appointmentRanges.some((appt) => {
                return (slotStart.getTime() < appt.end &&
                    slotEnd.getTime() > appt.start);
            });
            if (!hasConflict && slotStart.getTime() > now.getTime()) {
                availableSlots.push(new Date(slotStart));
            }
            current = new Date(current.getTime() +
                (slotDuration + bufferTime) * 60000);
        }
    }
    return availableSlots;
};
exports.fetchAvailableSlots = fetchAvailableSlots;
const createNewAppointment = async (data) => {
    const { businessId, leadId, name, email, phone, startTime, endTime, } = data;
    return prisma_1.default.$transaction(async (tx) => {
        /* 🔥 PREVENT MULTIPLE BOOKINGS PER USER */
        if (leadId) {
            const existingUserBooking = await tx.appointment.findFirst({
                where: {
                    leadId,
                    status: "CONFIRMED",
                },
            });
            if (existingUserBooking) {
                throw new Error("User already has active booking");
            }
        }
        /* 🔥 SLOT CONFLICT CHECK */
        const existing = await tx.appointment.findFirst({
            where: {
                businessId,
                status: "CONFIRMED",
                AND: [
                    { startTime: { lt: endTime } },
                    { endTime: { gt: startTime } },
                ],
            },
        });
        if (existing) {
            throw new Error("Slot already booked");
        }
        /* 🔥 CREATE */
        const appointment = await tx.appointment.create({
            data: {
                businessId,
                leadId,
                name,
                email,
                phone,
                startTime,
                endTime,
                status: "CONFIRMED", // ✅ FIXED
            },
        });
        /* 🔥 REMINDERS */
        (0, bookingReminder_queue_1.scheduleReminderJobs)(appointment.id).catch(() => { });
        /* 🔥 OWNER NOTIFY */
        if (leadId) {
            (0, ownerNotification_service_1.sendOwnerWhatsAppNotification)({
                businessId,
                leadId,
                slot: startTime,
                type: "BOOKED",
            }).catch(() => { });
        }
        return appointment;
    });
};
exports.createNewAppointment = createNewAppointment;
/*
=====================================================
GET UPCOMING APPOINTMENT (FIXED)
=====================================================
*/
const getUpcomingAppointment = async (leadId) => {
    return prisma_1.default.appointment.findFirst({
        where: {
            leadId,
            status: "CONFIRMED",
            startTime: { gte: new Date() }, // ✅ FIX
        },
        orderBy: { startTime: "asc" },
    });
};
exports.getUpcomingAppointment = getUpcomingAppointment;
/*
=====================================================
CANCEL APPOINTMENT (FIXED)
=====================================================
*/
const cancelAppointmentByLead = async (leadId) => {
    const appointment = await (0, exports.getUpcomingAppointment)(leadId);
    if (!appointment) {
        throw new Error("No active booking found");
    }
    return prisma_1.default.appointment.update({
        where: { id: appointment.id },
        data: { status: "CANCELLED" },
    });
};
exports.cancelAppointmentByLead = cancelAppointmentByLead;
/*
=====================================================
🔥 RESCHEDULE (BEST PRACTICE — UPDATE SAME ROW)
=====================================================
*/
const rescheduleByLead = async (leadId, newStart, newEnd) => {
    const appointment = await (0, exports.getUpcomingAppointment)(leadId);
    if (!appointment) {
        throw new Error("No active booking found");
    }
    if (appointment.startTime < new Date()) {
        throw new Error("Cannot reschedule past appointment");
    }
    return prisma_1.default.$transaction(async (tx) => {
        /* 🔥 SLOT CONFLICT CHECK */
        const conflict = await tx.appointment.findFirst({
            where: {
                businessId: appointment.businessId,
                status: "CONFIRMED",
                id: { not: appointment.id },
                AND: [
                    { startTime: { lt: newEnd } },
                    { endTime: { gt: newStart } },
                ],
            },
        });
        if (conflict) {
            throw new Error("New slot not available");
        }
        const updated = await tx.appointment.update({
            where: { id: appointment.id },
            data: {
                startTime: newStart,
                endTime: newEnd,
            },
        });
        /* 🔥 NOTIFY */
        await (0, ownerNotification_service_1.sendOwnerWhatsAppNotification)({
            businessId: appointment.businessId,
            leadId,
            slot: newStart,
            type: "RESCHEDULED",
        });
        return updated;
    });
};
exports.rescheduleByLead = rescheduleByLead;
/*
=====================================================
🔥 AUTO COMPLETE OLD BOOKINGS (USE IN CRON)
=====================================================
*/
const autoCompleteAppointments = async () => {
    return prisma_1.default.appointment.updateMany({
        where: {
            endTime: { lt: new Date() },
            status: "CONFIRMED",
        },
        data: {
            status: "COMPLETED",
        },
    });
};
exports.autoCompleteAppointments = autoCompleteAppointments;
const getAppointmentById = async (appointmentId) => {
    const appointment = await prisma_1.default.appointment.findUnique({
        where: { id: appointmentId },
    });
    if (!appointment) {
        throw new Error("Appointment not found");
    }
    return appointment;
};
const cancelExistingAppointment = async (appointmentId) => {
    const appointment = await getAppointmentById(appointmentId);
    if (appointment.status === "CANCELLED") {
        return appointment;
    }
    return prisma_1.default.appointment.update({
        where: { id: appointmentId },
        data: { status: "CANCELLED" },
    });
};
exports.cancelExistingAppointment = cancelExistingAppointment;
const rescheduleAppointment = async (appointmentId, newStart, newEnd) => {
    const appointment = await getAppointmentById(appointmentId);
    const conflict = await prisma_1.default.appointment.findFirst({
        where: {
            businessId: appointment.businessId,
            status: "CONFIRMED",
            id: { not: appointment.id },
            AND: [
                { startTime: { lt: newEnd } },
                { endTime: { gt: newStart } },
            ],
        },
    });
    if (conflict) {
        throw new Error("New slot not available");
    }
    return prisma_1.default.appointment.update({
        where: { id: appointmentId },
        data: {
            startTime: newStart,
            endTime: newEnd,
            status: appointment.status === "CANCELLED"
                ? "CONFIRMED"
                : appointment.status,
        },
    });
};
exports.rescheduleAppointment = rescheduleAppointment;
