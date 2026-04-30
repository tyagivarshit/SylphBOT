import crypto from "crypto";
import { Job, JobsOptions, Queue } from "bullmq";
import { env } from "../config/env";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

export const INBOUND_NORMALIZATION_QUEUE = "inbound-normalization";
export const INBOUND_CLASSIFICATION_QUEUE = "inbound-classification";
export const INBOUND_ROUTING_QUEUE = "inbound-routing";
export const REVENUE_BRAIN_BRIDGE_QUEUE = "revenue-brain-bridge";

const INBOUND_NORMALIZATION_DLQ = `${INBOUND_NORMALIZATION_QUEUE}-dlq`;
const INBOUND_CLASSIFICATION_DLQ = `${INBOUND_CLASSIFICATION_QUEUE}-dlq`;
const INBOUND_ROUTING_DLQ = `${INBOUND_ROUTING_QUEUE}-dlq`;
const REVENUE_BRAIN_BRIDGE_DLQ = `${REVENUE_BRAIN_BRIDGE_QUEUE}-dlq`;

export const RECEPTION_RUNTIME_WRITE_ONLY_DLQ_QUEUES = [
  INBOUND_NORMALIZATION_DLQ,
  INBOUND_CLASSIFICATION_DLQ,
  INBOUND_ROUTING_DLQ,
  REVENUE_BRAIN_BRIDGE_DLQ,
] as const;

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
});

export type InboundNormalizationJobPayload = {
  interactionId: string;
  traceId: string | null;
  externalInteractionKey: string;
};

export type InboundClassificationJobPayload = {
  interactionId: string;
  traceId: string | null;
  externalInteractionKey: string;
};

export type InboundRoutingJobPayload = {
  interactionId: string;
  traceId: string | null;
  externalInteractionKey: string;
};

export type RevenueBrainBridgeJobPayload = {
  interactionId: string;
  businessId: string;
  leadId: string;
  channel: string;
  priority: string | null;
  priorityScore: number;
  consentSnapshotRef: string | null;
  crmProfileRef: string | null;
  receptionMemoryRef: string | null;
  traceId: string | null;
  externalInteractionKey: string;
};

export type ReceptionRuntimeDeadLetterPayload = {
  queue: string;
  interactionId: string | null;
  externalInteractionKey: string | null;
  traceId: string | null;
  reason: string;
  stack: string | null;
  failedAt: string;
  attemptsMade: number;
  payload: Record<string, unknown> | null;
};

type RuntimeQueueRegistry = {
  normalization?: Queue<InboundNormalizationJobPayload>;
  classification?: Queue<InboundClassificationJobPayload>;
  routing?: Queue<InboundRoutingJobPayload>;
  revenueBridge?: Queue<RevenueBrainBridgeJobPayload>;
  normalizationDlq?: Queue<ReceptionRuntimeDeadLetterPayload>;
  classificationDlq?: Queue<ReceptionRuntimeDeadLetterPayload>;
  routingDlq?: Queue<ReceptionRuntimeDeadLetterPayload>;
  revenueBridgeDlq?: Queue<ReceptionRuntimeDeadLetterPayload>;
};

const globalForReceptionRuntimeQueue = globalThis as typeof globalThis & {
  __sylphReceptionRuntimeQueues?: RuntimeQueueRegistry;
};

const getRegistry = () => {
  if (!globalForReceptionRuntimeQueue.__sylphReceptionRuntimeQueues) {
    globalForReceptionRuntimeQueue.__sylphReceptionRuntimeQueues = {};
  }

  return globalForReceptionRuntimeQueue.__sylphReceptionRuntimeQueues;
};

const buildQueue = <TPayload>(
  queueName: string,
  options?: JobsOptions
) =>
  createResilientQueue(
    new Queue<TPayload>(queueName, {
      connection: getQueueRedisConnection(),
      prefix: env.AI_QUEUE_PREFIX,
      defaultJobOptions: options || defaultJobOptions,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
    }),
    queueName
  );

export const initReceptionRuntimeQueues = () => {
  const registry = getRegistry();

  if (!registry.normalization) {
    registry.normalization = buildQueue<InboundNormalizationJobPayload>(
      INBOUND_NORMALIZATION_QUEUE
    );
  }

  if (!registry.classification) {
    registry.classification = buildQueue<InboundClassificationJobPayload>(
      INBOUND_CLASSIFICATION_QUEUE
    );
  }

  if (!registry.routing) {
    registry.routing = buildQueue<InboundRoutingJobPayload>(
      INBOUND_ROUTING_QUEUE
    );
  }

  if (!registry.revenueBridge) {
    registry.revenueBridge = buildQueue<RevenueBrainBridgeJobPayload>(
      REVENUE_BRAIN_BRIDGE_QUEUE
    );
  }

  if (!registry.normalizationDlq) {
    registry.normalizationDlq = buildQueue<ReceptionRuntimeDeadLetterPayload>(
      INBOUND_NORMALIZATION_DLQ,
      buildQueueJobOptions({
        attempts: 1,
      })
    );
  }

  if (!registry.classificationDlq) {
    registry.classificationDlq = buildQueue<ReceptionRuntimeDeadLetterPayload>(
      INBOUND_CLASSIFICATION_DLQ,
      buildQueueJobOptions({
        attempts: 1,
      })
    );
  }

  if (!registry.routingDlq) {
    registry.routingDlq = buildQueue<ReceptionRuntimeDeadLetterPayload>(
      INBOUND_ROUTING_DLQ,
      buildQueueJobOptions({
        attempts: 1,
      })
    );
  }

  if (!registry.revenueBridgeDlq) {
    registry.revenueBridgeDlq = buildQueue<ReceptionRuntimeDeadLetterPayload>(
      REVENUE_BRAIN_BRIDGE_DLQ,
      buildQueueJobOptions({
        attempts: 1,
      })
    );
  }

  return registry;
};

const buildStableJobId = (
  queueName: string,
  externalInteractionKey: string,
  suffix?: string | null
) =>
  [
    queueName,
    Buffer.from(externalInteractionKey).toString("base64url"),
    String(suffix || "").trim(),
  ]
    .filter(Boolean)
    .join(":");

const getQueue = <TQueue extends keyof RuntimeQueueRegistry>(
  key: TQueue
): NonNullable<RuntimeQueueRegistry[TQueue]> => {
  const registry = initReceptionRuntimeQueues();
  return registry[key]!;
};

export const enqueueInboundNormalization = async (
  payload: InboundNormalizationJobPayload
) =>
  getQueue("normalization").add("normalize", payload, {
    jobId: buildStableJobId(
      INBOUND_NORMALIZATION_QUEUE,
      payload.externalInteractionKey
    ),
  });

export const enqueueInboundClassification = async (
  payload: InboundClassificationJobPayload
) =>
  getQueue("classification").add("classify", payload, {
    jobId: buildStableJobId(
      INBOUND_CLASSIFICATION_QUEUE,
      payload.externalInteractionKey
    ),
  });

export const enqueueInboundRouting = async (payload: InboundRoutingJobPayload) =>
  getQueue("routing").add("route", payload, {
    jobId: buildStableJobId(
      INBOUND_ROUTING_QUEUE,
      payload.externalInteractionKey
    ),
  });

export const enqueueRevenueBrainBridge = async (
  payload: RevenueBrainBridgeJobPayload
) =>
  getQueue("revenueBridge").add("bridge", payload, {
    jobId: buildStableJobId(
      REVENUE_BRAIN_BRIDGE_QUEUE,
      payload.externalInteractionKey
    ),
  });

export const enqueueReceptionRuntimeDeadLetter = async ({
  queueName,
  payload,
}: {
  queueName:
    | typeof INBOUND_NORMALIZATION_QUEUE
    | typeof INBOUND_CLASSIFICATION_QUEUE
    | typeof INBOUND_ROUTING_QUEUE
    | typeof REVENUE_BRAIN_BRIDGE_QUEUE;
  payload: ReceptionRuntimeDeadLetterPayload;
}) => {
  const registry = initReceptionRuntimeQueues();
  const deadLetterQueue =
    queueName === INBOUND_NORMALIZATION_QUEUE
      ? registry.normalizationDlq
      : queueName === INBOUND_CLASSIFICATION_QUEUE
      ? registry.classificationDlq
      : queueName === INBOUND_ROUTING_QUEUE
      ? registry.routingDlq
      : registry.revenueBridgeDlq;

  return deadLetterQueue!.add("dead-letter", payload, {
    jobId: `dlq:${queueName}:${payload.interactionId || crypto.randomUUID()}`,
    removeOnComplete: {
      count: 1000,
    },
    removeOnFail: {
      count: 1000,
    },
  });
};

export const getReceptionRuntimeQueues = () => {
  const registry = initReceptionRuntimeQueues();
  return [
    registry.normalization!,
    registry.classification!,
    registry.routing!,
    registry.revenueBridge!,
    registry.normalizationDlq!,
    registry.classificationDlq!,
    registry.routingDlq!,
    registry.revenueBridgeDlq!,
  ];
};

export const closeReceptionRuntimeQueues = async () => {
  const registry = globalForReceptionRuntimeQueue.__sylphReceptionRuntimeQueues;

  await Promise.allSettled(
    Object.values(registry || {})
      .filter(Boolean)
      .map((queue) => queue!.close())
  );

  globalForReceptionRuntimeQueue.__sylphReceptionRuntimeQueues = undefined;
};

export type ReceptionRuntimeQueueJob = Job<
  | InboundNormalizationJobPayload
  | InboundClassificationJobPayload
  | InboundRoutingJobPayload
  | RevenueBrainBridgeJobPayload
>;
