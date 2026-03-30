import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import { redisConnection } from "../config/redis";
import { BOOKING_REMINDER_QUEUE_NAME } from "../queues/bookingReminder.queue";

/*
=========================================================
BOOKING REMINDER WORKER (FINAL PRO)
=========================================================
*/

type ReminderJob = {
  type: "CONFIRMATION" | "MORNING" | "BEFORE_30_MIN";
  appointmentId: string;
};

export const bookingReminderWorker = new Worker<ReminderJob>(
  BOOKING_REMINDER_QUEUE_NAME, // ✅ sync with queue
  async (job) => {
    try {
      const { type, appointmentId } = job.data;

      /* =================================================
      FETCH APPOINTMENT
      ================================================= */

      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          lead: true,
          business: true,
        },
      });

      if (!appointment) {
        console.log("❌ Appointment not found:", appointmentId);
        return;
      }

      const { lead, startTime } = appointment;

      if (!lead?.phone) {
        console.log("❌ No phone number for lead");
        return;
      }

      const formattedTime = new Date(startTime).toLocaleString();

      /* =================================================
      MESSAGE GENERATOR
      ================================================= */

      let message = "";

      switch (type) {
        case "CONFIRMATION":
          message = `✅ Your meeting has been booked successfully!

📅 Date & Time: ${formattedTime}

We look forward to speaking with you 🚀`;
          break;

        case "MORNING":
          message = `🌅 Good morning!

Reminder: You have a meeting today.

📅 Time: ${formattedTime}

Be ready 👍`;
          break;

        case "BEFORE_30_MIN":
          message = `⏰ Your meeting starts in 30 minutes.

📅 Time: ${formattedTime}

Please join on time 🚀`;
          break;

        default:
          console.log("❌ Unknown reminder type:", type);
          return;
      }

      /* =================================================
      SEND WHATSAPP
      ================================================= */

      const sent = await sendWhatsAppMessage({
        to: lead.phone,
        message,
      });

      if (!sent) {
        throw new Error("WhatsApp send failed");
      }

      console.log(`✅ ${type} reminder sent to ${lead.phone}`);
    } catch (error) {
      console.error("❌ BOOKING REMINDER WORKER ERROR:", error);
      throw error; // 🔥 important → retry trigger karega
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);