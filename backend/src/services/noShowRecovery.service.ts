import prisma from "../config/prisma";
import { createMeetingStateService } from "./meetingState.service";
import { publishCRMRefreshEvent } from "./crm/refreshEvents.service";
import { scheduleFollowups } from "../queues/followup.queue";
import { sendOwnerWhatsAppNotification } from "./ownerNotification.service";

export const createNoShowRecoveryService = ({
  meetingState = createMeetingStateService(),
}: {
  meetingState?: ReturnType<typeof createMeetingStateService>;
} = {}) => ({
  processNoShow: async ({
    businessId,
    appointmentKey,
    isVip = false,
  }: {
    businessId: string;
    appointmentKey: string;
    isVip?: boolean;
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

    if (["NO_SHOW", "CANCELLED", "COMPLETED", "EXPIRED"].includes(appointment.status)) {
      return appointment;
    }

    const updated = await meetingState.transition({
      businessId,
      appointmentKey,
      nextState: "NO_SHOW",
      reason: "automatic_no_show_recovery",
      metadata: {
        noShowDetectedAt: new Date().toISOString(),
        isVip,
      },
    });

    await Promise.allSettled([
      publishCRMRefreshEvent({
        businessId,
        leadId: updated.leadId,
        event: "booking_missed",
        waitForSync: false,
      }),
      scheduleFollowups(updated.leadId, {
        trigger: "no_reply",
      }),
      isVip
        ? sendOwnerWhatsAppNotification({
            businessId,
            leadId: updated.leadId,
            slot: updated.startAt || undefined,
            type: "RESCHEDULED",
          })
        : Promise.resolve(),
    ]);

    return updated;
  },
});

export const noShowRecoveryService = createNoShowRecoveryService();
