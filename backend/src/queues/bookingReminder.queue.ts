import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

/*
=========================================================
BOOKING REMINDER QUEUE
Handles:
- Confirmation (instant)
- Morning reminder (scheduled)
- 30 min before reminder (scheduled)
=========================================================
*/

export const BOOKING_REMINDER_QUEUE_NAME = "booking-reminder-queue";

/*
=========================================================
QUEUE INSTANCE
=========================================================
*/

export const bookingReminderQueue = new Queue(
  BOOKING_REMINDER_QUEUE_NAME,
  {
    connection: redisConnection,

    defaultJobOptions: {
      attempts: 3, // retry 3 times
      backoff: {
        type: "exponential",
        delay: 5000, // retry delay
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  }
);

/*
=========================================================
HELPER FUNCTIONS (OPTIONAL BUT CLEAN)
=========================================================
*/

export const addConfirmationJob = async (appointmentId: string) => {
  return bookingReminderQueue.add("confirmation", {
    type: "CONFIRMATION",
    appointmentId,
  });
};

export const addMorningReminderJob = async (
  appointmentId: string,
  delay: number
) => {
  return bookingReminderQueue.add(
    "morning",
    {
      type: "MORNING",
      appointmentId,
    },
    { delay }
  );
};

export const addBefore30MinJob = async (
  appointmentId: string,
  delay: number
) => {
  return bookingReminderQueue.add(
    "before_30",
    {
      type: "BEFORE_30_MIN",
      appointmentId,
    },
    { delay }
  );
};