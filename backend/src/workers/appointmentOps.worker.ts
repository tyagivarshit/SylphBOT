import { Job, Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import {
  APPOINTMENT_OPS_QUEUE_NAME,
  type AppointmentOpsJobPayload,
} from "../queues/appointmentOps.queue";
import { appointmentReminderService } from "../services/appointmentReminder.service";
import { noShowRecoveryService } from "../services/noShowRecovery.service";
import { appointmentEngineService } from "../services/appointmentEngine.service";
import { waitlistEngineService } from "../services/waitlistEngine.service";
import { calendarSyncService } from "../services/calendarSync.service";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const globalForAppointmentOpsWorker = globalThis as typeof globalThis & {
  __sylphAppointmentOpsWorker?: Worker<AppointmentOpsJobPayload> | null;
};

const processAppointmentOpsJob = async (
  job: Job<AppointmentOpsJobPayload>
) => {
  const payload = job.data;

  switch (payload.type) {
    case "APPOINTMENT_REMINDER_SEND":
      await appointmentReminderService.processReminderJob({
        reminderId: payload.reminderId,
      });
      return;
    case "APPOINTMENT_NO_SHOW_CHECK":
      await noShowRecoveryService.processNoShow({
        businessId: payload.businessId,
        appointmentKey: payload.appointmentKey,
        isVip: Boolean(payload.isVip),
      });
      return;
    case "APPOINTMENT_HOLD_EXPIRE_SWEEP":
      await appointmentEngineService.reconcileExpiredHolds();
      return;
    case "APPOINTMENT_WAITLIST_FILL":
      await waitlistEngineService.fillFreedSlot({
        businessId: payload.businessId,
        slotId: payload.slotId,
      });
      return;
    case "APPOINTMENT_CALENDAR_REPLAY":
      await calendarSyncService.reconcileExternalWebhook({
        businessId: payload.businessId,
        provider: payload.provider,
        externalEventId: payload.externalEventId,
        externalEventVersion: payload.externalEventVersion || null,
        dedupeFingerprint: payload.dedupeFingerprint,
        externalUpdatedAt: new Date(payload.externalUpdatedAtIso),
        cancelled: Boolean(payload.cancelled),
        startAt: payload.startAtIso ? new Date(payload.startAtIso) : null,
        endAt: payload.endAtIso ? new Date(payload.endAtIso) : null,
        metadata: payload.metadata || null,
      });
      return;
    default:
      throw new Error(`unsupported_appointment_ops_job:${(payload as any).type}`);
  }
};

export const initAppointmentOpsWorker = () => {
  if (!shouldRunWorker) {
    return null;
  }

  if (globalForAppointmentOpsWorker.__sylphAppointmentOpsWorker) {
    return globalForAppointmentOpsWorker.__sylphAppointmentOpsWorker;
  }

  const worker = new Worker<AppointmentOpsJobPayload>(
    APPOINTMENT_OPS_QUEUE_NAME,
    withRedisWorkerFailSafe(APPOINTMENT_OPS_QUEUE_NAME, processAppointmentOpsJob),
    {
      connection: getWorkerRedisConnection(),
      concurrency: 8,
    }
  );

  globalForAppointmentOpsWorker.__sylphAppointmentOpsWorker = worker;
  return worker;
};

export const closeAppointmentOpsWorker = async () => {
  await globalForAppointmentOpsWorker.__sylphAppointmentOpsWorker
    ?.close()
    .catch(() => undefined);
  globalForAppointmentOpsWorker.__sylphAppointmentOpsWorker = undefined;
};
