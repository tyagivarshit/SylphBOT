import crypto from "crypto";
import { Job, type JobsOptions, Queue, Worker } from "bullmq";
import { env } from "../../config/env";
import {
  getQueueRedisConnection,
  getSharedRedisConnection,
  getWorkerRedisConnection,
} from "../../config/redis";
import {
  buildQueueJobOptions,
  withRedisWorkerFailSafe,
} from "../../queues/queue.defaults";
import logger from "../../utils/logger";
import {
  createDurableOutboxEvent,
  hasOutboxConsumerCheckpoint,
  markEventOutboxFailed,
  markEventOutboxPublished,
  markOutboxConsumerCheckpoint,
} from "../eventOutbox.service";
import type {
  RevenueBrainContext,
  RevenueBrainDecision,
  RevenueBrainDeliveryConfirmedEvent,
  RevenueBrainDeliveryFailedEvent,
  RevenueBrainExecutionSnapshot,
  RevenueBrainInput,
  RevenueBrainIntentResult,
  RevenueBrainStateResult,
  RevenueBrainToolExecution,
} from "./types";

export type RevenueBrainEventMap = {
  "revenue_brain.received": {
    traceId: string;
    startedAt: number;
    input: RevenueBrainInput;
  };
  "revenue_brain.context_built": {
    traceId: string;
    context: RevenueBrainContext;
  };
  "revenue_brain.intent_resolved": {
    traceId: string;
    context: RevenueBrainContext;
    intent: RevenueBrainIntentResult;
    state: RevenueBrainStateResult;
  };
  "revenue_brain.decision_made": {
    traceId: string;
    context: RevenueBrainContext;
    intent: RevenueBrainIntentResult;
    state: RevenueBrainStateResult;
    decision: RevenueBrainDecision;
  };
  "revenue_brain.tool_executed": {
    traceId: string;
    context: RevenueBrainContext;
    tool: RevenueBrainToolExecution;
  };
  "revenue_brain.delivery_confirmed": RevenueBrainDeliveryConfirmedEvent;
  "revenue_brain.delivery_failed": RevenueBrainDeliveryFailedEvent;
  "revenue_brain.completed": RevenueBrainExecutionSnapshot;
  "revenue_brain.failed": {
    traceId: string;
    startedAt: number;
    input: RevenueBrainInput;
    error: string;
  };
};

type RevenueBrainEventName = keyof RevenueBrainEventMap;
type RevenueBrainEventHandler<T extends RevenueBrainEventName> = (
  payload: RevenueBrainEventMap[T]
) => Promise<void> | void;

type RevenueBrainQueuedEvent<T extends RevenueBrainEventName = RevenueBrainEventName> = {
  eventId: string;
  event: T;
  traceId: string;
  occurredAt: number;
  outboxId?: string;
  payload: RevenueBrainEventMap[T];
};

type RevenueBrainDeadLetterEvent = {
  eventId: string;
  event: RevenueBrainEventName;
  traceId: string;
  occurredAt: number;
  payload: RevenueBrainEventMap[RevenueBrainEventName];
  failedAt: number;
  attemptsMade: number;
  maxAttempts: number;
  error: string;
};

type RevenueBrainSubscriber<T extends RevenueBrainEventName = RevenueBrainEventName> = {
  id: string;
  handler: RevenueBrainEventHandler<T>;
};

type RevenueBrainQueuedEventOptions = {
  eventId?: string;
  requireDurable?: boolean;
};

type RevenueBrainDispatchState = {
  hasProcessed: (eventId: string, handlerId: string) => Promise<boolean>;
  markProcessed: (eventId: string, handlerId: string) => Promise<void>;
};

const REVENUE_BRAIN_EVENT_QUEUE_NAME = "revenue-brain-events";
const REVENUE_BRAIN_EVENT_DLQ_NAME = "revenue-brain-events-dlq";
const REVENUE_BRAIN_EVENT_HANDLER_STATE_TTL_SECONDS = 60 * 60 * 24 * 14;
const REVENUE_BRAIN_EVENT_STATE_PREFIX = "revenue_brain:event:handler";
const REVENUE_BRAIN_EVENT_WORKER_CONCURRENCY = 6;

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
});

const buildHandlerStateKey = (eventId: string, handlerId: string) =>
  `${REVENUE_BRAIN_EVENT_STATE_PREFIX}:${eventId}:${handlerId}`;

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const globalForRevenueBrainBus = globalThis as typeof globalThis & {
  __automexiaRevenueBrainSubscriptions?: Set<string>;
  __sylphRevenueBrainEventQueue?: Queue<RevenueBrainQueuedEvent>;
  __sylphRevenueBrainEventDLQ?: Queue<RevenueBrainDeadLetterEvent>;
  __sylphRevenueBrainEventWorker?: Worker<RevenueBrainQueuedEvent>;
  __sylphRevenueBrainEventSubscribers?: Map<
    RevenueBrainEventName,
    Map<string, RevenueBrainSubscriber<any>>
  >;
  __sylphRevenueBrainPendingLocalTasks?: Set<Promise<void>>;
  __sylphRevenueBrainLocalDispatchState?: RevenueBrainDispatchState;
  __sylphRevenueBrainSubscriberCounter?: number;
};

const subscriptionRegistry =
  globalForRevenueBrainBus.__automexiaRevenueBrainSubscriptions || new Set();

if (!globalForRevenueBrainBus.__automexiaRevenueBrainSubscriptions) {
  globalForRevenueBrainBus.__automexiaRevenueBrainSubscriptions =
    subscriptionRegistry;
}

const getSubscriberRegistry = () => {
  if (!globalForRevenueBrainBus.__sylphRevenueBrainEventSubscribers) {
    globalForRevenueBrainBus.__sylphRevenueBrainEventSubscribers = new Map();
  }

  return globalForRevenueBrainBus.__sylphRevenueBrainEventSubscribers;
};

const getPendingLocalTasks = () => {
  if (!globalForRevenueBrainBus.__sylphRevenueBrainPendingLocalTasks) {
    globalForRevenueBrainBus.__sylphRevenueBrainPendingLocalTasks = new Set();
  }

  return globalForRevenueBrainBus.__sylphRevenueBrainPendingLocalTasks;
};

const createInMemoryDispatchState = (): RevenueBrainDispatchState => {
  const completed = new Set<string>();

  return {
    hasProcessed: async (eventId, handlerId) =>
      completed.has(`${eventId}:${handlerId}`),
    markProcessed: async (eventId, handlerId) => {
      completed.add(`${eventId}:${handlerId}`);
    },
  };
};

const getLocalDispatchState = () => {
  if (!globalForRevenueBrainBus.__sylphRevenueBrainLocalDispatchState) {
    globalForRevenueBrainBus.__sylphRevenueBrainLocalDispatchState =
      createInMemoryDispatchState();
  }

  return globalForRevenueBrainBus.__sylphRevenueBrainLocalDispatchState;
};

const getRedisDispatchState = (): RevenueBrainDispatchState => {
  const redis = getSharedRedisConnection();

  return {
    hasProcessed: async (eventId, handlerId) =>
      (await redis.get(buildHandlerStateKey(eventId, handlerId))) === "done",
    markProcessed: async (eventId, handlerId) => {
      await redis.set(
        buildHandlerStateKey(eventId, handlerId),
        "done",
        "EX",
        REVENUE_BRAIN_EVENT_HANDLER_STATE_TTL_SECONDS
      );
    },
  };
};

const nextSubscriberId = () => {
  globalForRevenueBrainBus.__sylphRevenueBrainSubscriberCounter =
    (globalForRevenueBrainBus.__sylphRevenueBrainSubscriberCounter || 0) + 1;

  return globalForRevenueBrainBus.__sylphRevenueBrainSubscriberCounter;
};

const buildQueuedEvent = <T extends RevenueBrainEventName>(
  event: T,
  payload: RevenueBrainEventMap[T],
  options?: RevenueBrainQueuedEventOptions
): RevenueBrainQueuedEvent<T> => ({
  eventId:
    typeof options?.eventId === "string" && options.eventId.trim()
      ? options.eventId.trim()
      : `rb_evt_${crypto.randomUUID()}`,
  event,
  traceId:
    typeof (payload as { traceId?: unknown })?.traceId === "string"
      ? String((payload as { traceId?: string }).traceId).trim()
      : `rb_trace_${crypto.randomUUID()}`,
  occurredAt: Date.now(),
  payload,
});

const buildOutboxAggregate = (queuedEvent: RevenueBrainQueuedEvent) => {
  const payload = queuedEvent.payload as Record<string, unknown>;
  const businessId =
    typeof payload.businessId === "string" ? payload.businessId : null;

  if (typeof payload.leadId === "string" && payload.leadId.trim()) {
    return {
      businessId,
      aggregateType: "lead",
      aggregateId: payload.leadId.trim(),
    };
  }

  if (typeof payload.traceId === "string" && payload.traceId.trim()) {
    return {
      businessId,
      aggregateType: "trace",
      aggregateId: payload.traceId.trim(),
    };
  }

  return {
    businessId,
    aggregateType: "event",
    aggregateId: queuedEvent.eventId,
  };
};

const isJobAlreadyExistsError = (error: unknown) =>
  /job.+already exists/i.test(
    String((error as { message?: unknown })?.message || error || "")
  );

const shouldUseLocalDispatch = () =>
  process.env.NODE_ENV === "test" ||
  !globalForRevenueBrainBus.__sylphRevenueBrainEventQueue;

const getOutboxDispatchState = (
  eventOutboxId: string
): RevenueBrainDispatchState => ({
  hasProcessed: async (_eventId, handlerId) =>
    hasOutboxConsumerCheckpoint({
      eventOutboxId,
      consumerKey: handlerId,
    }),
  markProcessed: async (_eventId, handlerId) => {
    await markOutboxConsumerCheckpoint({
      eventOutboxId,
      consumerKey: handlerId,
    });
  },
});

export const dispatchRevenueBrainQueuedEvent = async ({
  queuedEvent,
  dispatchState,
}: {
  queuedEvent: RevenueBrainQueuedEvent;
  dispatchState?: RevenueBrainDispatchState;
}) => {
  const registry = getSubscriberRegistry();
  const subscribers = Array.from(
    registry.get(queuedEvent.event)?.values() || []
  );
  const state =
    dispatchState ||
    (queuedEvent.outboxId
      ? getOutboxDispatchState(queuedEvent.outboxId)
      : getRedisDispatchState());

  for (const subscriber of subscribers) {
    if (await state.hasProcessed(queuedEvent.eventId, subscriber.id)) {
      continue;
    }

    await Promise.resolve(
      subscriber.handler(
        queuedEvent.payload as RevenueBrainEventMap[typeof queuedEvent.event]
      )
    );
    await state.markProcessed(queuedEvent.eventId, subscriber.id);
  }

  if (queuedEvent.outboxId) {
    await markEventOutboxPublished(queuedEvent.outboxId);
  }
};

const queueLocalDispatch = (queuedEvent: RevenueBrainQueuedEvent) => {
  const pending = getPendingLocalTasks();
  let task: Promise<void>;

  task = dispatchRevenueBrainQueuedEvent({
    queuedEvent,
    ...(queuedEvent.outboxId
      ? {}
      : {
          dispatchState: getLocalDispatchState(),
        }),
  })
    .catch((error) => {
      if (queuedEvent.outboxId) {
        void markEventOutboxFailed(queuedEvent.outboxId, error).catch(
          () => undefined
        );
      }

      logger.error(
        {
          eventId: queuedEvent.eventId,
          event: queuedEvent.event,
          traceId: queuedEvent.traceId,
          error,
        },
        "Revenue brain local event dispatch failed"
      );
      throw error;
    })
    .finally(() => {
      pending.delete(task);
    });

  pending.add(task);
  return task;
};

export const initRevenueBrainEventQueues = () => {
  if (!globalForRevenueBrainBus.__sylphRevenueBrainEventQueue) {
    globalForRevenueBrainBus.__sylphRevenueBrainEventQueue =
      new Queue<RevenueBrainQueuedEvent>(REVENUE_BRAIN_EVENT_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        prefix: env.AI_QUEUE_PREFIX,
        defaultJobOptions,
        streams: {
          events: {
            maxLen: 1000,
          },
        },
      });
  }

  if (!globalForRevenueBrainBus.__sylphRevenueBrainEventDLQ) {
    globalForRevenueBrainBus.__sylphRevenueBrainEventDLQ =
      new Queue<RevenueBrainDeadLetterEvent>(REVENUE_BRAIN_EVENT_DLQ_NAME, {
        connection: getQueueRedisConnection(),
        prefix: env.AI_QUEUE_PREFIX,
        defaultJobOptions: buildQueueJobOptions({
          attempts: 1,
        }),
        streams: {
          events: {
            maxLen: 1000,
          },
        },
      });
  }

  return {
    events: globalForRevenueBrainBus.__sylphRevenueBrainEventQueue,
    deadLetter: globalForRevenueBrainBus.__sylphRevenueBrainEventDLQ,
  };
};

const getRevenueBrainEventQueue = () => initRevenueBrainEventQueues().events;
const getRevenueBrainDeadLetterQueue = () =>
  initRevenueBrainEventQueues().deadLetter;

export const subscribeRevenueBrainEvent = <
  T extends RevenueBrainEventName,
>(
  event: T,
  handler: RevenueBrainEventHandler<T>,
  options?: {
    handlerId?: string;
  }
) => {
  const registry = getSubscriberRegistry();
  const eventSubscribers = registry.get(event) || new Map();
  const id =
    options?.handlerId ||
    `${event}:anonymous:${String(nextSubscriberId()).padStart(4, "0")}`;

  eventSubscribers.set(id, {
    id,
    handler,
  });
  registry.set(event, eventSubscribers);

  return () => {
    const latest = registry.get(event);
    latest?.delete(id);
  };
};

export const publishRevenueBrainEvent = <
  T extends RevenueBrainEventName,
>(
  event: T,
  payload: RevenueBrainEventMap[T],
  options?: RevenueBrainQueuedEventOptions
) =>
  dispatchRevenueBrainQueuedEvent({
    queuedEvent: buildQueuedEvent(event, payload, options),
    dispatchState: getLocalDispatchState(),
  });

export const queueRevenueBrainEvent = <
  T extends RevenueBrainEventName,
>(
  event: T,
  payload: RevenueBrainEventMap[T],
  options?: RevenueBrainQueuedEventOptions
) => {
  const queuedEvent = buildQueuedEvent(event, payload, options);

  if (shouldUseLocalDispatch()) {
    return queueLocalDispatch(queuedEvent);
  }

  return getRevenueBrainEventQueue()
    .add("dispatch", queuedEvent, {
      ...defaultJobOptions,
      jobId: queuedEvent.eventId,
    })
    .catch((error) => {
      if (isJobAlreadyExistsError(error)) {
        return;
      }

      logger.error(
        {
          eventId: queuedEvent.eventId,
          event: queuedEvent.event,
          traceId: queuedEvent.traceId,
          error,
        },
        "Revenue brain durable event enqueue failed, falling back to local dispatch"
      );

      return queueLocalDispatch(queuedEvent);
    });
};

export const queueRevenueBrainEventDurably = <
  T extends RevenueBrainEventName,
>(
  event: T,
  payload: RevenueBrainEventMap[T],
  options?: RevenueBrainQueuedEventOptions
) => {
  const queuedEvent = buildQueuedEvent(event, payload, options);

  if (!options?.requireDurable && shouldUseLocalDispatch()) {
    return queueLocalDispatch(queuedEvent);
  }

  const aggregate = buildOutboxAggregate(queuedEvent);

  const createAndDispatch = async () => {
    const outbox = await createDurableOutboxEvent({
      businessId: aggregate.businessId,
      eventType: queuedEvent.event,
      aggregateType: aggregate.aggregateType,
      aggregateId: aggregate.aggregateId,
      payload: queuedEvent as unknown as Record<string, unknown>,
      dedupeKey: queuedEvent.eventId,
    });
    const durableQueuedEvent = {
      ...queuedEvent,
      outboxId: outbox.id,
    };

    if (shouldUseLocalDispatch()) {
      return queueLocalDispatch(durableQueuedEvent);
    }

    return getRevenueBrainEventQueue()
      .add("dispatch", durableQueuedEvent, {
        ...defaultJobOptions,
        jobId: queuedEvent.eventId,
      })
      .catch(async (error) => {
        if (isJobAlreadyExistsError(error)) {
          return;
        }

        await markEventOutboxFailed(outbox.id, error).catch(() => undefined);

        logger.error(
          {
            eventId: queuedEvent.eventId,
            event: queuedEvent.event,
            traceId: queuedEvent.traceId,
            error,
          },
          "Revenue brain durable event enqueue failed"
        );

        throw error;
      });
  };

  return createAndDispatch();
};

export const waitForRevenueBrainBackgroundTasks = async () => {
  const pending = getPendingLocalTasks();

  while (pending.size > 0) {
    await Promise.allSettled(Array.from(pending));
  }
};

export const registerRevenueBrainSubscriber = (
  key: string,
  register: () => void
) => {
  if (subscriptionRegistry.has(key)) {
    return;
  }

  subscriptionRegistry.add(key);
  register();
};

export const initRevenueBrainEventWorker = ({
  concurrency = REVENUE_BRAIN_EVENT_WORKER_CONCURRENCY,
}: {
  concurrency?: number;
} = {}) => {
  if (!shouldRunWorker) {
    return null;
  }

  initRevenueBrainEventQueues();

  if (globalForRevenueBrainBus.__sylphRevenueBrainEventWorker) {
    return globalForRevenueBrainBus.__sylphRevenueBrainEventWorker;
  }

  const worker = new Worker<RevenueBrainQueuedEvent>(
    REVENUE_BRAIN_EVENT_QUEUE_NAME,
    withRedisWorkerFailSafe(
      REVENUE_BRAIN_EVENT_QUEUE_NAME,
      async (job: Job<RevenueBrainQueuedEvent>) => {
        try {
          return await dispatchRevenueBrainQueuedEvent({
            queuedEvent: job.data,
          });
        } catch (error) {
          if (job.data.outboxId) {
            await markEventOutboxFailed(job.data.outboxId, error).catch(
              () => undefined
            );
          }

          throw error;
        }
      }
    ),
    {
      connection: getWorkerRedisConnection(),
      prefix: env.AI_QUEUE_PREFIX,
      concurrency: Math.max(1, concurrency),
    }
  );

  worker.on("failed", async (job, error) => {
    logger.error(
      {
        queueName: REVENUE_BRAIN_EVENT_QUEUE_NAME,
        jobId: job?.id || null,
        eventId: job?.data?.eventId || null,
        event: job?.data?.event || null,
        attemptsMade: job?.attemptsMade || 0,
        maxAttempts: Number(job?.opts?.attempts || defaultJobOptions.attempts || 1),
        error,
      },
      "Revenue brain event worker job failed"
    );

    if (!job) {
      return;
    }

    const maxAttempts = Number(job.opts.attempts || defaultJobOptions.attempts || 1);
    const attemptsMade = Number(job.attemptsMade || 0);

    if (attemptsMade < maxAttempts) {
      return;
    }

    await getRevenueBrainDeadLetterQueue()
      .add(
        "dead-letter",
        {
          eventId: job.data.eventId,
          event: job.data.event,
          traceId: job.data.traceId,
          occurredAt: job.data.occurredAt,
          payload: job.data.payload,
          failedAt: Date.now(),
          attemptsMade,
          maxAttempts,
          error: String(
            (error as { message?: unknown })?.message || error || "event_dispatch_failed"
          ),
        },
        {
          jobId: `rb_dlq_${job.data.eventId}`,
          removeOnComplete: {
            count: 1000,
          },
          removeOnFail: {
            count: 1000,
          },
        }
      )
      .catch((deadLetterError) => {
        logger.error(
          {
            eventId: job.data.eventId,
            event: job.data.event,
            error: deadLetterError,
          },
          "Revenue brain dead-letter enqueue failed"
        );
      });
  });

  worker.on("error", (error) => {
    logger.error(
      {
        queueName: REVENUE_BRAIN_EVENT_QUEUE_NAME,
        error,
      },
      "Revenue brain event worker error"
    );
  });

  globalForRevenueBrainBus.__sylphRevenueBrainEventWorker = worker;
  return worker;
};

export const closeRevenueBrainEventQueue = async () => {
  await globalForRevenueBrainBus.__sylphRevenueBrainEventWorker
    ?.close()
    .catch(() => undefined);
  await globalForRevenueBrainBus.__sylphRevenueBrainEventQueue
    ?.close()
    .catch(() => undefined);
  await globalForRevenueBrainBus.__sylphRevenueBrainEventDLQ
    ?.close()
    .catch(() => undefined);
  globalForRevenueBrainBus.__sylphRevenueBrainEventWorker = undefined;
  globalForRevenueBrainBus.__sylphRevenueBrainEventQueue = undefined;
  globalForRevenueBrainBus.__sylphRevenueBrainEventDLQ = undefined;
};

export const revenueBrainEventBus = {
  publish: publishRevenueBrainEvent,
  queue: queueRevenueBrainEvent,
  queueDurably: queueRevenueBrainEventDurably,
  subscribe: subscribeRevenueBrainEvent,
  register: registerRevenueBrainSubscriber,
  waitForBackgroundTasks: waitForRevenueBrainBackgroundTasks,
  initWorker: initRevenueBrainEventWorker,
  close: closeRevenueBrainEventQueue,
};
