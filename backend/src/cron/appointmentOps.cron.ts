import cron from "node-cron";
import prisma from "../config/prisma";
import {
  enqueueAppointmentHoldExpirySweep,
  enqueueAppointmentNoShowJob,
  enqueueAppointmentWaitlistFillJob,
} from "../queues/appointmentOps.queue";
import logger from "../utils/logger";

const NO_SHOW_GRACE_MINUTES = 15;

export const startAppointmentOpsCron = () =>
  cron.schedule("*/1 * * * *", async () => {
    try {
      await enqueueAppointmentHoldExpirySweep();
      const now = new Date();
      const threshold = new Date(now.getTime() - NO_SHOW_GRACE_MINUTES * 60_000);

      const dueNoShowAppointments = await prisma.appointmentLedger.findMany({
        where: {
          status: {
            in: ["CONFIRMED", "RESCHEDULED", "REMINDER_SENT", "CHECKED_IN"],
          },
          startAt: {
            lte: threshold,
          },
        },
        select: {
          businessId: true,
          appointmentKey: true,
          metadata: true,
        },
        take: 200,
      });

      for (const appointment of dueNoShowAppointments) {
        const isVip = Boolean(
          (appointment.metadata as Record<string, unknown> | null)?.vipOverride
        );
        await enqueueAppointmentNoShowJob({
          businessId: appointment.businessId,
          appointmentKey: appointment.appointmentKey,
          isVip,
        }).catch(() => undefined);
      }

      const waitlistBacklog = await prisma.waitlistLedger.findMany({
        where: {
          status: "WAITING",
          slotId: {
            not: null,
          },
        },
        select: {
          businessId: true,
          slotId: true,
        },
        take: 150,
      });

      for (const row of waitlistBacklog) {
        if (!row.slotId) {
          continue;
        }

        await enqueueAppointmentWaitlistFillJob({
          businessId: row.businessId,
          slotId: row.slotId,
        }).catch(() => undefined);
      }
    } catch (error) {
      logger.error(
        {
          error,
        },
        "Appointment ops cron failed"
      );
    }
  });
