import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import { sendAIFollowup } from "../services/aiFollowup.service";
/*
=========================================================
MISSED BOOKING MONITOR (PRODUCTION SAFE)
=========================================================
*/

export const bookingMonitorWorker =
  process.env.RUN_WORKER === "true"
    ? new Worker(
  "booking-monitor",
  withRedisWorkerFailSafe("booking-monitor", async () => {
    try {
      const now = new Date();

      console.log("🧠 Running booking monitor...");

      /* =================================================
      🔥 LIMIT QUERY (SCALABLE)
      ================================================= */
      const missedAppointments = await prisma.appointment.findMany({
        where: {
          status: "BOOKED",
          startTime: {
            lt: new Date(now.getTime() - 10 * 60 * 1000),
          },
        },
        include: { lead: true },
        take: 50, // 🔥 IMPORTANT (batch processing)
      });

      for (const appt of missedAppointments) {
        try {
          /* =================================================
          🔒 DOUBLE CHECK (ANTI DUPLICATE)
          ================================================= */
          if (appt.status !== "BOOKED") continue;

          /* =================================================
          🔥 MARK MISSED
          ================================================= */
          await prisma.appointment.update({
            where: { id: appt.id },
            data: { status: "MISSED" },
          });
          /* =================================================
🧠 SET RESCHEDULE STATE (NEW)
================================================= */
try {
  const { setConversationState } = await import(
    "../services/conversationState.service"
  );

  if (appt.lead?.id) {
  await setConversationState(appt.lead.id, "RESCHEDULE_FLOW", {
    context: { from: "MISSED_BOOKING" },
  });

  console.log("🧠 RESCHEDULE STATE SET:", appt.lead.id);
}

  console.log("🧠 RESCHEDULE STATE SET:", appt.leadId);
} catch (err) {
  console.error("❌ STATE SET ERROR:", err);
}

          console.log("⚠️ Marked MISSED:", appt.id);

          /* =================================================
          📞 FORMAT PHONE
          ================================================= */
          let finalPhone: string | null = null;

          if (appt.lead?.phone) {
            const raw = appt.lead.phone.replace(/\D/g, "");
            finalPhone = raw.startsWith("91") ? raw : `91${raw}`;
          }

          /* =================================================
          📲 SEND WHATSAPP
          ================================================= */
          if (finalPhone) {
            await sendWhatsAppMessage({
              to: finalPhone,
              message: `😔 We missed you today.

Would you like to reschedule your appointment?

Reply YES and we’ll set it up again 👍`,
            });
          }

          /* =================================================
          🤖 AI FOLLOWUP (NON BLOCKING)
          ================================================= */
          if (appt.lead?.id) {
            sendAIFollowup(appt.lead.id).catch((err) => {
              console.error("❌ AI FOLLOWUP ERROR:", err);
            });
          }

          /* =================================================
          📊 ANALYTICS (SAFE)
          ================================================= */
          prisma.analytics.create({
            data: {
              businessId: appt.businessId,
              type: "BOOKING_MISSED",
              meta: {
                appointmentId: appt.id,
                leadId: appt.leadId,
                time: new Date(),
              },
            },
          }).catch(() => {});

        } catch (err) {
          console.error("❌ ERROR PROCESSING APPT:", appt.id, err);
        }
      }

    } catch (error) {
      console.error("❌ BOOKING MONITOR ERROR:", error);
    }
  }),
  {
    connection: getWorkerRedisConnection(),
    concurrency: 1, // 🔥 IMPORTANT (avoid race condition)
  }
)
    : null;
