import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import {
  BOOKING_REMINDER_QUEUE_NAME,
  type BookingReminderJobData,
} from "../queues/bookingReminder.queue";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const globalForBookingReminderWorker = globalThis as typeof globalThis & {
  __sylphBookingReminderWorker?: Worker<BookingReminderJobData> | null;
};

export const initBookingReminderWorker = () => {
  if (!shouldRunWorker) {
    console.log("[bookingReminder.worker] RUN_WORKER disabled, worker not started");
    return null;
  }

  if (globalForBookingReminderWorker.__sylphBookingReminderWorker) {
    return globalForBookingReminderWorker.__sylphBookingReminderWorker;
  }

  const worker = new Worker<BookingReminderJobData>(
    BOOKING_REMINDER_QUEUE_NAME,
    withRedisWorkerFailSafe(BOOKING_REMINDER_QUEUE_NAME, async (job) => {
      const { type, appointmentId, businessId } = job.data;

      try {
        console.log(`Processing ${type} for ${appointmentId}`);

        const appointment = await prisma.appointment.findFirst({
          where: {
            id: appointmentId,
            businessId,
          },
          include: { lead: true },
        });

        if (!appointment) {
          console.log("Appointment not found:", appointmentId);
          return;
        }

        if (appointment.status !== "CONFIRMED") {
          console.log("Skipping reminder because booking is not confirmed");
          return;
        }

        if (new Date(appointment.startTime).getTime() < Date.now()) {
          console.log("Skipping reminder because appointment is in the past");
          return;
        }

        const lead = appointment.lead;

        if (!lead?.phone) {
          console.log("No phone number available for reminder");
          return;
        }

        const existing = await prisma.reminderLog.findFirst({
          where: {
            appointmentId,
            type,
          },
        });

        if (existing) {
          console.log("Reminder already sent, skipping");
          return;
        }

        const rawPhone = lead.phone.replace(/\D/g, "");
        const finalPhone =
          rawPhone.startsWith("91") ? rawPhone : `91${rawPhone}`;
        const formattedTime = new Date(appointment.startTime).toLocaleString();

        let message = "";

        switch (type) {
          case "CONFIRMATION":
            message = `Your meeting is confirmed.\n\n${formattedTime}`;
            break;
          case "MORNING":
            message = `Reminder: you have a meeting today.\n\n${formattedTime}`;
            break;
          case "BEFORE_30_MIN":
            message = `Your meeting starts in 30 minutes.\n\n${formattedTime}`;
            break;
          default:
            return;
        }

        const sent = await sendWhatsAppMessage({
          to: finalPhone,
          message,
        });

        if (!sent) {
          throw new Error("WhatsApp send failed");
        }

        await prisma.reminderLog.create({
          data: {
            appointmentId,
            type,
          },
        });
      } catch (error) {
        console.error("REMINDER WORKER ERROR:", error);
        throw error;
      }
    }),
    {
      connection: getWorkerRedisConnection(),
      concurrency: 5,
    }
  );

  globalForBookingReminderWorker.__sylphBookingReminderWorker = worker;
  return worker;
};

export const closeBookingReminderWorker = async () => {
  await globalForBookingReminderWorker.__sylphBookingReminderWorker
    ?.close()
    .catch(() => undefined);
  globalForBookingReminderWorker.__sylphBookingReminderWorker = undefined;
};
