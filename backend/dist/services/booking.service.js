"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rescheduleAppointment = exports.cancelExistingAppointment = exports.autoCompleteAppointments = exports.rescheduleByLead = exports.cancelAppointmentByLead = exports.getUpcomingAppointment = exports.createNewAppointment = exports.fetchAvailableSlots = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const availabilityPlanner_service_1 = require("./availabilityPlanner.service");
const appointmentEngine_service_1 = require("./appointmentEngine.service");
const appointmentReminder_service_1 = require("./appointmentReminder.service");
const rescheduleEngine_service_1 = require("./rescheduleEngine.service");
const appointmentOutcome_service_1 = require("./appointmentOutcome.service");
const securityGovernanceOS_service_1 = require("./security/securityGovernanceOS.service");
const availabilityPlanner = (0, availabilityPlanner_service_1.createAvailabilityPlannerService)();
const resolveCanonicalByLegacy = async ({ businessId, legacyAppointmentId, }) => {
    const legacy = await prisma_1.default.appointment.findFirst({
        where: {
            id: legacyAppointmentId,
            businessId,
        },
    });
    if (!legacy) {
        return null;
    }
    const canonical = await prisma_1.default.appointmentLedger.findFirst({
        where: {
            businessId,
            leadId: legacy.leadId || undefined,
            startAt: legacy.startTime,
            endAt: legacy.endTime,
            status: {
                in: [
                    "REQUESTED",
                    "PROPOSED",
                    "HOLD",
                    "CONFIRMED",
                    "RESCHEDULED",
                    "REMINDER_SENT",
                    "CHECKED_IN",
                    "LATE_JOIN",
                    "IN_PROGRESS",
                ],
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });
    return canonical;
};
const resolveLegacyMirror = async ({ businessId, leadId, startAt, }) => prisma_1.default.appointment.findFirst({
    where: {
        businessId,
        leadId,
        startTime: startAt,
    },
    orderBy: {
        updatedAt: "desc",
    },
});
const fetchAvailableSlots = async (businessId, date) => {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    const ranked = await availabilityPlanner.getRankedSlots({
        businessId,
        windowStart: start,
        windowEnd: end,
        timezone: "UTC",
        maxResults: 200,
    });
    return ranked.map((slot) => slot.startAt);
};
exports.fetchAvailableSlots = fetchAvailableSlots;
const createNewAppointment = async (data) => {
    const { businessId, leadId, startTime, endTime } = data;
    await (0, securityGovernanceOS_service_1.enforceSecurityGovernanceInfluence)({
        domain: "BOOKING",
        action: "messages:enqueue",
        businessId,
        tenantId: businessId,
        actorId: leadId || "booking_runtime",
        actorType: "SERVICE",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
        resourceType: "APPOINTMENT",
        resourceId: leadId || "unknown_lead",
        resourceTenantId: businessId,
        purpose: "APPOINTMENT_CREATE",
        metadata: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
        },
    });
    if (!leadId) {
        throw new Error("Lead ID is required for canonical booking");
    }
    const appointment = await appointmentEngine_service_1.appointmentEngineService.bookDirect({
        businessId,
        leadId,
        startAt: startTime,
        endAt: endTime,
        bookedBy: "SELF",
        source: "BOOKING_API",
        meetingType: "GENERAL",
        timezone: "UTC",
        metadata: {
            legacyName: data.name,
            legacyEmail: data.email || null,
            legacyPhone: data.phone || null,
        },
    });
    if (appointment.startAt) {
        await appointmentReminder_service_1.appointmentReminderService
            .scheduleCoreCadence({
            businessId,
            appointmentId: appointment.id,
            appointmentKey: appointment.appointmentKey,
            leadId: appointment.leadId,
            startAt: appointment.startAt,
        })
            .catch(() => undefined);
    }
    const legacy = await resolveLegacyMirror({
        businessId,
        leadId,
        startAt: startTime,
    });
    return (legacy || {
        id: appointment.id,
        businessId: appointment.businessId,
        leadId: appointment.leadId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        startTime: appointment.startAt || startTime,
        endTime: appointment.endAt || endTime,
        status: appointment.status,
        meetingLink: appointment.meetingJoinUrl || null,
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
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
const cancelAppointmentByLead = async (businessId, leadId) => {
    await (0, securityGovernanceOS_service_1.enforceSecurityGovernanceInfluence)({
        domain: "BOOKING",
        action: "messages:enqueue",
        businessId,
        tenantId: businessId,
        actorId: leadId,
        actorType: "SERVICE",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
        resourceType: "APPOINTMENT",
        resourceId: leadId,
        resourceTenantId: businessId,
        purpose: "APPOINTMENT_CANCEL",
    });
    const appointment = await appointmentEngine_service_1.appointmentEngineService.getActiveAppointmentByLead({
        businessId,
        leadId,
    });
    if (!appointment) {
        throw new Error("No active booking found");
    }
    await appointmentEngine_service_1.appointmentEngineService.cancelAppointment({
        businessId,
        appointmentKey: appointment.appointmentKey,
        reason: "cancelled_by_lead",
        actor: "SELF",
    });
    return prisma_1.default.appointment.findFirst({
        where: {
            businessId,
            leadId,
            status: "CANCELLED",
        },
        orderBy: {
            updatedAt: "desc",
        },
    });
};
exports.cancelAppointmentByLead = cancelAppointmentByLead;
const rescheduleByLead = async (businessId, leadId, newStart, newEnd) => {
    await (0, securityGovernanceOS_service_1.enforceSecurityGovernanceInfluence)({
        domain: "BOOKING",
        action: "messages:enqueue",
        businessId,
        tenantId: businessId,
        actorId: leadId,
        actorType: "SERVICE",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
        resourceType: "APPOINTMENT",
        resourceId: leadId,
        resourceTenantId: businessId,
        purpose: "APPOINTMENT_RESCHEDULE",
        metadata: {
            newStart: newStart.toISOString(),
            newEnd: newEnd.toISOString(),
        },
    });
    const appointment = await appointmentEngine_service_1.appointmentEngineService.getActiveAppointmentByLead({
        businessId,
        leadId,
    });
    if (!appointment) {
        throw new Error("No active booking found");
    }
    const slot = await prisma_1.default.availabilitySlot.findFirst({
        where: {
            businessId,
            startAt: newStart,
            endAt: newEnd,
        },
        orderBy: {
            updatedAt: "desc",
        },
    });
    if (!slot) {
        throw new Error("New slot not available");
    }
    await rescheduleEngine_service_1.rescheduleEngineService.reschedule({
        businessId,
        appointmentKey: appointment.appointmentKey,
        newSlotKey: slot.slotKey,
        actor: "SELF",
        reason: "lead_reschedule",
    });
    return prisma_1.default.appointment.findFirst({
        where: {
            businessId,
            leadId,
            status: "CONFIRMED",
            startTime: newStart,
        },
        orderBy: {
            updatedAt: "desc",
        },
    });
};
exports.rescheduleByLead = rescheduleByLead;
const autoCompleteAppointments = async () => {
    const now = new Date();
    const due = await prisma_1.default.appointmentLedger.findMany({
        where: {
            status: {
                in: ["CONFIRMED", "RESCHEDULED", "REMINDER_SENT", "CHECKED_IN", "LATE_JOIN", "IN_PROGRESS"],
            },
            endAt: {
                lt: now,
            },
        },
        select: {
            businessId: true,
            appointmentKey: true,
        },
        take: 200,
    });
    for (const appointment of due) {
        await appointmentOutcome_service_1.appointmentOutcomeService
            .complete({
            businessId: appointment.businessId,
            appointmentKey: appointment.appointmentKey,
            outcome: "AUTO_COMPLETED",
            metadata: {
                completionSource: "automatic_completion_sweep",
            },
        })
            .catch(() => undefined);
    }
    return {
        count: due.length,
    };
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
const cancelExistingAppointment = async (businessId, appointmentId) => {
    const canonical = await resolveCanonicalByLegacy({
        businessId,
        legacyAppointmentId: appointmentId,
    });
    if (canonical) {
        await appointmentEngine_service_1.appointmentEngineService.cancelAppointment({
            businessId,
            appointmentKey: canonical.appointmentKey,
            reason: "cancelled_via_legacy_endpoint",
            actor: "HUMAN",
        });
    }
    else {
        await prisma_1.default.appointment.updateMany({
            where: {
                id: appointmentId,
                businessId,
            },
            data: {
                status: "CANCELLED",
            },
        });
    }
    return getAppointmentById(businessId, appointmentId);
};
exports.cancelExistingAppointment = cancelExistingAppointment;
const rescheduleAppointment = async (businessId, appointmentId, newStart, newEnd) => {
    const canonical = await resolveCanonicalByLegacy({
        businessId,
        legacyAppointmentId: appointmentId,
    });
    if (!canonical) {
        const conflict = await prisma_1.default.appointment.findFirst({
            where: {
                businessId,
                status: "CONFIRMED",
                id: { not: appointmentId },
                AND: [{ startTime: { lt: newEnd } }, { endTime: { gt: newStart } }],
            },
        });
        if (conflict) {
            throw new Error("New slot not available");
        }
        await prisma_1.default.appointment.updateMany({
            where: {
                id: appointmentId,
                businessId,
            },
            data: {
                startTime: newStart,
                endTime: newEnd,
            },
        });
        return getAppointmentById(businessId, appointmentId);
    }
    const slot = await prisma_1.default.availabilitySlot.findFirst({
        where: {
            businessId,
            startAt: newStart,
            endAt: newEnd,
        },
    });
    if (!slot) {
        throw new Error("New slot not available");
    }
    await rescheduleEngine_service_1.rescheduleEngineService.reschedule({
        businessId,
        appointmentKey: canonical.appointmentKey,
        newSlotKey: slot.slotKey,
        actor: "HUMAN",
        reason: "legacy_endpoint_reschedule",
    });
    return getAppointmentById(businessId, appointmentId);
};
exports.rescheduleAppointment = rescheduleAppointment;
