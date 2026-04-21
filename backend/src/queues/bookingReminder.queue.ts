import { JobsOptions, Queue } from "bullmq";
import prisma from "../config/prisma";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

/*
=========================================================
BOOKING REMINDER QUEUE (SAAS LEVEL)
=========================================================
*/

export type BookingReminderJobData = {
  type: "CONFIRMATION" | "MORNING" | "BEFORE_30_MIN";
  appointmentId: string;
};

export const BOOKING_REMINDER_QUEUE_NAME: string = "booking";
export const LEGACY_BOOKING_REMINDER_QUEUE_NAME: string =
  "booking-reminder-queue";

const queueConnection = getQueueRedisConnection();
const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  backoff: {
    type: "exponential",
    delay: 5000,
  },
});

export const bookingReminderQueue = createResilientQueue(
  new Queue<BookingReminderJobData>(
    BOOKING_REMINDER_QUEUE_NAME,
    {
      connection: queueConnection,
      defaultJobOptions,
    }
  ),
  BOOKING_REMINDER_QUEUE_NAME
);

export const legacyBookingReminderQueue =
  LEGACY_BOOKING_REMINDER_QUEUE_NAME === BOOKING_REMINDER_QUEUE_NAME
    ? bookingReminderQueue
    : createResilientQueue(
        new Queue<BookingReminderJobData>(LEGACY_BOOKING_REMINDER_QUEUE_NAME, {
          connection: queueConnection,
          defaultJobOptions,
        }),
        LEGACY_BOOKING_REMINDER_QUEUE_NAME
      );

/*
=========================================================
CORE: SCHEDULE ALL REMINDERS (IMPORTANT)
=========================================================
*/

export const scheduleReminderJobs = async (appointmentId: string) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      console.log("No appointment found for reminders");
      return;
    }

    const queueReminderJob = async (
      name: string,
      type: "CONFIRMATION" | "MORNING" | "BEFORE_30_MIN",
      delay = 0
    ) => {
      const jobId = `booking:${appointmentId}:${type}`;
      const existing =
        (await bookingReminderQueue.getJob(jobId)) ||
        (await legacyBookingReminderQueue.getJob(jobId));

      if (existing) {
        await existing.remove().catch(() => undefined);
      }

      await bookingReminderQueue.add(
        name,
        {
          type,
          appointmentId,
        },
        buildQueueJobOptions({
          jobId,
          delay,
        })
      );
    };

    const now = Date.now();
    const startTime = new Date(appointment.startTime).getTime();

    await queueReminderJob("confirmation", "CONFIRMATION");

    const morningTime = new Date(appointment.startTime);
    morningTime.setHours(9, 0, 0, 0);

    const morningDelay = morningTime.getTime() - now;

    if (morningDelay > 0) {
      await queueReminderJob("morning", "MORNING", morningDelay);
    }

    const before30 = startTime - 30 * 60 * 1000;
    const before30Delay = before30 - now;

    if (before30Delay > 0) {
      await queueReminderJob("before_30", "BEFORE_30_MIN", before30Delay);
    }

    console.log("Reminder jobs scheduled:", appointmentId);
  } catch (error) {
    console.error("REMINDER SCHEDULER ERROR:", error);
  }
};
