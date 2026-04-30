import { JobsOptions, Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import { buildQueueJobOptions, createResilientQueue } from "./queue.defaults";

export const CALENDAR_SYNC_QUEUE_NAME = "calendar-sync";
export const CALENDAR_SYNC_DLQ_QUEUE_NAME = "calendar-sync-dlq";

export type CalendarSyncOutboxJobPayload = {
  type: "CALENDAR_SYNC_OUTBOX_EVENT";
  outboxId: string;
};

export type CalendarSyncWebhookJobPayload = {
  type: "CALENDAR_SYNC_WEBHOOK_RECONCILE";
  businessId: string;
  provider: string;
  externalEventId: string;
  externalUpdatedAtIso: string;
  externalEventVersion?: string | null;
  dedupeFingerprint: string;
  cancelled?: boolean;
  startAtIso?: string | null;
  endAtIso?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CalendarSyncHealthSweepJobPayload = {
  type: "CALENDAR_SYNC_PROVIDER_HEALTH_SWEEP";
  watchCallbackUrl: string;
};

export type CalendarSyncJobPayload =
  | CalendarSyncOutboxJobPayload
  | CalendarSyncWebhookJobPayload
  | CalendarSyncHealthSweepJobPayload;

type CalendarSyncDLQPayload = {
  event: CalendarSyncJobPayload;
  failedAtIso: string;
  attemptsMade: number;
  error: string;
};

const globalForCalendarSyncQueue = globalThis as typeof globalThis & {
  __sylphCalendarSyncQueue?: Queue<CalendarSyncJobPayload>;
  __sylphCalendarSyncDLQ?: Queue<CalendarSyncDLQPayload>;
};

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  attempts: 6,
  backoff: {
    type: "exponential",
    delay: 1500,
  },
});

export const initCalendarSyncQueue = () => {
  if (!globalForCalendarSyncQueue.__sylphCalendarSyncQueue) {
    globalForCalendarSyncQueue.__sylphCalendarSyncQueue = createResilientQueue(
      new Queue<CalendarSyncJobPayload>(CALENDAR_SYNC_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        defaultJobOptions,
      }),
      CALENDAR_SYNC_QUEUE_NAME
    );
  }

  if (!globalForCalendarSyncQueue.__sylphCalendarSyncDLQ) {
    globalForCalendarSyncQueue.__sylphCalendarSyncDLQ = createResilientQueue(
      new Queue<CalendarSyncDLQPayload>(CALENDAR_SYNC_DLQ_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        defaultJobOptions: buildQueueJobOptions({
          attempts: 1,
        }),
      }),
      CALENDAR_SYNC_DLQ_QUEUE_NAME
    );
  }

  return {
    queue: globalForCalendarSyncQueue.__sylphCalendarSyncQueue,
    dlq: globalForCalendarSyncQueue.__sylphCalendarSyncDLQ,
  };
};

export const getCalendarSyncQueue = () => initCalendarSyncQueue().queue;
export const getCalendarSyncDLQ = () => initCalendarSyncQueue().dlq;

export const enqueueCalendarSyncOutboxEventJob = async ({
  outboxId,
}: {
  outboxId: string;
}) =>
  getCalendarSyncQueue().add(
    "calendar-sync-outbox",
    {
      type: "CALENDAR_SYNC_OUTBOX_EVENT",
      outboxId,
    },
    buildQueueJobOptions({
      jobId: `calendar_sync_outbox:${outboxId}`,
    })
  );

export const enqueueCalendarSyncWebhookJob = async (
  payload: Omit<CalendarSyncWebhookJobPayload, "type">
) =>
  getCalendarSyncQueue().add(
    "calendar-sync-webhook",
    {
      type: "CALENDAR_SYNC_WEBHOOK_RECONCILE",
      ...payload,
    },
    buildQueueJobOptions({
      jobId: `calendar_sync_webhook:${payload.businessId}:${payload.provider}:${payload.externalEventId}:${payload.dedupeFingerprint}`,
    })
  );

export const enqueueCalendarSyncHealthSweepJob = async ({
  watchCallbackUrl,
}: {
  watchCallbackUrl: string;
}) =>
  getCalendarSyncQueue().add(
    "calendar-sync-health-sweep",
    {
      type: "CALENDAR_SYNC_PROVIDER_HEALTH_SWEEP",
      watchCallbackUrl,
    },
    buildQueueJobOptions({
      jobId: `calendar_sync_health:${Math.floor(Date.now() / (5 * 60_000))}`,
    })
  );

export const enqueueCalendarSyncDLQJob = async ({
  event,
  failedAtIso,
  attemptsMade,
  error,
}: {
  event: CalendarSyncJobPayload;
  failedAtIso: string;
  attemptsMade: number;
  error: string;
}) =>
  getCalendarSyncDLQ().add(
    "calendar-sync-dead-letter",
    {
      event,
      failedAtIso,
      attemptsMade,
      error,
    },
    buildQueueJobOptions({
      attempts: 1,
      jobId: `calendar_sync_dlq:${event.type}:${failedAtIso}:${Math.floor(
        Math.random() * 100_000
      )}`,
    })
  );

export const closeCalendarSyncQueue = async () => {
  await globalForCalendarSyncQueue.__sylphCalendarSyncQueue
    ?.close()
    .catch(() => undefined);
  await globalForCalendarSyncQueue.__sylphCalendarSyncDLQ
    ?.close()
    .catch(() => undefined);
  globalForCalendarSyncQueue.__sylphCalendarSyncQueue = undefined;
  globalForCalendarSyncQueue.__sylphCalendarSyncDLQ = undefined;
};
