import { Worker } from "bullmq";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import { publishCRMRefreshEvent } from "../services/crm/refreshEvents.service";
import { sendWhatsAppMessage } from "../services/whatsapp.service";
import { sendAIFollowup } from "../services/aiFollowup.service";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const globalForBookingMonitorWorker = globalThis as typeof globalThis & {
  __sylphBookingMonitorWorker?: Worker | null;
};

export const initBookingMonitorWorker = () => {
  if (!shouldRunWorker) {
    console.log("[bookingMonitor.worker] RUN_WORKER disabled, worker not started");
    return null;
  }

  if (globalForBookingMonitorWorker.__sylphBookingMonitorWorker) {
    return globalForBookingMonitorWorker.__sylphBookingMonitorWorker;
  }

  const worker = new Worker(
    "booking-monitor",
    withRedisWorkerFailSafe("booking-monitor", async () => {
      try {
        const now = new Date();

        const missedAppointments = await prisma.appointment.findMany({
          where: {
            status: "CONFIRMED",
            startTime: {
              lt: new Date(now.getTime() - 10 * 60 * 1000),
            },
          },
          include: { lead: true },
          take: 50,
        });

        for (const appointment of missedAppointments) {
          try {
            if (appointment.status !== "CONFIRMED") {
              continue;
            }

            await prisma.appointment.update({
              where: { id: appointment.id },
              data: { status: "MISSED" },
            });

            if (appointment.leadId) {
              await publishCRMRefreshEvent({
                businessId: appointment.businessId,
                leadId: appointment.leadId,
                event: "booking_missed",
              });
            }

            try {
              const { setConversationState } = await import(
                "../services/conversationState.service"
              );

              if (appointment.lead?.id) {
                await setConversationState(appointment.lead.id, "RESCHEDULE_FLOW", {
                  context: { from: "MISSED_BOOKING" },
                });
              }
            } catch (error) {
              console.error("STATE SET ERROR:", error);
            }

            let finalPhone: string | null = null;

            if (appointment.lead?.phone) {
              const raw = appointment.lead.phone.replace(/\D/g, "");
              finalPhone = raw.startsWith("91") ? raw : `91${raw}`;
            }

            if (finalPhone) {
              await sendWhatsAppMessage({
                to: finalPhone,
                message:
                  "We missed you today.\n\nWould you like to reschedule your appointment?",
              });
            }

            if (appointment.lead?.id) {
              sendAIFollowup(appointment.lead.id).catch((error) => {
                console.error("AI FOLLOWUP ERROR:", error);
              });
            }

            prisma.analytics
              .create({
                data: {
                  businessId: appointment.businessId,
                  type: "BOOKING_MISSED",
                  meta: {
                    appointmentId: appointment.id,
                    leadId: appointment.leadId,
                    time: new Date(),
                  },
                },
              })
              .catch(() => undefined);
          } catch (error) {
            console.error("ERROR PROCESSING APPOINTMENT:", appointment.id, error);
          }
        }
      } catch (error) {
        console.error("BOOKING MONITOR ERROR:", error);
      }
    }),
    {
      connection: getWorkerRedisConnection(),
      concurrency: 1,
    }
  );

  globalForBookingMonitorWorker.__sylphBookingMonitorWorker = worker;
  return worker;
};

export const closeBookingMonitorWorker = async () => {
  await globalForBookingMonitorWorker.__sylphBookingMonitorWorker
    ?.close()
    .catch(() => undefined);
  globalForBookingMonitorWorker.__sylphBookingMonitorWorker = undefined;
};
