import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { createMeetingStateService } from "./meetingState.service";
import { publishCRMRefreshEvent } from "./crm/refreshEvents.service";
import { publishAppointmentEvent } from "./appointmentEvent.service";
import { commerceProjectionService } from "./commerceProjection.service";
import { mergeAppointmentMetadata, parseAppointmentMetadata } from "./appointment.shared";

export const createAppointmentOutcomeService = ({
  meetingState = createMeetingStateService(),
}: {
  meetingState?: ReturnType<typeof createMeetingStateService>;
} = {}) => ({
  complete: async ({
    businessId,
    appointmentKey,
    outcome,
    feedbackScore = null,
    notes = null,
    metadata = null,
  }: {
    businessId: string;
    appointmentKey: string;
    outcome: string;
    feedbackScore?: number | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const appointment = await prisma.appointmentLedger.findFirst({
      where: {
        businessId,
        appointmentKey,
      },
    });

    if (!appointment) {
      throw new Error("appointment_not_found");
    }

    const updated = await prisma.appointmentLedger.update({
      where: {
        id: appointment.id,
      },
      data: {
        outcome: String(outcome || "").trim() || null,
        feedbackScore:
          feedbackScore === null || feedbackScore === undefined
            ? null
            : Math.max(0, Math.min(10, Math.floor(feedbackScore))),
        notes: notes || appointment.notes || null,
        metadata: mergeAppointmentMetadata(
          parseAppointmentMetadata(appointment.metadata),
          metadata || undefined
        ) as Prisma.InputJsonValue,
      },
    });

    const completed = await meetingState.transition({
      businessId,
      appointmentKey,
      nextState: "COMPLETED",
      reason: "outcome_recorded",
    });

    await publishCRMRefreshEvent({
      businessId,
      leadId: completed.leadId,
      event: "booking_completed",
      waitForSync: false,
    }).catch(() => undefined);

    await commerceProjectionService
      .bootstrapBookingConversion({
        businessId,
        leadId: completed.leadId,
        appointmentKey: completed.appointmentKey,
        metadata: {
          source: "appointment_outcome",
          outcome: String(outcome || "").trim() || null,
        },
      })
      .catch(() => undefined);

    return updated;
  },

  markFollowupBooked: async ({
    businessId,
    appointmentKey,
    followupAppointmentKey = null,
  }: {
    businessId: string;
    appointmentKey: string;
    followupAppointmentKey?: string | null;
  }) => {
    const updated = await meetingState.transition({
      businessId,
      appointmentKey,
      nextState: "FOLLOWUP_BOOKED",
      reason: "followup_booked",
      metadata: {
        followupAppointmentKey,
      },
    });

    await publishAppointmentEvent({
      event: "appointment.followup_booked",
      businessId,
      aggregateId: updated.id,
      payload: {
        businessId: updated.businessId,
        appointmentId: updated.id,
        appointmentKey: updated.appointmentKey,
        leadId: updated.leadId,
        traceId: null,
        followupAppointmentKey,
      },
      eventKey: `${updated.appointmentKey}:followup`,
    });

    return updated;
  },
});

export const appointmentOutcomeService = createAppointmentOutcomeService();
