import { JobsOptions, Queue } from "bullmq";
import prisma from "../config/prisma";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

export type BookingReminderJobData = {
  type: "CONFIRMATION" | "MORNING" | "BEFORE_30_MIN";
  appointmentId: string;
  businessId: string;
};

export const BOOKING_REMINDER_QUEUE_NAME = "booking";

const globalForBookingReminderQueue = globalThis as typeof globalThis & {
  __sylphBookingReminderQueue?: Queue<BookingReminderJobData>;
};

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  backoff: {
    type: "exponential",
    delay: 5000,
  },
});

export const initBookingReminderQueue = () => {
  if (!globalForBookingReminderQueue.__sylphBookingReminderQueue) {
    globalForBookingReminderQueue.__sylphBookingReminderQueue = createResilientQueue(
      new Queue<BookingReminderJobData>(BOOKING_REMINDER_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        defaultJobOptions,
      }),
      BOOKING_REMINDER_QUEUE_NAME
    );
  }

  return globalForBookingReminderQueue.__sylphBookingReminderQueue;
};

export const getBookingReminderQueue = () => initBookingReminderQueue();

export const scheduleReminderJobs = async ({
  appointmentId,
  businessId,
}: {
  appointmentId: string;
  businessId: string;
}) => {
  try {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        businessId,
      },
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
      const queue = getBookingReminderQueue();
      const jobId = `booking:${businessId}:${appointmentId}:${type}`;
      const existing = await queue.getJob(jobId);

      if (existing) {
        await existing.remove().catch(() => undefined);
      }

      await queue.add(
        name,
        {
          type,
          appointmentId,
          businessId,
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

export const closeBookingReminderQueue = async () => {
  await globalForBookingReminderQueue.__sylphBookingReminderQueue
    ?.close()
    .catch(() => undefined);
  globalForBookingReminderQueue.__sylphBookingReminderQueue = undefined;
};
