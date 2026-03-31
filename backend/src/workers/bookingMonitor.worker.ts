import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { redisConnection } from "../config/redis";
import { sendWhatsAppMessage } from "../services/whatsapp.service";

/* 🔥 NEW ADD */
import { sendAIFollowup } from "../services/aiFollowup.service";

/*
=========================================================
MISSED BOOKING MONITOR (RUNS EVERY FEW MINUTES)
=========================================================
*/

export const bookingMonitorWorker = new Worker(
  "booking-monitor",
  async () => {
    try {
      const now = new Date();

      const missedAppointments = await prisma.appointment.findMany({
        where: {
          status: "BOOKED",
          startTime: {
            lt: new Date(now.getTime() - 10 * 60 * 1000), // 10 min buffer
          },
        },
        include: {
          lead: true,
        },
      });

      for (const appt of missedAppointments) {
        /* 🔥 MARK MISSED */
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { status: "MISSED" },
        });

        /* 🔥 SEND FOLLOWUP */
        if (appt.lead?.phone) {
          await sendWhatsAppMessage({
            to: appt.lead.phone,
            message: `😔 We missed you today.

Would you like to reschedule your appointment?

Reply YES and we’ll set it up again 👍`,
          });
        }

        console.log("⚠️ Marked MISSED:", appt.id);

        /* =================================================
        🤖 AI FOLLOWUP (SAFE ADD)
        ================================================= */
        try {
          if (appt.lead?.id) {
            await sendAIFollowup(appt.lead.id);
          }
        } catch (err) {
          console.error("❌ AI FOLLOWUP ERROR:", err);
        }

        /* =================================================
        📊 ANALYTICS TRACKING (SAFE ADD)
        ================================================= */
        try {
          await prisma.analytics.create({
            data: {
              businessId: appt.businessId,
              type: "BOOKING_MISSED",
              meta: {
                appointmentId: appt.id,
                leadId: appt.leadId,
                time: new Date(),
              },
            },
          });
        } catch (err) {
          console.error("❌ ANALYTICS ERROR:", err);
        }
      }

    } catch (error) {
      console.error("❌ BOOKING MONITOR ERROR:", error);
    }
  },
  {
    connection: redisConnection,
  }
);