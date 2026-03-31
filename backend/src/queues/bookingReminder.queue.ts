import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";
import prisma from "../config/prisma";

/*
=========================================================
BOOKING REMINDER QUEUE (SAAS LEVEL)
=========================================================
*/

export const BOOKING_REMINDER_QUEUE_NAME = "booking-reminder-queue";

export const bookingReminderQueue = new Queue(
  BOOKING_REMINDER_QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  }
);

/*
=========================================================
🔥 CORE: SCHEDULE ALL REMINDERS (IMPORTANT)
=========================================================
*/

export const scheduleReminderJobs = async (appointmentId: string) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      console.log("❌ No appointment found for reminders");
      return;
    }

    const now = Date.now();
    const startTime = new Date(appointment.startTime).getTime();

    /* =================================================
    🔥 1. INSTANT CONFIRMATION
    ================================================= */
    await bookingReminderQueue.add("confirmation", {
      type: "CONFIRMATION",
      appointmentId,
    });

    /* =================================================
    🌅 2. MORNING REMINDER (9 AM SAME DAY)
    ================================================= */
    const morningTime = new Date(appointment.startTime);
    morningTime.setHours(9, 0, 0, 0);

    const morningDelay = morningTime.getTime() - now;

    if (morningDelay > 0) {
      await bookingReminderQueue.add(
        "morning",
        {
          type: "MORNING",
          appointmentId,
        },
        { delay: morningDelay }
      );
    }

    /* =================================================
    ⏰ 3. 30 MIN BEFORE REMINDER
    ================================================= */
    const before30 = startTime - 30 * 60 * 1000;
    const before30Delay = before30 - now;

    if (before30Delay > 0) {
      await bookingReminderQueue.add(
        "before_30",
        {
          type: "BEFORE_30_MIN",
          appointmentId,
        },
        { delay: before30Delay }
      );
    }

    console.log("✅ Reminder jobs scheduled:", appointmentId);

  } catch (error) {
    console.error("❌ REMINDER SCHEDULER ERROR:", error);
  }
};