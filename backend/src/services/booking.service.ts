import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

/*
=====================================================
FETCH AVAILABLE SLOTS (ADVANCED - OPTIMIZED)
=====================================================
*/

export const fetchAvailableSlots = async (
  businessId: string,
  date: Date
): Promise<Date[]> => {

  const dayOfWeek = date.getDay();

  const slots = await prisma.bookingSlot.findMany({
    where: {
      businessId,
      dayOfWeek,
      isActive: true,
    },
    orderBy: {
      startTime: "asc",
    },
  });

  if (!slots.length) return [];

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      startTime: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: "BOOKED",
    },
    select: {
      startTime: true,
      endTime: true,
    },
  });

  /* 🔥 PERFORMANCE BOOST */
  const appointmentRanges = appointments.map((a) => ({
    start: a.startTime.getTime(),
    end: a.endTime.getTime(),
  }));

  const now = new Date();

  const availableSlots: Date[] = [];

  for (const slot of slots) {

    const [startHour, startMinute] = slot.startTime
      .split(":")
      .map(Number);

    const [endHour, endMinute] = slot.endTime
      .split(":")
      .map(Number);

    const slotDuration = slot.slotDuration || 30;
    const bufferTime = slot.bufferTime || 0;

    let current = new Date(date);
    current.setHours(startHour, startMinute, 0, 0);

    const end = new Date(date);
    end.setHours(endHour, endMinute, 0, 0);

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
CREATE APPOINTMENT (TRANSACTION SAFE)
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

    /* 🔥 STRONG CONFLICT CHECK (INSIDE TX) */
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

    /* 🔥 SAFE LEAD UPDATE */
    if (leadId) {
      await tx.lead.update({
        where: { id: leadId },
        data: {
          stage: "BOOKED_CALL",
          lastMessageAt: new Date(),
        },
      });
    }

    return appointment;
  });
};

/*
=====================================================
RESCHEDULE APPOINTMENT (SAFE)
=====================================================
*/

export const rescheduleAppointment = async (
  appointmentId: string,
  newStart: Date,
  newEnd: Date
) => {

  return prisma.$transaction(async (tx) => {

    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new Error("Appointment not found");
    }

    const conflict = await tx.appointment.findFirst({
      where: {
        businessId: appointment.businessId,
        status: "BOOKED",
        id: { not: appointmentId },
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
      where: { id: appointmentId },
      data: {
        startTime: newStart,
        endTime: newEnd,
        status: "RESCHEDULED",
      },
    });
  });
};

/*
=====================================================
CANCEL APPOINTMENT
=====================================================
*/

export const cancelExistingAppointment = async (
  appointmentId: string
) => {

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: "CANCELLED",
    },
  });

};