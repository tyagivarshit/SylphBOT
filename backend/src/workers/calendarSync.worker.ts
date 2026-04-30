import { Job, Worker } from "bullmq";
import prisma from "../config/prisma";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import {
  CALENDAR_SYNC_QUEUE_NAME,
  enqueueCalendarSyncDLQJob,
  type CalendarSyncJobPayload,
} from "../queues/calendarSync.queue";
import { calendarSyncService } from "../services/calendarSync.service";
import {
  hasOutboxConsumerCheckpoint,
  markOutboxConsumerCheckpoint,
} from "../services/eventOutbox.service";
import logger from "../utils/logger";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const CALENDAR_SYNC_OUTBOX_CONSUMER_KEY = "calendar_sync.worker";

const globalForCalendarSyncWorker = globalThis as typeof globalThis & {
  __sylphCalendarSyncWorker?: Worker<CalendarSyncJobPayload> | null;
};

const processCalendarSyncJob = async (job: Job<CalendarSyncJobPayload>) => {
  const payload = job.data;

  switch (payload.type) {
    case "CALENDAR_SYNC_OUTBOX_EVENT": {
      const outbox = await prisma.eventOutbox.findUnique({
        where: {
          id: payload.outboxId,
        },
      });

      if (!outbox) {
        return;
      }

      const alreadyProcessed = await hasOutboxConsumerCheckpoint({
        eventOutboxId: outbox.id,
        consumerKey: CALENDAR_SYNC_OUTBOX_CONSUMER_KEY,
      });

      if (alreadyProcessed) {
        return;
      }

      await calendarSyncService.processProviderSyncFromOutbox({
        outboxId: outbox.id,
        eventType: outbox.eventType,
        payload: outbox.payload as any,
      });

      await markOutboxConsumerCheckpoint({
        eventOutboxId: outbox.id,
        consumerKey: CALENDAR_SYNC_OUTBOX_CONSUMER_KEY,
      });
      return;
    }
    case "CALENDAR_SYNC_WEBHOOK_RECONCILE":
      await calendarSyncService.reconcileExternalWebhook({
        businessId: payload.businessId,
        provider: payload.provider,
        externalEventId: payload.externalEventId,
        externalUpdatedAt: new Date(payload.externalUpdatedAtIso),
        externalEventVersion: payload.externalEventVersion || null,
        dedupeFingerprint: payload.dedupeFingerprint,
        cancelled: Boolean(payload.cancelled),
        startAt: payload.startAtIso ? new Date(payload.startAtIso) : null,
        endAt: payload.endAtIso ? new Date(payload.endAtIso) : null,
        metadata: payload.metadata || null,
      });
      return;
    case "CALENDAR_SYNC_PROVIDER_HEALTH_SWEEP":
      await calendarSyncService.refreshProviderHealth({
        watchCallbackUrl: payload.watchCallbackUrl,
      });
      return;
    default:
      throw new Error(`unsupported_calendar_sync_job:${(payload as any).type}`);
  }
};

export const initCalendarSyncWorker = () => {
  if (!shouldRunWorker) {
    return null;
  }

  if (globalForCalendarSyncWorker.__sylphCalendarSyncWorker) {
    return globalForCalendarSyncWorker.__sylphCalendarSyncWorker;
  }

  const worker = new Worker<CalendarSyncJobPayload>(
    CALENDAR_SYNC_QUEUE_NAME,
    withRedisWorkerFailSafe(CALENDAR_SYNC_QUEUE_NAME, processCalendarSyncJob),
    {
      connection: getWorkerRedisConnection(),
      concurrency: 6,
    }
  );

  worker.on("failed", async (job, error) => {
    logger.error(
      {
        queueName: CALENDAR_SYNC_QUEUE_NAME,
        jobId: job?.id || null,
        attemptsMade: job?.attemptsMade || 0,
        maxAttempts: Number(job?.opts?.attempts || 1),
        error,
      },
      "Calendar sync worker job failed"
    );

    if (!job) {
      return;
    }

    const maxAttempts = Number(job.opts.attempts || 1);
    const attemptsMade = Number(job.attemptsMade || 0);

    if (attemptsMade < maxAttempts) {
      return;
    }

    await enqueueCalendarSyncDLQJob({
      event: job.data,
      failedAtIso: new Date().toISOString(),
      attemptsMade,
      error: String((error as any)?.message || error || "calendar_sync_worker_failed"),
    }).catch(() => undefined);
  });

  globalForCalendarSyncWorker.__sylphCalendarSyncWorker = worker;
  return worker;
};

export const closeCalendarSyncWorker = async () => {
  await globalForCalendarSyncWorker.__sylphCalendarSyncWorker
    ?.close()
    .catch(() => undefined);
  globalForCalendarSyncWorker.__sylphCalendarSyncWorker = undefined;
};
