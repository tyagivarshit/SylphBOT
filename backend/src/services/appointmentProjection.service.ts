import prisma from "../config/prisma";

const percent = (numerator: number, denominator: number) =>
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

export const createAppointmentProjectionService = () => ({
  getOpsProjection: async ({
    businessId,
    from,
    to,
  }: {
    businessId: string;
    from: Date;
    to: Date;
  }) => {
    const [appointments, slots, conversions] = await Promise.all([
      prisma.appointmentLedger.findMany({
        where: {
          businessId,
          createdAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          leadId: true,
          status: true,
          assignedHumanId: true,
          assignedTeam: true,
          startAt: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.availabilitySlot.findMany({
        where: {
          businessId,
          startAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          capacity: true,
          reservedCount: true,
          startAt: true,
          humanId: true,
          teamId: true,
        },
      }),
      prisma.conversionEvent.findMany({
        where: {
          businessId,
          outcome: "payment_completed",
          occurredAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          leadId: true,
          value: true,
          occurredAt: true,
        },
      }),
    ]);

    const totalRequested = appointments.filter(
      (appointment) => appointment.status === "REQUESTED"
    ).length;
    const totalConfirmed = appointments.filter((appointment) =>
      ["CONFIRMED", "RESCHEDULED", "REMINDER_SENT", "CHECKED_IN", "LATE_JOIN", "IN_PROGRESS", "COMPLETED", "FOLLOWUP_BOOKED"].includes(
        appointment.status
      )
    ).length;
    const totalRescheduled = appointments.filter(
      (appointment) => appointment.status === "RESCHEDULED"
    ).length;
    const totalCancelled = appointments.filter(
      (appointment) => appointment.status === "CANCELLED"
    ).length;
    const totalNoShow = appointments.filter(
      (appointment) => appointment.status === "NO_SHOW"
    ).length;
    const totalCompleted = appointments.filter(
      (appointment) =>
        appointment.status === "COMPLETED" ||
        appointment.status === "FOLLOWUP_BOOKED"
    ).length;
    const totalFollowupBooked = appointments.filter(
      (appointment) => appointment.status === "FOLLOWUP_BOOKED"
    ).length;

    const totalSlotCapacity = slots.reduce(
      (sum, slot) => sum + Math.max(1, Number(slot.capacity || 1)),
      0
    );
    const totalReserved = slots.reduce(
      (sum, slot) => sum + Math.max(0, Number(slot.reservedCount || 0)),
      0
    );

    const hourlyMap = new Map<string, number>();

    for (const slot of slots) {
      const hour = slot.startAt.toISOString().slice(11, 13);
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + slot.reservedCount);
    }

    const peakSlots = Array.from(hourlyMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([hour, count]) => ({
        hour,
        reservedCount: count,
      }));

    const repLoadMap = new Map<string, number>();

    for (const appointment of appointments) {
      const key = String(appointment.assignedHumanId || appointment.assignedTeam || "UNASSIGNED");
      repLoadMap.set(key, (repLoadMap.get(key) || 0) + 1);
    }

    const repLoad = Array.from(repLoadMap.entries())
      .map(([owner, count]) => ({
        owner,
        appointments: count,
      }))
      .sort((left, right) => right.appointments - left.appointments)
      .slice(0, 15);

    const completedLeadIds = new Set(
      appointments
        .filter((appointment) => Boolean(appointment.completedAt))
        .map((appointment) => appointment.leadId)
    );
    const revenueAfterMeeting = conversions
      .filter((conversion) => completedLeadIds.has(conversion.leadId))
      .reduce((sum, conversion) => sum + Number(conversion.value || 0), 0);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bookingRate: percent(totalConfirmed, Math.max(1, totalRequested)),
      confirmationRate: percent(totalConfirmed, Math.max(1, appointments.length)),
      reschedulePercent: percent(totalRescheduled, Math.max(1, totalConfirmed)),
      cancelPercent: percent(totalCancelled, Math.max(1, appointments.length)),
      noShowPercent: percent(totalNoShow, Math.max(1, totalConfirmed)),
      utilizationPercent: percent(totalReserved, Math.max(1, totalSlotCapacity)),
      peakSlots,
      repLoad,
      meetingConversionPercent: percent(totalCompleted, Math.max(1, totalConfirmed)),
      revenueAfterMeeting,
      followupBookingRate: percent(totalFollowupBooked, Math.max(1, totalCompleted)),
      counts: {
        requested: totalRequested,
        confirmed: totalConfirmed,
        rescheduled: totalRescheduled,
        cancelled: totalCancelled,
        noShow: totalNoShow,
        completed: totalCompleted,
        followupBooked: totalFollowupBooked,
      },
    };
  },
});

export const appointmentProjectionService = createAppointmentProjectionService();
