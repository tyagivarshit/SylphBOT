import crypto from "crypto";
import { Job, JobsOptions, Queue } from "bullmq";
import { env } from "../config/env";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";
import { getLeadCancelTokenVersions } from "../services/leadControlState.service";
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
  source?: string;
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
  cancelTokenVersion?: number | null;
};

export type CommentReplyJobPayload = {
  type: "comment-reply";
  businessId: string;
  clientId: string;
  instagramUserId?: string;
  senderId?: string;
  reelId?: string;
  mediaId?: string;
  commentText?: string;
  text?: string;
  commentId?: string;
};

export type AIJobPayload = {
  batchId: string;
  source: "api" | "router" | "message" | "retry";
  createdAt: string;
  messages: AIMessagePayload[];
};

export type AIQueuePayload = AIJobPayload | CommentReplyJobPayload;

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

const globalForAIQueue = globalThis as typeof globalThis & {
  __sylphAIHighQueue?: Queue<AIQueuePayload>;
  __sylphAILegacyQueue?: Queue<AIQueuePayload>;
};

export const initAIQueues = () => {
  if (!globalForAIQueue.__sylphAIHighQueue) {
    globalForAIQueue.__sylphAIHighQueue = createResilientQueue(
      new Queue<AIQueuePayload>(AI_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
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
  }

  if (
    LEGACY_AI_QUEUE_NAME !== AI_QUEUE_NAME &&
    !globalForAIQueue.__sylphAILegacyQueue
  ) {
    globalForAIQueue.__sylphAILegacyQueue = createResilientQueue(
      new Queue<AIQueuePayload>(LEGACY_AI_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
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
  }

  return getAIQueues();
};

const getAIQueue = () => {
  if (!globalForAIQueue.__sylphAIHighQueue) {
    initAIQueues();
  }

  return globalForAIQueue.__sylphAIHighQueue!;
};

const getLegacyAIQueue = () => {
  if (LEGACY_AI_QUEUE_NAME === AI_QUEUE_NAME) {
    return getAIQueue();
  }

  if (!globalForAIQueue.__sylphAILegacyQueue) {
    initAIQueues();
  }

  return globalForAIQueue.__sylphAILegacyQueue!;
};

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
  source: message.source?.trim(),
  externalEventId: message.externalEventId?.trim(),
  idempotencyKey: message.idempotencyKey?.trim(),
  skipInboundPersist: Boolean(message.skipInboundPersist),
  retryCount: message.retryCount || 0,
  cancelTokenVersion:
    typeof message.cancelTokenVersion === "number"
      ? message.cancelTokenVersion
      : null,
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

  const cancelTokenVersions = await getLeadCancelTokenVersions(
    normalizedMessages.map((message) => message.leadId)
  );
  const controlledMessages = normalizedMessages.map((message) => ({
    ...message,
    cancelTokenVersion:
      typeof message.cancelTokenVersion === "number"
        ? message.cancelTokenVersion
        : cancelTokenVersions.get(message.leadId) ?? 0,
  }));

  const chunks = chunkMessages(controlledMessages, env.AI_JOB_BATCH_SIZE);
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
      acceptedMessages: controlledMessages.length,
      chunks: chunks.length,
      leadIds: Array.from(new Set(controlledMessages.map((item) => item.leadId))),
      idempotencyKey: options?.idempotencyKey || null,
    },
    "AI reply batch enqueue requested"
  );

  const createdJobs = await getAIQueue().addBulk(jobs);

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

const normalizeCommentReplyPayload = (
  payload: CommentReplyJobPayload
): CommentReplyJobPayload => ({
  type: "comment-reply",
  businessId: String(payload.businessId || "").trim(),
  clientId: String(payload.clientId || "").trim(),
  instagramUserId: payload.instagramUserId?.trim(),
  senderId: payload.senderId?.trim(),
  reelId: payload.reelId?.trim(),
  mediaId: payload.mediaId?.trim(),
  commentText: payload.commentText?.trim(),
  text: payload.text?.trim(),
  commentId: payload.commentId?.trim(),
});

export const enqueueCommentReplyJob = async (
  payload: CommentReplyJobPayload
) => {
  const normalizedPayload = normalizeCommentReplyPayload(payload);
  const jobId = normalizedPayload.commentId
    ? `comment_reply_${normalizedPayload.commentId}`
    : `comment_reply_${crypto.randomUUID()}`;

  logger.info(
    {
      queue: AI_QUEUE_NAME,
      source: "comment-reply",
      businessId: normalizedPayload.businessId,
      clientId: normalizedPayload.clientId,
      commentId: normalizedPayload.commentId || null,
      mediaId: normalizedPayload.mediaId || normalizedPayload.reelId || null,
    },
    "Comment reply job enqueue requested"
  );

  const job = await getAIQueue().add("ai-high", normalizedPayload, {
    jobId,
  });

  logger.info(
    {
      queue: AI_QUEUE_NAME,
      source: "comment-reply",
      jobId: job?.id || null,
      commentId: normalizedPayload.commentId || null,
    },
    "Comment reply job enqueued"
  );

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
    ? [getAIQueue()]
    : [getAIQueue(), getLegacyAIQueue()];

export const getAIQueueNames = () => getAIQueues().map((queue) => queue.name);

export const getAIQueueForLead = (_leadId: string) => getAIQueue();

export const closeAIQueue = async () => {
  await Promise.allSettled(
    [
      globalForAIQueue.__sylphAIHighQueue,
      globalForAIQueue.__sylphAILegacyQueue,
    ]
      .filter(Boolean)
      .map((queue) => queue!.close())
  );
  globalForAIQueue.__sylphAIHighQueue = undefined;
  globalForAIQueue.__sylphAILegacyQueue = undefined;
};

export type AIQueueJob = Job<AIQueuePayload>;
