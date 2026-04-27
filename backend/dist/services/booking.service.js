"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rescheduleAppointment = exports.cancelExistingAppointment = exports.autoCompleteAppointments = exports.rescheduleByLead = exports.cancelAppointmentByLead = exports.getUpcomingAppointment = exports.createNewAppointment = exports.fetchAvailableSlots = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const bookingReminder_queue_1 = require("../queues/bookingReminder.queue");
const refreshEvents_service_1 = require("./crm/refreshEvents.service");
const ownerNotification_service_1 = require("./ownerNotification.service");
const optimizer_service_1 = require("./salesAgent/optimizer.service");
const distributedLock_service_1 = require("./distributedLock.service");
const BOOKING_LOCK_TTL_MS = 15000;
const BOOKING_LOCK_WAIT_MS = 2000;
const buildBookingSlotLockKey = ({ businessId, startTime, endTime, }) => `booking:slot:${businessId}:${startTime.toISOString()}:${endTime.toISOString()}`;
const buildBookingLeadLockKey = (businessId, leadId) => `booking:lead:${businessId}:${leadId}`;
const buildBookingAppointmentLockKey = (businessId, appointmentId) => `booking:appointment:${businessId}:${appointmentId}`;
const acquireBookingLock = async ({ key, unavailableMessage, }) => {
    const lock = await (0, distributedLock_service_1.acquireDistributedLock)({
        key,
        ttlMs: BOOKING_LOCK_TTL_MS,
        waitMs: BOOKING_LOCK_WAIT_MS,
    });
    if (!lock) {
        throw new Error(unavailableMessage);
    }
    return lock;
};
const releaseBookingLocks = async (locks) => {
    await Promise.all(locks.map((lock) => lock.release().catch(() => undefined)));
};
const withBookingLocks = async ({ businessId, leadId, appointmentId, startTime, endTime, run, }) => {
    const locks = [];
    try {
        if (leadId) {
            locks.push(await acquireBookingLock({
                key: buildBookingLeadLockKey(businessId, leadId),
                unavailableMessage: "Another booking change is already in progress for this lead",
            }));
        }
        if (appointmentId) {
            locks.push(await acquireBookingLock({
                key: buildBookingAppointmentLockKey(businessId, appointmentId),
                unavailableMessage: "This appointment is already being updated",
            }));
        }
        if (startTime && endTime) {
            locks.push(await acquireBookingLock({
                key: buildBookingSlotLockKey({
                    businessId,
                    startTime,
                    endTime,
                }),
                unavailableMessage: "This slot is being booked right now",
            }));
        }
        return await run();
    }
    finally {
        await releaseBookingLocks(locks);
    }
};
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
    if (!slots.length) {
        return [];
    }
    const startOfDay = new Date(utcDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(utcDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const appointments = await prisma_1.default.appointment.findMany({
        where: {
            businessId,
            startTime: { gte: startOfDay, lte: endOfDay },
            status: "CONFIRMED",
        },
        select: {
            startTime: true,
            endTime: true,
        },
    });
    const appointmentRanges = appointments.map((appointment) => ({
        start: appointment.startTime.getTime(),
        end: appointment.endTime.getTime(),
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
            const hasConflict = appointmentRanges.some((appointment) => slotStart.getTime() < appointment.end &&
                slotEnd.getTime() > appointment.start);
            if (!hasConflict && slotStart.getTime() > now.getTime()) {
                availableSlots.push(new Date(slotStart));
            }
            current = new Date(current.getTime() + (slotDuration + bufferTime) * 60000);
        }
    }
    return availableSlots;
};
exports.fetchAvailableSlots = fetchAvailableSlots;
const createNewAppointment = async (data) => {
    const { businessId, leadId, name, email, phone, startTime, endTime } = data;
    return withBookingLocks({
        businessId,
        leadId: leadId || null,
        startTime,
        endTime,
        run: async () => {
            const appointment = await prisma_1.default.$transaction(async (tx) => {
                let scopedLead = null;
                if (leadId) {
                    scopedLead = await tx.lead.findFirst({
                        where: {
                            id: leadId,
                            businessId,
                            deletedAt: null,
                        },
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                        },
                    });
                    if (!scopedLead) {
                        throw new Error("Lead not found for this business");
                    }
                    const existingUserBooking = await tx.appointment.findFirst({
                        where: {
                            businessId,
                            leadId: scopedLead.id,
                            status: "CONFIRMED",
                        },
                    });
                    if (existingUserBooking) {
                        throw new Error("User already has active booking");
                    }
                }
                const existing = await tx.appointment.findFirst({
                    where: {
                        businessId,
                        status: "CONFIRMED",
                        AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
                    },
                });
                if (existing) {
                    throw new Error("Slot already booked");
                }
                const appointment = await tx.appointment.create({
                    data: {
                        businessId,
                        leadId: scopedLead?.id || leadId,
                        name: scopedLead?.name || name,
                        email: scopedLead?.email || email,
                        phone: scopedLead?.phone || phone,
                        startTime,
                        endTime,
                        status: "CONFIRMED",
                    },
                });
                if (scopedLead) {
                    await tx.lead.updateMany({
                        where: {
                            id: scopedLead.id,
                            businessId,
                            deletedAt: null,
                        },
                        data: {
                            stage: "BOOKED_CALL",
                            aiStage: "HOT",
                            revenueState: "HOT",
                            lastBookedAt: startTime,
                        },
                    });
                }
                return appointment;
            });
            await (0, bookingReminder_queue_1.scheduleReminderJobs)({
                appointmentId: appointment.id,
                businessId,
            }).catch(() => undefined);
            if (leadId) {
                void (0, ownerNotification_service_1.sendOwnerWhatsAppNotification)({
                    businessId,
                    leadId,
                    slot: startTime,
                    type: "CONFIRMED",
                }).catch(() => undefined);
                await (0, optimizer_service_1.recordSalesConversionEvent)({
                    businessId,
                    leadId,
                    outcome: "BOOKED_CALL",
                    idempotencyKey: `booking:${appointment.id}`,
                });
                await (0, refreshEvents_service_1.publishCRMRefreshEvent)({
                    businessId,
                    leadId,
                    event: "booking_confirmed",
                });
            }
            return appointment;
        },
    });
};
exports.createNewAppointment = createNewAppointment;
const getUpcomingAppointment = async (businessId, leadId) => prisma_1.default.appointment.findFirst({
    where: {
        businessId,
        leadId,
        status: "CONFIRMED",
        startTime: { gte: new Date() },
    },
    orderBy: { startTime: "asc" },
});
exports.getUpcomingAppointment = getUpcomingAppointment;
const withLeadOwnedAppointmentLocks = async ({ businessId, leadId, startTime, endTime, run, }) => {
    const leadLock = await acquireBookingLock({
        key: buildBookingLeadLockKey(businessId, leadId),
        unavailableMessage: "Another booking change is already in progress for this lead",
    });
    const locks = [leadLock];
    try {
        const appointment = await (0, exports.getUpcomingAppointment)(businessId, leadId);
        if (!appointment) {
            throw new Error("No active booking found");
        }
        locks.push(await acquireBookingLock({
            key: buildBookingAppointmentLockKey(businessId, appointment.id),
            unavailableMessage: "This appointment is already being updated",
        }));
        if (startTime && endTime) {
            locks.push(await acquireBookingLock({
                key: buildBookingSlotLockKey({
                    businessId,
                    startTime,
                    endTime,
                }),
                unavailableMessage: "This slot is being booked right now",
            }));
        }
        return await run(appointment);
    }
    finally {
        await releaseBookingLocks(locks);
    }
};
const cancelAppointmentByLead = async (businessId, leadId) => {
    return withLeadOwnedAppointmentLocks({
        businessId,
        leadId,
        run: async (appointment) => {
            await prisma_1.default.appointment.updateMany({
                where: {
                    id: appointment.id,
                    businessId,
                    leadId,
                },
                data: { status: "CANCELLED" },
            });
            await (0, refreshEvents_service_1.publishCRMRefreshEvent)({
                businessId,
                leadId,
                event: "booking_cancelled",
            });
            return getAppointmentById(businessId, appointment.id);
        },
    });
};
exports.cancelAppointmentByLead = cancelAppointmentByLead;
const rescheduleByLead = async (businessId, leadId, newStart, newEnd) => {
    return withLeadOwnedAppointmentLocks({
        businessId,
        leadId,
        startTime: newStart,
        endTime: newEnd,
        run: async (appointment) => {
            if (appointment.startTime < new Date()) {
                throw new Error("Cannot reschedule past appointment");
            }
            const updated = await prisma_1.default.$transaction(async (tx) => {
                const conflict = await tx.appointment.findFirst({
                    where: {
                        businessId,
                        status: "CONFIRMED",
                        id: { not: appointment.id },
                        AND: [{ startTime: { lt: newEnd } }, { endTime: { gt: newStart } }],
                    },
                });
                if (conflict) {
                    throw new Error("New slot not available");
                }
                await tx.appointment.updateMany({
                    where: {
                        id: appointment.id,
                        businessId,
                        leadId,
                    },
                    data: {
                        startTime: newStart,
                        endTime: newEnd,
                    },
                });
                const refreshed = await tx.appointment.findFirst({
                    where: {
                        id: appointment.id,
                        businessId,
                        leadId,
                    },
                });
                if (!refreshed) {
                    throw new Error("Appointment not found");
                }
                return refreshed;
            });
            await (0, ownerNotification_service_1.sendOwnerWhatsAppNotification)({
                businessId,
                leadId,
                slot: newStart,
                type: "RESCHEDULED",
            });
            await (0, refreshEvents_service_1.publishCRMRefreshEvent)({
                businessId,
                leadId,
                event: "booking_rescheduled",
            });
            return updated;
        },
    });
};
exports.rescheduleByLead = rescheduleByLead;
const autoCompleteAppointments = async () => {
    const appointments = await prisma_1.default.appointment.findMany({
        where: {
            endTime: { lt: new Date() },
            status: "CONFIRMED",
        },
        select: {
            id: true,
            businessId: true,
            leadId: true,
        },
    });
    if (!appointments.length) {
        return {
            count: 0,
        };
    }
    const result = await prisma_1.default.appointment.updateMany({
        where: {
            id: {
                in: appointments.map((appointment) => appointment.id),
            },
        },
        data: {
            status: "COMPLETED",
        },
    });
    await Promise.all(Array.from(new Set(appointments
        .filter((appointment) => appointment.leadId)
        .map((appointment) => `${appointment.businessId}:${appointment.leadId}`))).map((entry) => {
        const [eventBusinessId, eventLeadId] = entry.split(":");
        return (0, refreshEvents_service_1.publishCRMRefreshEvent)({
            businessId: eventBusinessId,
            leadId: eventLeadId,
            event: "booking_completed",
        });
    }));
    return result;
};
exports.autoCompleteAppointments = autoCompleteAppointments;
const getAppointmentById = async (businessId, appointmentId) => {
    const appointment = await prisma_1.default.appointment.findFirst({
        where: {
            id: appointmentId,
            businessId,
        },
    });
    if (!appointment) {
        throw new Error("Appointment not found");
    }
    return appointment;
};
const updateAppointmentForBusiness = async ({ businessId, appointmentId, data, }) => {
    await prisma_1.default.appointment.updateMany({
        where: {
            id: appointmentId,
            businessId,
        },
        data,
    });
    return getAppointmentById(businessId, appointmentId);
};
const cancelExistingAppointment = async (businessId, appointmentId) => {
    const appointment = await getAppointmentById(businessId, appointmentId);
    return withBookingLocks({
        businessId,
        appointmentId,
        leadId: appointment.leadId || null,
        run: async () => {
            const currentAppointment = await getAppointmentById(businessId, appointmentId);
            if (currentAppointment.status === "CANCELLED") {
                return currentAppointment;
            }
            const updated = await updateAppointmentForBusiness({
                businessId,
                appointmentId: currentAppointment.id,
                data: { status: "CANCELLED" },
            });
            if (updated.leadId) {
                await (0, refreshEvents_service_1.publishCRMRefreshEvent)({
                    businessId,
                    leadId: updated.leadId,
                    event: "booking_cancelled",
                });
            }
            return updated;
        },
    });
};
exports.cancelExistingAppointment = cancelExistingAppointment;
const rescheduleAppointment = async (businessId, appointmentId, newStart, newEnd) => {
    const appointment = await getAppointmentById(businessId, appointmentId);
    return withBookingLocks({
        businessId,
        appointmentId,
        leadId: appointment.leadId || null,
        startTime: newStart,
        endTime: newEnd,
        run: async () => {
            const currentAppointment = await getAppointmentById(businessId, appointmentId);
            const conflict = await prisma_1.default.appointment.findFirst({
                where: {
                    businessId,
                    status: "CONFIRMED",
                    id: { not: currentAppointment.id },
                    AND: [{ startTime: { lt: newEnd } }, { endTime: { gt: newStart } }],
                },
            });
            if (conflict) {
                throw new Error("New slot not available");
            }
            const updated = await updateAppointmentForBusiness({
                businessId,
                appointmentId: currentAppointment.id,
                data: {
                    startTime: newStart,
                    endTime: newEnd,
                    status: currentAppointment.status === "CANCELLED"
                        ? "CONFIRMED"
                        : currentAppointment.status,
                },
            });
            if (updated.leadId) {
                await (0, refreshEvents_service_1.publishCRMRefreshEvent)({
                    businessId,
                    leadId: updated.leadId,
                    event: "booking_rescheduled",
                });
            }
            return updated;
        },
    });
};
exports.rescheduleAppointment = rescheduleAppointment;
