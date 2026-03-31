import prisma from "../config/prisma";

/* 🔥 NEW IMPORTS (IMPORTANT) */
import { scheduleReminderJobs } from "../queues/bookingReminder.queue";
import { sendOwnerWhatsAppNotification } from "./ownerNotification.service";
// future ready
// import { syncToCRM } from "../integrations/crmSync.service";

/*
=====================================================
🔥 FETCH AVAILABLE SLOTS (UNCHANGED)
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
      status: "BOOKED",
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
🔥 CREATE APPOINTMENT (UPGRADED SaaS VERSION)
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

  return prisma.$transaction(async (tx) => {
    /* 🔥 DOUBLE BOOKING SAFETY */
    const existing = await tx.appointment.findFirst({
      where: {
        businessId,
        status: "BOOKED",
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
        status: "BOOKED",
      },
    });

    /* 🔥 UPDATE LEAD */
    if (leadId) {
      await tx.lead.update({
        where: { id: leadId },
        data: {
          stage: "BOOKED_CALL",
          lastMessageAt: new Date(),
        },
      });
    }

    /* =================================================
    🚀 POST BOOKING AUTOMATIONS (CRITICAL)
    ================================================= */

    /* 🔔 1. SCHEDULE REMINDERS */
    try {
      await scheduleReminderJobs(appointment.id);
    } catch (err) {
      console.error("❌ REMINDER SCHEDULE ERROR:", err);
    }

    /* 📲 2. OWNER NOTIFICATION */
    try {
      if (leadId) {
        await sendOwnerWhatsAppNotification({
          businessId,
          leadId,
          slot: startTime,
        });
      }
    } catch (err) {
      console.error("❌ OWNER NOTIFICATION ERROR:", err);
    }

    /* 🧠 3. CRM SYNC (FUTURE READY) */
    try {
      // await syncToCRM(appointment);
    } catch (err) {
      console.error("❌ CRM SYNC ERROR:", err);
    }

    /* 📊 ANALYTICS TRACKING (SAFE ADD) */
    try {
      await prisma.analytics.create({
        data: {
          businessId,
          type: "BOOKING_CREATED",
          meta: {
            leadId,
            startTime,
            createdAt: new Date(),
          },
        },
      });
    } catch (err) {
      console.error("❌ ANALYTICS ERROR:", err);
    }

    return appointment;
  });
};

/*
=====================================================
GET UPCOMING APPOINTMENT
=====================================================
*/
export const getUpcomingAppointment = async (leadId: string) => {
  return prisma.appointment.findFirst({
    where: {
      leadId,
      status: "BOOKED",
      startTime: { gte: new Date() },
    },
    orderBy: { startTime: "asc" },
  });
};

/*
=====================================================
CANCEL APPOINTMENT
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
RESCHEDULE APPOINTMENT
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
    const conflict = await tx.appointment.findFirst({
      where: {
        businessId: appointment.businessId,
        status: "BOOKED",
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

    return tx.appointment.update({
      where: { id: appointment.id },
      data: {
        startTime: newStart,
        endTime: newEnd,
        status: "RESCHEDULED",
      },
    });
  });
};