import crypto from "crypto";
import { Job, JobsOptions, Queue } from "bullmq";
import { env } from "../config/env";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";
import logger from "../utils/logger";
import { getRequestContext } from "../observability/requestContext";

export const AI_QUEUE_NAME: string = "ai-high";
export const LEGACY_AI_QUEUE_NAME: string = env.AI_QUEUE_NAME;
export const AI_QUEUE_PARTITIONS = 1;

export type AIMessageKind = "router" | "message";

export type AIMessagePayload = {
  businessId: string;
  leadId: string;
  message: string;
  kind?: AIMessageKind;
  plan?: unknown;
  platform?: string;
  senderId?: string;
  pageId?: string;
  phoneNumberId?: string;
  accessTokenEncrypted?: string;
  externalEventId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  skipInboundPersist?: boolean;
  retryCount?: number;
};

export type AIJobPayload = {
  batchId: string;
  source: "api" | "router" | "message" | "retry";
  createdAt: string;
  messages: AIMessagePayload[];
};

type EnqueueOptions = {
  source?: AIJobPayload["source"];
  idempotencyKey?: string;
  delayMs?: number;
  forceUniqueJobId?: boolean;
};

const defaultJobOptions: JobsOptions = {
  ...buildQueueJobOptions({
    backoff: {
      type: "exponential",
      delay: env.AI_JOB_BACKOFF_MS,
    },
  }),
};
const queueConnection = getQueueRedisConnection();

const globalForAIQueue = globalThis as typeof globalThis & {
  __sylphAIHighQueue?: Queue<AIJobPayload>;
  __sylphAILegacyQueue?: Queue<AIJobPayload>;
};

export const aiQueue =
  globalForAIQueue.__sylphAIHighQueue ||
  createResilientQueue(
    new Queue<AIJobPayload>(AI_QUEUE_NAME, {
      connection: queueConnection,
      prefix: env.AI_QUEUE_PREFIX,
      defaultJobOptions,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
    }),
    AI_QUEUE_NAME
  );

if (!globalForAIQueue.__sylphAIHighQueue) {
  globalForAIQueue.__sylphAIHighQueue = aiQueue;
}

export const legacyAIQueue =
  LEGACY_AI_QUEUE_NAME === AI_QUEUE_NAME
    ? aiQueue
    : globalForAIQueue.__sylphAILegacyQueue ||
      createResilientQueue(
        new Queue<AIJobPayload>(LEGACY_AI_QUEUE_NAME, {
          connection: queueConnection,
          prefix: env.AI_QUEUE_PREFIX,
          defaultJobOptions,
          streams: {
            events: {
              maxLen: 1000,
            },
          },
        }),
        LEGACY_AI_QUEUE_NAME
      );

if (
  LEGACY_AI_QUEUE_NAME !== AI_QUEUE_NAME &&
  !globalForAIQueue.__sylphAILegacyQueue
) {
  globalForAIQueue.__sylphAILegacyQueue = legacyAIQueue;
}

const setMetadataFieldIfMissing = (
  metadata: Record<string, unknown>,
  key: "requestId" | "userId" | "businessId",
  value: unknown
) => {
  if (metadata[key] !== undefined || value === undefined) {
    return;
  }

  metadata[key] = value;
};

const buildMessageMetadata = (
  message: AIMessagePayload,
  context = getRequestContext()
) => {
  const metadata = {
    ...(message.metadata || {}),
  } as Record<string, unknown>;

  setMetadataFieldIfMissing(metadata, "requestId", context?.requestId);
  setMetadataFieldIfMissing(metadata, "userId", context?.userId);
  setMetadataFieldIfMissing(metadata, "businessId", context?.businessId);

  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined
  );

  return entries.length
    ? (Object.fromEntries(entries) as Record<string, unknown>)
    : undefined;
};

const normalizeMessage = (
  message: AIMessagePayload,
  context = getRequestContext()
): AIMessagePayload => ({
  ...message,
  businessId: String(message.businessId || "").trim(),
  leadId: String(message.leadId || "").trim(),
  message: String(message.message || "").trim(),
  kind: message.kind || "router",
  externalEventId: message.externalEventId?.trim(),
  idempotencyKey: message.idempotencyKey?.trim(),
  skipInboundPersist: Boolean(message.skipInboundPersist),
  retryCount: message.retryCount || 0,
  metadata: buildMessageMetadata(message, context),
});

const chunkMessages = <T>(messages: T[], chunkSize: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < messages.length; index += chunkSize) {
    chunks.push(messages.slice(index, index + chunkSize));
  }

  return chunks;
};

const buildStableToken = (
  messages: AIMessagePayload[],
  idempotencyKey?: string
) => {
  if (idempotencyKey) {
    return idempotencyKey;
  }

  const messageTokens = messages
    .map((message) => message.idempotencyKey || message.externalEventId)
    .filter(Boolean);

  if (!messageTokens.length) {
    return undefined;
  }

  return crypto
  .createHash("sha1")
  .update(messageTokens.join("|"))
  .digest("hex");
};

const buildJobId = (
  messages: AIMessagePayload[],
  chunkIndex: number,
  options?: EnqueueOptions
) => {
  if (options?.forceUniqueJobId) {
    return `ai_${crypto.randomUUID()}`;
  }

  const stableToken = buildStableToken(messages, options?.idempotencyKey);

  if (stableToken) {
    return `ai_${stableToken}_${chunkIndex}`;
  }

  return `ai_${crypto.randomUUID()}`;
};


export const enqueueAIBatch = async (
  messages: AIMessagePayload[],
  options?: EnqueueOptions
) => {
  const requestContext = getRequestContext();
  const normalizedMessages = messages
    .map((message) => normalizeMessage(message, requestContext))
    .filter((message) => message.businessId && message.leadId && message.message);

  if (!normalizedMessages.length) {
    throw new Error("At least one valid message is required");
  }

  const chunks = chunkMessages(normalizedMessages, env.AI_JOB_BATCH_SIZE);
  const jobs = chunks.map((chunk, chunkIndex) => ({
    name: "process",
    data: {
      batchId: crypto.randomUUID(),
      source: options?.source || "api",
      createdAt: new Date().toISOString(),
      messages: chunk,
    },
    opts: {
      jobId: buildJobId(chunk, chunkIndex, options),
      delay: options?.delayMs || 0,
    },
  }));

  logger.info(
    {
      queue: AI_QUEUE_NAME,
      source: options?.source || "api",
      requestedMessages: messages.length,
      acceptedMessages: normalizedMessages.length,
      chunks: chunks.length,
      leadIds: Array.from(new Set(normalizedMessages.map((item) => item.leadId))),
      idempotencyKey: options?.idempotencyKey || null,
    },
    "AI reply batch enqueue requested"
  );

  const createdJobs = await aiQueue.addBulk(jobs);

  logger.info(
    {
      queue: AI_QUEUE_NAME,
      source: options?.source || "api",
      jobs: createdJobs.map((job) => String(job.id)),
    },
    "AI reply batch enqueued"
  );

  return createdJobs;
};

export const enqueueAIMessage = async (
  message: AIMessagePayload,
  options?: EnqueueOptions
) => {
  const [job] = await enqueueAIBatch([message], options);
  return job;
};

export const addAIJob = async (data: AIMessagePayload) =>
  enqueueAIMessage(
    {
      ...data,
      kind: data.kind || "message",
      skipInboundPersist: data.skipInboundPersist ?? false,
    },
    {
      source: "message",
      idempotencyKey: data.idempotencyKey || data.externalEventId,
    }
  );

export const addRouterJob = async (data: AIMessagePayload) =>
  enqueueAIMessage(
    {
      ...data,
      kind: "router",
      skipInboundPersist: data.skipInboundPersist ?? true,
    },
    {
      source: "router",
      idempotencyKey: data.idempotencyKey || data.externalEventId,
    }
  );

export const getAIQueues = () =>
  LEGACY_AI_QUEUE_NAME === AI_QUEUE_NAME
    ? [aiQueue]
    : [aiQueue, legacyAIQueue];

export const getAIQueueNames = () => getAIQueues().map((queue) => queue.name);

export const getAIQueueForLead = (_leadId: string) => aiQueue;

export const closeAIQueue = async () => {
  await Promise.allSettled(
    getAIQueues().map((queue) => queue.close())
  );
  globalForAIQueue.__sylphAIHighQueue = undefined;
  globalForAIQueue.__sylphAILegacyQueue = undefined;
};

export type AIQueueJob = Job<AIJobPayload>;
