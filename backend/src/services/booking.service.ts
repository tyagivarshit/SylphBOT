import prisma from "../config/prisma";
import { scheduleReminderJobs } from "../queues/bookingReminder.queue";
import { sendOwnerWhatsAppNotification } from "./ownerNotification.service";
import { recordSalesConversionEvent } from "./salesAgent/optimizer.service";

/*
=====================================================
🔥 FETCH AVAILABLE SLOTS (FIXED)
=====================================================
*/
export const fetchAvailableSlots = async (
  businessId: string,
  date: Date
): Promise<Date[]> => {

  const utcDate = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ));

  const dayOfWeek = utcDate.getUTCDay();

  const slots = await prisma.bookingSlot.findMany({
    where: {
      businessId,
      dayOfWeek,
      isActive: true,
    },
    orderBy: { startTime: "asc" },
  });

  if (!slots.length) return [];

  const startOfDay = new Date(utcDate);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(utcDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
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
  const availableSlots: Date[] = [];

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
      const slotEnd = new Date(
        current.getTime() + slotDuration * 60000
      );

      const hasConflict = appointmentRanges.some((appt) => {
        return (
          slotStart.getTime() < appt.end &&
          slotEnd.getTime() > appt.start
        );
      });

      if (!hasConflict && slotStart.getTime() > now.getTime()) {
        availableSlots.push(new Date(slotStart));
      }

      current = new Date(
        current.getTime() +
          (slotDuration + bufferTime) * 60000
      );
    }
  }

  return availableSlots;
};

/*
=====================================================
🔥 CREATE APPOINTMENT (FINAL FIXED)
=====================================================
*/
interface AppointmentInput {
  businessId: string;
  leadId?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  startTime: Date;
  endTime: Date;
}

export const createNewAppointment = async (
  data: AppointmentInput
) => {
  const {
    businessId,
    leadId,
    name,
    email,
    phone,
    startTime,
    endTime,
  } = data;

  const appointment = await prisma.$transaction(async (tx) => {

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
    scheduleReminderJobs(appointment.id).catch(() => {});

    /* 🔥 OWNER NOTIFY */
    if (leadId) {
      sendOwnerWhatsAppNotification({
        businessId,
        leadId,
        slot: startTime,
        type: "BOOKED",
      }).catch(() => {});

      await tx.lead.update({
        where: {
          id: leadId,
        },
        data: {
          stage: "BOOKED_CALL",
          aiStage: "HOT",
        },
      });
    }

    return appointment;
  });

  if (leadId) {
    void recordSalesConversionEvent({
      businessId,
      leadId,
      outcome: "BOOKED_CALL",
      idempotencyKey: `booking:${appointment.id}`,
    });
  }

  return appointment;
};

/*
=====================================================
GET UPCOMING APPOINTMENT (FIXED)
=====================================================
*/
export const getUpcomingAppointment = async (leadId: string) => {
  return prisma.appointment.findFirst({
    where: {
      leadId,
      status: "CONFIRMED",
      startTime: { gte: new Date() }, // ✅ FIX
    },
    orderBy: { startTime: "asc" },
  });
};

/*
=====================================================
CANCEL APPOINTMENT (FIXED)
=====================================================
*/
export const cancelAppointmentByLead = async (leadId: string) => {
  const appointment = await getUpcomingAppointment(leadId);

  if (!appointment) {
    throw new Error("No active booking found");
  }

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
  });
};

/*
=====================================================
🔥 RESCHEDULE (BEST PRACTICE — UPDATE SAME ROW)
=====================================================
*/
export const rescheduleByLead = async (
  leadId: string,
  newStart: Date,
  newEnd: Date
) => {
  const appointment = await getUpcomingAppointment(leadId);

  if (!appointment) {
    throw new Error("No active booking found");
  }

  if (appointment.startTime < new Date()) {
    throw new Error("Cannot reschedule past appointment");
  }

  return prisma.$transaction(async (tx) => {

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
    await sendOwnerWhatsAppNotification({
      businessId: appointment.businessId,
      leadId,
      slot: newStart,
      type: "RESCHEDULED",
    });

    return updated;
  });
};

/*
=====================================================
🔥 AUTO COMPLETE OLD BOOKINGS (USE IN CRON)
=====================================================
*/
export const autoCompleteAppointments = async () => {
  return prisma.appointment.updateMany({
    where: {
      endTime: { lt: new Date() },
      status: "CONFIRMED",
    },
    data: {
      status: "COMPLETED",
    },
  });
};

const getAppointmentById = async (appointmentId: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  return appointment;
};

export const cancelExistingAppointment = async (
  appointmentId: string
) => {
  const appointment = await getAppointmentById(appointmentId);

  if (appointment.status === "CANCELLED") {
    return appointment;
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });
};

export const rescheduleAppointment = async (
  appointmentId: string,
  newStart: Date,
  newEnd: Date
) => {
  const appointment = await getAppointmentById(appointmentId);

  const conflict = await prisma.appointment.findFirst({
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

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      startTime: newStart,
      endTime: newEnd,
      status:
        appointment.status === "CANCELLED"
          ? "CONFIRMED"
          : appointment.status,
    },
  });
};
