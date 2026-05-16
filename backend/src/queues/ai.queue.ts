import crypto from "crypto";
import { Job, JobsOptions, Queue } from "bullmq";
import { env } from "../config/env";
import { getQueueRedisConnection } from "../config/redis";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";
import { getLeadCancelTokenVersions } from "../services/leadControlState.service";
import logger from "../utils/logger";
import { getRequestContext } from "../observability/requestContext";
import { assertPhase5APreviewBypassEnabled } from "../services/runtimePolicy.service";

export const AI_QUEUE_NAME: string = "ai-high";
export const LEGACY_AI_QUEUE_NAME: string = env.AI_QUEUE_NAME;

const parsePositiveInt = (raw: string | undefined, fallbackValue: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return Math.max(1, Math.floor(parsed));
};

export const AI_QUEUE_PARTITIONS = parsePositiveInt(
  process.env.AI_QUEUE_PARTITIONS,
  2
);

const AI_QUEUE_TOPOLOGY_VERSION = "b3";
const AI_QUEUE_BACKLOG_METRIC_TTL_MS = parsePositiveInt(
  process.env.AI_QUEUE_BACKLOG_METRIC_TTL_MS,
  5000
);
const AI_PARTITION_SATURATION_BACKLOG = parsePositiveInt(
  process.env.AI_PARTITION_SATURATION_BACKLOG,
  400
);
const AI_HEAVY_BACKPRESSURE_STEP_MS = parsePositiveInt(
  process.env.AI_HEAVY_BACKPRESSURE_STEP_MS,
  250
);
const AI_HEAVY_BACKPRESSURE_MAX_MS = parsePositiveInt(
  process.env.AI_HEAVY_BACKPRESSURE_MAX_MS,
  5000
);

export type AIWorkloadLane =
  | "compat"
  | "realtime"
  | "webhook"
  | "orchestration"
  | "autonomous"
  | "retry";

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

export type AIQueueDescriptor = {
  routeKey: string;
  queueName: string;
  lane: AIWorkloadLane;
  partition: number;
  partitions: number;
  lightweight: boolean;
  weight: number;
  compatibility?: boolean;
  legacy?: boolean;
};

type EnqueueOptions = {
  source?: AIJobPayload["source"];
  idempotencyKey?: string;
  delayMs?: number;
  forceUniqueJobId?: boolean;
};

type RouteGroup = {
  descriptor: AIQueueDescriptor;
  messages: AIMessagePayload[];
};

type QueueBacklogSnapshot = {
  wait: number;
  active: number;
  delayed: number;
  failed: number;
  backlog: number;
};

const AI_LANE_POLICIES: Record<
  Exclude<AIWorkloadLane, "compat">,
  {
    partitions: number;
    lightweight: boolean;
    weight: number;
  }
> = {
  realtime: {
    partitions: AI_QUEUE_PARTITIONS,
    lightweight: true,
    weight: 4,
  },
  webhook: {
    partitions: AI_QUEUE_PARTITIONS,
    lightweight: true,
    weight: 3,
  },
  orchestration: {
    partitions: AI_QUEUE_PARTITIONS,
    lightweight: false,
    weight: 2,
  },
  autonomous: {
    partitions: Math.max(1, Math.ceil(AI_QUEUE_PARTITIONS / 2)),
    lightweight: false,
    weight: 1,
  },
  retry: {
    partitions: Math.max(1, Math.ceil(AI_QUEUE_PARTITIONS / 2)),
    lightweight: false,
    weight: 1,
  },
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
  __sylphAIQueuesByName?: Map<string, Queue<AIQueuePayload>>;
  __sylphAIHighDeadLetterQueue?: Queue<AIDeadLetterPayload>;
};

const AI_HIGH_DLQ_NAME = "ai-high-dlq";

const queueBacklogMetricState = new Map<string, number>();
let runtimeTopologyCache: AIQueueDescriptor[] | null = null;

export type AIDeadLetterPayload = {
  jobId: string | null;
  leadId: string | null;
  reason: string;
  stack: string | null;
  traceId: string | null;
  payload: AIQueuePayload | null;
  retryCount: number;
  failedAt: string;
};

const emitAIQueueMetric = (
  name:
    | "queue_backlog_by_partition"
    | "partition_saturation"
    | "queue_degraded"
    | "worker_utilization",
  value: number,
  metadata?: Record<string, unknown>
) => {
  emitPerformanceMetric({
    name,
    value,
    route: "ai_queue",
    metadata: {
      topologyVersion: AI_QUEUE_TOPOLOGY_VERSION,
      ...(metadata || {}),
    },
  });
};

const buildQueueName = (lane: Exclude<AIWorkloadLane, "compat">, partition: number) =>
  `${AI_QUEUE_NAME}-lane-${lane}-p${partition}`;

const buildBaseTopology = (): AIQueueDescriptor[] => {
  const descriptors: AIQueueDescriptor[] = [
    {
      routeKey: "compat:0",
      queueName: AI_QUEUE_NAME,
      lane: "compat",
      partition: 0,
      partitions: 1,
      lightweight: false,
      weight: 1,
      compatibility: true,
    },
  ];

  for (const [lane, policy] of Object.entries(AI_LANE_POLICIES) as Array<
    [Exclude<AIWorkloadLane, "compat">, (typeof AI_LANE_POLICIES)[Exclude<AIWorkloadLane, "compat">]]
  >) {
    for (let partition = 0; partition < policy.partitions; partition += 1) {
      descriptors.push({
        routeKey: `${lane}:${partition}`,
        queueName: buildQueueName(lane, partition),
        lane,
        partition,
        partitions: policy.partitions,
        lightweight: policy.lightweight,
        weight: policy.weight,
      });
    }
  }

  return descriptors;
};

const getRuntimeTopology = () => {
  if (!runtimeTopologyCache) {
    const descriptors = buildBaseTopology();

    if (
      LEGACY_AI_QUEUE_NAME !== AI_QUEUE_NAME &&
      !descriptors.some((descriptor) => descriptor.queueName === LEGACY_AI_QUEUE_NAME)
    ) {
      descriptors.push({
        routeKey: "legacy:0",
        queueName: LEGACY_AI_QUEUE_NAME,
        lane: "compat",
        partition: 0,
        partitions: 1,
        lightweight: false,
        weight: 1,
        compatibility: true,
        legacy: true,
      });
    }

    runtimeTopologyCache = descriptors;
  }

  return runtimeTopologyCache;
};

const getDescriptorByQueueName = (queueName: string) =>
  getRuntimeTopology().find((descriptor) => descriptor.queueName === queueName) ||
  null;

const getDescriptorsByLane = (lane: AIWorkloadLane) =>
  getRuntimeTopology().filter((descriptor) => descriptor.lane === lane && !descriptor.legacy);

const hashToPartitionIndex = (key: string, partitions: number) => {
  const digest = crypto.createHash("sha1").update(key).digest("hex");
  const value = Number.parseInt(digest.slice(0, 8), 16);

  if (!Number.isFinite(value) || partitions <= 1) {
    return 0;
  }

  return value % partitions;
};

const getQueueMap = () => {
  if (!globalForAIQueue.__sylphAIQueuesByName) {
    initAIQueues();
  }

  return globalForAIQueue.__sylphAIQueuesByName!;
};

const getQueueByName = (queueName: string) => {
  const map = getQueueMap();
  const queue = map.get(queueName);

  if (!queue) {
    throw new Error(`queue_unavailable:${queueName}`);
  }

  return queue;
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
  routeKey: string,
  options?: EnqueueOptions
) => {
  if (options?.forceUniqueJobId) {
    return `ai_${crypto.randomUUID()}`;
  }

  const stableToken = buildStableToken(messages, options?.idempotencyKey);

  if (stableToken) {
    return `ai_${stableToken}_${routeKey}_${chunkIndex}`;
  }

  return `ai_${crypto.randomUUID()}`;
};

const isTrueFlag = (value: unknown) =>
  value === true ||
  String(value || "")
    .trim()
    .toLowerCase() === "true";

const isAutonomousMessage = (message: AIMessagePayload) => {
  const source = String(message.source || "").trim().toUpperCase();
  const metadata = message.metadata || {};

  return (
    source === "AUTONOMOUS" ||
    String(metadata.source || "").trim().toUpperCase() === "AUTONOMOUS" ||
    Boolean(metadata.autonomous || metadata.autonomousCampaignId || metadata.opportunityId)
  );
};

const isWebhookStyleMessage = (message: AIMessagePayload) => {
  const metadata = message.metadata || {};

  return (
    isTrueFlag(metadata.canonicalInbound) ||
    Boolean(metadata.interactionId || metadata.externalInteractionKey) ||
    Boolean(message.platform && message.senderId)
  );
};

const isLocalPreviewMessage = (message: AIMessagePayload) => {
  const metadata = message.metadata || {};

  return (
    isTrueFlag(metadata.onboardingDemo) || isTrueFlag(metadata.internalSimulation)
  );
};

const resolveWorkloadLane = (
  message: AIMessagePayload,
  source?: AIJobPayload["source"]
): Exclude<AIWorkloadLane, "compat"> => {
  const sourceValue = String(source || "").trim().toLowerCase();

  if (sourceValue === "retry" || Number(message.retryCount || 0) > 0) {
    return "retry";
  }

  if (isAutonomousMessage(message)) {
    return "autonomous";
  }

  if (isLocalPreviewMessage(message) || message.kind === "message") {
    return "realtime";
  }

  if (isWebhookStyleMessage(message)) {
    return "webhook";
  }

  return "orchestration";
};

const resolveQueueDescriptorForMessage = (
  message: AIMessagePayload,
  source?: AIJobPayload["source"]
) => {
  const lane = resolveWorkloadLane(message, source);
  const descriptors = getDescriptorsByLane(lane);

  if (!descriptors.length) {
    return getRuntimeTopology()[0];
  }

  const partitionKey =
    message.leadId ||
    message.externalEventId ||
    message.idempotencyKey ||
    `${message.businessId}:${message.message.slice(0, 64)}`;
  const partitionIndex = hashToPartitionIndex(partitionKey, descriptors.length);

  return descriptors[partitionIndex] || descriptors[0];
};

const resolveQueueDescriptorForCommentReply = (
  payload: CommentReplyJobPayload
) => {
  const descriptors = getDescriptorsByLane("webhook");

  if (!descriptors.length) {
    return getRuntimeTopology()[0];
  }

  const partitionKey =
    payload.commentId ||
    payload.senderId ||
    payload.instagramUserId ||
    `${payload.businessId}:${payload.clientId}`;
  const partitionIndex = hashToPartitionIndex(partitionKey, descriptors.length);

  return descriptors[partitionIndex] || descriptors[0];
};

const applyRoutingMetadata = (
  message: AIMessagePayload,
  descriptor: AIQueueDescriptor
): AIMessagePayload => ({
  ...message,
  metadata: {
    ...(message.metadata || {}),
    aiQueueRoute: descriptor.routeKey,
    aiQueueLane: descriptor.lane,
    aiQueuePartition: descriptor.partition,
    aiQueueName: descriptor.queueName,
    aiQueueTopologyVersion: AI_QUEUE_TOPOLOGY_VERSION,
  },
});

const groupMessagesByRoute = (
  messages: AIMessagePayload[],
  source?: AIJobPayload["source"]
) => {
  const grouped = new Map<string, RouteGroup>();

  for (const message of messages) {
    const descriptor = resolveQueueDescriptorForMessage(message, source);
    const routeKey = descriptor.routeKey;
    const current = grouped.get(routeKey);

    if (current) {
      current.messages.push(applyRoutingMetadata(message, descriptor));
      continue;
    }

    grouped.set(routeKey, {
      descriptor,
      messages: [applyRoutingMetadata(message, descriptor)],
    });
  }

  return Array.from(grouped.values());
};

const loadQueueBacklogSnapshot = async (
  queue: Queue<AIQueuePayload>
): Promise<QueueBacklogSnapshot> => {
  const counts = await queue.getJobCounts("wait", "active", "failed", "delayed");
  const wait = Math.max(0, Number(counts.wait || 0));
  const active = Math.max(0, Number(counts.active || 0));
  const delayed = Math.max(0, Number(counts.delayed || 0));
  const failed = Math.max(0, Number(counts.failed || 0));

  return {
    wait,
    active,
    delayed,
    failed,
    backlog: wait + active + delayed,
  };
};

const maybeEmitQueueBacklogSnapshot = async (
  descriptor: AIQueueDescriptor,
  queue: Queue<AIQueuePayload>,
  reason: string,
  forced = false
) => {
  const metricKey = descriptor.queueName;
  const now = Date.now();
  const nextAllowedAt = queueBacklogMetricState.get(metricKey) || 0;

  if (!forced && now < nextAllowedAt) {
    return null;
  }

  queueBacklogMetricState.set(metricKey, now + AI_QUEUE_BACKLOG_METRIC_TTL_MS);

  const snapshot = await loadQueueBacklogSnapshot(queue);

  emitAIQueueMetric("queue_backlog_by_partition", snapshot.backlog, {
    reason,
    queueName: descriptor.queueName,
    routeKey: descriptor.routeKey,
    lane: descriptor.lane,
    partition: descriptor.partition,
    partitions: descriptor.partitions,
    wait: snapshot.wait,
    active: snapshot.active,
    delayed: snapshot.delayed,
    failed: snapshot.failed,
    lightweight: descriptor.lightweight,
  });

  const workerUtilization =
    snapshot.active / Math.max(1, snapshot.wait + snapshot.active);
  emitAIQueueMetric("worker_utilization", workerUtilization, {
    reason,
    queueName: descriptor.queueName,
    routeKey: descriptor.routeKey,
    lane: descriptor.lane,
    partition: descriptor.partition,
  });

  if (snapshot.backlog >= AI_PARTITION_SATURATION_BACKLOG) {
    emitAIQueueMetric("partition_saturation", 1, {
      reason,
      queueName: descriptor.queueName,
      routeKey: descriptor.routeKey,
      lane: descriptor.lane,
      partition: descriptor.partition,
      backlog: snapshot.backlog,
      threshold: AI_PARTITION_SATURATION_BACKLOG,
      lightweight: descriptor.lightweight,
    });
  }

  return snapshot;
};

const computeBackpressureDelayMs = (
  descriptor: AIQueueDescriptor,
  backlog: number
) => {
  if (descriptor.lightweight || descriptor.lane === "compat") {
    return 0;
  }

  if (backlog <= AI_PARTITION_SATURATION_BACKLOG) {
    return 0;
  }

  const overflow = backlog - AI_PARTITION_SATURATION_BACKLOG;
  const steps = Math.max(1, Math.ceil(overflow / 50));

  return Math.min(AI_HEAVY_BACKPRESSURE_MAX_MS, steps * AI_HEAVY_BACKPRESSURE_STEP_MS);
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

export const initAIQueues = () => {
  if (!globalForAIQueue.__sylphAIQueuesByName) {
    globalForAIQueue.__sylphAIQueuesByName = new Map();
  }

  const queueMap = globalForAIQueue.__sylphAIQueuesByName;

  for (const descriptor of getRuntimeTopology()) {
    if (queueMap.has(descriptor.queueName)) {
      continue;
    }

    const queue = createResilientQueue(
      new Queue<AIQueuePayload>(descriptor.queueName, {
        connection: getQueueRedisConnection(),
        prefix: env.AI_QUEUE_PREFIX,
        defaultJobOptions,
        streams: {
          events: {
            maxLen: 1000,
          },
        },
      }),
      descriptor.queueName
    );

    queueMap.set(descriptor.queueName, queue);
  }

  if (!globalForAIQueue.__sylphAIHighDeadLetterQueue) {
    globalForAIQueue.__sylphAIHighDeadLetterQueue = createResilientQueue(
      new Queue<AIDeadLetterPayload>(AI_HIGH_DLQ_NAME, {
        connection: getQueueRedisConnection(),
        prefix: env.AI_QUEUE_PREFIX,
        defaultJobOptions: buildQueueJobOptions({
          attempts: 1,
        }),
      }),
      AI_HIGH_DLQ_NAME
    );
  }

  return getAIQueues();
};

export const getAIQueueTopology = () =>
  getRuntimeTopology().map((descriptor) => ({ ...descriptor }));

export const getAIQueueDescriptor = (queueName: string) => {
  const descriptor = getDescriptorByQueueName(queueName);
  return descriptor ? { ...descriptor } : null;
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

  const routeGroups = groupMessagesByRoute(controlledMessages, options?.source);

  logger.info(
    {
      queue: AI_QUEUE_NAME,
      source: options?.source || "api",
      topologyVersion: AI_QUEUE_TOPOLOGY_VERSION,
      partitions: AI_QUEUE_PARTITIONS,
      requestedMessages: messages.length,
      acceptedMessages: controlledMessages.length,
      routeGroups: routeGroups.map((group) => ({
        queueName: group.descriptor.queueName,
        lane: group.descriptor.lane,
        partition: group.descriptor.partition,
        count: group.messages.length,
      })),
      leadIds: Array.from(new Set(controlledMessages.map((item) => item.leadId))),
      idempotencyKey: options?.idempotencyKey || null,
    },
    "AI reply batch enqueue requested"
  );

  const createdJobsByGroup = await Promise.all(
    routeGroups.map(async (group) => {
      const queue = getQueueByName(group.descriptor.queueName);
      const snapshot = await maybeEmitQueueBacklogSnapshot(
        group.descriptor,
        queue,
        "enqueue_before"
      ).catch(() => null);
      const backpressureDelayMs = computeBackpressureDelayMs(
        group.descriptor,
        snapshot?.backlog || 0
      );

      if (backpressureDelayMs > 0) {
        emitAIQueueMetric("queue_degraded", 1, {
          reason: "heavy_backpressure_delay",
          queueName: group.descriptor.queueName,
          routeKey: group.descriptor.routeKey,
          lane: group.descriptor.lane,
          partition: group.descriptor.partition,
          backlog: snapshot?.backlog || null,
          delayMs: backpressureDelayMs,
        });
      }

      const chunks = chunkMessages(group.messages, env.AI_JOB_BATCH_SIZE);
      const jobs = chunks.map((chunk, chunkIndex) => ({
        name: "process",
        data: {
          batchId: crypto.randomUUID(),
          source: options?.source || "api",
          createdAt: new Date().toISOString(),
          messages: chunk,
        },
        opts: {
          jobId: buildJobId(chunk, chunkIndex, group.descriptor.routeKey, options),
          delay: Math.max(0, Number(options?.delayMs || 0)) + backpressureDelayMs,
        },
      }));

      const created = await queue.addBulk(jobs);
      void maybeEmitQueueBacklogSnapshot(
        group.descriptor,
        queue,
        "enqueue_after",
        true
      ).catch(() => undefined);

      return created;
    })
  );

  const createdJobs = createdJobsByGroup.flat();

  logger.info(
    {
      queue: AI_QUEUE_NAME,
      source: options?.source || "api",
      topologyVersion: AI_QUEUE_TOPOLOGY_VERSION,
      jobs: createdJobs.map((job) => ({
        id: String(job.id),
        queueName: job.queueName,
      })),
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

export const enqueueCommentReplyJob = async (
  payload: CommentReplyJobPayload
) => {
  assertPhase5APreviewBypassEnabled("instagram_comment_reply_queue");

  const normalizedPayload = normalizeCommentReplyPayload(payload);
  const descriptor = resolveQueueDescriptorForCommentReply(normalizedPayload);
  const queue = getQueueByName(descriptor.queueName);
  const backpressureSnapshot = await maybeEmitQueueBacklogSnapshot(
    descriptor,
    queue,
    "comment_enqueue_before"
  ).catch(() => null);

  const backpressureDelayMs = computeBackpressureDelayMs(
    descriptor,
    backpressureSnapshot?.backlog || 0
  );
  const jobId = normalizedPayload.commentId
    ? `comment_reply_${normalizedPayload.commentId}_${descriptor.partition}`
    : `comment_reply_${crypto.randomUUID()}`;

  logger.info(
    {
      queue: descriptor.queueName,
      source: "comment-reply",
      topologyVersion: AI_QUEUE_TOPOLOGY_VERSION,
      businessId: normalizedPayload.businessId,
      clientId: normalizedPayload.clientId,
      commentId: normalizedPayload.commentId || null,
      mediaId: normalizedPayload.mediaId || normalizedPayload.reelId || null,
      lane: descriptor.lane,
      partition: descriptor.partition,
    },
    "Comment reply job enqueue requested"
  );

  if (backpressureDelayMs > 0) {
    emitAIQueueMetric("queue_degraded", 1, {
      reason: "comment_lane_backpressure",
      queueName: descriptor.queueName,
      lane: descriptor.lane,
      partition: descriptor.partition,
      backlog: backpressureSnapshot?.backlog || null,
      delayMs: backpressureDelayMs,
    });
  }

  const job = await queue.add("ai-high", normalizedPayload, {
    jobId,
    delay: backpressureDelayMs,
  });

  void maybeEmitQueueBacklogSnapshot(
    descriptor,
    queue,
    "comment_enqueue_after",
    true
  ).catch(() => undefined);

  logger.info(
    {
      queue: descriptor.queueName,
      source: "comment-reply",
      jobId: job?.id || null,
      commentId: normalizedPayload.commentId || null,
      lane: descriptor.lane,
      partition: descriptor.partition,
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
  getRuntimeTopology().map((descriptor) => getQueueByName(descriptor.queueName));

export const getAIQueueNames = () => getAIQueues().map((queue) => queue.name);

const getAIHighDeadLetterQueue = () => {
  if (!globalForAIQueue.__sylphAIHighDeadLetterQueue) {
    initAIQueues();
  }

  return globalForAIQueue.__sylphAIHighDeadLetterQueue!;
};

export const enqueueAIDeadLetterJob = async (payload: AIDeadLetterPayload) =>
  getAIHighDeadLetterQueue().add("dead-letter", payload, {
    jobId: `ai_dlq_${payload.jobId || payload.traceId || crypto.randomUUID()}`,
    removeOnComplete: {
      count: 1000,
    },
    removeOnFail: {
      count: 1000,
    },
  });

export const getAIQueueForLead = (leadId: string) => {
  const descriptor = resolveQueueDescriptorForMessage({
    businessId: "unknown",
    leadId,
    message: "route",
    kind: "router",
  });

  return getQueueByName(descriptor.queueName);
};

export const closeAIQueue = async () => {
  const queueMap = globalForAIQueue.__sylphAIQueuesByName;
  await Promise.allSettled(
    [
      ...(queueMap ? Array.from(queueMap.values()) : []),
      globalForAIQueue.__sylphAIHighDeadLetterQueue,
    ]
      .filter(Boolean)
      .map((queue) => queue!.close())
  );

  globalForAIQueue.__sylphAIQueuesByName = undefined;
  globalForAIQueue.__sylphAIHighDeadLetterQueue = undefined;
};

export type AIQueueJob = Job<AIQueuePayload>;
