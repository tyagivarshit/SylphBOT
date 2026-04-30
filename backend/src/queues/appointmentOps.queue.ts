import { JobsOptions, Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import { buildQueueJobOptions, createResilientQueue } from "./queue.defaults";

export const APPOINTMENT_OPS_QUEUE_NAME = "appointment-ops";

export type AppointmentReminderJobPayload = {
  type: "APPOINTMENT_REMINDER_SEND";
  reminderId: string;
  dedupeKey: string;
};

export type AppointmentNoShowJobPayload = {
  type: "APPOINTMENT_NO_SHOW_CHECK";
  businessId: string;
  appointmentKey: string;
  isVip?: boolean;
};

export type AppointmentHoldExpiryJobPayload = {
  type: "APPOINTMENT_HOLD_EXPIRE_SWEEP";
};

export type AppointmentWaitlistFillJobPayload = {
  type: "APPOINTMENT_WAITLIST_FILL";
  businessId: string;
  slotId: string;
};

export type AppointmentCalendarReplayPayload = {
  type: "APPOINTMENT_CALENDAR_REPLAY";
  businessId: string;
  provider: string;
  externalEventId: string;
  externalEventVersion?: string | null;
  dedupeFingerprint: string;
  externalUpdatedAtIso: string;
  cancelled?: boolean;
  startAtIso?: string | null;
  endAtIso?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AppointmentOpsJobPayload =
  | AppointmentReminderJobPayload
  | AppointmentNoShowJobPayload
  | AppointmentHoldExpiryJobPayload
  | AppointmentWaitlistFillJobPayload
  | AppointmentCalendarReplayPayload;

const globalForAppointmentOpsQueue = globalThis as typeof globalThis & {
  __sylphAppointmentOpsQueue?: Queue<AppointmentOpsJobPayload>;
};

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
});

export const initAppointmentOpsQueue = () => {
  if (!globalForAppointmentOpsQueue.__sylphAppointmentOpsQueue) {
    globalForAppointmentOpsQueue.__sylphAppointmentOpsQueue = createResilientQueue(
      new Queue<AppointmentOpsJobPayload>(APPOINTMENT_OPS_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        defaultJobOptions,
      }),
      APPOINTMENT_OPS_QUEUE_NAME
    );
  }

  return globalForAppointmentOpsQueue.__sylphAppointmentOpsQueue;
};

export const getAppointmentOpsQueue = () => initAppointmentOpsQueue();

export const enqueueAppointmentReminderJob = async ({
  reminderId,
  dedupeKey,
}: {
  reminderId: string;
  dedupeKey: string;
}) =>
  getAppointmentOpsQueue().add(
    "appointment-reminder-send",
    {
      type: "APPOINTMENT_REMINDER_SEND",
      reminderId,
      dedupeKey,
    },
    buildQueueJobOptions({
      jobId: `appointment_reminder:${dedupeKey}`,
    })
  );

export const enqueueAppointmentNoShowJob = async ({
  businessId,
  appointmentKey,
  isVip = false,
}: {
  businessId: string;
  appointmentKey: string;
  isVip?: boolean;
}) =>
  getAppointmentOpsQueue().add(
    "appointment-no-show",
    {
      type: "APPOINTMENT_NO_SHOW_CHECK",
      businessId,
      appointmentKey,
      isVip,
    },
    buildQueueJobOptions({
      jobId: `appointment_noshow:${businessId}:${appointmentKey}`,
    })
  );

export const enqueueAppointmentHoldExpirySweep = async () =>
  getAppointmentOpsQueue().add(
    "appointment-hold-expiry",
    {
      type: "APPOINTMENT_HOLD_EXPIRE_SWEEP",
    },
    buildQueueJobOptions({
      jobId: `appointment_hold_expiry_sweep:${Math.floor(Date.now() / 60_000)}`,
    })
  );

export const enqueueAppointmentWaitlistFillJob = async ({
  businessId,
  slotId,
}: {
  businessId: string;
  slotId: string;
}) =>
  getAppointmentOpsQueue().add(
    "appointment-waitlist-fill",
    {
      type: "APPOINTMENT_WAITLIST_FILL",
      businessId,
      slotId,
    },
    buildQueueJobOptions({
      jobId: `appointment_waitlist_fill:${businessId}:${slotId}:${Math.floor(
        Date.now() / 60_000
      )}`,
    })
  );

export const enqueueAppointmentCalendarReplayJob = async (
  payload: Omit<AppointmentCalendarReplayPayload, "type">
) =>
  getAppointmentOpsQueue().add(
    "appointment-calendar-replay",
    {
      type: "APPOINTMENT_CALENDAR_REPLAY",
      ...payload,
    },
    buildQueueJobOptions({
      jobId: `appointment_calendar_replay:${payload.businessId}:${payload.provider}:${payload.externalEventId}:${payload.dedupeFingerprint}`,
    })
  );

export const closeAppointmentOpsQueue = async () => {
  await globalForAppointmentOpsQueue.__sylphAppointmentOpsQueue
    ?.close()
    .catch(() => undefined);
  globalForAppointmentOpsQueue.__sylphAppointmentOpsQueue = undefined;
};
