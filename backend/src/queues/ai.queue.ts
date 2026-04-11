import crypto from "crypto";
import { Job, JobsOptions, Queue } from "bullmq";
import { env } from "../config/env";
import { getQueueRedisConnection } from "../config/redis";

export const AI_QUEUE_NAME = env.AI_QUEUE_NAME;
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
  attempts: env.AI_JOB_ATTEMPTS,
  backoff: {
    type: "exponential",
    delay: env.AI_JOB_BACKOFF_MS,
  },
  removeOnComplete: {
    age: 3600,
    count: 1000,
  },
  removeOnFail: {
    age: 86400,
    count: 1000,
  },
};

const globalForAIQueue = globalThis as typeof globalThis & {
  __sylphAIQueue?: Queue<AIJobPayload>;
};

export const aiQueue =
  globalForAIQueue.__sylphAIQueue ||
  new Queue<AIJobPayload>(AI_QUEUE_NAME, {
    connection: getQueueRedisConnection(),
    prefix: env.AI_QUEUE_PREFIX,
    defaultJobOptions,
    streams: {
      events: {
        maxLen: 1000,
      },
    },
  });

if (!globalForAIQueue.__sylphAIQueue) {
  globalForAIQueue.__sylphAIQueue = aiQueue;
}

const normalizeMessage = (message: AIMessagePayload): AIMessagePayload => ({
  ...message,
  businessId: String(message.businessId || "").trim(),
  leadId: String(message.leadId || "").trim(),
  message: String(message.message || "").trim(),
  kind: message.kind || "router",
  externalEventId: message.externalEventId?.trim(),
  idempotencyKey: message.idempotencyKey?.trim(),
  skipInboundPersist: Boolean(message.skipInboundPersist),
  retryCount: message.retryCount || 0,
});

const chunkMessages = <T>(messages: T[], chunkSize: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < messages.length; index += chunkSize) {
    chunks.push(messages.slice(index, index + chunkSize));
  }

  return chunks;
};

const buildStableToken = (messages: AIMessagePayload[], idempotencyKey?: string) => {
  if (idempotencyKey) {
    return idempotencyKey;
  }

  const messageTokens = messages
    .map((message) => message.idempotencyKey || message.externalEventId)
    .filter(Boolean);

  if (!messageTokens.length) {
    return undefined;
  }

  return messageTokens.join("|");
};

const buildJobId = (
  messages: AIMessagePayload[],
  chunkIndex: number,
  options?: EnqueueOptions
) => {
  if (options?.forceUniqueJobId) {
    return `ai:${crypto.randomUUID()}`;
  }

  const stableToken = buildStableToken(messages, options?.idempotencyKey);

  if (!stableToken) {
    return `ai:${crypto.randomUUID()}`;
  }

  const retrySuffix = Math.max(
    0,
    ...messages.map((message) => message.retryCount || 0)
  );

  const digest = crypto
    .createHash("sha1")
    .update(stableToken)
    .digest("hex");

  return `ai:${digest}:c${chunkIndex}:r${retrySuffix}`;
};

export const enqueueAIBatch = async (
  messages: AIMessagePayload[],
  options?: EnqueueOptions
) => {
  const normalizedMessages = messages
    .map(normalizeMessage)
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

  return aiQueue.addBulk(jobs);
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

export const getAIQueues = () => [aiQueue];

export const getAIQueueNames = () => [aiQueue.name];

export const getAIQueueForLead = (_leadId: string) => aiQueue;

export const closeAIQueue = async () => {
  await aiQueue.close();
  globalForAIQueue.__sylphAIQueue = undefined;
};

export type AIQueueJob = Job<AIJobPayload>;
