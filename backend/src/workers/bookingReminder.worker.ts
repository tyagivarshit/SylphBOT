import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import { redisConnection } from "../config/redis";
import { BOOKING_REMINDER_QUEUE_NAME } from "../queues/bookingReminder.queue";

/*
=========================================================
BOOKING REMINDER WORKER (SAAS LEVEL)
=========================================================
*/

type ReminderJob = {
  type: "CONFIRMATION" | "MORNING" | "BEFORE_30_MIN";
  appointmentId: string;
};

export const bookingReminderWorker = new Worker<ReminderJob>(
  BOOKING_REMINDER_QUEUE_NAME,
  async (job) => {
    const { type, appointmentId } = job.data;

    try {
      console.log(`🔔 Processing ${type} for ${appointmentId}`);

      /* =================================================
      FETCH APPOINTMENT
      ================================================= */

      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          lead: true,
        },
      });

      if (!appointment) {
        console.log("❌ Appointment not found:", appointmentId);
        return;
      }

      /* =================================================
      🔥 SAFETY CHECKS (IMPORTANT)
      ================================================= */

      // ❌ skip if cancelled
      if (appointment.status !== "BOOKED") {
        console.log("⚠️ Skipping - not active booking");
        return;
      }

      // ❌ skip if already passed (for safety)
      if (new Date(appointment.startTime).getTime() < Date.now()) {
        console.log("⚠️ Skipping - past appointment");
        return;
      }

      const lead = appointment.lead;

      if (!lead?.phone) {
        console.log("❌ No phone number for lead");
        return;
      }

      const formattedTime = new Date(
        appointment.startTime
      ).toLocaleString();

      /* =================================================
      🔥 MESSAGE BUILDER
      ================================================= */

      let message = "";

      switch (type) {
        case "CONFIRMATION":
          message = `✅ Your meeting is confirmed!

📅 ${formattedTime}

We’ll connect with you soon 🚀`;
          break;

        case "MORNING":
          message = `🌅 Good morning!

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
          console.log("❌ Unknown reminder type:", type);
          return;
      }

      /* =================================================
      📲 SEND MESSAGE
      ================================================= */

      const sent = await sendWhatsAppMessage({
        to: lead.phone,
        message,
      });

      if (!sent) {
        throw new Error("WhatsApp send failed");
      }

      console.log(`✅ ${type} sent to ${lead.phone}`);

    } catch (error) {
      console.error("❌ REMINDER WORKER ERROR:", error);
      throw error; // retry trigger
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);