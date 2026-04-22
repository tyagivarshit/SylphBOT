import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import { BOOKING_REMINDER_QUEUE_NAME } from "../queues/bookingReminder.queue";

type ReminderJob = {
  type: "CONFIRMATION" | "MORNING" | "BEFORE_30_MIN";
  appointmentId: string;
};

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

export const bookingReminderWorker =
  shouldRunWorker
    ? new Worker<ReminderJob>(
        BOOKING_REMINDER_QUEUE_NAME,
        withRedisWorkerFailSafe(BOOKING_REMINDER_QUEUE_NAME, async (job) => {
          const { type, appointmentId } = job.data;

          try {
            console.log(`Processing ${type} for ${appointmentId}`);

            const appointment = await prisma.appointment.findUnique({
              where: { id: appointmentId },
              include: { lead: true },
            });

            if (!appointment) {
              console.log("Appointment not found:", appointmentId);
              return;
            }

            if (appointment.status !== "BOOKED") {
              console.log("Skipping reminder because booking is not active");
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
                message = `✅ Your meeting is confirmed!

📅 ${formattedTime}

We’ll connect with you soon 🚀`;
                break;
              case "MORNING":
                message = `🌄 Good morning!

Reminder: You have a meeting today.

📅 ${formattedTime}

See you soon 👍`;
                break;
              case "BEFORE_30_MIN":
                message = `⏰ Your meeting starts in 30 minutes.

📅 ${formattedTime}

Please be ready 🚀`;
                break;
              default:
                console.log("Unknown reminder type:", type);
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
      )
    : null;

if (!shouldRunWorker) {
  console.log("[bookingReminder.worker] RUN_WORKER disabled, worker not started");
}
