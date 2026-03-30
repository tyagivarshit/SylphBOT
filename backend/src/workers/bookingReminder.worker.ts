import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import { redisConnection } from "../config/redis";

/*
=========================================================
BOOKING REMINDER WORKER
Handles:
1. Booking confirmation message
2. Morning reminder
3. 30 min before reminder
=========================================================
*/

const QUEUE_NAME = "booking-reminder-queue";

type ReminderJob = {
  type: "CONFIRMATION" | "MORNING" | "BEFORE_30_MIN";
  appointmentId: string;
};

export const bookingReminderWorker = new Worker<ReminderJob>(
  QUEUE_NAME,
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

      const { lead, startTime, business } = appointment;

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

We look forward to speaking with you.`;
          break;

        case "MORNING":
          message = `🌅 Reminder: You have a meeting scheduled today.

📅 Time: ${formattedTime}

Please be ready.`;
          break;

        case "BEFORE_30_MIN":
          message = `⏰ Your meeting starts in 30 minutes.

📅 Time: ${formattedTime}

Join on time.`;
          break;

        default:
          console.log("❌ Unknown reminder type");
          return;
      }

      /* =================================================
      SEND WHATSAPP MESSAGE
      ================================================= */

      await sendWhatsAppMessage({
        to: lead.phone,
        message,
      });

      console.log(`✅ ${type} reminder sent to ${lead.phone}`);
    } catch (error) {
      console.error("❌ BOOKING REMINDER WORKER ERROR:", error);
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);