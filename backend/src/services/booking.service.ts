import prisma from "../config/prisma";
import { createAvailabilityPlannerService } from "./availabilityPlanner.service";
import { appointmentEngineService } from "./appointmentEngine.service";
import { appointmentReminderService } from "./appointmentReminder.service";
import { rescheduleEngineService } from "./rescheduleEngine.service";
import { appointmentOutcomeService } from "./appointmentOutcome.service";
import { enforceSecurityGovernanceInfluence } from "./security/securityGovernanceOS.service";

const availabilityPlanner = createAvailabilityPlannerService();

interface AppointmentInput {
  businessId: string;
  leadId?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  startTime: Date;
  endTime: Date;
}

const resolveCanonicalByLegacy = async ({
  businessId,
  legacyAppointmentId,
}: {
  businessId: string;
  legacyAppointmentId: string;
}) => {
  const legacy = await prisma.appointment.findFirst({
    where: {
      id: legacyAppointmentId,
      businessId,
    },
  });

  if (!legacy) {
    return null;
  }

  const canonical = await prisma.appointmentLedger.findFirst({
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

const resolveLegacyMirror = async ({
  businessId,
  leadId,
  startAt,
}: {
  businessId: string;
  leadId: string;
  startAt: Date;
}) =>
  prisma.appointment.findFirst({
    where: {
      businessId,
      leadId,
      startTime: startAt,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

export const fetchAvailableSlots = async (
  businessId: string,
  date: Date
): Promise<Date[]> => {
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

export const createNewAppointment = async (data: AppointmentInput) => {
  const { businessId, leadId, startTime, endTime } = data;

  await enforceSecurityGovernanceInfluence({
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

  const appointment = await appointmentEngineService.bookDirect({
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
    await appointmentReminderService
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

  return (
    legacy || {
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
    }
  );
};

export const getUpcomingAppointment = async (
  businessId: string,
  leadId: string
) =>
  prisma.appointment.findFirst({
    where: {
      businessId,
      leadId,
      status: "CONFIRMED",
      startTime: { gte: new Date() },
    },
    orderBy: { startTime: "asc" },
  });

export const cancelAppointmentByLead = async (
  businessId: string,
  leadId: string
) => {
  await enforceSecurityGovernanceInfluence({
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

  const appointment = await appointmentEngineService.getActiveAppointmentByLead({
    businessId,
    leadId,
  });

  if (!appointment) {
    throw new Error("No active booking found");
  }

  await appointmentEngineService.cancelAppointment({
    businessId,
    appointmentKey: appointment.appointmentKey,
    reason: "cancelled_by_lead",
    actor: "SELF",
  });

  return prisma.appointment.findFirst({
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

export const rescheduleByLead = async (
  businessId: string,
  leadId: string,
  newStart: Date,
  newEnd: Date
) => {
  await enforceSecurityGovernanceInfluence({
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

  const appointment = await appointmentEngineService.getActiveAppointmentByLead({
    businessId,
    leadId,
  });

  if (!appointment) {
    throw new Error("No active booking found");
  }

  const slot = await prisma.availabilitySlot.findFirst({
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

  await rescheduleEngineService.reschedule({
    businessId,
    appointmentKey: appointment.appointmentKey,
    newSlotKey: slot.slotKey,
    actor: "SELF",
    reason: "lead_reschedule",
  });

  return prisma.appointment.findFirst({
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

export const autoCompleteAppointments = async () => {
  const now = new Date();
  const due = await prisma.appointmentLedger.findMany({
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
    await appointmentOutcomeService
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

const getAppointmentById = async (businessId: string, appointmentId: string) => {
  const appointment = await prisma.appointment.findFirst({
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

export const cancelExistingAppointment = async (
  businessId: string,
  appointmentId: string
) => {
  const canonical = await resolveCanonicalByLegacy({
    businessId,
    legacyAppointmentId: appointmentId,
  });

  if (canonical) {
    await appointmentEngineService.cancelAppointment({
      businessId,
      appointmentKey: canonical.appointmentKey,
      reason: "cancelled_via_legacy_endpoint",
      actor: "HUMAN",
    });
  } else {
    await prisma.appointment.updateMany({
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

export const rescheduleAppointment = async (
  businessId: string,
  appointmentId: string,
  newStart: Date,
  newEnd: Date
) => {
  const canonical = await resolveCanonicalByLegacy({
    businessId,
    legacyAppointmentId: appointmentId,
  });

  if (!canonical) {
    const conflict = await prisma.appointment.findFirst({
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

    await prisma.appointment.updateMany({
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

  const slot = await prisma.availabilitySlot.findFirst({
    where: {
      businessId,
      startAt: newStart,
      endAt: newEnd,
    },
  });

  if (!slot) {
    throw new Error("New slot not available");
  }

  await rescheduleEngineService.reschedule({
    businessId,
    appointmentKey: canonical.appointmentKey,
    newSlotKey: slot.slotKey,
    actor: "HUMAN",
    reason: "legacy_endpoint_reschedule",
  });

  return getAppointmentById(businessId, appointmentId);
};
